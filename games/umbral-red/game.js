// UMBRAL RED — a creature-taming RPG from an alternate universe.
// In the Umbral Province the sun never fully rises; wild spirits called
// "umbrae" haunt the tall grass, and Wraithkeepers bind them to soul-lanterns.
// Overworld + grass encounters + turn-based battles + catching + leveling.
// All art is drawn with Canvas 2D. Saves locally.

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

const FREDOKA = '"Fredoka One", sans-serif';
const MONO = '"Space Mono", monospace';

// ---------------------------------------------------------------- types & species

const TYPE_COLORS = { EMBER: '#FF7A35', MIST: '#7FB8C9', LIGHT: '#FFD86B', SHADOW: '#9B6BD8' };

// cycle: EMBER > MIST > LIGHT > SHADOW > EMBER
const BEATS = { EMBER: 'MIST', MIST: 'LIGHT', LIGHT: 'SHADOW', SHADOW: 'EMBER' };

function effectiveness(atk, def) {
if (BEATS[atk] === def) return 1.6;
if (BEATS[def] === atk) return 0.625;
return 1;
}

const MOVES = {
scratch: { name: 'Scratch', type: 'NONE', pow: 40 },
cinderspit: { name: 'Cinder Spit', type: 'EMBER', pow: 45 },
emberlash: { name: 'Ember Lash', type: 'EMBER', pow: 60 },
fogveil: { name: 'Fog Veil', type: 'MIST', pow: 45 },
dewburst: { name: 'Dew Burst', type: 'MIST', pow: 60 },
glowmote: { name: 'Glow Mote', type: 'LIGHT', pow: 45 },
lumenray: { name: 'Lumen Ray', type: 'LIGHT', pow: 60 },
duskbite: { name: 'Dusk Bite', type: 'SHADOW', pow: 45 },
voidclaw: { name: 'Void Claw', type: 'SHADOW', pow: 60 },
};

const SPECIES = {
cindersprite: {
name: 'CINDERSPRITE', type: 'EMBER', color: '#FF7A35',
base: { hp: 44, atk: 52, def: 43, spd: 60 },
moves: ['cinderspit', 'scratch', 'emberlash'],
dex: 'a sprite of warm ash. the last ember of the old sun, or so keepers say.',
},
fenwisp: {
name: 'FENWISP', type: 'LIGHT', color: '#FFD86B',
base: { hp: 40, atk: 45, def: 40, spd: 65 },
moves: ['glowmote', 'scratch', 'lumenray'],
dex: 'a stray lantern-soul that wanders the fens looking for its keeper.',
},
gloomux: {
name: 'GLOOMUX', type: 'SHADOW', color: '#9B6BD8',
base: { hp: 50, atk: 50, def: 48, spd: 38 },
moves: ['duskbite', 'scratch', 'voidclaw'],
dex: 'it naps inside shadows. waking one is considered very rude.',
},
dewnymph: {
name: 'DEWNYMPH', type: 'MIST', color: '#7FB8C9',
base: { hp: 42, atk: 46, def: 44, spd: 55 },
moves: ['fogveil', 'scratch', 'dewburst'],
dex: 'condenses from morning mist. evaporates from embarrassment.',
},
pyrelisk: {
name: 'PYRELISK', type: 'EMBER', color: '#E04545',
base: { hp: 55, atk: 60, def: 50, spd: 45 },
moves: ['emberlash', 'duskbite', 'cinderspit'],
dex: 'a salamander that swallowed a funeral pyre. rare and proud of it.',
},
};

function makeMon(speciesId, level) {
const sp = SPECIES[speciesId];
const mon = { speciesId, level, xp: 0, moves: sp.moves.slice(0, 4) };
recalcStats(mon);
mon.hp = mon.maxHp;
return mon;
}

function recalcStats(mon) {
const b = SPECIES[mon.speciesId].base;
const L = mon.level;
mon.maxHp = Math.floor((b.hp * 2 * L) / 100) + L + 10;
mon.atk = Math.floor((b.atk * 2 * L) / 100) + 5;
mon.def = Math.floor((b.def * 2 * L) / 100) + 5;
mon.spd = Math.floor((b.spd * 2 * L) / 100) + 5;
}

// ---------------------------------------------------------------- map

// legend: T tree · g grass · G tall grass · p path · W water · h house wall
// D sanctum door (heals) · s sign · B boulder · f flowers
const MAP_ROWS = [
'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
'TggggffGGGGggggggggggggggggT',
'TgGGGggGGGGgggghhhhggggffggT',
'TgGGGggggggggggh--hgggWWWggT',
'TgGGGgggpppppppD--pggWWWWWgT',
'TgggggggpgggggghhhhggWWWWWgT',
'TggGGGggpggggggggggggWWWWggT',
'TggGGGggpggggsggggggggggfggT',
'TggGGGggpppppppppppppppppggT',
'TggffggggggggggggggGGGgppggT',
'TgggggggggggggggggGGGGgppggT',
'TgGGGGggggggggggggGGGGgppggT',
'TgGGGGggsgggggggggGGGGgppggT',
'TgGGGGgggggggggggggggggppggT',
'TggggggggggggggggggggggppggT',
'TgggggBBgggggggggggggggppggT',
'TggffggggggGGGGGGggggggppggT',
'TggggggggggGGGGGGgggggfppggT',
'TggggggggggGGGGGGggggggggggT',
'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
];
const MAP_W = MAP_ROWS[0].length;
const MAP_H = MAP_ROWS.length;
const TILE = 40;
const tileAt = (x, y) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) ? 'T' : MAP_ROWS[y][x];
const SOLID = new Set(['T', 'W', 'h', 's', 'B']);

const SIGNS = {
'13,7': 'VERDANT HOLLOW — last town before the Umbral Marsh. mind the grass.',
'8,12': 'tall grass ahead! wild umbrae bite. carry a lit lantern.',
};

// ---------------------------------------------------------------- state

const SAVE_KEY = 'umbral-red-save';

