// RUN 3 — a Run-3-style gravity TUBE runner for slop.game.
//
// You auto-run along the INSIDE of a tunnel. Whatever surface is under you is
// "down" — A/D (or arrows) rotate you around the tube, so when the platform
// winds onto a wall you run on the wall and it becomes the new gravity. SPACE
// jumps across the GAPS in the floor. Miss a tile and you fall out into space.
// The safe platform gets narrower the further you run, so it keeps getting
// harder. Two players race the same seeded tunnel side by side (PeerJS lobby +
// invite link). Fully live-remixable via window.R3 + the dock.

import { NetCore } from '../../js/netcore.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const EMBED = new URLSearchParams(location.search).has('embed');

// ---------------------------------------------------------------- tunables (moddable via R3.cfg)
const cfg = {
SEG: 16, // tiles around the cube cross-section (4 per wall)
BASE_R: 250, // on-screen half-size of the nearest ring (px)
FOCAL: 600, // perspective strength
CX: W / 2, CY: H * 0.42,
ROWLEN: 34, // world depth between rings
DEPTH: 44, // rings drawn ahead
NEAR: -13, // rings drawn BEHIND the player (huge, run off the screen edges)
jumpInward: 0.42, // how far a jump pulls you toward the tube centre (visual + dodge)
runnerSpeed: 11, // rows/sec
skaterSpeed: 20,
rampPer1000: 4.5, // rows/sec added per km (linear component)
rampCurve: 0.45, // km² boost — keeps accelerating the farther you run
maxSpeedBonus: 18, // cap on distance-based speed bonus
gravity: 19.5, // jump fall accel (height units/s^2)
jumpV: 6.5, // jump impulse — slightly longer air time to clear gaps at higher speed
angAccel: 20, angFriction: 9, angMax: 4.2, // rotation around the tube
fallDeath: 1.6, // how far you fall through a gap before it's over
finish: 1200, // race distance (m); solo is endless
doubleUnlockAt: 600, // metres to unlock the double jump
shrink: 0.91, // how aggressively the safe platform narrows with distance
difficultyOver: 1300,// metres to reach max difficulty
retroOver: 1300, // metres to reach full retro filter intensity
hardSpeedMult: 1.38, // speed multiplier when hard mode is selected
patchMinSpacing: 26, // min solid rows between gap regions (before difficulty scaling)
patchSpacingRange: 18, // extra spacing early-run; tapers off as difficulty rises
};

const COLORS = {
solid: '#7B5CFF', solidEdge: '#FF6AD5',
player: '#C9C9D4', playerLine: '#1A1A2E', orb: '#FFFFFF', ghost: 'rgba(255,78,184,0.62)',
};

// animated floor gradient — cool violet/cyan/magenta sweep across the tube
function floorFill(row, seg, shade, t) {
const phase = t * 0.14 + row * 0.016 + seg * 0.21;
const hue = 205 + Math.sin(phase) * 48 + Math.cos(phase * 0.65 + seg * 0.35) * 22;
const sat = 72 + Math.sin(phase * 1.2) * 14;
const lit = 26 + shade * 24 + Math.sin(phase * 0.85 + row * 0.028) * 5;
return `hsl(${hue}, ${sat}%, ${lit}%)`;
}
function floorStroke(row, seg, shade, t) {
const phase = t * 0.11 + row * 0.019 + seg * 0.17 + 1.4;
const hue = 312 + Math.sin(phase) * 28 + Math.cos(phase * 0.5) * 12;
const lit = 52 + shade * 18;
return `hsl(${hue}, 88%, ${lit}%)`;
}

// offscreen scene buffer + light retro post-process
const sceneCanvas = document.createElement('canvas');
sceneCanvas.width = W; sceneCanvas.height = H;
const sceneCtx = sceneCanvas.getContext('2d');

