// SLOPPY ZOMBIES — round-based undead survival in the World-at-War mold.
// Boarded windows, a points economy, wall-buy guns, a mystery box, knifing,
// perks, power-ups, and co-op multiplayer (host-authoritative over WebRTC).
//
// Live-moddable: the whole sim is exposed on window.SZ for the remix dock,
// and applied mods are broadcast to every player in a multiplayer room.

import { Net } from './network.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

const $ = (id) => document.getElementById(id);
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const PLAYER_COLORS = ['#7FB069', '#C9A66B', '#6B9AC9', '#C96B6B'];
const FREDOKA = '"Fredoka One", sans-serif';
const MONO = '"Space Mono", monospace';

// ---------------------------------------------------------------- weapons

const WEAPONS = {
pistol: { name: 'Sloppy 1911', dmg: 30, mag: 8, reserve: 64, rpm: 200, auto: false, spread: 0.03, pellets: 1, reload: 1.3, tracer: '#FFE9A8' },
smg: { name: 'Gutter Gun', dmg: 24, mag: 30, reserve: 180, rpm: 620, auto: true, spread: 0.075, pellets: 1, reload: 2.0, cost: 1200, tracer: '#FFE9A8' },
shotgun: { name: 'Mop Sweeper', dmg: 16, mag: 6, reserve: 42, rpm: 75, auto: false, spread: 0.16, pellets: 8, reload: 2.6, cost: 1500, tracer: '#FFD27A' },
rifle: { name: 'Old Reliable', dmg: 110, mag: 5, reserve: 45, rpm: 55, auto: false, spread: 0.006, pellets: 1, reload: 2.2, cost: 1800, tracer: '#FFF3C9' },
mg: { name: 'Slop Saw', dmg: 38, mag: 75, reserve: 225, rpm: 540, auto: true, spread: 0.09, pellets: 1, reload: 3.6, cost: 3000, tracer: '#FFCE7A' },
mp40: { name: 'Sloppy Forty', dmg: 30, mag: 32, reserve: 192, rpm: 520, auto: true, spread: 0.06, pellets: 1, reload: 2.1, boxOnly: true, tracer: '#FFE9A8' },
magnum: { name: 'Slop Python', dmg: 140, mag: 6, reserve: 48, rpm: 130, auto: false, spread: 0.014, pellets: 1, reload: 2.4, boxOnly: true, tracer: '#FFF3C9' },
raygun: { name: 'Ray of Slop', dmg: 420, mag: 20, reserve: 160, rpm: 180, auto: false, spread: 0.012, pellets: 1, reload: 2.5, boxOnly: true, tracer: '#3DFFB0' },
};
const BOX_POOL = ['smg', 'shotgun', 'rifle', 'mg', 'mp40', 'magnum', 'raygun'];

// ---------------------------------------------------------------- map

// outer border + a dividing wall; the left room opens with a 1000-point door
const WALLS = [
{ x: 0, y: 0, w: 120, h: 16 }, { x: 200, y: 0, w: 280, h: 16 }, { x: 560, y: 0, w: 240, h: 16 },
{ x: 0, y: 584, w: 480, h: 16 }, { x: 560, y: 584, w: 240, h: 16 },
{ x: 0, y: 16, w: 16, h: 244 }, { x: 0, y: 340, w: 16, h: 244 },
{ x: 784, y: 16, w: 16, h: 164 }, { x: 784, y: 260, w: 16, h: 120 }, { x: 784, y: 460, w: 16, h: 124 },
{ x: 292, y: 16, w: 16, h: 244, door: true }, { x: 292, y: 340, w: 16, h: 244, door2: true },
];
const DOOR_RECT = { x: 292, y: 260, w: 16, h: 80 };

// window blockers: solid for players always; zombies pass through while entering
const WINDOWS = [
{ id: 'n_r', rect: { x: 480, y: 0, w: 80, h: 16 }, out: [520, -26], in: [520, 52], boards: 6, left: false },
{ id: 'e1', rect: { x: 784, y: 180, w: 16, h: 80 }, out: [828, 220], in: [748, 220], boards: 6, left: false },
{ id: 'e2', rect: { x: 784, y: 380, w: 16, h: 80 }, out: [828, 420], in: [748, 420], boards: 6, left: false },
{ id: 's_r', rect: { x: 480, y: 584, w: 80, h: 16 }, out: [520, 626], in: [520, 548], boards: 6, left: false },
{ id: 'n_l', rect: { x: 120, y: 0, w: 80, h: 16 }, out: [160, -26], in: [160, 52], boards: 6, left: true },
{ id: 'w', rect: { x: 0, y: 260, w: 16, h: 80 }, out: [-28, 300], in: [52, 300], boards: 6, left: true },
];

const STATIONS = [
{ id: 'smg', type: 'gun', weapon: 'smg', cost: 1200, x: 635, y: 42, label: 'Gutter Gun' },
{ id: 'shotgun', type: 'gun', weapon: 'shotgun', cost: 1500, x: 635, y: 558, label: 'Mop Sweeper' },
{ id: 'rifle', type: 'gun', weapon: 'rifle', cost: 1800, x: 752, y: 320, label: 'Old Reliable' },
{ id: 'mg', type: 'gun', weapon: 'mg', cost: 3000, x: 48, y: 480, label: 'Slop Saw' },
{ id: 'door', type: 'door', cost: 1000, x: 300, y: 300, label: 'Open Door' },
{ id: 'box', type: 'box', cost: 950, x: 120, y: 120, label: 'Mystery Box' },
{ id: 'jug', type: 'perk', perk: 'jug', cost: 2500, x: 245, y: 70, label: 'Slop-A-Cola (+150 HP)' },
{ id: 'speed', type: 'perk', perk: 'speed', cost: 3000, x: 245, y: 530, label: 'Speedy Slop (fast reload)' },
];

// ---------------------------------------------------------------- state

const game = {
state: 'title', // title | lobby | playing | gameover
mode: 'single', // single | host | client
round: 0,
zombiesLeft: 0, // still to spawn this round
spawnCd: 0,
betweenRounds: 0,
zombies: [],
players: [],
powerups: [], // { x, y, kind, t }
tracers: [], // { x1, y1, x2, y2, col, t }
particles: [],
decals: [], // blood, capped
windows: WINDOWS.map((w) => ({ ...w, boards: 6 })),
doorOpen: false,
box: { state: 'idle', t: 0, offer: null },
instaT: 0,
x2T: 0,
t: 0,
shake: 0,
netEvents: [],
};

let zombieSeq = 1;

// render + logic hooks for live mods
const hooks = {};

// ---------------------------------------------------------------- audio