const game = {
state: 'title', // title | world | dialog | battle
player: { x: 9, y: 5, px: 9, py: 5, dir: 'S', moving: 0 },
party: [],
lanterns: 5,
steps: 0,
dialog: null, // { lines: [], i, then }
battle: null,
t: 0,
flash: 0,
};

function save() {
try {
localStorage.setItem(SAVE_KEY, JSON.stringify({
party: game.party, lanterns: game.lanterns,
x: game.player.x, y: game.player.y,
}));
} catch { /* private mode */ }
}

function load() {
try {
const s = JSON.parse(localStorage.getItem(SAVE_KEY));
if (!s || !s.party?.length) return false;
game.party = s.party;
game.party.forEach(recalcStats);
game.lanterns = s.lanterns ?? 5;
game.player.x = game.player.px = s.x;
game.player.y = game.player.py = s.y;
return true;
} catch { return false; }
}

// ---------------------------------------------------------------- input

const keys = {};
let confirmPressed = false;

window.addEventListener('keydown', (e) => {
if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(e.code)) e.preventDefault();
if (!e.repeat) {
keys[e.code] = true;
if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ') confirmPressed = true;
}
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

const dirHeld = () => {
if (keys.ArrowUp || keys.KeyW) return 'N';
if (keys.ArrowDown || keys.KeyS) return 'S';
if (keys.ArrowLeft || keys.KeyA) return 'W';
if (keys.ArrowRight || keys.KeyD) return 'E';
return null;
};
const DIRS = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };

// ---------------------------------------------------------------- dialog

function say(lines, then) {
game.dialog = { lines: Array.isArray(lines) ? lines : [lines], i: 0, then };
game.state = 'dialog';
}

function advanceDialog() {
const d = game.dialog;
d.i += 1;
if (d.i >= d.lines.length) {
game.dialog = null;
game.state = 'world';
d.then?.();
}
}

// ---------------------------------------------------------------- world update

function updateWorld(dt) {
const p = game.player;

if (p.moving > 0) {
p.moving = Math.max(0, p.moving - dt * 5.2);
const [dx, dy] = DIRS[p.dir];
p.px = p.x - dx * p.moving;
p.py = p.y - dy * p.moving;
if (p.moving === 0) onStep();
return;
}

if (confirmPressed) {
confirmPressed = false;
// interact with the tile we face
const [dx, dy] = DIRS[p.dir];
const tx = p.x + dx;
const ty = p.y + dy;
const sign = SIGNS[`${tx},${ty}`];
if (sign && tileAt(tx, ty) === 's') { say(sign); return; }
if (tileAt(tx, ty) === 's') { say('the letters have worn away.'); return; }
}

const dir = dirHeld();
if (!dir) return;
p.dir = dir;
const [dx, dy] = DIRS[dir];
const nx = p.x + dx;
const ny = p.y + dy;
if (SOLID.has(tileAt(nx, ny))) return;
p.x = nx;
p.y = ny;
p.moving = 1;
}

function onStep() {
const p = game.player;
const tile = tileAt(p.x, p.y);
game.steps += 1;

if (tile === 'D') {
for (const m of game.party) m.hp = m.maxHp;
game.lanterns = Math.max(game.lanterns, 5);
say(['you step into the sanctum. a cold flame washes over your party.',
'your umbrae are fully rested. lanterns refilled.']);
save();
return;
}

if (tile === 'G' && Math.random() < 0.12) startEncounter();
}

// ---------------------------------------------------------------- battle

const WILD_TABLE = [
['fenwisp', 2, 4, 0.3],
['dewnymph', 2, 5, 0.3],
['gloomux', 3, 5, 0.25],
['pyrelisk', 4, 6, 0.15],
];

function rollWild() {
let roll = Math.random();
for (const [id, lo, hi, w] of WILD_TABLE) {
if (roll < w) return makeMon(id, lo + Math.floor(Math.random() * (hi - lo + 1)));
roll -= w;
}
return makeMon('fenwisp', 3);
}

function firstAlive() {
return game.party.find((m) => m.hp > 0) || null;
}

function startEncounter() {
const ally = firstAlive();
if (!ally) return;
game.battle = {
foe: rollWild(),
ally,
phase: 'intro', // intro | menu | moves | script | over
menuIdx: 0,
moveIdx: 0,
script: [], // queue of { text, fx } steps
over: null, // 'win' | 'caught' | 'ran' | 'loss'
shake: 0,
foeFlash: 0,
allyFlash: 0,
};
game.state = 'battle';
game.flash = 1;
}

function pushText(text, fx) { game.battle.script.push({ text, fx }); }

function runScript() {
const b = game.battle;
b.phase = 'script';
b.scriptIdx = -1;
nextScript();
}

function nextScript() {
const b = game.battle;
b.scriptIdx += 1;
if (b.scriptIdx >= b.script.length) {
b.script = [];
if (b.over) { endBattle(); return; }
b.phase = 'menu';
return;
}
b.script[b.scriptIdx].fx?.();
// silent steps (pure effects) don't wait for a keypress
if (!b.script[b.scriptIdx].text) nextScript();
}

function dmg(attacker, defender, move) {
const eff = move.type === 'NONE' ? 1 : effectiveness(move.type, SPECIES[defender.speciesId].type);
const raw = ((((2 * attacker.level) / 5 + 2) * move.pow * (attacker.atk / defender.def)) / 50 + 2)
* eff * (0.85 + Math.random() * 0.15);
return { amount: Math.max(1, Math.floor(raw)), eff };
}

function monName(mon, foe) {
return `${foe ? 'wild ' : ''}${SPECIES[mon.speciesId].name}`;
}

function doMove(attacker, defender, move, isFoe) {
const b = game.battle;
const { amount, eff } = dmg(attacker, defender, move);
pushText(`${monName(attacker, isFoe)} used ${move.name}!`, () => {
defender.hp = Math.max(0, defender.hp - amount);
if (isFoe) { b.allyFlash = 0.5; b.shake = 0.4; } else { b.foeFlash = 0.5; }
});
if (eff > 1) pushText("it's super effective!");
if (eff < 1) pushText("it's not very effective...");
}

