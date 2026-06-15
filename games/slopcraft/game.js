// SLOPCRAFT — a Minecraft-style voxel sandbox in the browser.
// Procedural terrain, chunked greedy-ish meshing with baked face shading,
// first-person controller with AABB voxel collision, break/place with a DDA
// raycast, hotbar, and persistent edits via localStorage. Built on three.js.

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// ---------------------------------------------------------------- world data

const WX = 128, WY = 48, WZ = 128; // world size in blocks
const CHUNK = 16; // chunk side (in columns)
const WATER_LEVEL = 13;

const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, WATER = 5,
LOG = 6, LEAVES = 7, PLANKS = 8, COBBLE = 9, GLOWSTONE = 10;

const BLOCKS = {
[GRASS]: { name: 'Grass', top: 0x5FA855, side: 0x7A5C3A, bottom: 0x6B4F33 },
[DIRT]: { name: 'Dirt', top: 0x7A5C3A, side: 0x7A5C3A, bottom: 0x6B4F33 },
[STONE]: { name: 'Stone', top: 0x8A8A92, side: 0x80808A, bottom: 0x74747E },
[SAND]: { name: 'Sand', top: 0xE2D08A, side: 0xD8C67E, bottom: 0xC9B872 },
[WATER]: { name: 'Water', top: 0x3D7BC9, side: 0x3D7BC9, bottom: 0x3D7BC9 },
[LOG]: { name: 'Log', top: 0xA8845C, side: 0x6B4A2E, bottom: 0xA8845C },
[LEAVES]: { name: 'Leaves', top: 0x3E7A36, side: 0x468A3E, bottom: 0x356B2E },
[PLANKS]: { name: 'Planks', top: 0xC9A063, side: 0xC9A063, bottom: 0xB8915A },
[COBBLE]: { name: 'Cobble', top: 0x6E6E78, side: 0x67676F, bottom: 0x5E5E66 },
[GLOWSTONE]: { name: 'Glowstone', top: 0xFFE08A, side: 0xFFD86B, bottom: 0xF0C95E },
};

const HOTBAR = [GRASS, DIRT, STONE, SAND, LOG, PLANKS, COBBLE, GLOWSTONE];

const world = new Uint8Array(WX * WY * WZ);
const idx = (x, y, z) => (x * WZ + z) * WY + y;

function getBlock(x, y, z) {
if (y < 0) return STONE; // bedrock floor
if (x < 0 || x >= WX || z < 0 || z >= WZ || y >= WY) return AIR;
return world[idx(x, y, z)];
}

const isSolid = (b) => b !== AIR && b !== WATER;

// ---------------------------------------------------------------- terrain gen

function vhash(x, z) {
const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
return s - Math.floor(s);
}

function smoothNoise(x, z) {
const xi = Math.floor(x), zi = Math.floor(z);
const xf = x - xi, zf = z - zi;
const u = xf * xf * (3 - 2 * xf);
const v = zf * zf * (3 - 2 * zf);
const a = vhash(xi, zi), b = vhash(xi + 1, zi);
const c = vhash(xi, zi + 1), d = vhash(xi + 1, zi + 1);
return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, z) {
return smoothNoise(x / 42, z / 42) * 0.55
+ smoothNoise(x / 18, z / 18) * 0.3
+ smoothNoise(x / 7, z / 7) * 0.15;
}

