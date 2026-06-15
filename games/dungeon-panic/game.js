// DUNGEON PANIC — core engine.
// Single player runs the full sim locally. Multiplayer: host runs the sim and
// broadcasts state at 20hz; clients send inputs at 30hz and render snapshots.

import {
W, H, WALL, DOOR, PLAYER_COLORS,
drawRoom, drawPlayerSprite, drawEnemySprite, drawProjectile, drawPickup, sfx,
} from './assets.js';
import {
Player, makeEnemy, Projectile, Pickup, randomDrop, rollItemChoices,
ITEM_POOL, ENEMY_TYPES, BOSS_NAMES,
} from './entities.js';
import { generateFloor } from './dungeon.js';
import { loadFont, drawHUD, drawMinimap, drawBossBar, drawChoice, choiceBoxes } from './ui.js';
import { Net } from './network.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Render hooks the live remix system can fill in to reskin the game
// (set e.g. hooks.drawProjectile = (ctx, pr) => {...} via window.DP.hooks).
const hooks = {};

const $ = (id) => document.getElementById(id);
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

// ---------------------------------------------------------------- state

const game = {
state: 'title', // title | lobby | playing | dead
mode: 'single', // single | host | client
floorNum: 1,
floor: null,
room: null,
players: [],
enemies: [],
projectiles: [],
choice: null, // { options, player, hover }
paused: false,
score: 0,
kills: 0,
shake: 0,
t: 0,
};

// the API surface entities rely on
game.nearestPlayer = (e) => {
let best = null;
let bd = Infinity;
for (const p of game.players) {
if (!p.alive) continue;
const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
if (d < bd) { bd = d; best = p; }
}
return best;
};

game.clampToRoom = (ent) => {
const room = game.room;
if (!room) return;
const open = ent.isPlayer && room.cleared;
const inGapX = Math.abs(ent.x - W / 2) < DOOR / 2 - 10;
const inGapY = Math.abs(ent.y - H / 2) < DOOR / 2 - 10;
if (!(open && room.doors.N && inGapX)) ent.y = Math.max(WALL + ent.r, ent.y);
if (!(open && room.doors.S && inGapX)) ent.y = Math.min(H - WALL - ent.r, ent.y);
if (!(open && room.doors.W && inGapY)) ent.x = Math.max(WALL + ent.r, ent.x);
if (!(open && room.doors.E && inGapY)) ent.x = Math.min(W - WALL - ent.r, ent.x);
};

game.spawnEnemyShot = (x, y, angle, speed) => {
game.projectiles.push(new Projectile(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 7, 1, false));
};

game.onPlayerDeath = () => {
sfx.dead();
if (game.players.every((p) => !p.alive)) gameOver();
};

// ---------------------------------------------------------------- net

let net = null;
let myId = 'p1';
let clientState = null; // latest snapshot (client mode)
let clientFloor = null; // floor meta (client mode)
let choiceClickBoxes = null;

const bestKey = 'dungeon-panic-best';
const getBest = () => parseInt(localStorage.getItem(bestKey) || '0', 10);
const saveBest = (s) => { if (s > getBest()) localStorage.setItem(bestKey, String(s)); };

// ---------------------------------------------------------------- input

const keys = {};
let mouseX = W / 2;
let mouseY = H / 2;

function canvasCoords(e) {
const rect = canvas.getBoundingClientRect();
return [
(e.clientX - rect.left) * (W / rect.width),
(e.clientY - rect.top) * (H / rect.height),
];
}