function foeTurn() {
const b = game.battle;
const move = MOVES[b.foe.moves[Math.floor(Math.random() * b.foe.moves.length)]];
doMove(b.foe, b.ally, move, true);
pushText('', () => checkFaints());
}

function checkFaints() {
const b = game.battle;
if (b.foe.hp <= 0 && !b.over) {
const xp = Math.floor(SPECIES[b.foe.speciesId].base.atk * b.foe.level * 0.6) + 8;
b.over = 'win';
b.script = b.script.slice(0, b.scriptIdx + 1);
pushText(`${monName(b.foe, true)} fainted!`);
pushText(`${monName(b.ally)} gained ${xp} XP.`, () => grantXp(b.ally, xp));
} else if (b.ally.hp <= 0) {
b.script = b.script.slice(0, b.scriptIdx + 1);
pushText(`${monName(b.ally)} fainted!`);
const next = firstAlive();
if (next) {
pushText(`go, ${monName(next)}!`, () => { b.ally = next; });
} else {
b.over = 'loss';
pushText('you have no umbrae left...');
pushText('you wake at the sanctum in Verdant Hollow.');
}
}
}

function grantXp(mon, xp) {
mon.xp += xp;
let need = mon.level * mon.level * 4;
while (mon.xp >= need) {
mon.xp -= need;
mon.level += 1;
const beforeMax = mon.maxHp;
recalcStats(mon);
mon.hp = Math.min(mon.maxHp, mon.hp + (mon.maxHp - beforeMax));
pushText(`${monName(mon)} grew to Lv ${mon.level}!`);
need = mon.level * mon.level * 4;
}
}

function tryCatch() {
const b = game.battle;
if (game.lanterns <= 0) { pushText('no lanterns left!'); runScript(); return; }
game.lanterns -= 1;
pushText(`you raise a soul-lantern... (${game.lanterns} left)`);
const chance = 0.15 + 0.75 * (1 - b.foe.hp / b.foe.maxHp);
if (Math.random() < chance) {
b.over = 'caught';
pushText(`the flame turns ${SPECIES[b.foe.speciesId].color === '#FFD86B' ? 'gold' : 'crimson'}... bound!`);
pushText(`${SPECIES[b.foe.speciesId].name} joined your party!`, () => {
if (game.party.length < 4) game.party.push(b.foe);
});
} else {
pushText('the flame gutters out. it broke free!');
foeTurn();
}
runScript();
}

function endBattle() {
const b = game.battle;
if (b.over === 'loss') {
for (const m of game.party) m.hp = m.maxHp;
game.player.x = game.player.px = 14;
game.player.y = game.player.py = 4;
}
game.battle = null;
game.state = 'world';
game.flash = 0.6;
save();
}

function updateBattle(dt) {
const b = game.battle;
b.shake = Math.max(0, b.shake - dt);
b.foeFlash = Math.max(0, b.foeFlash - dt);
b.allyFlash = Math.max(0, b.allyFlash - dt);

if (b.phase === 'intro') {
if (confirmPressed) { confirmPressed = false; b.phase = 'menu'; }
return;
}

if (b.phase === 'script') {
if (confirmPressed) { confirmPressed = false; nextScript(); }
return;
}

if (b.phase === 'menu') {
const opts = 4;
if (keys.ArrowUp || keys.KeyW) { b.menuIdx = (b.menuIdx + opts - 2) % opts; keys.ArrowUp = keys.KeyW = false; }
if (keys.ArrowDown || keys.KeyS) { b.menuIdx = (b.menuIdx + 2) % opts; keys.ArrowDown = keys.KeyS = false; }
if (keys.ArrowLeft || keys.KeyA) { b.menuIdx = b.menuIdx % 2 === 1 ? b.menuIdx - 1 : b.menuIdx; keys.ArrowLeft = keys.KeyA = false; }
if (keys.ArrowRight || keys.KeyD) { b.menuIdx = b.menuIdx % 2 === 0 ? b.menuIdx + 1 : b.menuIdx; keys.ArrowRight = keys.KeyD = false; }
if (confirmPressed) {
confirmPressed = false;
if (b.menuIdx === 0) { b.phase = 'moves'; b.moveIdx = 0; }
if (b.menuIdx === 1) tryCatch();
if (b.menuIdx === 2) {
const healthy = game.party.filter((m) => m.hp > 0 && m !== b.ally);
if (healthy.length) {
b.ally = healthy[0];
pushText(`you recall your umbra. go, ${monName(b.ally)}!`);
foeTurn();
runScript();
} else {
pushText('no other umbrae can fight!');
runScript();
}
}
if (b.menuIdx === 3) {
if (Math.random() < 0.8) {
b.over = 'ran';
pushText('you slipped away into the mist...');
} else {
pushText("couldn't escape!");
foeTurn();
}
runScript();
}
}
return;
}

if (b.phase === 'moves') {
const n = b.ally.moves.length;
if (keys.ArrowUp || keys.KeyW) { b.moveIdx = (b.moveIdx + n - 1) % n; keys.ArrowUp = keys.KeyW = false; }
if (keys.ArrowDown || keys.KeyS) { b.moveIdx = (b.moveIdx + 1) % n; keys.ArrowDown = keys.KeyS = false; }
if (keys.Escape || keys.KeyX) { b.phase = 'menu'; keys.Escape = keys.KeyX = false; }
if (confirmPressed) {
confirmPressed = false;
const myMove = MOVES[b.ally.moves[b.moveIdx]];
const foeMove = MOVES[b.foe.moves[Math.floor(Math.random() * b.foe.moves.length)]];
const meFirst = b.ally.spd >= b.foe.spd;
if (meFirst) {
doMove(b.ally, b.foe, myMove, false);
pushText('', () => { checkFaints(); });
if (b.foe.hp > 0) doMove(b.foe, b.ally, foeMove, true);
pushText('', () => checkFaints());
} else {
doMove(b.foe, b.ally, foeMove, true);
pushText('', () => checkFaints());
doMove(b.ally, b.foe, myMove, false);
pushText('', () => checkFaints());
}
runScript();
}
}
}