function generateTerrain() {
const heights = new Int16Array(WX * WZ);
for (let x = 0; x < WX; x++) {
for (let z = 0; z < WZ; z++) {
const h = Math.floor(10 + fbm(x, z) * 26);
heights[x * WZ + z] = h;
for (let y = 0; y <= h; y++) {
let b = STONE;
if (y === h) b = h <= WATER_LEVEL + 1 ? SAND : GRASS;
else if (y >= h - 3) b = h <= WATER_LEVEL + 1 ? SAND : DIRT;
world[idx(x, y, z)] = b;
}
for (let y = h + 1; y <= WATER_LEVEL; y++) world[idx(x, y, z)] = WATER;
}
}

// trees on grass, away from world edges
for (let i = 0; i < 110; i++) {
const x = 4 + Math.floor(vhash(i, 7) * (WX - 8));
const z = 4 + Math.floor(vhash(i, 31) * (WZ - 8));
const h = heights[x * WZ + z];
if (getBlock(x, h, z) !== GRASS || vhash(x, z) < 0.45) continue;
const trunk = 4 + Math.floor(vhash(x + 9, z + 3) * 2);
for (let y = 1; y <= trunk; y++) world[idx(x, h + y, z)] = LOG;
for (let dx = -2; dx <= 2; dx++) {
for (let dz = -2; dz <= 2; dz++) {
for (let dy = 0; dy <= 2; dy++) {
const dist = Math.abs(dx) + Math.abs(dz) + dy;
if (dist > 4 || (dx === 0 && dz === 0 && dy < 2)) continue;
const yy = h + trunk + dy;
if (getBlock(x + dx, yy, z + dz) === AIR && yy < WY) {
world[idx(x + dx, yy, z + dz)] = LEAVES;
}
}
}
}
world[idx(x, h + trunk + 2, z)] = LEAVES;
}
}

// ---------------------------------------------------------------- persistence

const SAVE_KEY = 'slopcraft-world';

let edits = {};
function loadEdits() {
try { edits = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { edits = {}; }
for (const [k, v] of Object.entries(edits)) {
const [x, y, z] = k.split(',').map(Number);
if (x >= 0 && x < WX && y >= 0 && y < WY && z >= 0 && z < WZ) world[idx(x, y, z)] = v;
}
}

let saveTimer = null;
function recordEdit(x, y, z, b) {
edits[`${x},${y},${z}`] = b;
clearTimeout(saveTimer);
saveTimer = setTimeout(() => {
try { localStorage.setItem(SAVE_KEY, JSON.stringify(edits)); } catch { /* full */ }
}, 400);
}

// ---------------------------------------------------------------- meshing

// faces: [normal, 4 corner offsets, shade]
const FACES = [
{ n: [0, 1, 0], c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], shade: 1.0, key: 'top' },
{ n: [0, -1, 0], c: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]], shade: 0.5, key: 'bottom' },
{ n: [1, 0, 0], c: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]], shade: 0.8, key: 'side' },
{ n: [-1, 0, 0], c: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]], shade: 0.8, key: 'side' },
{ n: [0, 0, 1], c: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]], shade: 0.68, key: 'side' },
{ n: [0, 0, -1], c: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], shade: 0.68, key: 'side' },
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9AD4F5);
scene.fog = new THREE.Fog(0x9AD4F5, 60, 150);

const CX = WX / CHUNK, CZ = WZ / CHUNK;
const chunkMeshes = []; // { solid, water }

const solidMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
const waterMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.65, side: THREE.DoubleSide });

function buildChunkGeometry(cx, cz, waterPass) {
const pos = [], col = [], idxArr = [];
const color = new THREE.Color();

for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) {
for (let z = cz * CHUNK; z < (cz + 1) * CHUNK; z++) {
for (let y = 0; y < WY; y++) {
const b = world[idx(x, y, z)];
if (b === AIR) continue;
const isWater = b === WATER;
if (isWater !== waterPass) continue;

for (const face of FACES) {
const nb = getBlock(x + face.n[0], y + face.n[1], z + face.n[2]);
if (waterPass) {
if (nb !== AIR) continue; // water only shows against air
} else if (isSolid(nb)) continue; // solid hidden by solid

const def = BLOCKS[b];
color.setHex(def[face.key]).multiplyScalar(face.shade);
const base = pos.length / 3;
for (const corner of face.c) {
pos.push(x + corner[0], y + corner[1], z + corner[2]);
col.push(color.r, color.g, color.b);
}
idxArr.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
}
}
}

if (!idxArr.length) return null;
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
geo.setIndex(idxArr);
return geo;
}