let actx = null;
function ac() {
if (!actx) {
const AC = window.AudioContext || window.webkitAudioContext;
if (AC) actx = new AC();
}
if (actx?.state === 'suspended') actx.resume();
return actx;
}
function noise(dur, vol, freq = 800) {
const c = ac(); if (!c) return;
try {
const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
const d = buf.getChannelData(0);
for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
const src = c.createBufferSource(); src.buffer = buf;
const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
const g = c.createGain(); g.gain.value = vol;
src.connect(f).connect(g).connect(c.destination); src.start();
} catch { /* audio optional */ }
}
function tone(f0, f1, dur, vol = 0.05, type = 'sawtooth') {
const c = ac(); if (!c) return;
try {
const o = c.createOscillator(); const g = c.createGain();
o.type = type; o.frequency.setValueAtTime(f0, c.currentTime);
o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), c.currentTime + dur);
g.gain.setValueAtTime(vol, c.currentTime);
g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur + 0.02);
} catch { /* audio optional */ }
}
const sfx = {
shoot: () => noise(0.09, 0.10, 1800),
bigShoot: () => { noise(0.14, 0.13, 900); tone(160, 60, 0.12, 0.05); },
ray: () => tone(900, 220, 0.22, 0.07, 'square'),
knife: () => noise(0.06, 0.06, 3000),
hit: () => noise(0.04, 0.05, 600),
hurt: () => tone(150, 60, 0.3, 0.09),
groan: () => tone(70 + Math.random() * 40, 45, 0.5, 0.035),
board: () => noise(0.12, 0.08, 400),
rip: () => { noise(0.18, 0.09, 300); tone(120, 70, 0.2, 0.04); },
buy: () => { tone(520, 520, 0.08, 0.06, 'square'); tone(780, 780, 0.1, 0.06, 'square'); },
round: () => { tone(90, 50, 1.4, 0.1); tone(140, 80, 1.2, 0.06); },
power: () => { tone(420, 840, 0.25, 0.07, 'square'); },
reload: () => noise(0.07, 0.05, 1200),
dry: () => tone(220, 180, 0.05, 0.04, 'square'),
down: () => tone(200, 40, 0.9, 0.1),
box: () => tone(330, 660, 0.4, 0.05, 'triangle'),
};

// ---------------------------------------------------------------- helpers

function gameMsg(text, ms = 2400) {
const el = $('game-msg');
el.textContent = text;
el.classList.add('on');
clearTimeout(gameMsg.timer);
gameMsg.timer = setTimeout(() => el.classList.remove('on'), ms);
}

function netEvent(e) { if (game.mode === 'host') game.netEvents.push(e); }

function makePlayer(id, name, color) {
return {
id, name, color, isPlayer: true,
x: 550, y: 300, r: 13, aim: 0,
hp: 100, maxHp: 100, points: 500,
weapons: [{ id: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve }],
cur: 0, fireCd: 0, reloading: 0, knifeCd: 0, knifeT: 0,
downed: false, bleed: 0, reviveT: 0, regenT: 0, lastHit: -99,
speedMul: 1, perks: {},
kills: 0,
input: { mx: 0, my: 0, aim: 0, shoot: false, reload: false, knife: false, interact: false, swap: false },
};
}

function makeZombie(round, win) {
const sprintShare = Math.min(0.7, round * 0.07);
const roll = Math.random();
const type = roll < sprintShare ? 'sprinter' : roll < sprintShare + 0.3 ? 'jogger' : 'walker';
const speed = { walker: 36, jogger: 60, sprinter: 92 }[type] * (1 + round * 0.012);
const hp = 55 + round * 38;
return {
id: zombieSeq++, x: win.out[0] + (Math.random() - 0.5) * 30, y: win.out[1] + (Math.random() - 0.5) * 30,
r: 12, hp, maxHp: hp, speed, type,
state: 'approach', // approach | tear | enter | chase
window: win.id, attackCd: 0, tearCd: 0, t: Math.random() * 9, flash: 0,
};
}

const curWeapon = (p) => p.weapons[p.cur];
const weaponDef = (p) => WEAPONS[curWeapon(p).id] || WEAPONS.pistol;

function givePoints(p, n) {
p.points += game.x2T > 0 ? n * 2 : n;
}

// ---------------------------------------------------------------- collision

function circleVsWalls(ent, ignoreWindowId = null) {
const rects = [];
for (const w of WALLS) {
if ((w.door || w.door2) && game.doorOpen && w.door === undefined && w.door2 === undefined) continue;
rects.push(w);
}
if (!game.doorOpen) rects.push(DOOR_RECT);
for (const win of game.windows) {
if (win.id !== ignoreWindowId) rects.push(win.rect);
}
for (const r of rects) {
const cx = clamp(ent.x, r.x, r.x + r.w);
const cy = clamp(ent.y, r.y, r.y + r.h);
const dx = ent.x - cx;
const dy = ent.y - cy;
const d2 = dx * dx + dy * dy;
if (d2 < ent.r * ent.r && d2 > 0.0001) {
const d = Math.sqrt(d2);
ent.x += (dx / d) * (ent.r - d);
ent.y += (dy / d) * (ent.r - d);
} else if (d2 <= 0.0001) {
ent.y = r.y - ent.r; // degenerate: push up
}
}
}

function clampInside(p) {
p.x = clamp(p.x, 18 + p.r, W - 18 - p.r);
p.y = clamp(p.y, 18 + p.r, H - 18 - p.r);
}

// hitscan: march the ray, stop at first wall, damage first zombie hit
function fireRay(p, angle, def) {
const step = 6;
const range = 900;
let x = p.x + Math.cos(angle) * (p.r + 6);
let y = p.y + Math.sin(angle) * (p.r + 6);
const dx = Math.cos(angle) * step;
const dy = Math.sin(angle) * step;
const solids = WALLS.concat(game.doorOpen ? [] : [DOOR_RECT]);
for (let d = 0; d < range; d += step) {
x += dx; y += dy;
if (x < 0 || x > W || y < 0 || y > H) break;
let blocked = false;
for (const r of solids) {
if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { blocked = true; break; }
}
if (blocked) break;
for (const z of game.zombies) {
if (z.hp <= 0) continue;
if (dist2(x, y, z.x, z.y) < (z.r + 3) ** 2) {
const dmg = game.instaT > 0 ? z.hp : def.dmg;
z.hp -= dmg;
z.flash = 0.1;
givePoints(p, 10);
sfx.hit();
netEvent({ k: 'hitm', id: p.id });
if (p.id === myId) hitMarkerT = 0.12;
if (z.hp <= 0) onZombieKill(p, z, false);
return { x, y, hit: true };
}
}
}
return { x, y, hit: false };
}

function onZombieKill(p, z, knifed) {
givePoints(p, knifed ? 130 : 60);
p.kills++;
splatter(z.x, z.y);
hooks.onKill?.(p, z);
// power-up drop
if (Math.random() < 0.034 && game.powerups.length < 3) {
const kinds = ['insta', 'x2', 'nuke', 'ammo'];
game.powerups.push({ x: z.x, y: z.y, kind: kinds[Math.floor(Math.random() * kinds.length)], t: 24 });
}
}

function splatter(x, y) {
for (let i = 0; i < 10; i++) {
game.particles.push({
x, y, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220,
t: 0.45 + Math.random() * 0.3, col: '#7A1212', r: 2 + Math.random() * 3,
});
}
if (game.decals.length > 60) game.decals.shift();
game.decals.push({ x, y, r: 9 + Math.random() * 10, a: 0.55 });
}

// ---------------------------------------------------------------- rounds

function startRound(n) {
game.round = n;
const players = Math.max(1, game.players.length);
game.zombiesLeft = Math.round((5 + n * 4) * (0.7 + 0.3 * players));
game.betweenRounds = 0;
sfx.round();
gameMsg(`— ROUND ${n} —`, 3000);
netEvent({ k: 'msg', text: `— ROUND ${n} —` });
netEvent({ k: 'snd', n: 'round' });
hooks.onRound?.(n);
}

function maxConcurrent() {
return Math.min(26, 8 + game.round * 2 + game.players.length * 2);
}