// ---------------------------------------------------------------- drawing: tiles

function drawTile(x, y, tile, sx, sy) {
const t = game.t;
switch (tile) {
case 'g':
case 'f': {
ctx.fillStyle = ((x + y) % 2 === 0) ? '#3E5C3A' : '#41603C';
ctx.fillRect(sx, sy, TILE, TILE);
if (tile === 'f') {
ctx.fillStyle = '#E04545';
ctx.fillRect(sx + 9, sy + 11, 4, 4);
ctx.fillRect(sx + 26, sy + 24, 4, 4);
ctx.fillStyle = '#FFD86B';
ctx.fillRect(sx + 22, sy + 9, 4, 4);
ctx.fillRect(sx + 12, sy + 27, 4, 4);
} else if ((x * 7 + y * 13) % 9 === 0) {
ctx.fillStyle = 'rgba(0,0,0,0.12)';
ctx.fillRect(sx + 14, sy + 18, 3, 3);
ctx.fillRect(sx + 24, sy + 10, 3, 3);
}
break;
}
case 'G': {
ctx.fillStyle = '#2E4A2C';
ctx.fillRect(sx, sy, TILE, TILE);
const sway = Math.sin(t * 2 + x * 1.7 + y) * 2;
ctx.fillStyle = '#244020';
for (let i = 0; i < 3; i++) {
for (let j = 0; j < 2; j++) {
const gx = sx + 5 + i * 12 + (j % 2) * 5;
const gy = sy + 6 + j * 17;
ctx.beginPath();
ctx.moveTo(gx, gy + 14);
ctx.lineTo(gx + 3 + sway, gy);
ctx.lineTo(gx + 7, gy + 14);
ctx.fill();
}
}
break;
}
case 'p': {
ctx.fillStyle = '#B89A6A';
ctx.fillRect(sx, sy, TILE, TILE);
ctx.fillStyle = 'rgba(0,0,0,0.10)';
if ((x * 5 + y * 3) % 4 === 0) ctx.fillRect(sx + 10, sy + 14, 6, 4);
if ((x * 3 + y * 7) % 5 === 0) ctx.fillRect(sx + 24, sy + 26, 5, 4);
break;
}
case 'W': {
ctx.fillStyle = '#27557E';
ctx.fillRect(sx, sy, TILE, TILE);
ctx.fillStyle = 'rgba(255,255,255,0.16)';
const ph = Math.sin(t * 2.4 + x * 2 + y * 3);
if (ph > 0.2) ctx.fillRect(sx + 6, sy + 12 + ph * 3, 14, 2.5);
if (ph < -0.2) ctx.fillRect(sx + 20, sy + 26 - ph * 3, 12, 2.5);
break;
}
case 'T': {
ctx.fillStyle = '#3E5C3A';
ctx.fillRect(sx, sy, TILE, TILE);
ctx.fillStyle = 'rgba(0,0,0,0.28)';
ctx.beginPath();
ctx.ellipse(sx + TILE / 2, sy + TILE - 6, 13, 4.5, 0, 0, 7);
ctx.fill();
ctx.fillStyle = '#5A4030';
ctx.fillRect(sx + 16, sy + 22, 8, 13);
ctx.fillStyle = '#1F4A2E';
ctx.beginPath();
ctx.arc(sx + TILE / 2, sy + 15, 14, 0, 7);
ctx.fill();
ctx.fillStyle = '#2B5E3C';
ctx.beginPath();
ctx.arc(sx + TILE / 2 - 5, sy + 11, 9, 0, 7);
ctx.fill();
break;
}
case 'h':
case 'D':
case '-': {
// sanctum building: walls, roof band on the top row, dark doorway
ctx.fillStyle = tile === '-' ? '#6E4A4A' : '#8A5A5A';
ctx.fillRect(sx, sy, TILE, TILE);
ctx.fillStyle = 'rgba(0,0,0,0.18)';
ctx.fillRect(sx, sy + TILE - 5, TILE, 5);
if (tileAt(x, y - 1) !== 'h' && tileAt(x, y - 1) !== '-' && tileAt(x, y - 1) !== 'D') {
ctx.fillStyle = '#A93232';
ctx.fillRect(sx, sy, TILE, 14);
ctx.fillStyle = 'rgba(255,255,255,0.15)';
ctx.fillRect(sx, sy, TILE, 4);
}
if (tile === 'D') {
ctx.fillStyle = '#241418';
ctx.fillRect(sx + 8, sy + 8, TILE - 16, TILE - 8);
ctx.fillStyle = `rgba(255,216,107,${0.5 + 0.3 * Math.sin(t * 3)})`;
ctx.fillRect(sx + 14, sy + 16, TILE - 28, 6);
}
break;
}
case 's': {
ctx.fillStyle = '#3E5C3A';
ctx.fillRect(sx, sy, TILE, TILE);
ctx.fillStyle = '#5A4030';
ctx.fillRect(sx + 17, sy + 20, 6, 14);
ctx.fillStyle = '#8A6A48';
ctx.fillRect(sx + 7, sy + 8, 26, 15);
ctx.strokeStyle = '#4A3520';
ctx.lineWidth = 2;
ctx.strokeRect(sx + 7, sy + 8, 26, 15);
ctx.fillStyle = 'rgba(0,0,0,0.4)';
ctx.fillRect(sx + 11, sy + 12, 18, 2);
ctx.fillRect(sx + 11, sy + 17, 13, 2);
break;
}
case 'B': {
ctx.fillStyle = '#3E5C3A';
ctx.fillRect(sx, sy, TILE, TILE);
ctx.fillStyle = 'rgba(0,0,0,0.25)';
ctx.beginPath();
ctx.ellipse(sx + TILE / 2, sy + TILE - 8, 14, 5, 0, 0, 7);
ctx.fill();
ctx.fillStyle = '#7A7A88';
ctx.beginPath();
ctx.arc(sx + TILE / 2, sy + 19, 13, 0, 7);
ctx.fill();
ctx.fillStyle = '#92929E';
ctx.beginPath();
ctx.arc(sx + TILE / 2 - 4, sy + 15, 7, 0, 7);
ctx.fill();
break;
}
}
}