function rebuildChunk(cx, cz) {
const slot = chunkMeshes[cx * CZ + cz] || (chunkMeshes[cx * CZ + cz] = {});
for (const pass of ['solid', 'water']) {
if (slot[pass]) {
scene.remove(slot[pass]);
slot[pass].geometry.dispose();
slot[pass] = null;
}
const geo = buildChunkGeometry(cx, cz, pass === 'water');
if (geo) {
slot[pass] = new THREE.Mesh(geo, pass === 'water' ? waterMat : solidMat);
scene.add(slot[pass]);
}
}
}

function rebuildAround(x, z) {
const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
rebuildChunk(cx, cz);
if (x % CHUNK === 0 && cx > 0) rebuildChunk(cx - 1, cz);
if (x % CHUNK === CHUNK - 1 && cx < CX - 1) rebuildChunk(cx + 1, cz);
if (z % CHUNK === 0 && cz > 0) rebuildChunk(cx, cz - 1);
if (z % CHUNK === CHUNK - 1 && cz < CZ - 1) rebuildChunk(cx, cz + 1);
}

// ---------------------------------------------------------------- renderer & camera

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
stage.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.08, 300);

function resize() {
const r = stage.getBoundingClientRect();
renderer.setSize(r.width, r.height, false);
camera.aspect = r.width / r.height;
camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// block highlight wireframe
const highlight = new THREE.LineSegments(
new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
new THREE.LineBasicMaterial({ color: 0x1a1a2e })
);
highlight.visible = false;
scene.add(highlight);

// ---------------------------------------------------------------- player

const player = {
pos: new THREE.Vector3(WX / 2 + 0.5, WY, WZ / 2 + 0.5),
vel: new THREE.Vector3(),
yaw: 0.7,
pitch: -0.15,
onGround: false,
W: 0.3, // half-width
H: 1.8, // height (eye at H - 0.2)
};

function surfaceY(x, z) {
for (let y = WY - 1; y > 0; y--) {
if (isSolid(getBlock(x, y, z))) return y;
}
return 0;
}

function spawnOnSurface() {
// spiral out from the center until we find dry land
const cx = Math.floor(WX / 2), cz = Math.floor(WZ / 2);
for (let r = 0; r < 48; r += 2) {
for (let a = 0; a < Math.PI * 2; a += 0.6) {
const x = Math.max(2, Math.min(WX - 3, cx + Math.round(Math.cos(a) * r)));
const z = Math.max(2, Math.min(WZ - 3, cz + Math.round(Math.sin(a) * r)));
const y = surfaceY(x, z);
if (y > WATER_LEVEL && getBlock(x, y, z) === GRASS) {
player.pos.set(x + 0.5, y + 2.2, z + 0.5);
return;
}
}
}
player.pos.y = surfaceY(cx, cz) + 2.2;
}

function collide(axis) {
const p = player.pos;
const min = [p.x - player.W, p.y, p.z - player.W];
const max = [p.x + player.W, p.y + player.H, p.z + player.W];
for (let x = Math.floor(min[0]); x <= Math.floor(max[0]); x++) {
for (let y = Math.floor(min[1]); y <= Math.floor(max[1]); y++) {
for (let z = Math.floor(min[2]); z <= Math.floor(max[2]); z++) {
if (!isSolid(getBlock(x, y, z))) continue;
// resolve along the moving axis only
if (axis === 0) {
p.x = player.vel.x > 0 ? x - player.W - 0.001 : x + 1 + player.W + 0.001;
player.vel.x = 0;
} else if (axis === 1) {
if (player.vel.y <= 0) { p.y = y + 1; player.onGround = true; }
else p.y = y - player.H - 0.001;
player.vel.y = 0;
} else {
p.z = player.vel.z > 0 ? z - player.W - 0.001 : z + 1 + player.W + 0.001;
player.vel.z = 0;
}
return;
}
}
}
}

const keys = {};
window.addEventListener('keydown', (e) => {
keys[e.code] = true;
if (e.code === 'Space') e.preventDefault();
const slotKey = parseInt(e.key, 10);
if (slotKey >= 1 && slotKey <= HOTBAR.length) selectSlot(slotKey - 1);
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

function updatePlayer(dt) {
const speed = 5.4;
const fwdX = Math.sin(player.yaw), fwdZ = -Math.cos(player.yaw);
let mx = 0, mz = 0;
if (keys.KeyW) { mx += fwdX; mz += fwdZ; }
if (keys.KeyS) { mx -= fwdX; mz -= fwdZ; }
if (keys.KeyA) { mx += fwdZ; mz -= fwdX; }
if (keys.KeyD) { mx -= fwdZ; mz += fwdX; }
const m = Math.hypot(mx, mz) || 1;
player.vel.x = (mx / m) * speed;
player.vel.z = (mz / m) * speed;

player.vel.y -= 22 * dt; // gravity
if (keys.Space && player.onGround) { player.vel.y = 8.2; player.onGround = false; }

player.onGround = false;
player.pos.x += player.vel.x * dt; collide(0);
player.pos.y += player.vel.y * dt; collide(1);
player.pos.z += player.vel.z * dt; collide(2);

// fell out of the world → respawn
if (player.pos.y < -12) { player.pos.set(WX / 2 + 0.5, WY, WZ / 2 + 0.5); player.vel.set(0, 0, 0); spawnOnSurface(); }

camera.position.set(player.pos.x, player.pos.y + player.H - 0.2, player.pos.z);
camera.rotation.set(0, 0, 0);
camera.rotateY(-player.yaw);
camera.rotateX(player.pitch);
}

// ---------------------------------------------------------------- raycast (DDA)

function raycast(maxDist = 6) {
const origin = camera.position.clone();
const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();

let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z);
const tDeltaX = Math.abs(1 / (dir.x || 1e-9));
const tDeltaY = Math.abs(1 / (dir.y || 1e-9));
const tDeltaZ = Math.abs(1 / (dir.z || 1e-9));
let tMaxX = tDeltaX * (stepX > 0 ? 1 - (origin.x - x) : origin.x - x);
let tMaxY = tDeltaY * (stepY > 0 ? 1 - (origin.y - y) : origin.y - y);
let tMaxZ = tDeltaZ * (stepZ > 0 ? 1 - (origin.z - z) : origin.z - z);
let normal = [0, 0, 0];
let t = 0;

while (t <= maxDist) {
const b = getBlock(x, y, z);
if (b !== AIR && b !== WATER) return { x, y, z, normal, block: b };
if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; normal = [-stepX, 0, 0]; }
else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; normal = [0, -stepY, 0]; }
else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; normal = [0, 0, -stepZ]; }
}
return null;
}