function pickWindow() {
const active = game.windows.filter((w) => !w.left || game.doorOpen);
let best = null;
let bestScore = -Infinity;
for (const w of active) {
const queue = game.zombies.filter((z) => z.window === w.id && z.state !== 'chase').length;
if (queue >= 4) continue;
let near = Infinity;
for (const p of game.players) {
if (!p.downed) near = Math.min(near, dist2(w.in[0], w.in[1], p.x, p.y));
}
const score = -Math.sqrt(near) - queue * 60 + Math.random() * 120;
if (score > bestScore) { bestScore = score; best = w; }
}
return best || game.windows[0];
}

// ---------------------------------------------------------------- update

function updatePlayer(p, dt) {
const inp = p.input;

if (p.downed) {
p.bleed -= dt;
if (p.bleed <= 0) p.dead = true;
return;
}

// movement
const mx = inp.mx || 0;
const my = inp.my || 0;
const m = Math.hypot(mx, my) || 1;
const speed = 150 * p.speedMul;
p.x += (mx / m) * speed * dt * (mx || my ? 1 : 0);
p.y += (my / m) * speed * dt * (mx || my ? 1 : 0);
circleVsWalls(p);
clampInside(p);
p.aim = inp.aim;

// health regen, CoD style
if (game.t - p.lastHit > 3.6 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 45 * dt);

// timers
p.fireCd = Math.max(0, p.fireCd - dt);
p.knifeCd = Math.max(0, p.knifeCd - dt);
p.knifeT = Math.max(0, p.knifeT - dt);
if (p.reloading > 0) {
p.reloading -= dt;
if (p.reloading <= 0) {
const w = curWeapon(p);
const def = WEAPONS[w.id];
const need = def.mag - w.mag;
const take = Math.min(need, w.reserve);
w.mag += take;
w.reserve -= take;
}
}

// weapon swap (edge)
if (inp.swap && !p._swapHeld && p.weapons.length > 1) {
p.cur = (p.cur + 1) % p.weapons.length;
p.reloading = 0;
}
p._swapHeld = inp.swap;

// reload (edge)
const w = curWeapon(p);
const def = WEAPONS[w.id] || WEAPONS.pistol;
if (inp.reload && !p._reloadHeld && p.reloading <= 0 && w.mag < def.mag && w.reserve > 0) {
p.reloading = def.reload * (p.perks.speed ? 0.55 : 1);
sfx.reload();
}
p._reloadHeld = inp.reload;

// knife (edge)
if (inp.knife && !p._knifeHeld && p.knifeCd <= 0) {
p.knifeCd = 0.55;
p.knifeT = 0.16;
sfx.knife();
netEvent({ k: 'snd', n: 'knife' });
const reachX = p.x + Math.cos(p.aim) * 26;
const reachY = p.y + Math.sin(p.aim) * 26;
for (const z of game.zombies) {
if (z.hp <= 0) continue;
if (dist2(reachX, reachY, z.x, z.y) < (z.r + 20) ** 2) {
const dmg = game.instaT > 0 || game.round <= 2 ? z.hp : 150;
z.hp -= dmg;
z.flash = 0.1;
splatter(z.x, z.y);
if (z.hp <= 0) onZombieKill(p, z, true);
else givePoints(p, 10);
break;
}
}
}
p._knifeHeld = inp.knife;

// shooting
if (inp.shoot && p.fireCd <= 0 && p.reloading <= 0 && p.knifeT <= 0) {
if (w.mag <= 0) {
if (!p._dryHeld) { sfx.dry(); if (w.reserve > 0) { p.reloading = def.reload * (p.perks.speed ? 0.55 : 1); sfx.reload(); } }
p._dryHeld = true;
} else {
w.mag--;
// every gun fires while held; semi-autos just have a low rpm
p.fireCd = 60 / def.rpm;
const col = def.tracer || '#FFE9A8';
for (let i = 0; i < def.pellets; i++) {
const a = p.aim + (Math.random() - 0.5) * 2 * def.spread;
const end = fireRay(p, a, def);
game.tracers.push({ x1: p.x + Math.cos(a) * 16, y1: p.y + Math.sin(a) * 16, x2: end.x, y2: end.y, col, t: 0.07 });
netEvent({ k: 'tracer', x1: p.x, y1: p.y, x2: end.x, y2: end.y, col });
}
(w.id === 'raygun' ? sfx.ray : def.pellets > 1 || def.dmg > 80 ? sfx.bigShoot : sfx.shoot)();
netEvent({ k: 'snd', n: w.id === 'raygun' ? 'ray' : 'shoot' });
game.shake = Math.min(0.3, game.shake + (def.pellets > 1 ? 0.12 : 0.05));
}
} else {
p._dryHeld = false;
}

// interactions (hold F)
p.prompt = null;
if (inp.interact) p._interactT = (p._interactT || 0) + dt;
else p._interactT = 0;
handleInteractions(p, dt);

// power-up pickup
for (let i = game.powerups.length - 1; i >= 0; i--) {
const pu = game.powerups[i];
if (dist2(p.x, p.y, pu.x, pu.y) < 26 ** 2) {
game.powerups.splice(i, 1);
applyPowerup(pu.kind, p);
}
}
}

function applyPowerup(kind, p) {
sfx.power();
netEvent({ k: 'snd', n: 'power' });
if (kind === 'insta') { game.instaT = 25; announce('INSTA-KILL'); }
if (kind === 'x2') { game.x2T = 30; announce('DOUBLE POINTS'); }
if (kind === 'nuke') {
for (const z of game.zombies) { if (z.hp > 0) { z.hp = 0; splatter(z.x, z.y); } }
for (const pl of game.players) givePoints(pl, 400);
game.shake = 0.5;
announce('KABOOM — +400');
}
if (kind === 'ammo') {
for (const pl of game.players) {
for (const w of pl.weapons) {
const def = WEAPONS[w.id];
if (def) { w.mag = def.mag; w.reserve = def.reserve; }
}
}
announce('MAX AMMO');
}
}

function announce(text) {
gameMsg(text, 2600);
netEvent({ k: 'msg', text });
}