// retro post-process — intensity ramps up the farther you run
const retroCanvas = document.createElement('canvas');
function retroIntensity() {
if (game.state !== 'run' && game.state !== 'countdown') return 0;
return Math.max(0, Math.min(1, Math.max(0, game.dist - 20) / cfg.retroOver));
}
function applyRetroFilter(destCtx, srcCanvas, t, intensity = retroIntensity()) {
const i = intensity;

if (i > 0.45) {
const scale = 1 - (i - 0.45) * 0.22;
const rw = Math.max(1, Math.floor(W * scale));
const rh = Math.max(1, Math.floor(H * scale));
retroCanvas.width = rw;
retroCanvas.height = rh;
const rctx = retroCanvas.getContext('2d');
rctx.imageSmoothingEnabled = false;
rctx.drawImage(srcCanvas, 0, 0, rw, rh);
destCtx.imageSmoothingEnabled = false;
destCtx.drawImage(retroCanvas, 0, 0, W, H);
destCtx.imageSmoothingEnabled = true;
} else {
destCtx.drawImage(srcCanvas, 0, 0, W, H);
}

const scanAlpha = 0.035 + i * 0.17;
const scanStep = Math.max(2, Math.round(4 - i * 1.6));
destCtx.fillStyle = `rgba(0, 4, 12, ${scanAlpha})`;
for (let y = 0; y < H; y += scanStep) destCtx.fillRect(0, y, W, 1);

const vigIn = H * (0.38 - i * 0.14);
const vigOut = H * (0.95 - i * 0.04);
const vig = destCtx.createRadialGradient(W / 2, H / 2, vigIn, W / 2, H / 2, vigOut);
vig.addColorStop(0, 'rgba(0,0,0,0)');
vig.addColorStop(1, `rgba(0,0,0,${0.1 + i * 0.32})`);
destCtx.fillStyle = vig;
destCtx.fillRect(0, 0, W, H);

destCtx.globalCompositeOperation = 'soft-light';
destCtx.fillStyle = `rgba(100, 50, 180, ${0.018 + i * 0.075 + Math.sin(t * 0.9) * (0.004 + i * 0.01)})`;
destCtx.fillRect(0, 0, W, H);
destCtx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- starfield
const stars = Array.from({ length: 170 }, () => ({
x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.6 + 0.3, b: Math.random() * 0.6 + 0.3,
}));

// ---------------------------------------------------------------- deterministic tunnel
function mulberry32(a) {
return function () {
a |= 0; a = (a + 0x6D2B79F5) | 0;
let t = Math.imul(a ^ (a >>> 15), 1 | a);
t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
}
const SEGSTEP = () => TAU / cfg.SEG;
const segAngle = (seg) => seg * SEGSTEP();
function angDistSeg(seg, centerRad) {
const cseg = centerRad / SEGSTEP();
let dz = Math.abs(seg - cseg) % cfg.SEG;
if (dz > cfg.SEG / 2) dz = cfg.SEG - dz;
return dz;
}
const difficulty = (row) => Math.max(0, Math.min(1, (row - 10) / cfg.difficultyOver));

// the centre of the safe platform meanders smoothly around the tube (seeded)
function pathCenter(row) {
const p1 = (game.seed % 1000) * 0.0173, p2 = (game.seed % 577) * 0.0411;
return Math.sin(row * 0.045 + p1) * 1.7 + Math.sin(row * 0.015 + p2) * 1.3;
}
// half-width of the safe platform (in segments) — shrinks the further you run
function safeHalf(row) {
if (row <= 10) return cfg.SEG / 2; // full ring runway at the start
return Math.max(1, (cfg.SEG / 2) * (1 - difficulty(row) * cfg.shrink));
}
// partial gap patches — random holes on the platform you dodge or jump over
const patchMemo = new Map();
function gapPatchRoll(row) {
return mulberry32(((game.seed * 2654435761) ^ (row * 40503)) >>> 0);
}
function rowInPatch(row) {
for (let s = row; s >= Math.max(11, row - 6); s--) {
const p = gapPatchMeta(s);
if (p && row < s + p.rowLen) return true;
}
return false;
}
function lastPatchEndBefore(startRow) {
let lastEnd = 10;
for (let s = startRow - 1; s >= Math.max(11, startRow - 45); s--) {
const p = gapPatchMeta(s);
if (p) lastEnd = Math.max(lastEnd, s + p.rowLen);
}
return lastEnd;
}
function canPlacePatch(startRow, centerSeg) {
const d = difficulty(startRow);
const minRowSpacing = cfg.patchMinSpacing + Math.floor((1 - d) * cfg.patchSpacingRange);
if (startRow - lastPatchEndBefore(startRow) < minRowSpacing) return false;

const minSeg = 3.2 + d * 1.2;
for (let s = startRow - 1; s >= Math.max(11, startRow - minRowSpacing - 8); s--) {
const p = gapPatchMeta(s);
if (!p) continue;
if (startRow - (s + p.rowLen) > minRowSpacing + 6) break;
if (angDistSeg(centerSeg, p.centerSeg * SEGSTEP()) < minSeg) return false;
}
return true;
}
function gapPatchMeta(startRow) {
if (startRow <= 10) return null;
if (patchMemo.has(startRow)) return patchMemo.get(startRow);

const r = gapPatchRoll(startRow);
const thr = 0.048 + difficulty(startRow) * 0.082;
if (r() >= thr) {
patchMemo.set(startRow, null);
return null;
}

const d = difficulty(startRow);
const cseg = pathCenter(startRow) / SEGSTEP();
const ribbon = safeHalf(startRow);
const offset = (r() * 2 - 1) * Math.max(0.5, ribbon * 0.9);
const centerSeg = (((Math.round(cseg + offset)) % cfg.SEG) + cfg.SEG) % cfg.SEG;
if (!canPlacePatch(startRow, centerSeg)) {
patchMemo.set(startRow, null);
return null;
}

const maxHalf = Math.max(0.7, ribbon * 0.52);
const halfWidth = Math.min(maxHalf, 0.5 + r() * (1.1 + d * 1.6));
const rowLen = Math.min(4, Math.max(2, 2 + Math.floor(r() * (1 + d * 1.2))));

const meta = { centerSeg, halfWidth, rowLen, wobble: r() * TAU };
patchMemo.set(startRow, meta);
return meta;
}
function patchGapAt(row, seg, forPlayer = false) {
if (row <= 10) return false;
for (let start = row; start >= Math.max(11, row - 6); start--) {
const p = gapPatchMeta(start);
if (!p || row >= start + p.rowLen) continue;
const drift = Math.round(Math.sin(p.wobble + (row - start) * 0.85) * 0.8);
const center = (((p.centerSeg + drift) % cfg.SEG) + cfg.SEG) % cfg.SEG;
const pad = forPlayer ? -0.55 : 0.3;
const hitHalf = Math.max(forPlayer ? 0.18 : 0, p.halfWidth + pad);
if (angDistSeg(seg, center * SEGSTEP()) <= hitHalf) return true;
}
return false;
}
// legacy helper — true when any segment on this row has a patch hole
function gapRow(row) {
for (let seg = 0; seg < cfg.SEG; seg++) if (patchGapAt(row, seg)) return true;
return false;
}
function segHole(row, seg, forPlayer = false) {
if (row <= 10) return false;
if (patchGapAt(row, seg, forPlayer)) return true;
if (angDistSeg(seg, pathCenter(row)) > safeHalf(row) + 0.5) return true; // off the platform → empty space
if (safeHalf(row) > 3) {
const r = mulberry32(((game.seed ^ (row * 2246822519) ^ (seg * 40503)) >>> 0))();
const thr = (forPlayer ? 0.03 : 0.04) * difficulty(row);
if (r < thr && !rowInPatch(row)) return true;
}
return false;
}
const normSeg = (seg) => ((seg % cfg.SEG) + cfg.SEG) % cfg.SEG;
const tileSolid = (row, seg) => !segHole(row, normSeg(seg), true);
const tileVisual = (row, seg) => !segHole(row, normSeg(seg), false);
// footing checks center tile + neighbor when hugging a segment edge
function footingSolid(row, ang) {
const seg = segOf(ang);
if (tileSolid(row, seg)) return true;
const segCent = Math.round(ang / SEGSTEP()) * SEGSTEP();
const delta = ang - segCent;
const grace = SEGSTEP() * 0.26;
if (Math.abs(delta) > SEGSTEP() * 0.5 - grace) {
const nseg = normSeg(delta > 0 ? seg + 1 : seg - 1);
if (tileSolid(row, nseg)) return true;
}
return false;
}

function orbAt(row) {
if (row < 14) return null;
const r = mulberry32(((game.seed ^ (row * 0x9E3779B1)) >>> 0));
if (r() >= 0.08) return null;
const cseg = pathCenter(row) / SEGSTEP();
const off = (r() < 0.5 ? -1 : 1) * Math.max(1, Math.round(safeHalf(row) * 0.7));
const s = (((Math.round(cseg + off)) % cfg.SEG) + cfg.SEG) % cfg.SEG;
return tileSolid(row, s) ? s : null;
}
const collected = new Set();

// ---------------------------------------------------------------- projection
const ringRadius = (z) => cfg.BASE_R * cfg.FOCAL / (cfg.FOCAL + z);
// map a ring angle to a point on the CUBE (square) cross-section of half-size `rad`
function ringPos(a, rad) {
const c = Math.cos(a), s = Math.sin(a), m = Math.max(Math.abs(c), Math.abs(s)) || 1;
return { x: cfg.CX + (c / m) * rad, y: cfg.CY + (s / m) * rad };
}
const pt = ringPos;
// project a point at tube-angle `ang`, depth `z`, jump-height `h` → screen
function project(ang, z, h) {
const rad = ringRadius(z) * (1 - cfg.jumpInward * h); // jump pulls toward centre; falling (h<0) pushes out
const sa = (ang - game.viewRot) + Math.PI / 2; // viewRot keeps the player at 6 o'clock (bottom)
const p = ringPos(sa, rad);
return { x: p.x, y: p.y, s: cfg.FOCAL / (cfg.FOCAL + z) };
}

// ---------------------------------------------------------------- game state
const game = {
state: 'title', mode: 'solo', char: 'runner', difficulty: localStorage.getItem('run3-diff') || 'normal', seed: 1,
dist: 0, ang: Math.PI / 2 * 3, viewRot: Math.PI / 2 * 3, // start centred under the runway
vAng: 0, h: 0, vy: 0, jumps: 0, onGround: true, plummeting: false,
alive: true, orbs: 0, t: 0, shake: 0, countdown: 0,
best: 0,
doubleUnlocked: localStorage.getItem('run3-double') === '1',
remote: null, finished: false, won: false,
};
function bestKey() {
return game.difficulty === 'hard' ? 'run3-best-hard' : 'run3-best';
}
function loadBest() {
game.best = Number(localStorage.getItem(bestKey()) || 0);
}
loadBest();
window.__r3game = game;

const sfx = {
jump() { beep(540, 0.06, 'square', 0.05); },
land() { beep(220, 0.05, 'sine', 0.04); },
orb() { beep(880, 0.1, 'sine', 0.07); beep(1180, 0.08, 'sine', 0.05); },
die() { beep(150, 0.4, 'sawtooth', 0.09); },
};
let actx = null;
function beep(freq, dur, type, vol) {
try {
actx = actx || new (window.AudioContext || window.webkitAudioContext)();
const o = actx.createOscillator(); const g = actx.createGain();
o.type = type; o.frequency.value = freq; g.gain.value = vol;
o.connect(g); g.connect(actx.destination); o.start();
g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur); o.stop(actx.currentTime + dur);
} catch { /* no audio */ }
}

// ---------------------------------------------------------------- input
const keys = {};
addEventListener('keydown', (e) => {
if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(e.key)) e.preventDefault();
keys[e.key.toLowerCase()] = true;
if ((e.key === 'r' || e.key === 'R') && game.state === 'end') runAgain();
if (e.key === ' ' || e.key === 'ArrowUp') jump();
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
const left = () => keys['a'] || keys['arrowright'];
const right = () => keys['d'] || keys['arrowleft'];

function jump() {
if (game.state !== 'run' || !game.alive) return;
if (game.onGround) { game.vy = cfg.jumpV; game.onGround = false; game.jumps = 1; sfx.jump(); }
else if (game.doubleUnlocked && game.jumps < 2) { game.vy = cfg.jumpV * 0.92; game.jumps = 2; sfx.jump(); }
}

// ---------------------------------------------------------------- simulation
// speed creeps up smoothly with distance — gentle early, steeper late
function speedBonus(dist = game.dist) {
const km = dist / 1000;
const linear = km * cfg.rampPer1000;
const curved = km * km * cfg.rampPer1000 * cfg.rampCurve;
return Math.min(cfg.maxSpeedBonus, linear + curved);
}
const speedMult = () => (game.difficulty === 'hard' ? cfg.hardSpeedMult : 1);
const speedNow = () => ((game.char === 'skater' ? cfg.skaterSpeed : cfg.runnerSpeed) + speedBonus()) * speedMult();
const segOf = (ang) => (((Math.round(ang / SEGSTEP())) % cfg.SEG) + cfg.SEG) % cfg.SEG;

function update(dt) {
game.t += dt;
if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 60);

if (game.state === 'countdown') {
game.countdown -= dt;
if (game.countdown <= 0) { game.state = 'run'; gameMsg('GO!'); }
} else if (game.state === 'run' && game.alive) {
game.dist += speedNow() * dt;

// rotate around the tube (this is also how you change which wall is "down")
const dir = (right() ? 1 : 0) - (left() ? 1 : 0);
game.vAng += dir * cfg.angAccel * dt;
game.vAng *= Math.max(0, 1 - cfg.angFriction * dt);
game.vAng = Math.max(-cfg.angMax, Math.min(cfg.angMax, game.vAng));
game.ang += game.vAng * dt;

// vertical: jump rises inward, gravity pulls back to the wall
if (!game.onGround) { game.vy -= cfg.gravity * dt; game.h += game.vy * dt; }
const row = Math.round(game.dist);
const seg = segOf(game.ang);
if (game.h <= 0) {
if (footingSolid(row, game.ang) && !game.plummeting) { // a tile is under us → stand on it
if (!game.onGround) sfx.land();
game.h = 0; game.vy = 0; game.onGround = true; game.jumps = 0;
} else { // no floor — fall through the gap
if (!game.plummeting) {
game.plummeting = true;
game.vy = Math.min(game.vy, -2.2);
}
game.onGround = false;
if (game.h < -cfg.fallDeath) die();
}
}

// collect orbs
const o = orbAt(row);
if (o !== null && seg === o && !collected.has(row)) { collected.add(row); game.orbs++; sfx.orb(); game.shake = 4; }

if (!game.doubleUnlocked && game.dist >= cfg.doubleUnlockAt) {
game.doubleUnlocked = true; localStorage.setItem('run3-double', '1'); gameMsg('DOUBLE JUMP UNLOCKED');
}
if (game.mode !== 'solo' && game.dist >= cfg.finish && !game.finished) finishRace(true);
}

// smooth camera so the surface under the player is always at the bottom
game.viewRot += (game.ang - game.viewRot) * Math.min(1, dt * 12);

if (game.remote && game.remote.fin && !game.finished && game.mode !== 'solo' && game.state === 'run') finishRace(false);
}

function die() {
if (!game.alive) return;
game.alive = false; game.shake = 14; sfx.die();
setTimeout(() => { if (game.mode === 'solo') endRun(); else if (!game.finished) finishRace(false); }, 650);
}

// ---------------------------------------------------------------- rendering
function drawAlien(x, y, size, color, line, target = ctx) {
target.fillStyle = color; target.strokeStyle = line; target.lineWidth = Math.max(1, size * 0.09);
target.beginPath(); target.arc(x - size * 0.5, y + size * 0.7, size * 0.32, 0, TAU); target.fill(); target.stroke();
target.beginPath(); target.arc(x + size * 0.5, y + size * 0.7, size * 0.32, 0, TAU); target.fill(); target.stroke();
target.beginPath(); target.arc(x, y, size, 0, TAU); target.fill(); target.stroke();
target.beginPath();
target.moveTo(x - size * 0.4, y - size * 0.8); target.lineTo(x - size * 0.6, y - size * 1.4);
target.moveTo(x + size * 0.4, y - size * 0.8); target.lineTo(x + size * 0.6, y - size * 1.4); target.stroke();
target.fillStyle = line;
target.beginPath(); target.arc(x - size * 0.6, y - size * 1.4, size * 0.16, 0, TAU); target.arc(x + size * 0.6, y - size * 1.4, size * 0.16, 0, TAU); target.fill();
}

function render() {
sceneCtx.fillStyle = '#03040A'; sceneCtx.fillRect(0, 0, W, H);
for (const s of stars) { sceneCtx.globalAlpha = s.b; sceneCtx.fillStyle = '#fff'; sceneCtx.fillRect(s.x, s.y, s.r, s.r); }
sceneCtx.globalAlpha = 1;

sceneCtx.save();
if (game.shake > 0) sceneCtx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);

const baseRow = Math.floor(game.dist);
const half = (Math.PI / cfg.SEG) * 0.92;
for (let i = cfg.DEPTH; i >= cfg.NEAR; i--) { // far → near (NEAR rows run off the screen edges, no black border)
const row = baseRow + i;
const z0 = (row - game.dist) * cfg.ROWLEN, z1 = (row + 1 - game.dist) * cfg.ROWLEN;
if (z1 <= -cfg.FOCAL + 24) continue;
const rho0 = ringRadius(z0), rho1 = ringRadius(z1);
const shade = Math.max(0.18, Math.min(1, rho0 / cfg.BASE_R));
for (let seg = 0; seg < cfg.SEG; seg++) {
if (!tileVisual(row, seg)) continue; // hole → space shows through
const ca = segAngle(seg) - game.viewRot + Math.PI / 2;
const a = pt(ca - half, rho0), b = pt(ca + half, rho0), c = pt(ca + half, rho1), d = pt(ca - half, rho1);
sceneCtx.beginPath(); sceneCtx.moveTo(a.x, a.y); sceneCtx.lineTo(b.x, b.y); sceneCtx.lineTo(c.x, c.y); sceneCtx.lineTo(d.x, d.y); sceneCtx.closePath();
sceneCtx.globalAlpha = 0.55 + 0.4 * shade;
sceneCtx.fillStyle = floorFill(row, seg, shade, game.t);
sceneCtx.fill();
sceneCtx.globalAlpha = 1;
sceneCtx.strokeStyle = floorStroke(row, seg, shade, game.t);
sceneCtx.lineWidth = Math.max(0.8, 2.4 * shade); sceneCtx.stroke();
// orb sitting on this tile
if (orbAt(row) === seg && !collected.has(row)) {
const m = pt(ca, (rho0 + rho1) / 2 * (1 - cfg.jumpInward * 0.34));
sceneCtx.fillStyle = COLORS.orb; sceneCtx.globalAlpha = 0.5 + 0.5 * shade;
sceneCtx.beginPath(); sceneCtx.arc(m.x, m.y, Math.max(2, 7 * shade), 0, TAU); sceneCtx.fill(); sceneCtx.globalAlpha = 1;
}
}
}

// rival ghost (same tunnel, their angle/depth)
if (game.remote) {
const r = game.remote, z = (r.dist - game.dist) * cfg.ROWLEN;
if (z > -cfg.FOCAL + 30 && z < cfg.DEPTH * cfg.ROWLEN) {
const p = project(r.ang ?? game.ang, z, r.h || 0);
const gs = Math.max(6, 26 * p.s);
sceneCtx.globalAlpha = r.alive ? 1 : 0.4; drawAlien(p.x, p.y - gs * 1.05, gs, COLORS.ghost, 'rgba(26,26,46,.6)', sceneCtx); sceneCtx.globalAlpha = 1;
}
}

// the player — standing on the floor at the bottom of the near ring
const psize = 28 * (game.char === 'skater' ? 0.9 : 1);
const me = project(game.ang, 0, game.h);
drawAlien(me.x, me.y - psize * 1.05, psize, game.alive ? COLORS.player : 'rgba(201,201,212,.4)', COLORS.playerLine, sceneCtx);

sceneCtx.restore();

ctx.fillStyle = '#03040A'; ctx.fillRect(0, 0, W, H);
applyRetroFilter(ctx, sceneCanvas, game.t);
if (game.hooks && game.hooks.postRender) { try { game.hooks.postRender(ctx, game); } catch { /* mod */ } }
drawHUD();
}

