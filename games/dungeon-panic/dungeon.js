// Procedural floor generation — 5×5 grid, flood-fill placement, room typing.
// Floors get bigger and meaner as you descend, rotate visual themes, and
// cycle through the boss roster (MONSTRO → DUKE OF FLIES → THE HUSK).

import { W, H } from './assets.js';
import { BOSS_ROTATION } from './entities.js';

const GRID = 5;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const key = (x, y) => `${x},${y}`;

export function generateFloor(floorNum) {
// 8–11 rooms on floor 1, growing toward the grid cap as you go deeper
const target = Math.min(8 + Math.min(floorNum - 1, 6) + Math.floor(Math.random() * 4), 18);
const cells = new Set([key(2, 2)]);

// random-walk growth keeps everything connected by construction
let guard = 500;
while (cells.size < target && guard-- > 0) {
const arr = [...cells];
const [cx, cy] = arr[Math.floor(Math.random() * arr.length)].split(',').map(Number);
const [dx, dy] = DIRS[Math.floor(Math.random() * 4)];
const nx = cx + dx;
const ny = cy + dy;
if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID) cells.add(key(nx, ny));
}

// BFS distances from start
const dist = new Map([[key(2, 2), 0]]);
const queue = [[2, 2]];
while (queue.length) {
const [cx, cy] = queue.shift();
for (const [dx, dy] of DIRS) {
const k = key(cx + dx, cy + dy);
if (cells.has(k) && !dist.has(k)) {
dist.set(k, dist.get(key(cx, cy)) + 1);
queue.push([cx + dx, cy + dy]);
}
}
}

const degree = (x, y) => DIRS.filter(([dx, dy]) => cells.has(key(x + dx, y + dy))).length;

// boss = farthest room (dead-ends preferred)
let bossKey = null;
let bestScore = -1;
for (const k of cells) {
if (k === key(2, 2)) continue;
const [x, y] = k.split(',').map(Number);
const score = dist.get(k) * 10 + (degree(x, y) === 1 ? 5 : 0);
if (score > bestScore) { bestScore = score; bossKey = k; }
}

// treasure rooms: 1–2 dead-ends, falling back to any normal room
const treasureKeys = new Set();
const wantTreasure = 1 + Math.floor(Math.random() * 2);
const candidates = [...cells].filter((k) => {
const [x, y] = k.split(',').map(Number);
return k !== key(2, 2) && k !== bossKey && degree(x, y) === 1;
});
const fallback = [...cells].filter((k) => k !== key(2, 2) && k !== bossKey);
while (treasureKeys.size < wantTreasure && (candidates.length || fallback.length)) {
const src = candidates.length ? candidates : fallback;
const k = src.splice(Math.floor(Math.random() * src.length), 1)[0];
if (!treasureKeys.has(k)) treasureKeys.add(k);
}

// build room objects
const rooms = new Map();
const theme = (floorNum - 1) % 4; // stone → moss → rust → void
const bossType = BOSS_ROTATION[(floorNum - 1) % BOSS_ROTATION.length];
for (const k of cells) {
const [gx, gy] = k.split(',').map(Number);
const type =
k === key(2, 2) ? 'start' :
k === bossKey ? 'boss' :
treasureKeys.has(k) ? 'treasure' : 'normal';

const room = {
key: k,
gx,
gy,
type,
theme,
doors: {
N: cells.has(key(gx, gy - 1)),
E: cells.has(key(gx + 1, gy)),
S: cells.has(key(gx, gy + 1)),
W: cells.has(key(gx - 1, gy)),
},
spawns: [],
pickups: [],
cleared: type === 'start' || type === 'treasure',
visited: false,
};

if (type === 'normal') room.spawns = rollSpawns(floorNum);
if (type === 'boss') room.spawns = [{ type: bossType, x: W / 2, y: H / 2 - 60 }];
if (type === 'treasure') room.pickups.push({ x: W / 2, y: H / 2, kind: 'item', r: 14 });

rooms.set(k, room);
}

return { rooms, startKey: key(2, 2), floorNum };
}

function rollSpawns(floorNum) {
const count = Math.min(2 + Math.floor(Math.random() * 4) + Math.floor((floorNum - 1) / 2), 8);
const spawns = [];
for (let i = 0; i < count; i++) {
const roll = Math.random();
const type =
roll < 0.35 ? 'fly' :
roll < 0.65 ? 'gaper' :
roll < 0.85 ? 'spider' : 'fatbat';
spawns.push({
type,
// central region — comfortably away from every door entrance
x: 220 + Math.random() * (W - 440),
y: 180 + Math.random() * (H - 360),
});
}
return spawns;
}