function handleInteractions(p, dt) {
// revive downed teammates first
for (const o of game.players) {
if (o !== p && o.downed && !o.dead && dist2(p.x, p.y, o.x, o.y) < 42 ** 2) {
p.prompt = `hold F — reviving ${o.name} ${Math.ceil(3 - o.reviveT)}s`;
if (p.input.interact) {
o.reviveT += dt;
if (o.reviveT >= 3) {
o.downed = false; o.hp = 50; o.bleed = 0; o.reviveT = 0;
announce(`${o.name} is back up!`);
}
} else o.reviveT = 0;
return;
}
}

// window rebuilding
for (const win of game.windows) {
const cx = win.rect.x + win.rect.w / 2;
const cy = win.rect.y + win.rect.h / 2;
if (dist2(p.x, p.y, cx, cy) < 52 ** 2 && win.boards < 6) {
p.prompt = 'hold F — rebuild barrier (+10)';
p._boardT = (p._boardT || 0) + (p.input.interact ? dt : -p._boardT);
if (p._boardT > 0.9) {
p._boardT = 0;
win.boards++;
givePoints(p, 10);
sfx.board();
netEvent({ k: 'snd', n: 'board' });
}
return;
}
}

// stations
for (const st of STATIONS) {
if (st.type === 'door' && game.doorOpen) continue;
if (dist2(p.x, p.y, st.x, st.y) > 46 ** 2) continue;

if (st.type === 'gun') {
const owned = p.weapons.find((w) => w.id === st.weapon);
const cost = owned ? Math.floor(st.cost / 2) : st.cost;
p.prompt = owned ? `F — ammo for ${st.label} (${cost})` : `F — buy ${st.label} (${cost})`;
if (edgeInteract(p)) {
if (p.points < cost) return deny(p);
p.points -= cost;
sfx.buy();
if (owned) { owned.reserve = WEAPONS[st.weapon].reserve; }
else giveWeapon(p, st.weapon);
}
return;
}
if (st.type === 'door') {
p.prompt = `F — clear the debris (${st.cost})`;
if (edgeInteract(p)) {
if (p.points < st.cost) return deny(p);
p.points -= st.cost;
game.doorOpen = true;
sfx.buy();
announce('the back room is open — mystery box inside');
}
return;
}
if (st.type === 'perk') {
if (p.perks[st.perk]) continue;
p.prompt = `F — ${st.label} (${st.cost})`;
if (edgeInteract(p)) {
if (p.points < st.cost) return deny(p);
p.points -= st.cost;
p.perks[st.perk] = true;
if (st.perk === 'jug') { p.maxHp = 250; p.hp = 250; }
sfx.buy();
announce(`${p.name} bought ${st.label.split(' (')[0]}`);
}
return;
}
if (st.type === 'box') {
if (game.box.state === 'idle') {
p.prompt = `F — spin the mystery box (${st.cost})`;
if (edgeInteract(p)) {
if (p.points < st.cost) return deny(p);
p.points -= st.cost;
game.box = { state: 'rolling', t: 2.6, offer: null, for: p.id };
sfx.box();
netEvent({ k: 'snd', n: 'box' });
}
} else if (game.box.state === 'offer' && game.box.for === p.id) {
p.prompt = `F — take ${WEAPONS[game.box.offer].name} (${Math.ceil(game.box.t)}s)`;
if (edgeInteract(p)) {
giveWeapon(p, game.box.offer);
game.box = { state: 'idle', t: 0, offer: null };
sfx.buy();
}
} else if (game.box.state === 'rolling') {
p.prompt = 'the box is deciding…';
}
return;
}
}
}

function edgeInteract(p) {
const fresh = p.input.interact && !p._fHeld;
p._fHeld = p.input.interact;
return fresh;
}

function deny(p) {
if (p.id === myId) gameMsg('not enough points', 1200);
else netEvent({ k: 'deny', id: p.id });
}

function giveWeapon(p, id) {
const def = WEAPONS[id];
const slot = { id, mag: def.mag, reserve: def.reserve };
if (p.weapons.length < 2) { p.weapons.push(slot); p.cur = p.weapons.length - 1; }
else { p.weapons[p.cur] = slot; }
p.reloading = 0;
}

function updateZombie(z, dt) {
z.t += dt;
z.flash = Math.max(0, z.flash - dt);
if (Math.random() < dt * 0.05) sfx.groan();

const win = game.windows.find((w) => w.id === z.window);

if (z.state === 'approach') {
moveToward(z, win.out[0], win.out[1], dt);
if (dist2(z.x, z.y, win.out[0], win.out[1]) < 18 ** 2) {
z.state = win.boards > 0 ? 'tear' : 'enter';
}
} else if (z.state === 'tear') {
z.tearCd -= dt;
if (z.tearCd <= 0) {
z.tearCd = 1.6 + Math.random() * 0.7;
if (win.boards > 0) {
win.boards--;
sfx.rip();
netEvent({ k: 'snd', n: 'rip' });
}
if (win.boards <= 0) z.state = 'enter';
}
} else if (z.state === 'enter') {
moveToward(z, win.in[0], win.in[1], dt, win.id);
if (dist2(z.x, z.y, win.in[0], win.in[1]) < 16 ** 2) z.state = 'chase';
} else {
// chase nearest living player
let target = null;
let best = Infinity;
for (const p of game.players) {
if (p.downed || p.dead) continue;
const d = dist2(z.x, z.y, p.x, p.y);
if (d < best) { best = d; target = p; }
}
if (!target) return;
moveToward(z, target.x, target.y, dt);
z.attackCd -= dt;
if (z.attackCd <= 0 && best < (z.r + target.r + 6) ** 2) {
z.attackCd = 0.9;
hurtPlayer(target, 30);
}
}
}

function moveToward(z, tx, ty, dt, ignoreWin = null) {
const a = Math.atan2(ty - z.y, tx - z.x);
const wob = Math.sin(z.t * 5) * 0.25;
z.x += Math.cos(a + wob) * z.speed * dt;
z.y += Math.sin(a + wob) * z.speed * dt;
z.dir = a;
// light zombie separation
for (const o of game.zombies) {
if (o === z || o.hp <= 0) continue;
const d2v = dist2(z.x, z.y, o.x, o.y);
if (d2v < 18 ** 2 && d2v > 0.01) {
const d = Math.sqrt(d2v);
z.x += ((z.x - o.x) / d) * (18 - d) * 0.4;
z.y += ((z.y - o.y) / d) * (18 - d) * 0.4;
}
}
if (z.state === 'chase') circleVsWalls(z, null);
else circleVsWalls(z, ignoreWin);
}

function hurtPlayer(p, dmg) {
if (p.downed || p.dead) return;
p.hp -= dmg;
p.lastHit = game.t;
sfx.hurt();
netEvent({ k: 'snd', n: 'hurt' });
netEvent({ k: 'hurt', id: p.id });
if (p.id === myId) hurtFlashT = 0.5;
game.shake = Math.min(0.4, game.shake + 0.15);
if (p.hp <= 0) {
p.hp = 0;
p.downed = true;
p.bleed = 32;
p.reviveT = 0;
sfx.down();
announce(`${p.name} is DOWN`);
const alive = game.players.some((pl) => !pl.downed && !pl.dead);
if (!alive) gameOver();
}
}

function updateWorld(dt) {
game.t += dt;
game.shake = Math.max(0, game.shake - dt * 1.6);
game.instaT = Math.max(0, game.instaT - dt);
game.x2T = Math.max(0, game.x2T - dt);

// local input for my player
const me = game.players.find((p) => p.id === myId);
if (me) me.input = readLocalInput(me);

for (const p of game.players) updatePlayer(p, dt);
for (const z of game.zombies) { if (z.hp > 0) updateZombie(z, dt); }
game.zombies = game.zombies.filter((z) => z.hp > 0);

// spawning
if (game.betweenRounds > 0) {
game.betweenRounds -= dt;
if (game.betweenRounds <= 0) startRound(game.round + 1);
} else if (game.zombiesLeft > 0) {
game.spawnCd -= dt;
if (game.spawnCd <= 0 && game.zombies.length < maxConcurrent()) {
game.spawnCd = Math.max(0.35, 2.2 - game.round * 0.12);
game.zombies.push(makeZombie(game.round, pickWindow()));
game.zombiesLeft--;
}
} else if (game.zombies.length === 0 && game.round > 0) {
game.betweenRounds = 6;
announce(`round ${game.round} survived — next horde incoming`);
}

// mystery box
if (game.box.state === 'rolling') {
game.box.t -= dt;
if (game.box.t <= 0) {
game.box.state = 'offer';
game.box.t = 10;
game.box.offer = BOX_POOL[Math.floor(Math.random() * BOX_POOL.length)];
}
} else if (game.box.state === 'offer') {
game.box.t -= dt;
if (game.box.t <= 0) game.box = { state: 'idle', t: 0, offer: null };
}

// effects
for (const tr of game.tracers) tr.t -= dt;
game.tracers = game.tracers.filter((t) => t.t > 0);
for (const pa of game.particles) {
pa.t -= dt; pa.x += pa.vx * dt; pa.y += pa.vy * dt; pa.vx *= 0.92; pa.vy *= 0.92;
}
game.particles = game.particles.filter((p) => p.t > 0);
for (const pu of game.powerups) pu.t -= dt;
game.powerups = game.powerups.filter((p) => p.t > 0);

hooks.onUpdate?.(dt, game);
}