function drawHUD() {
ctx.textAlign = 'left';
ctx.fillStyle = '#fff'; ctx.font = "900 26px Nunito, sans-serif"; ctx.fillText(`${Math.floor(game.dist)} m`, 18, H - 46);
ctx.font = "700 13px 'Space Mono', monospace"; ctx.fillStyle = '#FFE135'; ctx.fillText(`${game.orbs} orbs`, 18, H - 26);
if (game.mode === 'solo') { ctx.fillStyle = '#7FA899'; ctx.fillText(`best ${Math.floor(game.best)} m`, 18, H - 10); }
if (game.mode !== 'solo') {
bar(W - 210, 22, game.dist / cfg.finish, '#3DFFB0', 'YOU');
if (game.remote) bar(W - 210, 44, game.remote.dist / cfg.finish, '#FF4EB8', 'RIVAL');
}
if (game.char === 'skater') { ctx.textAlign = 'right'; ctx.fillStyle = '#4ECAFF'; ctx.font = "700 12px 'Space Mono', monospace"; ctx.fillText('SKATER', W - 18, H - 16); ctx.textAlign = 'left'; }
if (game.difficulty === 'hard' && game.state === 'run') {
ctx.textAlign = 'right'; ctx.fillStyle = '#FF6B6B'; ctx.font = "700 12px 'Space Mono', monospace";
ctx.fillText('HARD', W - 18, game.char === 'skater' ? H - 34 : H - 16); ctx.textAlign = 'left';
}
if (game.state === 'countdown') {
ctx.textAlign = 'center'; ctx.fillStyle = '#FFE135'; ctx.font = "900 92px 'Fredoka One', cursive";
ctx.fillText(Math.max(1, Math.ceil(game.countdown)), W / 2, H / 2 + 30); ctx.textAlign = 'left';
}
}
function bar(x, y, pct, color, label) {
pct = Math.max(0, Math.min(1, pct));
ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x, y, 180, 12);
ctx.fillStyle = color; ctx.fillRect(x, y, 180 * pct, 12);
ctx.fillStyle = '#fff'; ctx.font = "700 10px 'Space Mono', monospace"; ctx.textAlign = 'right';
ctx.fillText(label, x - 6, y + 11); ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
let dt = (now - last) / 1000; last = now;
if (dt > 0.05) dt = 0.05;
try { update(dt); render(); } catch (err) { console.warn('run3 frame', err); }
requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- flow / UI
function gameMsg(text) {
const el = $('game-msg'); el.textContent = text; el.classList.add('on');
clearTimeout(gameMsg._t); gameMsg._t = setTimeout(() => el.classList.remove('on'), 1100);
}
const hide = (el) => el.classList.add('hidden');
const show = (el) => el.classList.remove('hidden');