function setBlockAndRebuild(x, y, z, b) {
if (x < 0 || x >= WX || y < 0 || y >= WY || z < 0 || z >= WZ) return;
world[idx(x, y, z)] = b;
recordEdit(x, y, z, b);
rebuildAround(x, z);
}

function breakBlock() {
const hit = raycast();
if (!hit) return;
setBlockAndRebuild(hit.x, hit.y, hit.z, AIR);
}

function placeBlock() {
const hit = raycast();
if (!hit) return;
const x = hit.x + hit.normal[0];
const y = hit.y + hit.normal[1];
const z = hit.z + hit.normal[2];
if (getBlock(x, y, z) !== AIR && getBlock(x, y, z) !== WATER) return;
// don't place a block inside yourself
const p = player.pos;
if (x + 1 > p.x - player.W && x < p.x + player.W
&& z + 1 > p.z - player.W && z < p.z + player.W
&& y + 1 > p.y && y < p.y + player.H) return;
setBlockAndRebuild(x, y, z, HOTBAR[activeSlot]);
}

// ---------------------------------------------------------------- hotbar UI

let activeSlot = 0;
const hotbarEl = document.getElementById('hotbar');
const blockNameEl = document.getElementById('block-name');
let nameTimer = null;

function buildHotbar() {
hotbarEl.innerHTML = HOTBAR.map((b, i) => `
<div class="slot${i === 0 ? ' active' : ''}" data-i="${i}" title="${BLOCKS[b].name}">
<div class="swatch" style="background:#${BLOCKS[b].top.toString(16).padStart(6, '0')}"></div>
<span class="num">${i + 1}</span>
</div>`).join('');
hotbarEl.querySelectorAll('.slot').forEach((s) => {
s.addEventListener('click', () => selectSlot(Number(s.dataset.i)));
});
}