function gameOver() {
game.state = 'gameover';
const best = Number(localStorage.getItem('sz-best-round') || 0);
if (game.round > best) localStorage.setItem('sz-best-round', String(game.round));
$('go-stats').textContent = `you survived to round ${game.round} · ${game.players.reduce((s, p) => s + p.kills, 0)} zombies down · best: round ${Math.max(best, game.round)}`;
$('btn-go-restart').style.display = game.mode === 'client' ? 'none' : '';
show($('ov-gameover'));
if (game.mode === 'host') net.broadcast({ t: 'over', stats: $('go-stats').textContent });
}

// ---------------------------------------------------------------- input

const keys = {};
let mouseX = W / 2;
let mouseY = H / 2;
let mouseDown = false;
let hitMarkerT = 0;
let hurtFlashT = 0;

function canvasCoords(e) {
const rect = canvas.getBoundingClientRect();
return [(e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height)];
}

window.addEventListener('keydown', (e) => {
if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
if (['Space', 'KeyR', 'KeyF', 'KeyV', 'KeyQ'].includes(e.code)) e.preventDefault();
keys[e.code] = true;
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousemove', (e) => { [mouseX, mouseY] = canvasCoords(e); });
canvas.addEventListener('mousedown', () => { mouseDown = true; ac(); });
window.addEventListener('mouseup', () => { mouseDown = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function readLocalInput(meState) {
const px = meState?.x ?? W / 2;
const py = meState?.y ?? H / 2;
return {
mx: (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0),
my: (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0),
aim: Math.atan2(mouseY - py, mouseX - px),
shoot: mouseDown,
reload: !!keys.KeyR,
knife: !!keys.KeyV,
interact: !!keys.KeyF,
swap: !!keys.KeyQ,
};
}

// ---------------------------------------------------------------- render

function drawMap() {
// floors
ctx.fillStyle = '#28221C';
ctx.fillRect(0, 0, W, H);
ctx.fillStyle = '#322A22';
ctx.fillRect(308, 16, 476, 568); // right room wood
ctx.strokeStyle = 'rgba(0,0,0,0.25)';
ctx.lineWidth = 1;
ctx.beginPath();
for (let y = 16; y < 584; y += 28) { ctx.moveTo(308, y); ctx.lineTo(784, y); }
ctx.stroke();
ctx.fillStyle = game.doorOpen ? '#2A2D2A' : '#1A1C1A';
ctx.fillRect(16, 16, 276, 568); // left room concrete
ctx.strokeStyle = 'rgba(255,255,255,0.025)';
ctx.beginPath();
for (let x = 16; x < 292; x += 40) { ctx.moveTo(x, 16); ctx.lineTo(x, 584); }
ctx.stroke();

// blood decals
for (const d of game.decals) {
ctx.fillStyle = `rgba(90,12,12,${d.a})`;
ctx.beginPath();
ctx.arc(d.x, d.y, d.r, 0, 7);
ctx.fill();
}

// walls
for (const r of WALLS) {
ctx.fillStyle = '#0E0C0A';
ctx.fillRect(r.x, r.y, r.w, r.h);
ctx.strokeStyle = '#3A332B';
ctx.lineWidth = 2;
ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
}
// door
if (!game.doorOpen) {
ctx.fillStyle = '#4A3B28';
ctx.fillRect(DOOR_RECT.x, DOOR_RECT.y, DOOR_RECT.w, DOOR_RECT.h);
ctx.strokeStyle = '#211A10';
for (let i = 1; i < 4; i++) {
ctx.beginPath();
ctx.moveTo(DOOR_RECT.x, DOOR_RECT.y + i * 20);
ctx.lineTo(DOOR_RECT.x + DOOR_RECT.w, DOOR_RECT.y + i * 20);
ctx.stroke();
}
}

// windows + boards
for (const win of game.windows) {
const r = win.rect;
ctx.fillStyle = '#0A0908';
ctx.fillRect(r.x, r.y, r.w, r.h);
const horiz = r.w > r.h;
for (let i = 0; i < win.boards; i++) {
ctx.save();
ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
ctx.rotate((i % 2 ? 0.12 : -0.1) + i * 0.03);
ctx.fillStyle = i % 2 ? '#6B5634' : '#7A6340';
if (horiz) ctx.fillRect(-r.w / 2 - 4, -7 + (i - 2.5) * 2.4, r.w + 8, 6);
else ctx.fillRect(-7 + (i - 2.5) * 2.4, -r.h / 2 - 4, 6, r.h + 8);
ctx.restore();
}
}

// stations
ctx.font = `10px ${MONO}`;
ctx.textAlign = 'center';
for (const st of STATIONS) {
if (st.type === 'door') continue;
if (st.type === 'box') {
const glow = game.box.state !== 'idle';
ctx.fillStyle = glow ? '#3A2E1A' : '#2E2516';
ctx.fillRect(st.x - 30, st.y - 18, 60, 36);
ctx.strokeStyle = glow ? '#FFD86B' : '#8A6F3C';
ctx.lineWidth = 2;
ctx.strokeRect(st.x - 30, st.y - 18, 60, 36);
ctx.fillStyle = '#FFD86B';
ctx.fillText('?', st.x, st.y + 4);
if (game.box.state === 'rolling') {
const flick = BOX_POOL[Math.floor(game.t * 9) % BOX_POOL.length];
ctx.fillStyle = '#FFE9A8';
ctx.fillText(WEAPONS[flick].name, st.x, st.y - 26);
} else if (game.box.state === 'offer') {
ctx.fillStyle = '#3DFFB0';
ctx.fillText(WEAPONS[game.box.offer].name, st.x, st.y - 26);
}
} else if (st.type === 'perk') {
ctx.fillStyle = st.perk === 'jug' ? '#5A1A1A' : '#1A3A4A';
ctx.fillRect(st.x - 14, st.y - 20, 28, 40);
ctx.strokeStyle = '#777';
ctx.lineWidth = 2;
ctx.strokeRect(st.x - 14, st.y - 20, 28, 40);
ctx.fillStyle = '#DDD';
ctx.fillText(st.perk === 'jug' ? 'JUG' : 'SPD', st.x, st.y + 3);
} else {
// wall-buy chalk outline
ctx.strokeStyle = 'rgba(230,230,210,0.5)';
ctx.lineWidth = 1.5;
ctx.strokeRect(st.x - 22, st.y - 8, 44, 16);
ctx.beginPath();
ctx.moveTo(st.x - 16, st.y);
ctx.lineTo(st.x + 12, st.y);
ctx.lineTo(st.x + 18, st.y - 4);
ctx.stroke();
}
}
ctx.textAlign = 'left';
}

function drawZombie(z, t) {
if (hooks.drawZombie) { try { hooks.drawZombie(ctx, z, t); return; } catch { /* fall back */ } }
const lurch = Math.sin(z.t * 7) * 2.5;
ctx.save();
ctx.translate(z.x, z.y);
ctx.rotate(z.dir ?? 0);
if (z.flash > 0) ctx.globalAlpha = 0.55;
// arms reaching forward
ctx.strokeStyle = '#4A5A3A';
ctx.lineWidth = 5;
ctx.lineCap = 'round';
ctx.beginPath();
ctx.moveTo(2, -6); ctx.lineTo(16, -7 + lurch);
ctx.moveTo(2, 6); ctx.lineTo(16, 7 - lurch);
ctx.stroke();
// body
const bodyCol = z.type === 'sprinter' ? '#5E7044' : z.type === 'jogger' ? '#55663E' : '#4C5C38';
ctx.fillStyle = bodyCol;
ctx.beginPath();
ctx.arc(0, 0, z.r, 0, 7);
ctx.fill();
ctx.strokeStyle = '#202818';
ctx.lineWidth = 2;
ctx.stroke();
// head
ctx.fillStyle = '#6E8050';
ctx.beginPath();
ctx.arc(5, 0, 6, 0, 7);
ctx.fill();
// glowing eyes
ctx.fillStyle = game.instaT > 0 ? '#FFE96B' : '#FFB13D';
ctx.fillRect(7, -3, 2.5, 2);
ctx.fillRect(7, 1.5, 2.5, 2);
// hp bar when chewed on
if (z.hp < z.maxHp) {
ctx.rotate(-(z.dir ?? 0));
ctx.fillStyle = 'rgba(0,0,0,0.5)';
ctx.fillRect(-11, -z.r - 8, 22, 3);
ctx.fillStyle = '#B33';
ctx.fillRect(-11, -z.r - 8, 22 * Math.max(0, z.hp / z.maxHp), 3);
}
ctx.restore();
ctx.globalAlpha = 1;
}

function drawPlayer(p, t) {
if (hooks.drawPlayer) { try { hooks.drawPlayer(ctx, p, t); return; } catch { /* fall back */ } }
ctx.save();
ctx.translate(p.x, p.y);
if (p.downed) {
ctx.globalAlpha = 0.8;
ctx.fillStyle = '#5A1A1A';
ctx.beginPath();
ctx.arc(0, 0, p.r + 4, 0, 7);
ctx.fill();
ctx.fillStyle = p.color;
ctx.beginPath();
ctx.ellipse(0, 0, p.r, p.r * 0.6, t * 0.5, 0, 7);
ctx.fill();
ctx.restore();
ctx.fillStyle = '#FFF';
ctx.font = `9px ${MONO}`;
ctx.textAlign = 'center';
ctx.fillText('DOWN — F to revive', p.x, p.y - 20);
ctx.textAlign = 'left';
return;
}
ctx.rotate(p.aim);
// gun
ctx.strokeStyle = '#1A1A1A';
ctx.lineWidth = 5;
ctx.lineCap = 'round';
ctx.beginPath();
ctx.moveTo(4, 4);
ctx.lineTo(p.knifeT > 0 ? 24 : 19, p.knifeT > 0 ? 0 : 4);
ctx.stroke();
if (p.knifeT > 0) {
ctx.strokeStyle = '#C9C9C9';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(20, 0); ctx.lineTo(30, 0);
ctx.stroke();
}
// muzzle flash
if (p.fireCd > 0 && p.fireCd > 60 / (weaponDef(p).rpm || 200) - 0.05) {
ctx.fillStyle = '#FFE9A8';
ctx.beginPath();
ctx.arc(22, 4, 5 + Math.random() * 3, 0, 7);
ctx.fill();
}
// body + helmet
ctx.fillStyle = p.color;
ctx.beginPath();
ctx.arc(0, 0, p.r, 0, 7);
ctx.fill();
ctx.strokeStyle = '#15120E';
ctx.lineWidth = 2.5;
ctx.stroke();
ctx.fillStyle = 'rgba(0,0,0,0.35)';
ctx.beginPath();
ctx.arc(0, 0, p.r - 5, -2.4, 2.4);
ctx.fill();
ctx.restore();
// name
ctx.fillStyle = 'rgba(255,255,255,0.7)';
ctx.font = `9px ${MONO}`;
ctx.textAlign = 'center';
ctx.fillText(p.name, p.x, p.y - p.r - 7);
ctx.textAlign = 'left';
}

function drawPowerup(pu, t) {
const bob = Math.sin(t * 4 + pu.x) * 3;
const blink = pu.t < 5 && Math.floor(t * 5) % 2 === 0;
if (blink) return;
const cols = { insta: '#FFE96B', x2: '#3DFFB0', nuke: '#FF6B3D', ammo: '#6BC9FF' };
const labels = { insta: '', x2: '×2', nuke: '*', ammo: '∞' };
ctx.save();
ctx.translate(pu.x, pu.y + bob);
ctx.shadowColor = cols[pu.kind];
ctx.shadowBlur = 14;
ctx.fillStyle = '#16130E';
ctx.beginPath();
ctx.arc(0, 0, 13, 0, 7);
ctx.fill();
ctx.shadowBlur = 0;
ctx.strokeStyle = cols[pu.kind];
ctx.lineWidth = 2.5;
ctx.stroke();
ctx.fillStyle = cols[pu.kind];
ctx.font = `13px ${FREDOKA}`;
ctx.textAlign = 'center';
ctx.fillText(labels[pu.kind], 0, 5);
ctx.restore();
ctx.textAlign = 'left';
}

function drawHUD(me) {
// round counter — big, red, gothic
ctx.save();
ctx.shadowColor = '#FF2A1A';
ctx.shadowBlur = 16;
ctx.fillStyle = '#B81B10';
ctx.font = `46px ${FREDOKA}`;
ctx.fillText(String(game.round || 1), 26, 66);
ctx.restore();
ctx.fillStyle = 'rgba(255,255,255,0.45)';
ctx.font = `10px ${MONO}`;
ctx.fillText('ROUND', 26, 80);

// points list
let py = 110;
ctx.font = `13px ${MONO}`;
for (const p of game.players) {
ctx.fillStyle = p.color;
ctx.fillText(`${p.name}`, 26, py);
ctx.fillStyle = '#FFD86B';
ctx.fillText(`${p.points}`, 26 + ctx.measureText(p.name).width + 10, py);
py += 18;
}

if (me) {
// ammo
const w = curWeapon(me);
const def = WEAPONS[w.id] || WEAPONS.pistol;
ctx.textAlign = 'right';
ctx.fillStyle = '#EEE';
ctx.font = `22px ${FREDOKA}`;
ctx.fillText(me.reloading > 0 ? 'RELOADING' : `${w.mag} / ${w.reserve}`, W - 26, H - 30);
ctx.fillStyle = 'rgba(255,255,255,0.55)';
ctx.font = `11px ${MONO}`;
ctx.fillText(def.name + (me.weapons.length > 1 ? ' · Q swap' : ''), W - 26, H - 58);
// perks
let px = W - 26;
ctx.font = `10px ${MONO}`;
if (me.perks.jug) { ctx.fillStyle = '#FF6B6B'; ctx.fillText('JUG', px, H - 76); px -= 36; }
if (me.perks.speed) { ctx.fillStyle = '#6BC9FF'; ctx.fillText('SPD', px, H - 76); }
ctx.textAlign = 'left';

// health bar
ctx.fillStyle = 'rgba(0,0,0,0.5)';
ctx.fillRect(26, H - 44, 150, 14);
const hpFrac = clamp(me.hp / me.maxHp, 0, 1);
ctx.fillStyle = hpFrac > 0.4 ? '#7FB069' : '#C0392B';
ctx.fillRect(28, H - 42, 146 * hpFrac, 10);

// interaction prompt
if (me.prompt) {
ctx.fillStyle = 'rgba(0,0,0,0.65)';
const tw = ctx.measureText(me.prompt).width;
ctx.font = `13px ${MONO}`;
const pw = ctx.measureText(me.prompt).width + 28;
ctx.fillRect(W / 2 - pw / 2, H - 92, pw, 28);
ctx.fillStyle = '#FFE9A8';
ctx.textAlign = 'center';
ctx.fillText(me.prompt, W / 2, H - 73);
ctx.textAlign = 'left';
}
}

// active power-ups
let ix = W / 2 - 30;
ctx.font = `12px ${MONO}`;
ctx.textAlign = 'center';
if (game.instaT > 0) { ctx.fillStyle = '#FFE96B'; ctx.fillText(` ${Math.ceil(game.instaT)}`, ix, 34); ix += 60; }
if (game.x2T > 0) { ctx.fillStyle = '#3DFFB0'; ctx.fillText(`×2 ${Math.ceil(game.x2T)}`, ix, 34); }
ctx.textAlign = 'left';

// crosshair
ctx.strokeStyle = hitMarkerT > 0 ? '#FF4444' : 'rgba(255,255,255,0.85)';
ctx.lineWidth = 1.5;
const g = hitMarkerT > 0 ? 7 : 5;
ctx.beginPath();
ctx.moveTo(mouseX - g - 4, mouseY); ctx.lineTo(mouseX - g + 2, mouseY);
ctx.moveTo(mouseX + g - 2, mouseY); ctx.lineTo(mouseX + g + 4, mouseY);
ctx.moveTo(mouseX, mouseY - g - 4); ctx.lineTo(mouseX, mouseY - g + 2);
ctx.moveTo(mouseX, mouseY + g - 2); ctx.lineTo(mouseX, mouseY + g + 4);
ctx.stroke();
if (hitMarkerT > 0) {
ctx.beginPath();
for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
ctx.moveTo(mouseX + sx * 4, mouseY + sy * 4);
ctx.lineTo(mouseX + sx * 9, mouseY + sy * 9);
}
ctx.stroke();
}
}

function render(view) {
// view = local game (host/single) or a client snapshot adapter
ctx.clearRect(0, 0, W, H);
ctx.save();
if (game.shake > 0) ctx.translate((Math.random() - 0.5) * game.shake * 18, (Math.random() - 0.5) * game.shake * 18);

drawMap();
for (const pu of view.powerups) drawPowerup(pu, game.t);
for (const z of view.zombies) drawZombie(z, game.t);
for (const p of view.players) drawPlayer(p, game.t);
for (const tr of view.tracers) {
ctx.strokeStyle = tr.col;
ctx.globalAlpha = clamp(tr.t / 0.07, 0, 1);
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(tr.x1, tr.y1);
ctx.lineTo(tr.x2, tr.y2);
ctx.stroke();
ctx.globalAlpha = 1;
}
for (const pa of game.particles) {
ctx.fillStyle = pa.col;
ctx.globalAlpha = clamp(pa.t / 0.4, 0, 1);
ctx.fillRect(pa.x - pa.r / 2, pa.y - pa.r / 2, pa.r, pa.r);
ctx.globalAlpha = 1;
}

ctx.restore();

// atmosphere: vignette + flicker
const flick = 0.55 + Math.sin(game.t * 13) * 0.012 + Math.sin(game.t * 7.7) * 0.01;
const grad = ctx.createRadialGradient(W / 2, H / 2, 180, W / 2, H / 2, 560);
grad.addColorStop(0, 'rgba(0,0,0,0)');
grad.addColorStop(1, `rgba(0,0,0,${flick})`);
ctx.fillStyle = grad;
ctx.fillRect(0, 0, W, H);

// hurt flash
hurtFlashT = Math.max(0, hurtFlashT - 1 / 60);
hitMarkerT = Math.max(0, hitMarkerT - 1 / 60);
const me = view.players.find((p) => p.id === myId);
if (me && me.hp < me.maxHp * 0.35 && !me.downed) hurtFlashT = Math.max(hurtFlashT, 0.25);
if (hurtFlashT > 0) {
ctx.fillStyle = `rgba(160,10,10,${hurtFlashT * 0.4})`;
ctx.fillRect(0, 0, W, H);
}

drawHUD(me);
hooks.postRender?.(ctx, game);
}

// ---------------------------------------------------------------- multiplayer

let net = null;
let myId = 'p1';
let clientState = null;

function snapshot() {
return {
t: 'state',
st: game.state,
round: game.round,
zl: game.zombiesLeft,
insta: game.instaT,
x2: game.x2T,
doorOpen: game.doorOpen,
box: { state: game.box.state, t: game.box.t, offer: game.box.offer, for: game.box.for },
windows: game.windows.map((w) => w.boards),
zombies: game.zombies.map((z) => ({ id: z.id, x: z.x, y: z.y, hp: z.hp, maxHp: z.maxHp, type: z.type, dir: z.dir, t: z.t, flash: z.flash, state: z.state })),
players: game.players.map((p) => ({
id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, aim: p.aim,
hp: p.hp, maxHp: p.maxHp, points: p.points, downed: p.downed, dead: p.dead,
cur: p.cur, weapons: p.weapons, reloading: p.reloading, fireCd: p.fireCd, knifeT: p.knifeT,
perks: p.perks, prompt: p.id === myId ? null : p.prompt,
})),
powerups: game.powerups,
ev: game.netEvents.splice(0),
};
}

function applySnapshot(s) {
game.round = s.round;
game.instaT = s.insta;
game.x2T = s.x2;
game.doorOpen = s.doorOpen;
game.box = s.box;
s.windows.forEach((b, i) => { game.windows[i].boards = b; });
game.zombies = s.zombies;
game.players = s.players;
game.powerups = s.powerups;
for (const e of s.ev || []) {
if (e.k === 'tracer') game.tracers.push({ ...e, t: 0.07 });
if (e.k === 'msg') gameMsg(e.text, 2600);
if (e.k === 'snd' && sfx[e.n]) sfx[e.n]();
if (e.k === 'hitm' && e.id === myId) hitMarkerT = 0.12;
if (e.k === 'hurt' && e.id === myId) hurtFlashT = 0.5;
if (e.k === 'deny' && e.id === myId) gameMsg('not enough points', 1200);
if (e.k === 'splat') splatter(e.x, e.y);
}
if (s.st === 'gameover' && game.state !== 'gameover') {
game.state = 'gameover';
}
}

function applyModCode(code) {
new Function('SZ', code)(window.SZ);
}

function hostGame() {
if (!Net.available()) { gameMsg('multiplayer needs internet — PeerJS failed to load'); return; }
game.mode = 'host';
myId = 'host';
game.players = [makePlayer('host', playerName(), PLAYER_COLORS[0])];

net = new Net({
onJoin(conn) {
const i = game.players.length;
const p = makePlayer(conn.peer, `chef_${i + 1}`, PLAYER_COLORS[i % PLAYER_COLORS.length]);
game.players.push(p);
conn.send({ t: 'init', id: p.id });
// sync active mods to the newcomer
for (const mod of window.SZ.activeMods) conn.send({ t: 'mod', code: mod.code, summary: mod.summary });
if (game.state === 'playing') conn.send({ t: 'start' });
updateLobby();
announce(`${p.name} joined the squad`);
},
onLeave(conn) {
game.players = game.players.filter((p) => p.id !== conn.peer);
updateLobby();
},
onData(conn, msg) {
if (msg?.t === 'input') {
const p = game.players.find((pl) => pl.id === conn.peer);
if (p && !p.downed) p.input = { mx: Number(msg.mx) || 0, my: Number(msg.my) || 0, aim: Number(msg.aim) || 0, shoot: !!msg.shoot, reload: !!msg.reload, knife: !!msg.knife, interact: !!msg.interact, swap: !!msg.swap };
else if (p) p.input = { ...p.input, interact: !!msg.interact };
}
},
onError(type) { gameMsg(`network error: ${type}`); },
});

game.state = 'lobby';
hideAll();
show($('ov-lobby'));
$('lobby-title').textContent = 'SQUAD LOBBY';
$('room-code').textContent = '·····';
$('btn-start').style.display = '';
updateLobby();

net.host((code) => {
$('room-code').textContent = code;
$('share-link').value = `${location.origin}${location.pathname}?room=${code}`;
});

setInterval(() => {
if (!net?.isHost) return;
if (game.state === 'lobby') net.broadcast({ t: 'lobby', n: game.players.length });
else if (game.state === 'playing' || game.state === 'gameover') net.broadcast(snapshot());
}, 50);
}

function joinGame(code) {
game.mode = 'client';
net = new Net({
onData(conn, msg) {
switch (msg?.t) {
case 'init': myId = msg.id; break;
case 'lobby': $('lobby-count').textContent = `${msg.n} in the squad — waiting for host`; break;
case 'start': game.state = 'playing'; hideAll(); break;
case 'state':
clientState = msg;
if (game.state !== 'playing' && msg.st === 'playing') { game.state = 'playing'; hideAll(); }
applySnapshot(msg);
break;
case 'mod':
try { applyModCode(msg.code); window.SZ.activeMods.push({ code: msg.code, summary: msg.summary }); gameMsg(`mod from host: ${msg.summary || 'applied'}`); }
catch (e) { console.warn('mod apply failed', e); }
break;
case 'over':
game.state = 'gameover';
$('go-stats').textContent = msg.stats;
$('btn-go-restart').style.display = 'none';
show($('ov-gameover'));
break;
}
},
onLeave() {
hideAll();
show($('ov-lobby'));
$('lobby-title').textContent = 'CONNECTION LOST';
$('lobby-count').textContent = 'the host left (or the wifi did)';
$('btn-start').style.display = 'none';
},
onError(type) {
$('lobby-count').textContent = type === 'peer-unavailable' ? 'room not found — check the link' : `network error: ${type}`;
},
});

game.state = 'lobby';
hideAll();
show($('ov-lobby'));
$('lobby-title').textContent = 'JOINING SQUAD';
$('room-code').textContent = code;
$('share-link').value = location.href;
$('lobby-count').textContent = 'connecting…';
$('btn-start').style.display = 'none';

net.join(code, () => { $('lobby-count').textContent = 'connected — waiting for host to start'; });

setInterval(() => {
if (game.state !== 'playing' || !clientState) return;
const me = game.players.find((p) => p.id === myId);
if (!me) return;
net.send({ t: 'input', ...readLocalInput(me) });
}, 33);
}

function updateLobby() {
const n = game.players.length;
$('lobby-count').textContent = `${n} chef${n === 1 ? '' : 's'} in the squad`;
$('btn-start').disabled = false;
$('btn-start').textContent = n > 1 ? 'Start the Massacre' : 'Start Solo (friends can still join)';
}

// ---------------------------------------------------------------- flow

function playerName() {
return localStorage.getItem('slop-username') || 'chef_1';
}

function startSingle() {
game.mode = 'single';
myId = 'p1';
game.players = [makePlayer('p1', playerName(), PLAYER_COLORS[0])];
beginRun();
}

function beginRun() {
Object.assign(game, {
round: 0, zombiesLeft: 0, spawnCd: 0, betweenRounds: 0,
zombies: [], powerups: [], tracers: [], particles: [], decals: [],
doorOpen: false, box: { state: 'idle', t: 0, offer: null }, instaT: 0, x2T: 0, t: 0, shake: 0,
});
game.windows.forEach((w) => { w.boards = 6; });
for (const p of game.players) {
Object.assign(p, makePlayer(p.id, p.name, p.color));
}
game.state = 'playing';
hideAll();
startRound(1);
if (game.mode === 'host') net.broadcast({ t: 'start' });
}

function hideAll() {
hide($('ov-title'));
hide($('ov-lobby'));
hide($('ov-gameover'));
}

function backToTitle() {
try { net?.destroy(); } catch { /* gone */ }
net = null;
game.state = 'title';
history.replaceState(null, '', location.pathname + (location.search.includes('remix=1') ? '?remix=1' : ''));
hideAll();
show($('ov-title'));
$('hi-round').textContent = localStorage.getItem('sz-best-round') || '0';
}

// ---------------------------------------------------------------- loop

let last = performance.now();
function frame(now) {
const dt = Math.min(0.033, (now - last) / 1000);
last = now;

if (game.state === 'playing' || game.state === 'gameover') {
if (game.mode === 'client') {
game.t += dt;
game.shake = Math.max(0, game.shake - dt * 1.6);
for (const tr of game.tracers) tr.t -= dt;
game.tracers = game.tracers.filter((t) => t.t > 0);
for (const pa of game.particles) { pa.t -= dt; pa.x += pa.vx * dt; pa.y += pa.vy * dt; }
game.particles = game.particles.filter((p) => p.t > 0);
render(game);
} else {
if (game.state === 'playing') updateWorld(dt);
render(game);
}
}
requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot

function init() {
$('hi-round').textContent = localStorage.getItem('sz-best-round') || '0';

$('btn-single').addEventListener('click', () => { ac(); startSingle(); });
$('btn-multi').addEventListener('click', () => { ac(); hostGame(); });
$('btn-start').addEventListener('click', () => { if (game.mode === 'host') beginRun(); });
$('btn-leave').addEventListener('click', backToTitle);
$('btn-go-restart').addEventListener('click', () => { if (game.mode !== 'client') beginRun(); });
$('btn-go-title').addEventListener('click', backToTitle);
$('copy-link').addEventListener('click', () => {
const link = $('share-link').value;
const done = () => gameMsg('link copied — send it to your squad');
if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(done, done);
else done();
});

const room = new URLSearchParams(location.search).get('room');
if (room) {
if (Net.available()) { hide($('ov-title')); joinGame(room); }
else gameMsg('multiplayer needs internet — PeerJS failed to load');
}

requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- mod surface

window.SZ = {
game,
WEAPONS,
BOX_POOL,
STATIONS,
WALLS,
WINDOWS: game.windows,
hooks,
sfx,
consts: { W, H, PLAYER_COLORS },
makeZombie,
makePlayer,
giveWeapon,
givePoints,
spawnZombie(round = game.round || 1) {
const z = makeZombie(round, pickWindow());
game.zombies.push(z);
return z;
},
applyPowerup,
startRound,
gameMsg,
activeMods: [],
// the remix dock calls this after a mod applies locally —
// the host forwards it so EVERYONE in the room gets the mod, live
shareMod(code, summary) {
this.activeMods.push({ code, summary });
if (game.mode === 'host' && net) net.broadcast({ t: 'mod', code, summary });
},
applyModCode,
};

init();
