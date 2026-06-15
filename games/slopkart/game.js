// SLOPKART — a fully 3D arcade kart racer (three.js).
// Drift to charge turbo, grab item boxes, sling shells, race AI or friends.
// Host-authoritative multiplayer via slop netcore. Fully live-remixable
// through window.SK (the remix dock patches the running race).

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { NetCore } from '../../js/netcore.js';

const $ = (id) => document.getElementById(id);
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const COLORS = [0xFF4EB8, 0x4ECAFF, 0xFFE135, 0x3DFFB0, 0xFF7A35, 0xB94EFF];
const COLOR_NAMES = ['pink', 'blue', 'yellow', 'mint', 'orange', 'purple'];
const FIELD = 4; // total karts on the grid

// live-tunable config (the remix dock mutates this)
const config = {
maxSpeed: 52, accel: 46, turnRate: 2.3, drag: 0.9,
driftTurn: 1.7, boostMul: 1.5, boostTime: 1.6, miniBoostCharge: 1.0,
gravity: 26, laps: 3, itemRate: 1, offTrackMul: 0.62, shellSpeed: 80,
};

const hooks = {};

// ---------------------------------------------------------------- track
// a fun closed circuit; Catmull-Rom smooths the control points into a loop.
const CTRL = [
[0, 6], [46, -2], [82, -34], [86, -86], [56, -120], [4, -126],
[-44, -104], [-44, -58], [-74, -34], [-66, 16], [-26, 40], [12, 34],
];
const HALF = 8.5; // road half-width
const NS = 360; // samples around the loop

const curve = new THREE.CatmullRomCurve3(
CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', 0.5);

const samples = [];
{
let len = 0;
let prev = null;
for (let i = 0; i < NS; i++) {
const t = i / NS;
const p = curve.getPointAt(t);
const tan = curve.getTangentAt(t); // unit tangent
const nx = -tan.z, nz = tan.x; // left normal in XZ
if (prev) len += p.distanceTo(prev);
samples.push({ x: p.x, z: p.z, tx: tan.x, tz: tan.z, nx, nz });
prev = p;
}
samples.totalLen = len;
}
const track = { curve, samples, halfWidth: HALF, length: samples.totalLen, NS };

function nearestIndex(x, z, hint = 0) {
let best = hint, bd = Infinity;
for (let d = -14; d <= 14; d++) {
const i = (hint + d + NS) % NS;
const s = samples[i];
const dd = (s.x - x) ** 2 + (s.z - z) ** 2;
if (dd < bd) { bd = dd; best = i; }
}
return best;
}
// full search (used at spawn)
function nearestIndexFull(x, z) {
let best = 0, bd = Infinity;
for (let i = 0; i < NS; i++) {
const s = samples[i];
const dd = (s.x - x) ** 2 + (s.z - z) ** 2;
if (dd < bd) { bd = dd; best = i; }
}
return best;
}

// ---------------------------------------------------------------- three.js scene
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2A1A5E);
scene.fog = new THREE.Fog(0x6C2BC0, 90, 260);
const camera = new THREE.PerspectiveCamera(64, 16 / 10, 0.1, 600);

scene.add(new THREE.HemisphereLight(0xBFA0FF, 0x331a55, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(60, 120, 40);
scene.add(sun);

// sky dome (gradient)
{
const geo = new THREE.SphereGeometry(400, 24, 16);
const mat = new THREE.ShaderMaterial({
side: THREE.BackSide,
uniforms: { top: { value: new THREE.Color(0x241654) }, bot: { value: new THREE.Color(0xFF4EB8) } },
vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
fragmentShader: 'varying float h; uniform vec3 top; uniform vec3 bot; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.1,0.6,h)),1.0);} ',
});
scene.add(new THREE.Mesh(geo, mat));
}

// ground
{
const g = new THREE.Mesh(
new THREE.PlaneGeometry(900, 900),
new THREE.MeshStandardMaterial({ color: 0x1c2b3a, roughness: 1 }));
g.rotation.x = -Math.PI / 2;
g.position.y = -0.05;
scene.add(g);
const grid = new THREE.GridHelper(900, 90, 0x2f4a63, 0x223547);
grid.position.y = -0.04;
scene.add(grid);
}

// road ribbon + edges
function buildRoad() {
const pos = [], idx = [], uv = [];
for (let i = 0; i < NS; i++) {
const s = samples[i];
pos.push(s.x + s.nx * HALF, 0.02, s.z + s.nz * HALF);
pos.push(s.x - s.nx * HALF, 0.02, s.z - s.nz * HALF);
uv.push(0, i / 8); uv.push(1, i / 8);
}
for (let i = 0; i < NS; i++) {
const a = i * 2, b = i * 2 + 1, c = ((i + 1) % NS) * 2, d = ((i + 1) % NS) * 2 + 1;
idx.push(a, b, c, b, d, c);
}
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
geo.setIndex(idx);
geo.computeVertexNormals();
scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2b2740, roughness: .85 })));