function resetRun() {
Object.assign(game, {
dist: 0, ang: Math.PI / 2 * 3, viewRot: Math.PI / 2 * 3, vAng: 0,
h: 0, vy: 0, jumps: 0, onGround: true, plummeting: false, alive: true, orbs: 0, shake: 0, finished: false, won: false,
});
collected.clear();
patchMemo.clear();
}
function startSolo() {
game.mode = 'solo'; game.seed = (Math.random() * 1e9) | 0; resetRun();
hide($('ov-title')); hide($('ov-end')); game.state = 'countdown'; game.countdown = 1.2;
}
function runAgain() {
if (game.mode === 'solo') return startSolo();
resetRun(); hide($('ov-end')); game.state = 'countdown'; game.countdown = 1.5;
}
function saveBest() {
localStorage.setItem(bestKey(), String(Math.floor(game.best)));
}
function endRun() {
game.state = 'end';
if (game.dist > game.best) { game.best = game.dist; saveBest(); }
if (EMBED) { setTimeout(startSolo, 1400); return; }
$('end-title').textContent = 'FELL INTO SPACE'; $('end-title').className = 'win-title lose';
$('end-stats').textContent = `${Math.floor(game.dist)} m · ${game.orbs} orbs${game.difficulty === 'hard' ? ' · hard' : ''}`;
$('end-note').textContent = `best: ${Math.floor(game.best)} m — press R to run it back`;
show($('ov-end'));
}
function finishRace(won) {
game.finished = true; game.won = won; game.state = 'end';
if (game.dist > game.best) { game.best = game.dist; saveBest(); }
if (net) { try { (game.mode === 'host' ? net.broadcast : net.send).call(net, posMsg(true)); } catch { /* */ } }
$('end-title').textContent = won ? 'YOU WIN! ' : 'RIVAL WINS';
$('end-title').className = `win-title ${won ? 'win' : 'lose'}`;
$('end-stats').textContent = `${Math.floor(game.dist)} m · ${game.orbs} orbs`;
$('end-note').textContent = 'click below to head back to the lobby';
show($('ov-end'));
}