window.addEventListener('keydown', (e) => {
if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
keys[e.code] = true;

if (game.choice) {
const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
if (idx >= 0) pickChoice(idx);
}
if (game.state === 'dead' && e.code === 'KeyR' && game.mode !== 'client') restartFloor();
if (e.code === 'KeyP' && game.state === 'playing' && game.mode === 'single' && !game.choice) {
game.paused = !game.paused;
}
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// mouse is only used for picking blessings — aiming and shooting live on the arrow keys
canvas.addEventListener('mousemove', (e) => {
[mouseX, mouseY] = canvasCoords(e);
if (game.choice && choiceClickBoxes) {
game.choice.hover = choiceClickBoxes.findIndex(
(b) => mouseX >= b.x && mouseX <= b.x + b.w && mouseY >= b.y && mouseY <= b.y + b.h
);
}
});
canvas.addEventListener('mousedown', (e) => {
[mouseX, mouseY] = canvasCoords(e);
if (game.choice && choiceClickBoxes) {
const idx = choiceClickBoxes.findIndex(
(b) => mouseX >= b.x && mouseX <= b.x + b.w && mouseY >= b.y && mouseY <= b.y + b.h
);
if (idx >= 0) pickChoice(idx);
}
});

// twin-stick on a keyboard: WASD moves, arrow keys aim AND shoot (8-way)
let lastAim = 0;

function readLocalInput() {
const sx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
const sy = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
const shooting = !!(sx || sy);
if (shooting) lastAim = Math.atan2(sy, sx);
return {
up: !!keys.KeyW,
down: !!keys.KeyS,
left: !!keys.KeyA,
right: !!keys.KeyD,
aim: lastAim,
shoot: shooting,
};
}

// ---------------------------------------------------------------- flow

function startSingle() {
game.mode = 'single';
myId = 'p1';
game.players = [new Player('p1', PLAYER_COLORS[0])];
newRun();
}

function newRun() {
game.floorNum = 1;
game.score = 0;
game.kills = 0;
for (const p of game.players) {
p.resetStats();
p.alive = true;
p.coins = 0;
}
game.floor = generateFloor(game.floorNum);
game.choice = null;
game.paused = false;
enterRoom(game.floor.rooms.get(game.floor.startKey), null);
game.state = 'playing';
hideAllOverlays();
if (game.mode === 'host') {
net.broadcast(floorMetaMsg());
net.broadcast({ t: 'start' });
}
}

function enterRoom(room, fromDir) {
game.room = room;
room.visited = true;
game.projectiles = [];
game.enemies = room.cleared
? []
: room.spawns.map((s) => makeEnemy(s.type, s.x, s.y, game.floorNum));

const entry = {
N: [W / 2, H - WALL - 28],
S: [W / 2, WALL + 28],
W: [W - WALL - 28, H / 2],
E: [WALL + 28, H / 2],
}[fromDir] || [W / 2, H / 2 + 60];

game.players.forEach((p, i) => {
p.x = entry[0] + (fromDir === 'W' || fromDir === 'E' ? 0 : (i - (game.players.length - 1) / 2) * 30);
p.y = entry[1] + (fromDir === 'W' || fromDir === 'E' ? (i - (game.players.length - 1) / 2) * 30 : 0);
});

if (room.type === 'boss' && !room.cleared) {
sfx.boss();
gameMsg('MONSTRO');
}
}

function moveRoom(dx, dy, dir) {
const next = game.floor.rooms.get(`${game.room.gx + dx},${game.room.gy + dy}`);
if (next) enterRoom(next, dir);
}

function nextFloor() {
game.floorNum += 1;
game.score += 100;
sfx.stairs();
game.floor = generateFloor(game.floorNum);
enterRoom(game.floor.rooms.get(game.floor.startKey), null);
gameMsg(`FLOOR ${game.floorNum}`);
if (game.mode === 'host') net.broadcast(floorMetaMsg());
}

function restartFloor() {
for (const p of game.players) {
p.resetStats();
p.alive = true;
}
game.floor = generateFloor(game.floorNum);
game.choice = null;
enterRoom(game.floor.rooms.get(game.floor.startKey), null);
game.state = 'playing';
hideAllOverlays();
if (game.mode === 'host') net.broadcast(floorMetaMsg());
}

function gameOver() {
game.state = 'dead';
saveBest(game.score);
$('death-stats').textContent =
`floor ${game.floorNum} · ${game.kills} kills · score ${game.score} · best ${getBest()}`;
$('btn-restart').style.display = game.mode === 'client' ? 'none' : '';
$('death-note').textContent = game.mode === 'client'
? 'waiting for the host to restart...'
: 'press R or click below to run it back';
show($('ov-dead'));
if (game.mode === 'host') net.broadcast({ t: 'dead', stats: $('death-stats').textContent });
}

function backToTitle() {
net?.destroy();
net = null;
clientState = null;
clientFloor = null;
game.state = 'title';
game.players = [];
game.paused = false;
history.replaceState(null, '', location.pathname);
hideAllOverlays();
$('hi-score').textContent = getBest().toLocaleString('en-US');
show($('ov-title'));
}

function hideAllOverlays() {
hide($('ov-title'));
hide($('ov-lobby'));
hide($('ov-dead'));
}

let msgTimer = null;
function gameMsg(text) {
const el = $('game-msg');
el.textContent = text;
el.classList.add('on');
clearTimeout(msgTimer);
msgTimer = setTimeout(() => el.classList.remove('on'), 2400);
}

// ---------------------------------------------------------------- items

function openChoice(player) {
game.choice = { options: rollItemChoices(3), player, hover: -1 };
sfx.item();
}

function pickChoice(i) {
const c = game.choice;
if (!c || !c.options[i]) return;
c.options[i].apply(c.player);
gameMsg(`${c.options[i].name}!`);
sfx.item();
game.choice = null;
choiceClickBoxes = null;
}

function applyPickup(player, pk) {
switch (pk.kind) {
case 'heart':
if (player.hp >= player.maxHp) return false;
player.hp += 1;
sfx.pickup();
break;
case 'speed': player.speed *= 1.2; sfx.pickup(); gameMsg('speed up!'); break;
case 'damage': player.damage *= 1.5; sfx.pickup(); gameMsg('damage up!'); break;
case 'firerate': player.fireRate *= 1.25; sfx.pickup(); gameMsg('fire rate up!'); break;
case 'coin': player.coins += 1; sfx.pickup(); break;
case 'item':
if (game.mode === 'single') {
openChoice(player);
} else {
// multiplayer keeps moving — grant a random blessing instantly
const item = rollItemChoices(1)[0];
item.apply(player);
sfx.item();
gameMsg(`${item.name}!`);
}
break;
case 'trapdoor':
nextFloor();
return true;
}
return true;
}

// ---------------------------------------------------------------- simulation (single + host)

const overlap = (a, b, pad = 0) =>
Math.abs(a.x - b.x) < a.r + b.r + pad && Math.abs(a.y - b.y) < a.r + b.r + pad;

function updateWorld(dt) {
if (game.choice || game.paused) return;

// local player input
const me = game.players.find((p) => p.id === myId);
if (me) me.input = readLocalInput();

for (const p of game.players) p.update(dt, game);
for (const e of game.enemies) e.update(dt, game);
for (const pr of game.projectiles) pr.update(dt);

// tears vs enemies
for (const pr of game.projectiles) {
if (!pr.friendly || pr.dead) continue;
for (const e of game.enemies) {
if (e.hp <= 0 || (pr.hitIds && pr.hitIds.has(e))) continue;
if (overlap(pr, e)) {
e.takeHit(pr.damage);
if (pr.pierce) pr.hitIds.add(e);
else { pr.dead = true; break; }
}
}
}

// enemy shots + enemy bodies vs players
for (const p of game.players) {
if (!p.alive) continue;
for (const pr of game.projectiles) {
if (pr.friendly || pr.dead) continue;
if (overlap(pr, p)) { pr.dead = true; p.hurt(game); }
}
for (const e of game.enemies) {
if (e.hp > 0 && overlap(e, p)) p.hurt(game);
}
}

// bury the dead (and trigger death effects)
const dead = game.enemies.filter((e) => e.hp <= 0);
if (dead.length) {
game.enemies = game.enemies.filter((e) => e.hp > 0);
for (const e of dead) {
game.kills += 1;
game.score += e.isBoss ? 250 : 10;
sfx.kill();
if (e.spawnsOnDeath && game.enemies.length < 28) {
game.enemies.push(makeEnemy('fly', e.x - 12, e.y, game.floorNum));
game.enemies.push(makeEnemy('fly', e.x + 12, e.y, game.floorNum));
}
if (e.dropsItem) {
game.room.pickups.push(new Pickup(e.x, e.y, randomDrop()));
}
}
}

game.projectiles = game.projectiles.filter((pr) => !pr.dead);

// room cleared → open doors, drop a reward
if (!game.room.cleared && game.enemies.length === 0) {
game.room.cleared = true;
sfx.door();
if (game.room.type === 'boss') {
game.room.pickups.push(new Pickup(W / 2, H / 2, 'trapdoor'));
gameMsg('boss down! take the trapdoor');
} else {
game.room.pickups.push(new Pickup(W / 2, H / 2, randomDrop()));
gameMsg('doors open OK');
}
}

// pickups
for (const p of game.players) {
if (!p.alive) continue;
for (let i = game.room.pickups.length - 1; i >= 0; i--) {
const pk = game.room.pickups[i];
if (overlap(p, pk, 4) && applyPickup(p, pk)) {
game.room.pickups.splice(i, 1);
}
}
}

// door transitions
if (game.room.cleared) {
for (const p of game.players) {
if (!p.alive) continue;
if (p.y < 16 && game.room.doors.N) return moveRoom(0, -1, 'N');
if (p.y > H - 16 && game.room.doors.S) return moveRoom(0, 1, 'S');
if (p.x < 16 && game.room.doors.W) return moveRoom(-1, 0, 'W');
if (p.x > W - 16 && game.room.doors.E) return moveRoom(1, 0, 'E');
}
}

game.shake = Math.max(0, game.shake - dt);
}

// ---------------------------------------------------------------- rendering

function render() {
ctx.clearRect(0, 0, W, H);
ctx.save();
if (game.shake > 0) {
ctx.translate((Math.random() - 0.5) * game.shake * 26, (Math.random() - 0.5) * game.shake * 26);
}

(hooks.drawRoom || drawRoom)(ctx, game.room, game.t);
for (const pk of game.room.pickups) (hooks.drawPickup || drawPickup)(ctx, pk, game.t);
for (const pr of game.projectiles) (hooks.drawProjectile || drawProjectile)(ctx, pr);
for (const e of game.enemies) e.draw(ctx, game.t);
for (const p of game.players) p.draw(ctx, game.t);
hooks.postRender?.(ctx, game);
ctx.restore();

const me = game.players.find((p) => p.id === myId);
const roomLabel = game.room.cleared
? (game.room.type === 'boss' ? 'boss defeated' : 'room cleared OK')
: `enemies remaining: ${game.enemies.length}`;
drawHUD(ctx, me, game.floorNum, game.score, roomLabel);
drawMinimap(ctx, [...game.floor.rooms.values()], game.room.key);

const boss = game.enemies.find((e) => e.isBoss);
if (boss) drawBossBar(ctx, boss);

if (game.choice) {
choiceClickBoxes = drawChoice(ctx, game.choice.options, game.choice.hover);
}

if (game.paused) {
ctx.fillStyle = 'rgba(10,10,20,0.7)';
ctx.fillRect(0, 0, W, H);
ctx.fillStyle = '#FFE135';
ctx.font = '44px "Fredoka One", sans-serif';
ctx.textAlign = 'center';
ctx.fillText('PAUSED', W / 2, H / 2);
ctx.font = '15px "Space Mono", monospace';
ctx.fillStyle = 'rgba(255,255,255,0.7)';
ctx.fillText('press P to resume', W / 2, H / 2 + 34);
ctx.textAlign = 'left';
}
}

function renderClient() {
ctx.clearRect(0, 0, W, H);
const s = clientState;
if (!s) {
ctx.fillStyle = '#0F0F1A';
ctx.fillRect(0, 0, W, H);
return;
}

drawRoom(ctx, { doors: s.doors, cleared: s.cleared, type: s.type, theme: s.th }, game.t);
for (const pk of s.pk) drawPickup(ctx, pk, game.t);
for (const pr of s.pr) drawProjectile(ctx, { x: pr.x, y: pr.y, r: pr.r, friendly: pr.f });
for (const e of s.en) {
drawEnemySprite(ctx, { type: e.ty, x: e.x, y: e.y, r: e.r, hp: e.hp, maxHp: e.maxHp, hopT: e.hopT, flash: e.flash, charging: e.charging }, game.t);
}
for (const p of s.players) {
drawPlayerSprite(ctx, { ...p, r: 14 }, game.t);
}

const me = s.players.find((p) => p.id === myId);
const roomLabel = s.cleared ? 'room cleared OK' : `enemies remaining: ${s.en.length}`;
drawHUD(ctx, me, s.fl, s.sc, roomLabel);

if (clientFloor) {
const rooms = clientFloor.rooms.map((r) => ({ ...r, visited: s.vis.includes(r.key) }));
drawMinimap(ctx, rooms, s.rk);
}

const boss = s.en.find((e) => e.bs);
if (boss) drawBossBar(ctx, { hp: boss.hp, maxHp: boss.maxHp, name: BOSS_NAMES[boss.ty] });

if (s.choice) {
ctx.fillStyle = 'rgba(10,10,20,0.7)';
ctx.fillRect(0, 0, W, H);
ctx.fillStyle = '#FFE135';
ctx.font = '24px "Fredoka One", sans-serif';
ctx.textAlign = 'center';
ctx.fillText('the host is choosing a blessing...', W / 2, H / 2);
ctx.textAlign = 'left';
} else if (me && !me.alive && s.players.some((p) => p.alive)) {
ctx.fillStyle = 'rgba(255,255,255,0.85)';
ctx.font = '16px "Space Mono", monospace';
ctx.textAlign = 'center';
ctx.fillText('spectating — your friends fight on', W / 2, H - 18);
ctx.textAlign = 'left';
}
}

// ---------------------------------------------------------------- multiplayer wiring

function floorMetaMsg() {
return {
t: 'floor',
fl: game.floorNum,
rooms: [...game.floor.rooms.values()].map((r) => ({ key: r.key, gx: r.gx, gy: r.gy, type: r.type })),
};
}

function snapshot() {
return {
t: 'state',
st: game.state,
rk: game.room.key,
fl: game.floorNum,
sc: game.score,
type: game.room.type,
th: game.room.theme,
cleared: game.room.cleared,
doors: game.room.doors,
choice: !!game.choice,
vis: [...game.floor.rooms.values()].filter((r) => r.visited).map((r) => r.key),
players: game.players.map((p) => ({
id: p.id, x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp,
color: p.color, inv: p.inv, alive: p.alive, aim: p.aim, coins: p.coins,
})),
en: game.enemies.map((e) => ({
ty: e.type, x: e.x, y: e.y, r: e.r, hp: e.hp, maxHp: e.maxHp,
hopT: e.hopT || 0, flash: e.flash, charging: !!e.charging, bs: e.isBoss ? 1 : 0,
})),
pr: game.projectiles.map((p) => ({ x: p.x, y: p.y, r: p.r, f: p.friendly })),
pk: game.room.pickups.map((p) => ({ x: p.x, y: p.y, kind: p.kind })),
};
}

function updateLobbyCount() {
const n = game.players.length;
$('lobby-count').textContent = `${n} player${n === 1 ? '' : 's'} in the room`;
const startBtn = $('btn-start');
startBtn.disabled = net.conns.length < 1;
startBtn.textContent = net.conns.length < 1 ? 'Start Game (waiting for players...)' : 'Start Game';
}

function hostGame() {
if (!Net.available()) {
gameMsg('multiplayer needs internet — PeerJS failed to load');
return;
}
game.mode = 'host';
myId = 'host';
game.players = [new Player('host', PLAYER_COLORS[0])];

net = new Net({
onJoin(conn) {
const color = PLAYER_COLORS[game.players.length % PLAYER_COLORS.length];
const player = new Player(conn.peer, color);
game.players.push(player);
conn.send({ t: 'init', id: player.id, color });
if (game.state === 'playing' || game.state === 'dead') {
conn.send(floorMetaMsg());
conn.send({ t: 'start' });
player.x = game.players[0].x + 30;
player.y = game.players[0].y;
}
// sync any live mods to the newcomer so the whole room runs the same game
for (const mod of window.DP.activeMods) conn.send({ t: 'mod', code: mod.code, summary: mod.summary });
updateLobbyCount();
gameMsg('a challenger joins!');
},
onLeave(conn) {
game.players = game.players.filter((p) => p.id !== conn.peer);
if (game.state === 'lobby') updateLobbyCount();
},
onData(conn, msg) {
if (msg?.t !== 'input') return;
const p = game.players.find((pl) => pl.id === conn.peer);
if (p) {
p.input = {
up: !!msg.up, down: !!msg.down, left: !!msg.left, right: !!msg.right,
aim: Number(msg.aim) || 0, shoot: !!msg.shoot,
};
}
},
onError(type) { gameMsg(`network error: ${type}`); },
});

game.state = 'lobby';
hideAllOverlays();
show($('ov-lobby'));
$('lobby-title').textContent = 'MULTIPLAYER LOBBY';
$('room-code').textContent = '·····';
$('lobby-note').textContent = 'share the link — friends who open it join instantly';
$('btn-start').style.display = '';
updateLobbyCount();

net.host((code) => {
$('room-code').textContent = code;
const link = `${location.origin}${location.pathname}?room=${code}`;
$('share-link').value = link;
});

// host broadcast loop — 20hz
setInterval(() => {
if (!net?.isHost) return;
if (game.state === 'lobby') net.broadcast({ t: 'lobby', n: game.players.length });
else if (game.state === 'playing' || game.state === 'dead') net.broadcast(snapshot());
}, 50);
}

function joinGame(code) {
game.mode = 'client';

net = new Net({
onData(conn, msg) {
switch (msg?.t) {
case 'init':
myId = msg.id;
break;
case 'lobby':
$('lobby-count').textContent = `${msg.n} player${msg.n === 1 ? '' : 's'} in the room — waiting for host to start`;
break;
case 'floor':
clientFloor = msg;
break;
case 'start':
game.state = 'playing';
hideAllOverlays();
break;
case 'mod':
// a live mod from the host — apply it so everyone plays the same remix
try {
new Function('DP', msg.code)(window.DP);
window.DP.activeMods.push({ code: msg.code, summary: msg.summary });
gameMsg(`mod from host: ${msg.summary || 'applied'}`);
} catch (e) { console.warn('host mod failed to apply', e); }
break;
case 'state':
clientState = msg;
if (msg.st === 'playing' && game.state !== 'playing') {
game.state = 'playing';
hideAllOverlays();
}
break;
case 'dead':
game.state = 'dead';
$('death-stats').textContent = msg.stats;
$('btn-restart').style.display = 'none';
$('death-note').textContent = 'waiting for the host to restart...';
show($('ov-dead'));
break;
}
},
onLeave() {
hideAllOverlays();
show($('ov-lobby'));
$('lobby-title').textContent = 'CONNECTION LOST';
$('room-code').textContent = '·····';
$('lobby-count').textContent = 'the host left (or the wifi did)';
$('lobby-note').textContent = '';
$('btn-start').style.display = 'none';
},
onError(type) {
$('lobby-count').textContent = type === 'peer-unavailable'
? 'room not found — check the link'
: `network error: ${type}`;
},
});

game.state = 'lobby';
hideAllOverlays();
show($('ov-lobby'));
$('lobby-title').textContent = 'JOINING ROOM';
$('room-code').textContent = code;
$('share-link').value = location.href;
$('lobby-count').textContent = 'connecting...';
$('lobby-note').textContent = 'the host starts the game for everyone';
$('btn-start').style.display = 'none';

net.join(code, () => {
$('lobby-count').textContent = 'connected! waiting for host to start';
});

// client input loop — 30hz
setInterval(() => {
if (game.state !== 'playing' || !clientState) return;
const me = clientState.players.find((p) => p.id === myId);
if (!me) return;
net.send({ t: 'input', ...readLocalInput() });
}, 33);
}

// ---------------------------------------------------------------- main loop

let last = performance.now();
function frame(now) {
const dt = Math.min(0.033, (now - last) / 1000);
last = now;
game.t += dt;

if (game.state === 'playing' || game.state === 'dead') {
if (game.mode === 'client') {
renderClient();
} else {
if (game.state === 'playing') updateWorld(dt);
if (game.room) render();
}
}

requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot

function init() {
loadFont();
$('hi-score').textContent = getBest().toLocaleString('en-US');

$('btn-single').addEventListener('click', startSingle);
$('btn-multi').addEventListener('click', hostGame);
$('btn-start').addEventListener('click', () => {
if (game.mode === 'host') newRun();
});
$('btn-leave').addEventListener('click', backToTitle);
$('btn-restart').addEventListener('click', () => {
if (game.mode !== 'client') restartFloor();
});
$('btn-title').addEventListener('click', backToTitle);
$('copy-link').addEventListener('click', () => {
const link = $('share-link').value;
const done = () => gameMsg('link copied!');
if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(done, done);
else { $('share-link').select(); done(); }
});

// joining via shared link?
const room = new URLSearchParams(location.search).get('room');
if (room) {
if (Net.available()) {
hide($('ov-title'));
joinGame(room);
} else {
gameMsg('multiplayer needs internet — PeerJS failed to load');
}
}

requestAnimationFrame(frame);
}

init();

// ---------------------------------------------------------------- live remix API
// Everything the AI remix drawer (remix.js) is allowed to touch. Mods patch
// prototypes and mutate these live objects while the game keeps running.

window.DP = {
game,
gameMsg,
hooks,
assets: { drawRoom, drawPlayerSprite, drawEnemySprite, drawProjectile, drawPickup },
Player,
Projectile,
Pickup,
makeEnemy,
ENEMY_TYPES,
ITEM_POOL,
rollItemChoices,
randomDrop,
sfx,
consts: { W, H, WALL, DOOR, PLAYER_COLORS },
// live mod sync: the remix dock calls shareMod after a mod applies locally;
// when hosting, the mod is broadcast so the whole room gets it live.
activeMods: [],
shareMod(code, summary) {
this.activeMods.push({ code, summary });
if (game.mode === 'host' && net) net.broadcast({ t: 'mod', code, summary });
},
};