// start/finish stripe
const s0 = samples[0];
const stripe = new THREE.Mesh(
new THREE.PlaneGeometry(HALF * 2, 3),
new THREE.MeshBasicMaterial({ color: 0xffffff }));
stripe.rotation.x = -Math.PI / 2;
stripe.position.set(s0.x, 0.05, s0.z);
stripe.rotation.z = Math.atan2(s0.tx, s0.tz);
scene.add(stripe);

// glowing edge rails
for (const side of [1, -1]) {
const pts = [];
for (let i = 0; i <= NS; i++) { const s = samples[i % NS]; pts.push(new THREE.Vector3(s.x + s.nx * HALF * side, 0.5, s.z + s.nz * HALF * side)); }
const rail = new THREE.Mesh(
new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), NS, 0.5, 6, true),
new THREE.MeshBasicMaterial({ color: side > 0 ? 0xFF4EB8 : 0x4ECAFF }));
scene.add(rail);
}
}
buildRoad();

// ---------------------------------------------------------------- karts
function buildKartMesh(color) {
const g = new THREE.Group();
const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 3.4),
new THREE.MeshStandardMaterial({ color, roughness: .45, metalness: .3 }));
body.position.y = 0.7; g.add(body);
const nose = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 1.2),
new THREE.MeshStandardMaterial({ color, roughness: .45 }));
nose.position.set(0, 0.55, 2.0); g.add(nose);
const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.2),
new THREE.MeshStandardMaterial({ color: 0x1A1A2E }));
seat.position.set(0, 1.2, -0.4); g.add(seat);
// driver blob
const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10),
new THREE.MeshStandardMaterial({ color: 0xFFE2C0 }));
head.position.set(0, 1.9, -0.4); g.add(head);
const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.5, 12);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x15131f });
for (const [wx, wz] of [[1.3, 1.2], [-1.3, 1.2], [1.3, -1.2], [-1.3, -1.2]]) {
const w = new THREE.Mesh(wheelGeo, wheelMat);
w.rotation.z = Math.PI / 2; w.position.set(wx, 0.55, wz); g.add(w);
}
// drift spark sprite
const spark = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 8),
new THREE.MeshBasicMaterial({ color: 0xFFE135, transparent: true, opacity: 0 }));
spark.rotation.x = Math.PI / 2; spark.position.set(0, 0.4, -2.2);
g.add(spark); g.userData.spark = spark;
scene.add(g);
return g;
}

function makeKart(id, color, name, ai, gridSlot) {
// line up on the start straight, staggered
const s = samples[(NS - 8 - gridSlot * 3) % NS];
const lane = (gridSlot % 2 ? 1 : -1) * 2.8;
const px = s.x + s.nx * lane, pz = s.z + s.nz * lane;
const idx0 = nearestIndexFull(px, pz);
const k = {
id, color, name, ai: !!ai,
pos: { x: px, y: 0, z: pz },
heading: Math.atan2(s.tx, s.tz),
speed: 0, vy: 0, drift: 0, driftCharge: 0, driftDir: 0,
item: null, boostT: 0, spinT: 0,
lap: 0, progress: idx0 / NS, idx: idx0, prevIdx: idx0,
finished: false, finishTime: 0, place: 0,
input: { throttle: 0, steer: 0, drift: false, use: false },
mesh: buildKartMesh(color),
};
k.mesh.position.set(k.pos.x, 0, k.pos.z);
k.mesh.rotation.y = k.heading;
return k;
}

// ---------------------------------------------------------------- items
const itemBoxes = [];
function buildItemBoxes() {
for (let i = 18; i < NS; i += 34) {
const s = samples[i];
const lane = (Math.floor(i / 34) % 2 ? 1 : -1) * 3;
const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2),
new THREE.MeshStandardMaterial({ color: 0xFFE135, emissive: 0xFF7A35, emissiveIntensity: .5, transparent: true, opacity: .85 }));
mesh.position.set(s.x + s.nx * lane, 1.6, s.z + s.nz * lane);
scene.add(mesh);
itemBoxes.push({ x: mesh.position.x, z: mesh.position.z, mesh, cooldown: 0 });
}
}
buildItemBoxes();

const projectiles = []; // shells
const bananas = [];