document.querySelectorAll('#char-row .char').forEach((c) => c.addEventListener('click', () => {
if (c.classList.contains('locked')) return;
document.querySelectorAll('#char-row .char').forEach((x) => x.classList.remove('sel'));
c.classList.add('sel'); game.char = c.dataset.char;
}));
document.querySelectorAll('#diff-row .char').forEach((c) => c.addEventListener('click', () => {
document.querySelectorAll('#diff-row .char').forEach((x) => x.classList.remove('sel'));
c.classList.add('sel');
game.difficulty = c.dataset.diff;
localStorage.setItem('run3-diff', game.difficulty);
loadBest();
$('hi-score').textContent = Math.floor(game.best);
}));
// restore saved difficulty selection on title
document.querySelectorAll('#diff-row .char').forEach((c) => {
c.classList.toggle('sel', c.dataset.diff === game.difficulty);
c.classList.toggle('hard', c.dataset.diff === 'hard');
});
$('btn-single').addEventListener('click', startSolo);
$('btn-again').addEventListener('click', () => { if (game.mode === 'solo') startSolo(); else backToLobbyOrTitle(); });
$('btn-title').addEventListener('click', () => { teardownNet(); hide($('ov-end')); hide($('ov-lobby')); show($('ov-title')); game.state = 'title'; });
$('hi-score').textContent = Math.floor(game.best);