// ---------------------------------------------------------------- drawing: characters

function drawKeeper(sx, sy, dir, walking, t) {
const step = walking ? Math.sin(t * 14) * 2.5 : 0;
// shadow
ctx.fillStyle = 'rgba(0,0,0,0.3)';
ctx.beginPath();
ctx.ellipse(sx, sy + 14, 11, 4, 0, 0, 7);
ctx.fill();
// cloak body
ctx.fillStyle = '#7A2430';
ctx.beginPath();
ctx.moveTo(sx - 9, sy + 13);
ctx.quadraticCurveTo(sx - 11, sy - 4, sx, sy - 6);
ctx.quadraticCurveTo(sx + 11, sy - 4, sx + 9, sy + 13);
ctx.closePath();
ctx.fill();
ctx.strokeStyle = '#3A1018';
ctx.lineWidth = 2;
ctx.stroke();
// feet
ctx.fillStyle = '#2A2030';
ctx.fillRect(sx - 7, sy + 11 + step, 5, 4);
ctx.fillRect(sx + 2, sy + 11 - step, 5, 4);
// head
ctx.fillStyle = '#F0C8A0';
ctx.beginPath();
ctx.arc(sx, sy - 12, 8, 0, 7);
ctx.fill();
// hood
ctx.fillStyle = '#8A2A38';
ctx.beginPath();
ctx.arc(sx, sy - 14, 8.5, Math.PI, 0);
ctx.fill();
// face by direction
ctx.fillStyle = '#241418';
if (dir === 'S') {
ctx.fillRect(sx - 4, sy - 13, 2.5, 3);
ctx.fillRect(sx + 2, sy - 13, 2.5, 3);
} else if (dir === 'W') {
ctx.fillRect(sx - 5, sy - 13, 2.5, 3);
} else if (dir === 'E') {
ctx.fillRect(sx + 3, sy - 13, 2.5, 3);
}
// lantern in hand
ctx.fillStyle = `rgba(255,216,107,${0.75 + 0.25 * Math.sin(t * 5)})`;
ctx.beginPath();
ctx.arc(sx + 11, sy + 2 + step * 0.4, 3.5, 0, 7);
ctx.fill();
ctx.strokeStyle = '#3A2A18';
ctx.lineWidth = 1.5;
ctx.stroke();
}

function drawCreature(cx, cy, speciesId, scale, t, flip) {
ctx.save();
ctx.translate(cx, cy);
ctx.scale(flip ? -scale : scale, scale);
const bob = Math.sin(t * 3 + cx) * 2;
ctx.translate(0, bob);

// grounding shadow
ctx.fillStyle = 'rgba(0,0,0,0.3)';
ctx.beginPath();
ctx.ellipse(0, 26 - bob, 24, 7, 0, 0, 7);
ctx.fill();

switch (speciesId) {
case 'cindersprite': {
ctx.fillStyle = '#FF7A35';
ctx.beginPath();
ctx.arc(0, 4, 20, 0, 7);
ctx.fill();
// flame crest
ctx.fillStyle = '#FFD86B';
ctx.beginPath();
ctx.moveTo(-8, -12);
ctx.quadraticCurveTo(0, -34 - Math.sin(t * 6) * 4, 8, -12);
ctx.quadraticCurveTo(0, -6, -8, -12);
ctx.fill();
ctx.fillStyle = '#fff';
ctx.beginPath(); ctx.arc(-7, 0, 4, 0, 7); ctx.arc(7, 0, 4, 0, 7); ctx.fill();
ctx.fillStyle = '#241418';
ctx.beginPath(); ctx.arc(-6, 0, 2, 0, 7); ctx.arc(8, 0, 2, 0, 7); ctx.fill();
// smile
ctx.strokeStyle = '#7A2430'; ctx.lineWidth = 2;
ctx.beginPath(); ctx.arc(0, 8, 6, 0.3, Math.PI - 0.3); ctx.stroke();
break;
}
case 'fenwisp': {
const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 30);
glow.addColorStop(0, 'rgba(255,216,107,0.5)');
glow.addColorStop(1, 'rgba(255,216,107,0)');
ctx.fillStyle = glow;
ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill();
ctx.fillStyle = '#FFD86B';
ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.fill();
// wisp tails
ctx.strokeStyle = '#FFEFC0'; ctx.lineWidth = 4; ctx.lineCap = 'round';
for (let i = -1; i <= 1; i++) {
ctx.beginPath();
ctx.moveTo(i * 7, 10);
ctx.quadraticCurveTo(i * 12, 22 + Math.sin(t * 5 + i) * 4, i * 5, 26);
ctx.stroke();
}
ctx.fillStyle = '#241418';
ctx.beginPath(); ctx.arc(-5, -2, 2.2, 0, 7); ctx.arc(5, -2, 2.2, 0, 7); ctx.fill();
break;
}
case 'gloomux': {
ctx.fillStyle = '#5A3E80';
ctx.beginPath();
ctx.moveTo(-20, 22);
ctx.quadraticCurveTo(-24, -8, 0, -14);
ctx.quadraticCurveTo(24, -8, 20, 22);
ctx.closePath();
ctx.fill();
// ear nubs
ctx.beginPath();
ctx.moveTo(-12, -10); ctx.lineTo(-16, -22); ctx.lineTo(-4, -13);
ctx.moveTo(12, -10); ctx.lineTo(16, -22); ctx.lineTo(4, -13);
ctx.fill();
// glowing eyes
ctx.fillStyle = '#D8B6FF';
ctx.beginPath(); ctx.arc(-7, -1, 3.5, 0, 7); ctx.arc(7, -1, 3.5, 0, 7); ctx.fill();
ctx.fillStyle = '#fff';
ctx.beginPath(); ctx.arc(-7, -2, 1.2, 0, 7); ctx.arc(7, -2, 1.2, 0, 7); ctx.fill();
break;
}
case 'dewnymph': {
// wings
ctx.fillStyle = 'rgba(200,240,255,0.6)';
const flap = Math.sin(t * 10) * 6;
ctx.beginPath();
ctx.ellipse(-14, -6 + flap * 0.4, 11, 5, -0.6, 0, 7);
ctx.ellipse(14, -6 - flap * 0.4, 11, 5, 0.6, 0, 7);
ctx.fill();
// droplet body
ctx.fillStyle = '#7FB8C9';
ctx.beginPath();
ctx.moveTo(0, -20);
ctx.quadraticCurveTo(16, 2, 0, 18);
ctx.quadraticCurveTo(-16, 2, 0, -20);
ctx.fill();
ctx.fillStyle = 'rgba(255,255,255,0.4)';
ctx.beginPath(); ctx.arc(-4, -4, 3.5, 0, 7); ctx.fill();
ctx.fillStyle = '#241418';
ctx.beginPath(); ctx.arc(-4, 5, 2, 0, 7); ctx.arc(5, 5, 2, 0, 7); ctx.fill();
break;
}
case 'pyrelisk': {
// tail
ctx.strokeStyle = '#E04545'; ctx.lineWidth = 7; ctx.lineCap = 'round';
ctx.beginPath();
ctx.moveTo(12, 12);
ctx.quadraticCurveTo(30, 14, 32, 0 + Math.sin(t * 4) * 3);
ctx.stroke();
ctx.fillStyle = '#FFD86B';
ctx.beginPath(); ctx.arc(33, Math.sin(t * 4) * 3 - 1, 5, 0, 7); ctx.fill();
// body
ctx.fillStyle = '#E04545';
ctx.beginPath();
ctx.ellipse(0, 8, 19, 13, 0, 0, 7);
ctx.fill();
// head
ctx.beginPath(); ctx.arc(-14, -4, 11, 0, 7); ctx.fill();
// back spikes
ctx.fillStyle = '#7A1A1A';
for (let i = 0; i < 3; i++) {
ctx.beginPath();
ctx.moveTo(-6 + i * 9, -2);
ctx.lineTo(-2 + i * 9, -14);
ctx.lineTo(2 + i * 9, -2);
ctx.fill();
}
ctx.fillStyle = '#FFD86B';
ctx.beginPath(); ctx.arc(-17, -6, 2.4, 0, 7); ctx.fill();
break;
}
}
ctx.restore();
}