function giveItem(kart, type) {
if (!type) type = Math.random() < 0.5 ? 'boost' : (Math.random() < 0.6 ? 'shell' : 'banana');
kart.item = type;
if (kart === player) { $('item-slot').textContent = ITEM_ICON[type]; $('item-slot').classList.remove('spin'); void $('item-slot').offsetWidth; $('item-slot').classList.add('spin'); }
return type;
}
const ITEM_ICON = { boost: '', shell: '', banana: '' };

function useItem(kart) {
if (!kart.item || kart.spinT > 0) return;
const type = kart.item; kart.item = null;
if (kart === player) $('item-slot').textContent = '';
hooks.onItemUse?.(kart, type);
if (type === 'boost') { kart.boostT = config.boostTime; if (kart === player) flashBoost(); sfx.boost(); }
else if (type === 'shell') spawnShell(kart);
else if (type === 'banana') {
const bx = kart.pos.x - Math.sin(kart.heading) * 4, bz = kart.pos.z - Math.cos(kart.heading) * 4;
const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), new THREE.MeshStandardMaterial({ color: 0xFFE135 }));
mesh.position.set(bx, 0.6, bz); scene.add(mesh);
bananas.push({ x: bx, z: bz, mesh, owner: kart.id, life: 30 });
sfx.drop();
}
}

function spawnShell(kart) {
const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8),
new THREE.MeshStandardMaterial({ color: 0x3DFFB0, emissive: 0x16804f, emissiveIntensity: .6 }));
mesh.position.set(kart.pos.x + Math.sin(kart.heading) * 3, 0.9, kart.pos.z + Math.cos(kart.heading) * 3);
scene.add(mesh);
projectiles.push({ x: mesh.position.x, z: mesh.position.z, heading: kart.heading, mesh, owner: kart.id, life: 6 });
sfx.shell();
}

function spinOut(kart) {
if (kart.spinT > 0) return;
kart.spinT = 1.2; kart.speed *= 0.3; kart.boostT = 0;
if (kart === player) shake = 0.4;
}

// ---------------------------------------------------------------- audio
let actx = null;
const ac = () => { if (!actx) { const A = window.AudioContext || window.webkitAudioContext; if (A) actx = new A(); } if (actx?.state === 'suspended') actx.resume(); return actx; };
function tone(f0, f1, dur, vol = .05, type = 'sawtooth') { const c = ac(); if (!c) return; try { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, c.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), c.currentTime + dur); g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + dur); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur + .02); } catch { /* */ } }
const sfx = {
boost: () => tone(300, 900, .4, .07, 'square'),
shell: () => tone(700, 300, .25, .05, 'triangle'),
drop: () => tone(400, 150, .15, .05),
item: () => { tone(500, 800, .1, .05, 'square'); tone(800, 1100, .12, .05, 'square'); },
hit: () => tone(180, 60, .4, .08, 'sawtooth'),
lap: () => { tone(523, 523, .12, .06, 'triangle'); tone(784, 784, .18, .06, 'triangle'); },
win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, f, .2, .07, 'triangle'), i * 120)); },
count: () => tone(440, 440, .15, .06, 'square'),
go: () => tone(880, 880, .3, .08, 'square'),
engine: null,
};

// ---------------------------------------------------------------- game state
const game = { state: 'title', mode: 'single', karts: [], countdown: 0, raceTime: 0, t: 0 };
let player = null;
let shake = 0;
let camPos = new THREE.Vector3(0, 14, 30);
let net = null, myId = 'host', clientSnap = null;

const keys = {};
addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); keys[e.code] = true; ac(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });

function readInput() {
return {
throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0),
steer: (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0),
drift: !!keys.Space,
use: !!(keys.ShiftLeft || keys.ShiftRight || keys.KeyE),
};
}

// ---------------------------------------------------------------- AI
function aiInput(k) {
const look = samples[(k.idx + 9) % NS];
const desired = Math.atan2(look.x - k.pos.x, look.z - k.pos.z);
let d = desired - k.heading;
while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
const steer = clamp(d * 1.6, -1, 1);
const drift = Math.abs(d) > 0.5 && k.speed > config.maxSpeed * 0.6;
// use items: boost on straights, shell/banana opportunistically
let use = false;
if (k.item === 'boost' && Math.abs(d) < 0.15) use = true;
else if (k.item && Math.random() < 0.01) use = true;
return { throttle: 1, steer, drift, use };
}