// ---------------------------------------------------------------- multiplayer (NetCore)
let net = null;
const posMsg = (fin) => ({ t: 'pos', dist: game.dist, ang: game.ang, h: game.h, alive: game.alive, fin: !!fin || game.finished, char: game.char });
function onData(_conn, msg) {
if (!msg || typeof msg !== 'object') return;
if (msg.t === 'cfg') {
game.seed = msg.seed;
cfg.finish = msg.finish || cfg.finish;
if (msg.difficulty) game.difficulty = msg.difficulty;
}
else if (msg.t === 'start') beginRace();
else if (msg.t === 'pos') game.remote = msg;
}
function wireCommon() {
net.on('data', onData)
.on('mod', (code, summary) => applyIncomingMod(code, summary))
.on('leave', () => { game.remote = null; if (game.state === 'lobby') updateLobby(); })
.on('disconnected', () => { game.remote = null; gameMsg('rival disconnected'); });
}
function openLobby() {
if (!NetCore.available()) return gameMsg('no connection for multiplayer');
hide($('ov-title')); show($('ov-lobby'));
game.state = 'lobby'; game.mode = 'host'; game.seed = (Math.random() * 1e9) | 0;
net = new NetCore({ prefix: 'slop-run3' }); wireCommon();
net.on('join', () => {
for (const m of window.R3.activeMods) net.broadcastMod(m.code, m.summary);
net.broadcast({ t: 'cfg', seed: game.seed, finish: cfg.finish, difficulty: game.difficulty }); updateLobby();
});
net.host((code) => { $('room-code').textContent = code; $('share-link').value = net.shareLink(); updateLobby(); });
setInterval(() => { if (net && game.mode === 'host' && game.state === 'run') net.broadcast(posMsg()); }, 66);
}
function joinRoom(code) {
if (!NetCore.available()) return gameMsg('no connection for multiplayer');
hide($('ov-title')); show($('ov-lobby'));
game.state = 'lobby'; game.mode = 'client';
$('lobby-title').textContent = 'JOINING RACE'; $('room-code').textContent = code; $('btn-start').style.display = 'none';
net = new NetCore({ prefix: 'slop-run3' }); wireCommon();
net.join(code, () => { $('lobby-count').textContent = 'connected — waiting for host to start…'; });
setInterval(() => { if (net && game.mode === 'client' && game.state === 'run') net.send(posMsg()); }, 66);
}
function updateLobby() {
const opp = net && net.peerCount > 0;
$('lobby-count').textContent = opp ? 'OK opponent in the room — ready!' : 'waiting for an opponent…';
const btn = $('btn-start'); btn.disabled = !opp;
btn.textContent = opp ? 'Start Race' : 'Start Race (waiting…)';
}
function beginRace() { resetRun(); hide($('ov-lobby')); hide($('ov-end')); game.state = 'countdown'; game.countdown = 3; }
$('btn-multi').addEventListener('click', openLobby);
$('btn-start').addEventListener('click', () => { if (net && net.peerCount > 0) { net.broadcast({ t: 'start' }); beginRace(); } });
$('btn-leave').addEventListener('click', () => { teardownNet(); hide($('ov-lobby')); show($('ov-title')); game.state = 'title'; });
$('copy-link').addEventListener('click', () => {
const inp = $('share-link'); inp.select();
navigator.clipboard?.writeText(inp.value).then(() => { $('copy-link').textContent = 'Copied!'; setTimeout(() => $('copy-link').textContent = 'Copy', 1400); }).catch(() => {});
});
function backToLobbyOrTitle() {
hide($('ov-end'));
if (net) { show($('ov-lobby')); game.state = 'lobby'; updateLobby(); } else { show($('ov-title')); game.state = 'title'; }
}
function teardownNet() { try { net?.destroy(); } catch { /* */ } net = null; game.remote = null; }