// ---------------------------------------------------------------- drawing: world

function render() {
const t = game.t;
ctx.clearRect(0, 0, W, H);

if (game.state === 'title') { renderTitle(); return; }
if (game.state === 'battle') { renderBattle(); return; }

const p = game.player;
const camX = Math.max(0, Math.min(MAP_W * TILE - W, (p.px + 0.5) * TILE - W / 2));
const camY = Math.max(0, Math.min(MAP_H * TILE - H, (p.py + 0.5) * TILE - H / 2));

const x0 = Math.floor(camX / TILE);
const y0 = Math.floor(camY / TILE);
for (let y = y0; y <= y0 + Math.ceil(H / TILE); y++) {
for (let x = x0; x <= x0 + Math.ceil(W / TILE); x++) {
drawTile(x, y, tileAt(x, y), Math.floor(x * TILE - camX), Math.floor(y * TILE - camY));
}
}

drawKeeper((p.px + 0.5) * TILE - camX, (p.py + 0.5) * TILE - camY, p.dir, p.moving > 0, t);

// perpetual dusk of the Umbral Province
ctx.fillStyle = 'rgba(40,20,60,0.16)';
ctx.fillRect(0, 0, W, H);
const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.7);
vg.addColorStop(0, 'rgba(0,0,0,0)');
vg.addColorStop(1, 'rgba(10,0,20,0.4)');
ctx.fillStyle = vg;
ctx.fillRect(0, 0, W, H);

// party strip — top left
ctx.fillStyle = 'rgba(10,6,14,0.7)';
roundRect(14, 12, 190, 26 + game.party.length * 20, 9);
ctx.fill();
ctx.fillStyle = '#FFD86B';
ctx.font = `13px ${FREDOKA}`;
ctx.textAlign = 'left';
ctx.fillText(`PARTY lanterns: ${game.lanterns}`, 26, 30);
ctx.font = `11px ${MONO}`;
game.party.forEach((m, i) => {
const sp = SPECIES[m.speciesId];
ctx.fillStyle = m.hp > 0 ? '#fff' : 'rgba(255,255,255,0.35)';
ctx.fillText(`${sp.name} Lv${m.level}`, 26, 50 + i * 20);
drawHpBar(132, 42 + i * 20, 60, 7, m.hp / m.maxHp);
});

// hint — bottom
ctx.fillStyle = 'rgba(255,255,255,0.55)';
ctx.font = `12px ${MONO}`;
ctx.textAlign = 'center';
ctx.fillText('move: WASD / arrows · interact: SPACE · tall grass hides wild umbrae', W / 2, H - 14);
ctx.textAlign = 'left';

if (game.state === 'dialog') renderDialogBox(game.dialog.lines[game.dialog.i]);

if (game.flash > 0) {
ctx.fillStyle = `rgba(255,255,255,${game.flash * 0.8})`;
ctx.fillRect(0, 0, W, H);
}
}

function roundRect(x, y, w, h, r) {
ctx.beginPath();
ctx.moveTo(x + r, y);
ctx.arcTo(x + w, y, x + w, y + h, r);
ctx.arcTo(x + w, y + h, x, y + h, r);
ctx.arcTo(x, y + h, x, y, r);
ctx.arcTo(x, y, x + w, y, r);
ctx.closePath();
}