// ---------------------------------------------------------------- physics
let prevUse = {};
function updateKart(k, dt) {
const inp = k.input;

if (k.spinT > 0) {
k.spinT -= dt; k.heading += dt * 9; k.speed = lerp(k.speed, 0, dt * 3);
advance(k, dt); k.mesh.position.set(k.pos.x, k.pos.y, k.pos.z); k.mesh.rotation.y = k.heading; return;
}

// item use (edge-triggered)
if (inp.use && !prevUse[k.id]) useItem(k);
prevUse[k.id] = inp.use;

// off-track check
k.idx = nearestIndex(k.pos.x, k.pos.z, k.idx);
const s = samples[k.idx];
const lateral = (k.pos.x - s.x) * s.nx + (k.pos.z - s.z) * s.nz;
const offTrack = Math.abs(lateral) > HALF;

// throttle / drag
const boosting = k.boostT > 0;
let cap = config.maxSpeed * (boosting ? config.boostMul : 1) * (offTrack ? config.offTrackMul : 1);
if (inp.throttle > 0) k.speed += config.accel * dt * inp.throttle;
else if (inp.throttle < 0) k.speed += config.accel * dt * inp.throttle * 0.9;
else k.speed = lerp(k.speed, 0, dt * 1.2);
k.speed -= k.speed * config.drag * dt * (offTrack ? 1.5 : 1);
k.speed = clamp(k.speed, -config.maxSpeed * 0.35, cap);
if (boosting) { k.boostT -= dt; k.speed = Math.max(k.speed, config.maxSpeed * 1.05); }

// steering + drift
const speedFactor = clamp(Math.abs(k.speed) / config.maxSpeed, 0, 1);
let turn = config.turnRate;
if (inp.drift && Math.abs(inp.steer) > 0.1 && k.speed > config.maxSpeed * 0.35) {
if (!k.drift) { k.driftDir = Math.sign(inp.steer); k.drift = 1; }
turn = config.driftTurn;
k.driftCharge += dt;
k.heading += k.driftDir * turn * dt * (0.5 + speedFactor) * (0.6 + Math.abs(inp.steer) * 0.6);
k.mesh.userData.spark.material.opacity = Math.min(1, k.driftCharge);
k.mesh.userData.spark.material.color.setHex(k.driftCharge > config.miniBoostCharge ? 0x4ECAFF : 0xFFE135);
} else {
if (k.drift) { // released
if (k.driftCharge > config.miniBoostCharge) { k.boostT = Math.max(k.boostT, config.boostTime * 0.7); if (k === player) flashBoost(); sfx.boost(); }
k.drift = 0; k.driftCharge = 0; k.mesh.userData.spark.material.opacity = 0;
}
k.heading += inp.steer * turn * dt * (0.4 + speedFactor) * Math.sign(k.speed || 1);
}

advance(k, dt);

// barrier clamp — graze, never pin (clamp position, cap speed once)
k.idx = nearestIndex(k.pos.x, k.pos.z, k.idx);
const s2 = samples[k.idx];
const lat2 = (k.pos.x - s2.x) * s2.nx + (k.pos.z - s2.z) * s2.nz;
const limit = HALF + 2.5;
if (Math.abs(lat2) > limit) {
const over = Math.abs(lat2) - limit, sgn = Math.sign(lat2);
k.pos.x -= s2.nx * over * sgn; k.pos.z -= s2.nz * over * sgn;
k.speed = Math.min(k.speed, config.maxSpeed * 0.66); // scrape the wall, keep rolling
}

// lap progress
const di = k.idx - k.prevIdx;
if (di < -NS / 2) { k.lap++; onLap(k); }
else if (di > NS / 2) { k.lap--; }
k.prevIdx = k.idx;
k.progress = k.lap + k.idx / NS;

// bananas + shells collision
for (const b of bananas) { if (b.owner !== k.id && (b.x - k.pos.x) ** 2 + (b.z - k.pos.z) ** 2 < 6) { spinOut(k); b.life = 0; sfx.hit(); } }
for (const p of projectiles) { if (p.owner !== k.id && (p.x - k.pos.x) ** 2 + (p.z - k.pos.z) ** 2 < 7) { spinOut(k); p.life = 0; sfx.hit(); } }

// item boxes
for (const box of itemBoxes) {
if (box.cooldown <= 0 && (box.x - k.pos.x) ** 2 + (box.z - k.pos.z) ** 2 < 9) {
box.cooldown = 5; box.mesh.visible = false;
if (!k.item) giveItem(k); if (k === player) sfx.item();
}
}

k.mesh.position.set(k.pos.x, k.pos.y, k.pos.z);
k.mesh.rotation.y = k.heading;
// squash/lean
k.mesh.rotation.z = lerp(k.mesh.rotation.z, k.drift ? -k.driftDir * 0.2 : -inp.steer * 0.08 * speedFactor, dt * 8);
hooks.onKartUpdate?.(k, dt);
}