const room = new URLSearchParams(location.search).get('room');
if (room) joinRoom(room);

// ---------------------------------------------------------------- live remix surface (window.R3)
function applyIncomingMod(code, summary) {
try { new Function('R3', code)(window.R3); if (summary) gameMsg(`mod: ${summary}`); }
catch (e) { console.warn('run3 mod', e); }
}
window.R3 = {
game, cfg, consts: { W, H, SEG: cfg.SEG }, colors: COLORS, sfx,
floorFill, floorStroke, retroIntensity,
hooks: (game.hooks = {}),
tileSolid, tileVisual, footingSolid, segHole, patchGapAt, gapPatchMeta, gapRow, pathCenter, safeHalf, orbAt, difficulty, project, speedNow, speedBonus, // tunnel + projection, patchable
gameMsg,
activeMods: [],
shareMod(code, summary) {
this.activeMods.push({ code, summary });
if (game.mode === 'host' && net) net.broadcastMod(code, summary);
},
};

if (EMBED) {
document.documentElement.classList.add('embed');
document.body.classList.add('embed');
hide($('ov-title'));
hide($('ov-end'));

function fitEmbedCanvas() {
const stage = $('stage');
if (!stage) return;
const box = stage.getBoundingClientRect();
const ratio = W / H;
// cover the phone screen — fill height, crop sides if needed, stay centered
let h = box.height;
let w = h * ratio;
if (w < box.width) {
w = box.width;
h = w / ratio;
}
canvas.style.width = `${Math.floor(w)}px`;
canvas.style.height = `${Math.floor(h)}px`;
}

fitEmbedCanvas();
addEventListener('resize', fitEmbedCanvas);
if (window.ResizeObserver) {
new ResizeObserver(fitEmbedCanvas).observe($('stage-wrap'));
}

addEventListener('message', (e) => {
const d = e.data;
if (!d || d.type !== 'r3-input') return;
if (d.action === 'down') {
keys[d.key.toLowerCase()] = true;
if (d.key === ' ' || d.key === 'ArrowUp') jump();
} else if (d.action === 'up') {
keys[d.key.toLowerCase()] = false;
} else if (d.action === 'start') {
if (game.state === 'title' || game.state === 'end' || game.state === 'countdown') startSolo();
}
});
}