function drawHpBar(x, y, w, h, frac, label) {
ctx.fillStyle = 'rgba(0,0,0,0.6)';
roundRect(x, y, w, h, h / 2);
ctx.fill();
const f = Math.max(0, Math.min(1, frac));
if (f > 0) {
ctx.fillStyle = f > 0.5 ? '#3DFFB0' : f > 0.2 ? '#FFD86B' : '#E04545';
roundRect(x + 1.5, y + 1.5, Math.max(3, (w - 3) * f), h - 3, (h - 3) / 2);
ctx.fill();
}
if (label) {
ctx.fillStyle = 'rgba(255,255,255,0.8)';
ctx.font = `10px ${MONO}`;
ctx.fillText(label, x, y - 4);
}
}

function renderDialogBox(text) {
const bx = 30;
const bw = W - 60;
const bh = 104;
const by = H - bh - 26;
ctx.fillStyle = '#F8F4E8';
roundRect(bx, by, bw, bh, 12);
ctx.fill();
ctx.strokeStyle = '#241418';
ctx.lineWidth = 4;
ctx.stroke();
ctx.strokeStyle = '#A93232';
ctx.lineWidth = 2;
roundRect(bx + 6, by + 6, bw - 12, bh - 12, 8);
ctx.stroke();

ctx.fillStyle = '#241418';
ctx.font = `16px ${MONO}`;
ctx.textAlign = 'left';
wrapText(text, bx + 24, by + 34, bw - 48, 24);

ctx.fillStyle = '#A93232';
ctx.font = `12px ${MONO}`;
if (Math.sin(game.t * 5) > 0) ctx.fillText('SPACE >', bx + bw - 84, by + bh - 14);
}

function wrapText(text, x, y, maxW, lineH) {
const words = String(text).split(' ');
let line = '';
for (const word of words) {
const test = line ? `${line} ${word}` : word;
if (ctx.measureText(test).width > maxW && line) {
ctx.fillText(line, x, y);
line = word;
y += lineH;
} else line = test;
}
if (line) ctx.fillText(line, x, y);
}

// ---------------------------------------------------------------- drawing: battle

function renderBattle() {
const b = game.battle;
const t = game.t;

ctx.save();
if (b.shake > 0) ctx.translate((Math.random() - 0.5) * b.shake * 18, (Math.random() - 0.5) * b.shake * 18);

// dusk sky backdrop
const sky = ctx.createLinearGradient(0, 0, 0, H);
sky.addColorStop(0, '#2A1A3E');
sky.addColorStop(0.6, '#4A2440');
sky.addColorStop(1, '#1A1020');
ctx.fillStyle = sky;
ctx.fillRect(0, 0, W, H);
// dim red sun
ctx.fillStyle = 'rgba(224,69,69,0.5)';
ctx.beginPath();
ctx.arc(W * 0.78, 96, 44, 0, 7);
ctx.fill();

// platforms
ctx.fillStyle = '#3A2A48';
ctx.beginPath(); ctx.ellipse(W * 0.72, 268, 130, 30, 0, 0, 7); ctx.fill();
ctx.beginPath(); ctx.ellipse(W * 0.26, 420, 150, 34, 0, 0, 7); ctx.fill();

// creatures
if (!(b.foeFlash > 0 && Math.floor(t * 24) % 2 === 0)) {
drawCreature(W * 0.72, 238, b.foe.speciesId, 1.5, t, true);
}
if (!(b.allyFlash > 0 && Math.floor(t * 24) % 2 === 0)) {
drawCreature(W * 0.26, 384, b.ally.speciesId, 1.9, t, false);
}

// info boxes
drawBattleInfo(40, 60, b.foe, true);
drawBattleInfo(W - 320, 300, b.ally, false);

// bottom panel
const py = H - 150;
ctx.fillStyle = '#241418';
ctx.fillRect(0, py - 6, W, 156);
ctx.fillStyle = '#F8F4E8';
roundRect(16, py + 6, W - 32, 124, 12);
ctx.fill();
ctx.strokeStyle = '#A93232';
ctx.lineWidth = 3;
ctx.stroke();

ctx.fillStyle = '#241418';
ctx.textAlign = 'left';

if (b.phase === 'intro') {
ctx.font = `18px ${MONO}`;
ctx.fillText(`a wild ${SPECIES[b.foe.speciesId].name} drifts out of the grass!`, 44, py + 52);
ctx.font = `13px ${MONO}`;
ctx.fillStyle = '#A93232';
if (Math.sin(t * 5) > 0) ctx.fillText('SPACE >', W - 130, py + 110);
} else if (b.phase === 'script') {
const line = b.script[b.scriptIdx];
ctx.font = `17px ${MONO}`;
wrapText(line?.text || '...', 44, py + 50, W - 110, 25);
ctx.font = `13px ${MONO}`;
ctx.fillStyle = '#A93232';
if (Math.sin(t * 5) > 0) ctx.fillText('SPACE >', W - 130, py + 110);
} else if (b.phase === 'menu') {
ctx.font = `17px ${MONO}`;
ctx.fillText('what will you do?', 44, py + 42);
const opts = ['FIGHT', `LANTERN x${game.lanterns}`, 'SWITCH', 'RUN'];
ctx.font = `19px ${FREDOKA}`;
opts.forEach((o, i) => {
const ox = 380 + (i % 2) * 200;
const oy = py + 48 + Math.floor(i / 2) * 44;
ctx.fillStyle = i === b.menuIdx ? '#A93232' : '#241418';
ctx.fillText(`${i === b.menuIdx ? '>' : ' '} ${o}`, ox, oy);
});
} else if (b.phase === 'moves') {
ctx.font = `13px ${MONO}`;
ctx.fillText('X — back', W - 130, py + 28);
b.ally.moves.forEach((mid, i) => {
const m = MOVES[mid];
const oy = py + 42 + i * 27;
ctx.font = `17px ${FREDOKA}`;
ctx.fillStyle = i === b.moveIdx ? '#A93232' : '#241418';
ctx.fillText(`${i === b.moveIdx ? '>' : ' '} ${m.name}`, 60, oy);
ctx.font = `12px ${MONO}`;
ctx.fillStyle = TYPE_COLORS[m.type] || '#777';
ctx.fillText(m.type === 'NONE' ? 'NEUTRAL' : m.type, 280, oy);
ctx.fillStyle = '#241418';
ctx.fillText(`pow ${m.pow}`, 400, oy);
});
}

ctx.restore();

if (game.flash > 0) {
ctx.fillStyle = `rgba(255,255,255,${game.flash * 0.8})`;
ctx.fillRect(0, 0, W, H);
}
}