function advance(k, dt) {
const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
k.pos.x += fx * k.speed * dt;
k.pos.z += fz * k.speed * dt;
// gravity hop (cosmetic, lets mods do moon physics)
k.vy -= config.gravity * dt;
k.pos.y += k.vy * dt;
if (k.pos.y < 0) { k.pos.y = 0; k.vy = 0; }
}

function onLap(k) {
hooks.onLap?.(k);
if (k.lap >= config.laps && !k.finished) {
k.finished = true; k.finishTime = game.raceTime;
k.place = game.karts.filter((o) => o.finished).length;
if (k === player) { sfx.win(); }
else if (!game.karts.some((o) => o === player && o.finished)) { /* opponent finished */ }
if (game.karts.every((o) => o.finished) || (player && player.finished)) finishRace();
} else if (k === player) {
sfx.lap(); centerMsg(`LAP ${k.lap + 1}`);
// best lap tracking
const lapT = game.raceTime - (k._lapStart || 0); k._lapStart = game.raceTime;
if (k.lap >= 1) { const best = Number(localStorage.getItem('slopkart-best-lap-ms') || 0); if (!best || lapT * 1000 < best) localStorage.setItem('slopkart-best-lap-ms', String(Math.round(lapT * 1000))), localStorage.setItem('slopkart-best-lap', String(lapT.toFixed(1))); }
}
if (k === player) k._lapStart = game.raceTime;
}

// ---------------------------------------------------------------- projectiles / pickups update
function updateProjectiles(dt) {
for (const p of projectiles) {
// gently home toward nearest kart ahead
let target = null, bd = Infinity;
for (const k of game.karts) { if (k.id === p.owner) continue; const d = (k.pos.x - p.x) ** 2 + (k.pos.z - p.z) ** 2; if (d < bd) { bd = d; target = k; } }
if (target) { const desired = Math.atan2(target.pos.x - p.x, target.pos.z - p.z); let d = desired - p.heading; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; p.heading += clamp(d, -2 * dt, 2 * dt); }
p.x += Math.sin(p.heading) * config.shellSpeed * dt;
p.z += Math.cos(p.heading) * config.shellSpeed * dt;
p.life -= dt;
p.mesh.position.set(p.x, 0.9, p.z);
}
for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].life <= 0) { scene.remove(projectiles[i].mesh); projectiles.splice(i, 1); }
for (const b of bananas) { b.life -= dt; b.mesh.rotation.y += dt * 2; }
for (let i = bananas.length - 1; i >= 0; i--) if (bananas[i].life <= 0) { scene.remove(bananas[i].mesh); bananas.splice(i, 1); }
for (const box of itemBoxes) { if (box.cooldown > 0) { box.cooldown -= dt; if (box.cooldown <= 0) box.mesh.visible = true; } box.mesh.rotation.y += dt * 1.5; box.mesh.rotation.x += dt; }
}