function selectSlot(i) {
activeSlot = (i + HOTBAR.length) % HOTBAR.length;
hotbarEl.querySelectorAll('.slot').forEach((s, j) => s.classList.toggle('active', j === activeSlot));
blockNameEl.textContent = BLOCKS[HOTBAR[activeSlot]].name;
blockNameEl.classList.add('on');
clearTimeout(nameTimer);
nameTimer = setTimeout(() => blockNameEl.classList.remove('on'), 1100);
}

window.addEventListener('wheel', (e) => {
if (!locked) return;
selectSlot(activeSlot + (e.deltaY > 0 ? 1 : -1));
});

// ---------------------------------------------------------------- pointer lock

const overlay = document.getElementById('overlay');
let locked = false;

overlay.addEventListener('click', () => renderer.domElement.requestPointerLock());

document.addEventListener('pointerlockchange', () => {
locked = document.pointerLockElement === renderer.domElement;
overlay.classList.toggle('hidden', locked);
});

document.addEventListener('mousemove', (e) => {
if (!locked) return;
player.yaw += e.movementX * 0.0024;
player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - e.movementY * 0.0024));
});

renderer.domElement.addEventListener('mousedown', (e) => {
if (!locked) return;
if (e.button === 0) breakBlock();
if (e.button === 2) placeBlock();
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- boot & loop

generateTerrain();
loadEdits();
for (let cx = 0; cx < CX; cx++) for (let cz = 0; cz < CZ; cz++) rebuildChunk(cx, cz);
spawnOnSurface();
buildHotbar();
resize();

// live remix surface (remix dock patches the running game through this)
window.SC = {
player, camera, scene, THREE,
world, BLOCKS, HOTBAR,
getBlock, recordEdit, rebuildChunk, rebuildAround, surfaceY,
breakBlock, placeBlock, raycast,
consts: { WX, WY, WZ, CHUNK, WATER_LEVEL, AIR, GRASS, DIRT, STONE, SAND, WATER, LOG, PLANKS, COBBLE, GLOWSTONE },
hooks: {},
setLock(v) { locked = v; },
gameMsg(text) {
let el = document.getElementById('sc-mod-msg');
if (!el) {
el = document.createElement('div');
el.id = 'sc-mod-msg';
el.style.cssText = 'position:fixed;top:14%;left:50%;transform:translateX(-50%);z-index:60;font-family:"Fredoka One",cursive;font-size:18px;color:#fff;background:rgba(20,18,28,.92);border:2px solid #000;border-radius:100px;padding:8px 24px;pointer-events:none;transition:opacity .2s;';
document.body.appendChild(el);
}
el.textContent = text;
el.style.opacity = '1';
clearTimeout(window.__scMsgT);
window.__scMsgT = setTimeout(() => { el.style.opacity = '0'; }, 2400);
},
activeMods: [],
shareMod(code, summary) { this.activeMods.push({ code, summary }); },
};

let last = performance.now();
function frame(now) {
const dt = Math.min(0.05, (now - last) / 1000);
last = now;

if (locked) updatePlayer(dt);
else updatePlayer(0); // keep camera in sync while paused

const hit = locked ? raycast() : null;
highlight.visible = !!hit;
if (hit) highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);

// underwater tint
const head = getBlock(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z));
scene.fog.color.setHex(head === WATER ? 0x2A5C94 : 0x9AD4F5);
scene.background.setHex(head === WATER ? 0x2A5C94 : 0x9AD4F5);

renderer.render(scene, camera);
requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