function drawBattleInfo(x, y, mon, isFoe) {
const sp = SPECIES[mon.speciesId];
ctx.fillStyle = 'rgba(248,244,232,0.95)';
roundRect(x, y, 280, isFoe ? 62 : 78, 10);
ctx.fill();
ctx.strokeStyle = '#241418';
ctx.lineWidth = 3;
ctx.stroke();

ctx.fillStyle = '#241418';
ctx.font = `16px ${FREDOKA}`;
ctx.textAlign = 'left';
ctx.fillText(sp.name, x + 16, y + 24);
ctx.font = `12px ${MONO}`;
ctx.fillText(`Lv${mon.level}`, x + 220, y + 24);
ctx.fillStyle = TYPE_COLORS[sp.type];
ctx.fillText(sp.type, x + 16, y + 42);

drawHpBar(x + 80, y + 34, 180, 10, mon.hp / mon.maxHp);
if (!isFoe) {
ctx.fillStyle = '#241418';
ctx.font = `12px ${MONO}`;
ctx.fillText(`${mon.hp} / ${mon.maxHp} HP`, x + 80, y + 64);
}
}

// ---------------------------------------------------------------- title

function renderTitle() {
const t = game.t;
const sky = ctx.createLinearGradient(0, 0, 0, H);
sky.addColorStop(0, '#1A1024');
sky.addColorStop(0.55, '#4A1A28');
sky.addColorStop(1, '#801818');
ctx.fillStyle = sky;
ctx.fillRect(0, 0, W, H);

// huge red sun
ctx.fillStyle = '#E04545';
ctx.beginPath();
ctx.arc(W / 2, H * 0.62, 110 + Math.sin(t) * 3, 0, 7);
ctx.fill();
ctx.fillStyle = 'rgba(255,216,107,0.25)';
ctx.beginPath();
ctx.arc(W / 2, H * 0.62, 150 + Math.sin(t * 0.7) * 8, 0, 7);
ctx.fill();

// grass silhouette
ctx.fillStyle = '#120D14';
ctx.beginPath();
ctx.moveTo(0, H);
for (let x = 0; x <= W; x += 16) {
ctx.lineTo(x, H - 60 - Math.sin(x * 0.05 + t * 1.2) * 8 - (x % 48 === 0 ? 26 : 0));
}
ctx.lineTo(W, H);
ctx.fill();

ctx.textAlign = 'center';
ctx.fillStyle = '#241418';
ctx.font = `74px ${FREDOKA}`;
ctx.fillText('UMBRAL RED', W / 2 + 4, 154 + 4);
ctx.fillStyle = '#FFD86B';
ctx.fillText('UMBRAL RED', W / 2, 154);

ctx.fillStyle = 'rgba(255,255,255,0.85)';
ctx.font = `15px ${MONO}`;
ctx.fillText('a creature-taming RPG from an alternate universe', W / 2, 196);
ctx.fillText('where the sun never fully rose', W / 2, 220);

drawCreature(W / 2 - 200, H * 0.55, 'gloomux', 1.4, t, false);
drawCreature(W / 2 + 200, H * 0.55, 'cindersprite', 1.4, t, true);

ctx.fillStyle = '#fff';
ctx.font = `22px ${FREDOKA}`;
if (Math.sin(t * 3) > -0.2) ctx.fillText('press SPACE to begin', W / 2, H - 110);
ctx.font = `12px ${MONO}`;
ctx.fillStyle = 'rgba(255,255,255,0.6)';
ctx.fillText(localStorage.getItem(SAVE_KEY) ? 'a saved journey was found — it will continue' : 'WASD / arrows to move · SPACE to interact', W / 2, H - 78);
ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- boot & loop

function startGame() {
const loaded = load();
game.state = 'world';
if (!loaded) {
game.party = [makeMon('cindersprite', 5)];
say([
'VERDANT HOLLOW, the Umbral Province. the sun stalled at dusk three hundred years ago.',
'the Keeper of the sanctum hands you a warm soul-lantern. inside flickers CINDERSPRITE, Lv 5.',
'"the marsh grass south of town crawls with wild umbrae. weaken them, then raise your lantern to bind them."',
'"build a party of four. and child — stay out of the deep water."',
], save);
}
}

let last = performance.now();
function frame(now) {
const dt = Math.min(0.05, (now - last) / 1000);
last = now;
game.t += dt;
game.flash = Math.max(0, game.flash - dt * 2.5);

if (game.state === 'title') {
if (confirmPressed) { confirmPressed = false; startGame(); }
} else if (game.state === 'world') {
updateWorld(dt);
} else if (game.state === 'dialog') {
if (confirmPressed) { confirmPressed = false; advanceDialog(); }
} else if (game.state === 'battle') {
updateBattle(dt);
}

render();
try { window.UR?.hooks?.postRender?.(ctx, game); } catch { /* mod error — never break the loop */ }
requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// ---------------------------------------------------------------- live remix surface
// Everything the remix dock is allowed to patch while the game runs.
window.UR = {
game,
MOVES,
SPECIES,
makeMon,
recalcStats,
startEncounter,
rollWild,
grantXp,
endBattle,
save,
hooks: {},
consts: { W, H, MAP_W, MAP_H },
gameMsg(text) { try { say([text]); } catch { /* mid-battle */ } },
activeMods: [],
shareMod(code, summary) { this.activeMods.push({ code, summary }); },
};