// ---------------------------------------------------------------- camera + render
function updateCamera(dt) {
const target = player || game.karts[0];
if (!target) return;
const fx = Math.sin(target.heading), fz = Math.cos(target.heading);
const want = new THREE.Vector3(
target.pos.x - fx * 13, target.pos.y + 7.5 + (target.boostT > 0 ? 1 : 0), target.pos.z - fz * 13);
camPos.lerp(want, clamp(dt * 4, 0, 1));
camera.position.copy(camPos);
if (shake > 0) { camera.position.x += (Math.random() - .5) * shake * 3; camera.position.y += (Math.random() - .5) * shake * 2; shake -= dt * 1.5; }
camera.lookAt(target.pos.x + fx * 8, target.pos.y + 2, target.pos.z + fz * 8);
const fovWant = 64 + (target.boostT > 0 ? 10 : 0) + Math.min(14, target.speed * 0.12);
camera.fov = lerp(camera.fov, fovWant, dt * 4); camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- HUD + minimap
const mmCtx = $('minimap').getContext('2d');
function drawMinimap() {
const W = 130, H = 130, pad = 14;
mmCtx.clearRect(0, 0, W, H);
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const s of samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
const px = (x) => pad + (x - minX) * sc, pz = (z) => pad + (z - minZ) * sc;
mmCtx.strokeStyle = 'rgba(255,255,255,.5)'; mmCtx.lineWidth = 3; mmCtx.beginPath();
for (let i = 0; i <= NS; i += 4) { const s = samples[i % NS]; i === 0 ? mmCtx.moveTo(px(s.x), pz(s.z)) : mmCtx.lineTo(px(s.x), pz(s.z)); }
mmCtx.closePath(); mmCtx.stroke();
for (const k of game.karts) {
mmCtx.fillStyle = '#' + k.color.toString(16).padStart(6, '0');
mmCtx.beginPath(); mmCtx.arc(px(k.pos.x), pz(k.pos.z), k === player ? 5 : 3.5, 0, TAU); mmCtx.fill();
if (k === player) { mmCtx.strokeStyle = '#fff'; mmCtx.lineWidth = 2; mmCtx.stroke(); }
}
}

function updateHUD() {
const me = game.mode === 'client' ? (clientSnap?.karts.find((k) => k.id === myId)) : player;
if (!me) return;
const karts = game.mode === 'client' ? clientSnap.karts : game.karts;
$('lap-n').textContent = Math.min(config.laps, (me.lap || 0) + 1);
$('lap').querySelector('small').textContent = '/' + config.laps;
const sorted = [...karts].sort((a, b) => b.progress - a.progress);
const place = sorted.indexOf(sorted.find((k) => k.id === me.id)) + 1;
const sfx2 = ['', 'st', 'nd', 'rd', 'th'][place] || 'th';
$('pos').innerHTML = place + '<sup>' + sfx2 + '</sup>';
$('of').textContent = 'of ' + karts.length;
$('kmh').textContent = Math.round(Math.abs(me.speed) * 3.6);
$('item-slot').textContent = me.item ? ITEM_ICON[me.item] : '';
$('curtime').textContent = (game.raceTime - (me._lapStart || 0)).toFixed(1);
const best = localStorage.getItem('slopkart-best-lap');
$('besttime').textContent = best ? `best ${best}s` : '';
}

function centerMsg(text, ms = 1100) {
const el = $('center-msg'); el.textContent = text; el.classList.add('on');
clearTimeout(centerMsg.t); centerMsg.t = setTimeout(() => el.classList.remove('on'), ms);
}
function flashBoost() { const f = $('boost-flash'); f.classList.add('on'); clearTimeout(flashBoost.t); flashBoost.t = setTimeout(() => f.classList.remove('on'), 350); }

// ---------------------------------------------------------------- race flow
function buildField() {
game.karts.forEach((k) => scene.remove(k.mesh));
game.karts = [];
let slot = 0;
const players = game.mode === 'host' ? ['host', ...net.conns.map((c) => c.peer)] : ['host'];
if (game.mode === 'single') {
player = makeKart('host', COLORS[0], 'you', false, slot++);
game.karts.push(player);
} else {
for (const id of players) {
const k = makeKart(id, COLORS[slot % COLORS.length], id === 'host' ? 'host' : 'racer', false, slot++);
game.karts.push(k);
if (id === myId) player = k;
}
}
while (game.karts.length < FIELD) {
game.karts.push(makeKart('ai' + slot, COLORS[slot % COLORS.length], 'CPU', true, slot)); slot++;
}
for (const box of itemBoxes) { box.cooldown = 0; box.mesh.visible = true; }
projectiles.splice(0).forEach((p) => scene.remove(p.mesh));
bananas.splice(0).forEach((b) => scene.remove(b.mesh));
}

function startRace() {
buildField();
game.state = 'countdown'; game.countdown = 3.2; game.raceTime = 0;
hideAll();
if (game.mode === 'host') net.broadcast({ t: 'start' });
}

function finishRace() {
if (game.state === 'finished') return;
game.state = 'finished';
const sorted = [...game.karts].sort((a, b) => (b.finished ? b.progress + 100 - b.finishTime / 1000 : b.progress) - (a.finished ? a.progress + 100 - a.finishTime / 1000 : a.progress));
const mine = sorted.indexOf(player) + 1;
$('res-title').textContent = mine === 1 ? 'YOU WIN!' : `${mine}${['', 'st', 'nd', 'rd', 'th'][mine] || 'th'} place`;
$('res-list').innerHTML = sorted.map((k, i) => `<div class="results-row"><span class="${i === 0 ? 'r1' : ''}">${i + 1}. ${k === player ? 'YOU' : (k.ai ? 'CPU' : k.name)} ${k.color === COLORS[0] ? '' : ''}</span></div>`).join('');
if (mine === 1) queueXP({ xp: 80, reason: 'won a SlopKart race!', unlock: 'speedster' });
else queueXP({ xp: 25, reason: 'finished a race' });
show($('ov-results'));
if (game.mode === 'host') net.broadcast({ t: 'results', html: $('res-list').innerHTML, title: $('res-title').textContent });
}

function queueXP(e) { try { const q = JSON.parse(localStorage.getItem('slop-xp-queue') || '[]'); q.push(e); localStorage.setItem('slop-xp-queue', JSON.stringify(q)); } catch { /* */ } }

function hideAll() { hide($('ov-title')); hide($('ov-lobby')); hide($('ov-results')); }
function backToTitle() {
try { net?.destroy(); } catch { /* */ } net = null; clientSnap = null;
game.state = 'title'; hideAll(); show($('ov-title'));
const best = localStorage.getItem('slopkart-best-lap'); $('hi-lap').textContent = best ? best + 's' : '—';
}

// ---------------------------------------------------------------- multiplayer
function hostGame() {
if (!NetCore.available()) { centerMsg('no internet for MP'); return; }
game.mode = 'host'; myId = 'host';
net = new NetCore({ prefix: 'slop-kart' });
net.on('join', () => { updateLobby(); for (const m of window.SK.activeMods) net.broadcastMod(m.code, m.summary); })
.on('leave', updateLobby)
.on('input', (id, i) => { const k = game.karts.find((x) => x.id === id); if (k) k.input = i; })
.on('mod', (code, summary) => applyIncomingMod(code, summary))
.on('error', (t) => centerMsg('net: ' + t));
game.state = 'lobby'; hideAll(); show($('ov-lobby'));
$('lobby-title').textContent = 'RACE LOBBY'; $('btn-start').style.display = '';
net.host((code) => { $('room-code').textContent = code; $('share-link').value = net.shareLink(); updateLobby(); });
// host broadcast loop
setInterval(() => {
if (!net?.isHost) return;
if (game.state === 'lobby') net.broadcastLobby({ n: 1 + net.conns.length });
else if (game.state === 'countdown' || game.state === 'racing' || game.state === 'finished') net.broadcastState(snapshot());
}, 50);
}

function joinGame(code) {
game.mode = 'client';
net = new NetCore({ prefix: 'slop-kart' });
net.on('init', (id) => { myId = id; })
.on('lobby', (m) => { $('lobby-count').textContent = `${m.n} racer${m.n === 1 ? '' : 's'} — waiting for host`; })
.on('state', (s) => { clientSnap = s; if (game.state !== 'racing' && game.state !== 'countdown') { game.state = 'racing'; hideAll(); } renderSnapshot(s); })
.on('mod', (code, summary) => applyIncomingMod(code, summary))
.on('disconnected', () => { show($('ov-lobby')); $('lobby-title').textContent = 'HOST LEFT'; $('btn-start').style.display = 'none'; })
.on('error', (t) => { $('lobby-count').textContent = t === 'peer-unavailable' ? 'room not found' : 'net: ' + t; })
.on('data', (conn, m) => { if (m.t === 'start') { game.state = 'countdown'; hideAll(); } if (m.t === 'results') { $('res-list').innerHTML = m.html; $('res-title').textContent = m.title; show($('ov-results')); } });
game.state = 'lobby'; hideAll(); show($('ov-lobby'));
$('lobby-title').textContent = 'JOINING…'; $('room-code').textContent = code; $('share-link').value = location.href; $('btn-start').style.display = 'none';
net.join(code, () => { $('lobby-count').textContent = 'connected — waiting for host'; });
// assign id after connect: host assigns on join via init; ensure we have karts mapping by id from snapshot
setInterval(() => { if (game.state === 'racing' || game.state === 'countdown') { const me = clientSnap?.karts.find((k) => k.id === myId) || clientSnap?.karts.find((k) => !k.ai); if (me) net.sendInput(readInput()); } }, 33);
}
// host assigns ids to clients on join
function assignClientIds() { /* host: client id = conn.peer, already used as kart id */ }

function updateLobby() {
const n = game.mode === 'host' ? 1 + net.conns.length : 1;
$('lobby-count').textContent = `${n} racer${n === 1 ? '' : 's'} in the lobby`;
}

function snapshot() {
return {
state: game.state, raceTime: game.raceTime, countdown: game.countdown,
karts: game.karts.map((k) => ({ id: k.id, x: k.pos.x, y: k.pos.y, z: k.pos.z, heading: k.heading, speed: k.speed, drift: k.drift, item: k.item, boostT: k.boostT, spinT: k.spinT, lap: k.lap, progress: k.progress, color: k.color, ai: k.ai, name: k.name })),
proj: projectiles.map((p) => ({ x: p.x, z: p.z })),
ban: bananas.map((b) => ({ x: b.x, z: b.z })),
boxes: itemBoxes.map((b) => b.cooldown <= 0),
};
}

// client render from snapshot
const remoteMeshes = {};
function renderSnapshot(s) {
game.raceTime = s.raceTime;
const seen = {};
for (const ks of s.karts) {
seen[ks.id] = true;
let m = remoteMeshes[ks.id];
if (!m) { m = buildKartMesh(ks.color); remoteMeshes[ks.id] = m; }
m.position.set(ks.x, ks.y, ks.z); m.rotation.y = ks.heading;
m.userData.spark.material.opacity = ks.drift ? 1 : 0;
}
for (const id in remoteMeshes) if (!seen[id]) { scene.remove(remoteMeshes[id]); delete remoteMeshes[id]; }
// camera follows my kart
const me = s.karts.find((k) => k.id === myId) || s.karts[0];
if (me) { player = { pos: { x: me.x, y: me.y, z: me.z }, heading: me.heading, speed: me.speed, boostT: me.boostT }; game.karts = s.karts.map((k) => ({ ...k, pos: { x: k.x, y: k.y, z: k.z } })); }
itemBoxes.forEach((b, i) => { b.mesh.visible = s.boxes[i]; });
}

function applyIncomingMod(code, summary) {
try { new Function('SK', code)(window.SK); window.SK.activeMods.push({ code, summary }); centerMsg('mod: ' + (summary || 'applied'), 1600); }
catch (e) { console.warn('mod failed', e); }
}

// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
const dt = Math.min(0.05, (now - last) / 1000); last = now;
game.t += dt;

if (game.mode !== 'client') {
if (game.state === 'countdown') {
game.countdown -= dt;
const n = Math.ceil(game.countdown);
centerMsg(n > 0 ? String(n) : 'GO!', 600);
if (game.countdown <= 0) { game.state = 'racing'; sfx.go(); } else { /* tick */ if (n !== frame._lastN) { frame._lastN = n; sfx.count(); } }
}
if (game.state === 'racing' || game.state === 'finished') {
game.raceTime += dt;
for (const k of game.karts) {
if (game.state === 'finished' && k === player) { k.input = { throttle: 0, steer: 0, drift: false, use: false }; }
else if (k === player && game.mode !== 'host') k.input = readInput();
else if (k === player) k.input = readInput();
else if (k.ai) k.input = aiInput(k);
// non-ai remote karts already have k.input from net 'input'
updateKart(k, dt);
}
updateProjectiles(dt);
hooks.onUpdate?.(dt);
}
updateCamera(dt);
if (game.state !== 'title' && game.state !== 'lobby') { updateHUD(); drawMinimap(); }
} else {
// client: render from latest snapshot, smooth camera
updateCamera(dt);
if (clientSnap) { updateHUD(); drawMinimap(); }
}

try { hooks.postRender?.(); } catch { /* */ }
renderer.render(scene, camera);
requestAnimationFrame(frame);
}

function resize() {
const r = canvas.getBoundingClientRect();
renderer.setSize(r.width, r.height, false);
camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- boot / UI
function init() {
resize(); setTimeout(resize, 50);
const best = localStorage.getItem('slopkart-best-lap'); $('hi-lap').textContent = best ? best + 's' : '—';
$('btn-single').onclick = () => { ac(); game.mode = 'single'; startRace(); };
$('btn-multi').onclick = () => { ac(); hostGame(); };
$('btn-start').onclick = () => { if (game.mode === 'host') startRace(); };
$('btn-leave').onclick = backToTitle;
$('btn-again').onclick = () => { if (game.mode === 'client') return; startRace(); };
$('btn-title').onclick = backToTitle;
$('copy-link').onclick = () => { const v = $('share-link').value; navigator.clipboard?.writeText(v).then(() => centerMsg('link copied!', 900), () => {}); };

const room = new URLSearchParams(location.search).get('room');
if (room) { hide($('ov-title')); if (NetCore.available()) joinGame(room); else centerMsg('no internet for MP'); }

requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- live remix surface
window.SK = {
THREE, scene, camera, renderer, config, track, hooks,
get karts() { return game.karts; },
get player() { return player; },
get projectiles() { return projectiles; },
get bananas() { return bananas; },
get itemBoxes() { return itemBoxes; },
get game() { return game; },
consts: { COLORS, COLOR_NAMES, FIELD },
giveItem, useItem, spawnShell, spinOut, makeKart,
gameMsg: (t) => centerMsg(t, 1600),
sfx,
activeMods: [],
shareMod(code, summary) { this.activeMods.push({ code, summary }); if (game.mode === 'host' && net) net.broadcastMod(code, summary); },
};

init();
