// Programmatic sprite & sound generation. No image files, no audio files —
// everything is drawn with Canvas 2D and synthesized with WebAudio.

export const W = 800;
export const H = 600;
export const WALL = 48;
export const DOOR = 88;

export const PLAYER_COLORS = ['#4ECAFF', '#FF4EB8', '#FFE135', '#3DFFB0'];

// ---------------------------------------------------------------- helpers

export function roundRect(ctx, x, y, w, h, r) {
ctx.beginPath();
ctx.moveTo(x + r, y);
ctx.arcTo(x + w, y, x + w, y + h, r);
ctx.arcTo(x + w, y + h, x, y + h, r);
ctx.arcTo(x, y + h, x, y, r);
ctx.arcTo(x, y, x + w, y, r);
ctx.closePath();
}

function heartPath(ctx, x, y, s) {
ctx.beginPath();
ctx.moveTo(x, y + s * 0.32);
ctx.bezierCurveTo(x, y - s * 0.05, x - s * 0.55, y - s * 0.05, x - s * 0.55, y + 0.32 * s);
ctx.bezierCurveTo(x - s * 0.55, y + s * 0.6, x - s * 0.25, y + s * 0.8, x, y + s);
ctx.bezierCurveTo(x + s * 0.25, y + s * 0.8, x + s * 0.55, y + s * 0.6, x + s * 0.55, y + 0.32 * s);
ctx.bezierCurveTo(x + s * 0.55, y - s * 0.05, x, y - s * 0.05, x, y + s * 0.32);
ctx.closePath();
}

// deterministic per-tile pseudo-random — keeps the floor detail stable
function hash(n) {
const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
return s - Math.floor(s);
}

// ---------------------------------------------------------------- room

const TILE = 47;

// the static parts of a room (bricks, tiles, cracks) are expensive to redraw
// at 60fps, so each room layout is rendered once to an offscreen canvas
const roomCache = new Map();

// floor themes: [wall hue, floor hue/sat] — stone, moss, rust, void
const THEMES = [
{ wallHue: 240, floor: [235, 13] },
{ wallHue: 140, floor: [130, 16] },
{ wallHue: 14, floor: [18, 18] },
{ wallHue: 275, floor: [272, 18] },
];

function roomBaseCanvas(room) {
const theme = THEMES[room.theme ?? 0] || THEMES[0];
const key = `${room.type}|${room.theme ?? 0}|${room.gx ?? 'c'},${room.gy ?? 'c'}`;
if (roomCache.has(key)) return roomCache.get(key);

const off = document.createElement('canvas');
off.width = W;
off.height = H;
const ctx = off.getContext('2d');
const seed = ((room.gx ?? 3) * 31 + (room.gy ?? 7) * 57) | 0;

// ---- wall zone: chunky stone bricks
ctx.fillStyle = '#101019';
ctx.fillRect(0, 0, W, H);
const BW = 56;
const BH = WALL / 2;
for (let row = 0; row * BH < H; row++) {
const offX = (row % 2) * (BW / 2);
for (let col = -1; col * BW < W + BW; col++) {
const x = col * BW + offX;
const y = row * BH;
// only draw bricks inside the wall band
if (x > WALL && x + BW < W - WALL && y > WALL && y + BH < H - WALL) continue;
const v = hash(seed + col * 13.7 + row * 91.3);
ctx.fillStyle = `hsl(${theme.wallHue}, 18%, ${9 + v * 5}%)`;
ctx.fillRect(x + 1.5, y + 1.5, BW - 3, BH - 3);
ctx.fillStyle = 'rgba(255,255,255,0.04)';
ctx.fillRect(x + 1.5, y + 1.5, BW - 3, 3);
}
}

// ---- floor: worn stone tiles with variation
const base = room.type === 'boss' ? [346, 14, 19]
: room.type === 'treasure' ? [48, 10, 20]
: [theme.floor[0], theme.floor[1], 20];
for (let x = WALL; x < W - WALL; x += TILE) {
for (let y = WALL; y < H - WALL; y += TILE) {
const v = hash(seed + x * 3.1 + y * 7.7);
const w = Math.min(TILE, W - WALL - x);
const h = Math.min(TILE, H - WALL - y);
ctx.fillStyle = `hsl(${base[0]}, ${base[1]}%, ${base[2] + v * 4 - 2}%)`;
ctx.fillRect(x, y, w, h);
// bevel: light top edge, dark bottom edge
ctx.fillStyle = 'rgba(255,255,255,0.035)';
ctx.fillRect(x, y, w, 2);
ctx.fillStyle = 'rgba(0,0,0,0.22)';
ctx.fillRect(x, y + h - 2, w, 2);
// occasional crack / pebble detail
if (v > 0.82) {
ctx.strokeStyle = 'rgba(0,0,0,0.3)';
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.moveTo(x + 8 + v * 14, y + 9);
ctx.lineTo(x + 16 + v * 10, y + 22 + v * 8);
ctx.lineTo(x + 11 + v * 16, y + 36);
ctx.stroke();
} else if (v < 0.1) {
ctx.fillStyle = 'rgba(0,0,0,0.25)';
ctx.beginPath();
ctx.arc(x + 12 + v * 200, y + 30, 2.2, 0, 7);
ctx.fill();
}
}
}

// grout lines
ctx.strokeStyle = 'rgba(0,0,0,0.35)';
ctx.lineWidth = 1.5;
ctx.beginPath();
for (let x = WALL; x <= W - WALL; x += TILE) { ctx.moveTo(x, WALL); ctx.lineTo(x, H - WALL); }
for (let y = WALL; y <= H - WALL; y += TILE) { ctx.moveTo(WALL, y); ctx.lineTo(W - WALL, y); }
ctx.stroke();

// ---- ambient light pool in the middle of the floor
const light = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.55);
light.addColorStop(0, 'rgba(255,236,180,0.12)');
light.addColorStop(0.55, 'rgba(255,236,180,0.03)');
light.addColorStop(1, 'rgba(0,0,0,0.16)');
ctx.fillStyle = light;
ctx.fillRect(WALL, WALL, W - WALL * 2, H - WALL * 2);

// ---- inner wall lip: drop shadow cast onto the floor + bright rim
ctx.strokeStyle = 'rgba(0,0,0,0.55)';
ctx.lineWidth = 10;
ctx.strokeRect(WALL + 5, WALL + 5, W - WALL * 2 - 10, H - WALL * 2 - 10);
ctx.strokeStyle = '#05050C';
ctx.lineWidth = 6;
ctx.strokeRect(WALL - 3, WALL - 3, W - WALL * 2 + 6, H - WALL * 2 + 6);
ctx.strokeStyle = 'rgba(255,255,255,0.10)';
ctx.lineWidth = 2;
ctx.strokeRect(WALL + 0.5, WALL + 0.5, W - WALL * 2 - 1, H - WALL * 2 - 1);

roomCache.set(key, off);
if (roomCache.size > 40) roomCache.delete(roomCache.keys().next().value);
return off;
}

export function drawRoom(ctx, room, t) {
ctx.drawImage(roomBaseCanvas(room), 0, 0);

// flickering corner torches (live layer)
const flick = () => 0.75 + 0.25 * Math.sin(t * 9 + hash(Math.floor(t * 7)) * 6);
const corners = [
[WALL + 26, WALL + 26], [W - WALL - 26, WALL + 26],
[WALL + 26, H - WALL - 26], [W - WALL - 26, H - WALL - 26],
];
for (const [cx, cy] of corners) {
const f = flick();
const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 70);
glow.addColorStop(0, `rgba(255,170,60,${0.22 * f})`);
glow.addColorStop(1, 'rgba(255,170,60,0)');
ctx.fillStyle = glow;
ctx.fillRect(cx - 70, cy - 70, 140, 140);
// sconce
ctx.fillStyle = '#2A2A3C';
ctx.fillRect(cx - 3, cy - 2, 6, 10);
ctx.fillStyle = `rgba(255,${150 + 60 * f},40,0.95)`;
ctx.beginPath();
ctx.ellipse(cx, cy - 6, 3.5, 5.5 + f * 2, 0, 0, 7);
ctx.fill();
ctx.fillStyle = `rgba(255,240,170,${0.85 * f})`;
ctx.beginPath();
ctx.ellipse(cx, cy - 5, 1.6, 2.8, 0, 0, 7);
ctx.fill();
}

// boss room: breathing red dread
if (room.type === 'boss' && !room.cleared) {
ctx.fillStyle = `rgba(255,40,40,${0.04 + 0.03 * Math.sin(t * 2.2)})`;
ctx.fillRect(WALL, WALL, W - WALL * 2, H - WALL * 2);
}

// doors
const open = room.cleared;
if (room.doors.N) drawDoor(ctx, W / 2 - DOOR / 2, 0, DOOR, WALL, open, 'h', t);
if (room.doors.S) drawDoor(ctx, W / 2 - DOOR / 2, H - WALL, DOOR, WALL, open, 'h', t);
if (room.doors.W) drawDoor(ctx, 0, H / 2 - DOOR / 2, WALL, DOOR, open, 'v', t);
if (room.doors.E) drawDoor(ctx, W - WALL, H / 2 - DOOR / 2, WALL, DOOR, open, 'v', t);

// vignette over everything in the room layer
const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.72);
vg.addColorStop(0, 'rgba(0,0,0,0)');
vg.addColorStop(1, 'rgba(0,0,0,0.26)');
ctx.fillStyle = vg;
ctx.fillRect(0, 0, W, H);
}

// soft elliptical drop shadow under an entity
export function drawShadow(ctx, x, y, r, alpha = 0.32) {
ctx.fillStyle = `rgba(0,0,0,${alpha})`;
ctx.beginPath();
ctx.ellipse(x, y + r * 0.85, r * 0.95, r * 0.38, 0, 0, 7);
ctx.fill();
}

function drawDoor(ctx, x, y, w, h, open, dir, t) {
// corridor floor through the wall, darker toward the unknown
const grad = dir === 'h'
? ctx.createLinearGradient(x, y, x, y + h)
: ctx.createLinearGradient(x, y, x + w, y);
const into = (dir === 'h' ? y < H / 2 : x < W / 2);
grad.addColorStop(into ? 0 : 1, open ? '#0A0A14' : '#101018');
grad.addColorStop(into ? 1 : 0, open ? '#33334A' : '#1B1B28');
ctx.fillStyle = grad;
ctx.fillRect(x, y, w, h);

// carved stone frame
ctx.strokeStyle = open ? '#4ECAFF' : '#34344E';
ctx.lineWidth = 4;
ctx.beginPath();
if (dir === 'h') {
ctx.moveTo(x, y); ctx.lineTo(x, y + h);
ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h);
} else {
ctx.moveTo(x, y); ctx.lineTo(x + w, y);
ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h);
}
ctx.stroke();

if (!open) {
// heavy locked bars with highlight
for (let i = 1; i <= 3; i++) {
const pos = i / 4;
ctx.strokeStyle = '#5A1620';
ctx.lineWidth = 6;
ctx.beginPath();
if (dir === 'h') {
const bx = x + w * pos;
ctx.moveTo(bx, y + 5); ctx.lineTo(bx, y + h - 5);
} else {
const by = y + h * pos;
ctx.moveTo(x + 5, by); ctx.lineTo(x + w - 5, by);
}
ctx.stroke();
ctx.strokeStyle = '#FF3B3B';
ctx.lineWidth = 2.5;
ctx.stroke();
}
} else {
// inviting glow spilling out of open doors
const pulse = 0.10 + 0.05 * Math.sin(t * 3);
const cx = x + w / 2;
const cy = y + h / 2;
const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, Math.max(w, h));
glow.addColorStop(0, `rgba(78,202,255,${pulse * 2.2})`);
glow.addColorStop(1, 'rgba(78,202,255,0)');
ctx.fillStyle = glow;
ctx.fillRect(cx - Math.max(w, h), cy - Math.max(w, h), Math.max(w, h) * 2, Math.max(w, h) * 2);
}
}

// ---------------------------------------------------------------- player

// movement tracking so the hero's legs/arms animate when (and only when) walking
const heroMotion = new Map(); // id → { x, y, moving, walkT }

export function drawPlayerSprite(ctx, p, t) {
if (!p.alive) {
// little ghost, drifting
const drift = Math.sin(t * 2.5 + p.x * 0.02) * 3;
ctx.globalAlpha = 0.35;
ctx.fillStyle = '#FFFFFF';
roundRect(ctx, p.x - 11, p.y - 13 + drift, 22, 22, 9);
ctx.fill();
ctx.fillStyle = '#1A1A2E';
ctx.fillRect(p.x - 5, p.y - 6 + drift, 3, 5);
ctx.fillRect(p.x + 2, p.y - 6 + drift, 3, 5);
ctx.globalAlpha = 1;
return;
}

// detect movement from frame-to-frame position
let m = heroMotion.get(p.id);
if (!m) { m = { x: p.x, y: p.y, moving: 0, walkT: 0 }; heroMotion.set(p.id, m); }
const moved = Math.hypot(p.x - m.x, p.y - m.y);
m.moving = moved > 0.4 ? Math.min(1, m.moving + 0.2) : Math.max(0, m.moving - 0.15);
if (m.moving > 0.1) m.walkT += moved * 0.16;
m.x = p.x; m.y = p.y;

drawShadow(ctx, p.x, p.y + 2, p.r + 2);

// iframe flash
if (p.inv && Math.floor(t * 14) % 2 === 0) ctx.globalAlpha = 0.35;

const swing = Math.sin(m.walkT) * m.moving; // leg/arm swing
const bob = Math.abs(Math.sin(m.walkT)) * 1.6 * m.moving + Math.sin(t * 2.2 + p.x * 0.05) * 0.6;
const x = p.x;
const y = p.y - bob;
const facing = Math.cos(p.aim) >= 0 ? 1 : -1; // which way the hero faces
const skin = '#F4C896';
const skinDark = '#D8A878';
const hair = '#5B3A22';
const pants = '#3A3A5C';
const boots = '#2A2A3E';

// ---- legs (walking scissor)
ctx.strokeStyle = pants;
ctx.lineWidth = 5.5;
ctx.lineCap = 'round';
ctx.beginPath();
ctx.moveTo(x - 4, y + 6);
ctx.lineTo(x - 4 + swing * 5, y + 13);
ctx.moveTo(x + 4, y + 6);
ctx.lineTo(x + 4 - swing * 5, y + 13);
ctx.stroke();
// boots
ctx.fillStyle = boots;
ctx.beginPath();
ctx.ellipse(x - 4 + swing * 5, y + 14.5, 4.2, 2.6, 0, 0, 7);
ctx.ellipse(x + 4 - swing * 5, y + 14.5, 4.2, 2.6, 0, 0, 7);
ctx.fill();

// ---- tunic (player color) with belt
const tunic = ctx.createLinearGradient(x, y - 8, x, y + 8);
tunic.addColorStop(0, lighten(p.color, 22));
tunic.addColorStop(1, darken(p.color, 20));
ctx.fillStyle = tunic;
roundRect(ctx, x - 9, y - 7, 18, 15, 6);
ctx.fill();
ctx.strokeStyle = '#0B0B14';
ctx.lineWidth = 2.5;
ctx.stroke();
ctx.fillStyle = 'rgba(0,0,0,0.35)';
ctx.fillRect(x - 9, y + 3, 18, 3);
ctx.fillStyle = '#E8B33C';
ctx.fillRect(x - 2, y + 3, 4, 3);

// ---- back arm (swings while walking)
ctx.strokeStyle = skinDark;
ctx.lineWidth = 4.5;
ctx.beginPath();
ctx.moveTo(x - 8 * facing, y - 4);
ctx.lineTo(x - (10 + swing * 4) * facing, y + 3);
ctx.stroke();

// ---- head
ctx.fillStyle = skin;
ctx.beginPath();
ctx.arc(x, y - 14, 8.5, 0, 7);
ctx.fill();
ctx.strokeStyle = '#0B0B14';
ctx.lineWidth = 2.2;
ctx.stroke();

// hair: messy top + side sweep toward facing
ctx.fillStyle = hair;
ctx.beginPath();
ctx.arc(x, y - 16.5, 8.2, Math.PI * 0.95, Math.PI * 2.05);
ctx.quadraticCurveTo(x + 8 * facing, y - 13, x + 5 * facing, y - 11);
ctx.quadraticCurveTo(x + 2 * facing, y - 14.5, x - 4 * facing, y - 13.5);
ctx.closePath();
ctx.fill();
// hair tuft
ctx.beginPath();
ctx.moveTo(x - 2, y - 24);
ctx.quadraticCurveTo(x + 3 * facing, y - 28, x + 5 * facing, y - 23.5);
ctx.quadraticCurveTo(x + 1 * facing, y - 24.5, x - 2, y - 22.5);
ctx.fill();

// face looks toward aim
const ex = Math.cos(p.aim) * 2.6;
const ey = Math.sin(p.aim) * 1.8;
const blink = (Math.sin(t * 1.7 + p.x * 0.1) > 0.985);
if (blink) {
ctx.strokeStyle = '#1A1A2E';
ctx.lineWidth = 1.6;
ctx.beginPath();
ctx.moveTo(x - 5 + ex, y - 14 + ey); ctx.lineTo(x - 1.5 + ex, y - 14 + ey);
ctx.moveTo(x + 1.5 + ex, y - 14 + ey); ctx.lineTo(x + 5 + ex, y - 14 + ey);
ctx.stroke();
} else {
ctx.fillStyle = '#FFFFFF';
ctx.beginPath();
ctx.arc(x - 3.2 + ex, y - 14 + ey, 2.6, 0, 7);
ctx.arc(x + 3.2 + ex, y - 14 + ey, 2.6, 0, 7);
ctx.fill();
ctx.fillStyle = '#1A1A2E';
ctx.beginPath();
ctx.arc(x - 3 + ex * 1.5, y - 14 + ey * 1.5, 1.4, 0, 7);
ctx.arc(x + 3.4 + ex * 1.5, y - 14 + ey * 1.5, 1.4, 0, 7);
ctx.fill();
}
// determined brow + mouth
ctx.strokeStyle = 'rgba(26,26,46,0.75)';
ctx.lineWidth = 1.4;
ctx.beginPath();
ctx.moveTo(x - 5 + ex, y - 17.5 + ey); ctx.lineTo(x - 1 + ex, y - 16.8 + ey);
ctx.moveTo(x + 1 + ex, y - 16.8 + ey); ctx.lineTo(x + 5 + ex, y - 17.5 + ey);
ctx.stroke();
ctx.beginPath();
ctx.moveTo(x - 1.5 + ex, y - 9.5);
ctx.quadraticCurveTo(x + ex, y - 8.6, x + 1.5 + ex, y - 9.5);
ctx.stroke();

// ---- front arm: aims the slingshot toward p.aim
const ax = Math.cos(p.aim);
const ay = Math.sin(p.aim);
ctx.strokeStyle = skin;
ctx.lineWidth = 4.5;
ctx.beginPath();
ctx.moveTo(x + 6 * facing, y - 4);
ctx.lineTo(x + ax * 13, y - 3 + ay * 9);
ctx.stroke();
// slingshot in hand
const hx = x + ax * 14;
const hy = y - 3 + ay * 10;
ctx.strokeStyle = '#7A4A28';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(hx, hy);
ctx.lineTo(hx + ax * 6 - ay * 4, hy + ay * 6 + ax * 4);
ctx.moveTo(hx, hy);
ctx.lineTo(hx + ax * 6 + ay * 4, hy + ay * 6 - ax * 4);
ctx.stroke();

ctx.globalAlpha = 1;
}

// quick hex color shade helpers for sprite gradients
function lighten(hex, amt) { return shade(hex, amt); }
function darken(hex, amt) { return shade(hex, -amt); }
function shade(hex, amt) {
const n = parseInt(hex.slice(1), 16);
const r = Math.max(0, Math.min(255, (n >> 16) + amt));
const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------- enemies

export function drawEnemySprite(ctx, e, t) {
// grounded enemies cast shadows; fliers cast smaller, offset ones
const flier = e.type === 'fly' || e.type === 'fatbat';
drawShadow(ctx, e.x, e.y + (flier ? 7 : 0), flier ? e.r * 0.7 : e.r + 2, flier ? 0.22 : 0.3);

if (e.flash > 0 && Math.floor(t * 30) % 2 === 0) ctx.globalAlpha = 0.4;
switch (e.type) {
case 'fly': drawFly(ctx, e, t); break;
case 'gaper': drawGaper(ctx, e, t); break;
case 'spider': drawSpider(ctx, e, t); break;
case 'fatbat': drawFatBat(ctx, e, t); break;
case 'monstro': drawMonstro(ctx, e, t); break;
case 'duke': drawDuke(ctx, e, t); break;
case 'husk': drawHusk(ctx, e, t); break;
}
ctx.globalAlpha = 1;

// low-health enemies sweat it
if (e.maxHp && e.hp / e.maxHp < 0.35 && e.type !== 'monstro') {
ctx.fillStyle = 'rgba(160,220,255,0.8)';
ctx.beginPath();
ctx.arc(e.x + e.r * 0.7, e.y - e.r - 2 + (t * 30 % 6), 1.6, 0, 7);
ctx.fill();
}
}

function drawFly(ctx, e, t) {
const flap = Math.sin(t * 26 + e.x) * 4;
// wings
ctx.fillStyle = 'rgba(255,255,255,0.55)';
ctx.beginPath();
ctx.ellipse(e.x - 8, e.y - 7 + flap, 7, 4, -0.5, 0, 7);
ctx.ellipse(e.x + 8, e.y - 7 - flap, 7, 4, 0.5, 0, 7);
ctx.fill();
// body
ctx.fillStyle = '#5C5C74';
ctx.beginPath();
ctx.arc(e.x, e.y, e.r, 0, 7);
ctx.fill();
ctx.strokeStyle = '#101018';
ctx.lineWidth = 2.5;
ctx.stroke();
// angry red eyes
ctx.fillStyle = '#FF3B3B';
ctx.beginPath();
ctx.arc(e.x - 3.5, e.y - 2, 2.2, 0, 7);
ctx.arc(e.x + 3.5, e.y - 2, 2.2, 0, 7);
ctx.fill();
}

function drawGaper(ctx, e, t) {
const lean = e.charging ? 0.18 : Math.sin(t * 8 + e.y) * 0.06;
ctx.save();
ctx.translate(e.x, e.y);
ctx.rotate(lean);
// body
ctx.fillStyle = '#D9C8B4';
roundRect(ctx, -e.r, -e.r, e.r * 2, e.r * 2, 8);
ctx.fill();
ctx.strokeStyle = '#101018';
ctx.lineWidth = 3;
ctx.stroke();
// gaping mouth
ctx.fillStyle = '#5A1212';
ctx.beginPath();
ctx.ellipse(0, 4, 6.5, 7.5, 0, 0, 7);
ctx.fill();
// hollow eyes
ctx.fillStyle = '#1A1A2E';
ctx.beginPath();
ctx.arc(-5.5, -5, 3, 0, 7);
ctx.arc(5.5, -5, 3, 0, 7);
ctx.fill();
ctx.restore();
}

function drawSpider(ctx, e, t) {
// legs
ctx.strokeStyle = '#101018';
ctx.lineWidth = 2.5;
ctx.beginPath();
for (let i = 0; i < 4; i++) {
const a = -0.7 + i * 0.45;
const wig = Math.sin(t * 18 + i * 2) * 3;
ctx.moveTo(e.x, e.y);
ctx.lineTo(e.x - e.r - 7, e.y + (i - 1.5) * 7 + wig);
ctx.moveTo(e.x, e.y);
ctx.lineTo(e.x + e.r + 7, e.y + (i - 1.5) * 7 - wig);
}
ctx.stroke();
// body
ctx.fillStyle = '#3B2B4F';
ctx.beginPath();
ctx.arc(e.x, e.y, e.r, 0, 7);
ctx.fill();
ctx.strokeStyle = '#101018';
ctx.lineWidth = 2.5;
ctx.stroke();
// many eyes
ctx.fillStyle = '#FFE135';
ctx.beginPath();
ctx.arc(e.x - 4, e.y - 3, 1.8, 0, 7);
ctx.arc(e.x + 4, e.y - 3, 1.8, 0, 7);
ctx.arc(e.x, e.y - 5, 1.5, 0, 7);
ctx.fill();
}

function drawFatBat(ctx, e, t) {
const flap = Math.sin(t * 12 + e.x * 0.1) * 8;
// wings
ctx.fillStyle = '#2E2E44';
ctx.beginPath();
ctx.moveTo(e.x - 4, e.y);
ctx.quadraticCurveTo(e.x - e.r - 16, e.y - 14 + flap, e.x - e.r - 20, e.y + 4 + flap);
ctx.quadraticCurveTo(e.x - e.r - 4, e.y + 8, e.x - 4, e.y + 4);
ctx.moveTo(e.x + 4, e.y);
ctx.quadraticCurveTo(e.x + e.r + 16, e.y - 14 - flap, e.x + e.r + 20, e.y + 4 - flap);
ctx.quadraticCurveTo(e.x + e.r + 4, e.y + 8, e.x + 4, e.y + 4);
ctx.fill();
// round body
ctx.fillStyle = '#454566';
ctx.beginPath();
ctx.arc(e.x, e.y, e.r, 0, 7);
ctx.fill();
ctx.strokeStyle = '#101018';
ctx.lineWidth = 3;
ctx.stroke();
// ears
ctx.fillStyle = '#454566';
ctx.beginPath();
ctx.moveTo(e.x - 9, e.y - e.r + 3); ctx.lineTo(e.x - 13, e.y - e.r - 9); ctx.lineTo(e.x - 3, e.y - e.r + 1);
ctx.moveTo(e.x + 9, e.y - e.r + 3); ctx.lineTo(e.x + 13, e.y - e.r - 9); ctx.lineTo(e.x + 3, e.y - e.r + 1);
ctx.fill();
// eyes + fangs
ctx.fillStyle = '#FF7A35';
ctx.beginPath();
ctx.arc(e.x - 5, e.y - 3, 2.6, 0, 7);
ctx.arc(e.x + 5, e.y - 3, 2.6, 0, 7);
ctx.fill();
ctx.fillStyle = '#FFFFFF';
ctx.beginPath();
ctx.moveTo(e.x - 4, e.y + 5); ctx.lineTo(e.x - 2, e.y + 10); ctx.lineTo(e.x, e.y + 5);
ctx.moveTo(e.x + 4, e.y + 5); ctx.lineTo(e.x + 2, e.y + 10); ctx.lineTo(e.x, e.y + 5);
ctx.fill();
}

function drawMonstro(ctx, e, t) {
const squash = 1 + (e.hopT > 0 ? Math.sin(e.hopT * Math.PI) * 0.18 : Math.sin(t * 3) * 0.04);
ctx.save();
ctx.translate(e.x, e.y);
ctx.scale(2 - squash, squash);

// big red mass
ctx.fillStyle = '#C42B2B';
roundRect(ctx, -e.r, -e.r, e.r * 2, e.r * 2, 18);
ctx.fill();
ctx.strokeStyle = '#101018';
ctx.lineWidth = 5;
ctx.stroke();

// lumps
ctx.fillStyle = '#A82020';
ctx.beginPath();
ctx.arc(-e.r * 0.55, -e.r * 0.5, 11, 0, 7);
ctx.arc(e.r * 0.5, -e.r * 0.42, 9, 0, 7);
ctx.arc(e.r * 0.1, e.r * 0.55, 12, 0, 7);
ctx.fill();

// furious eyes
ctx.fillStyle = '#FFE135';
ctx.beginPath();
ctx.arc(-14, -12, 7, 0, 7);
ctx.arc(14, -12, 7, 0, 7);
ctx.fill();
ctx.fillStyle = '#1A1A2E';
ctx.beginPath();
ctx.arc(-14, -11, 3.2, 0, 7);
ctx.arc(14, -11, 3.2, 0, 7);
ctx.fill();

// jagged mouth
ctx.fillStyle = '#3A0808';
ctx.beginPath();
ctx.moveTo(-22, 8);
ctx.quadraticCurveTo(0, 0, 22, 8);
ctx.quadraticCurveTo(0, 30, -22, 8);
ctx.fill();
ctx.fillStyle = '#FFFFFF';
for (let i = -2; i <= 2; i++) {
ctx.beginPath();
ctx.moveTo(i * 8 - 3, 7 + Math.abs(i));
ctx.lineTo(i * 8, 14 + Math.abs(i));
ctx.lineTo(i * 8 + 3, 7 + Math.abs(i));
ctx.fill();
}
ctx.restore();
}

function drawDuke(ctx, e, t) {
const flap = Math.sin(t * 14) * 9;
const bob = Math.sin(t * 2.4) * 4;
ctx.save();
ctx.translate(e.x, e.y + bob);

// royal wings
ctx.fillStyle = 'rgba(220,230,255,0.5)';
ctx.beginPath();
ctx.ellipse(-e.r - 8, -10 + flap, 20, 9, -0.5, 0, 7);
ctx.ellipse(e.r + 8, -10 - flap, 20, 9, 0.5, 0, 7);
ctx.fill();

// bloated body
const body = ctx.createRadialGradient(-10, -12, 6, 0, 0, e.r + 6);
body.addColorStop(0, '#8C8CB0');
body.addColorStop(1, '#3E3E58');
ctx.fillStyle = body;
ctx.beginPath();
ctx.arc(0, 0, e.r, 0, 7);
ctx.fill();
ctx.strokeStyle = '#0B0B14';
ctx.lineWidth = 4;
ctx.stroke();

// pus blisters
ctx.fillStyle = '#A4D45E';
ctx.beginPath();
ctx.arc(-e.r * 0.45, e.r * 0.3, 7, 0, 7);
ctx.arc(e.r * 0.5, -e.r * 0.1, 5.5, 0, 7);
ctx.arc(e.r * 0.15, e.r * 0.55, 4.5, 0, 7);
ctx.fill();

// single furious eye
ctx.fillStyle = '#FFF6D9';
ctx.beginPath();
ctx.arc(0, -8, 13, 0, 7);
ctx.fill();
ctx.strokeStyle = '#0B0B14';
ctx.lineWidth = 2.5;
ctx.stroke();
ctx.fillStyle = '#C42B2B';
ctx.beginPath();
ctx.arc(0, -7, 6, 0, 7);
ctx.fill();
ctx.fillStyle = '#1A1A2E';
ctx.beginPath();
ctx.arc(0, -7, 2.6, 0, 7);
ctx.fill();

// tiny crown
ctx.fillStyle = '#FFD024';
ctx.beginPath();
ctx.moveTo(-10, -e.r - 2);
ctx.lineTo(-10, -e.r - 12);
ctx.lineTo(-5, -e.r - 6);
ctx.lineTo(0, -e.r - 14);
ctx.lineTo(5, -e.r - 6);
ctx.lineTo(10, -e.r - 12);
ctx.lineTo(10, -e.r - 2);
ctx.closePath();
ctx.fill();
ctx.strokeStyle = '#0B0B14';
ctx.lineWidth = 2;
ctx.stroke();

ctx.restore();
}

function drawHusk(ctx, e, t) {
const lean = e.charging ? 0.22 : Math.sin(t * 5) * 0.05;
ctx.save();
ctx.translate(e.x, e.y);
ctx.rotate(lean);

// cracked pale mass
const body = ctx.createLinearGradient(0, -e.r, 0, e.r);
body.addColorStop(0, '#E8DCC8');
body.addColorStop(1, '#9C8C74');
ctx.fillStyle = body;
roundRect(ctx, -e.r, -e.r, e.r * 2, e.r * 2, 16);
ctx.fill();
ctx.strokeStyle = '#0B0B14';
ctx.lineWidth = 4.5;
ctx.stroke();

// cracks
ctx.strokeStyle = 'rgba(60,40,30,0.55)';
ctx.lineWidth = 2.5;
ctx.beginPath();
ctx.moveTo(-e.r * 0.6, -e.r * 0.7); ctx.lineTo(-e.r * 0.3, -e.r * 0.2); ctx.lineTo(-e.r * 0.55, e.r * 0.2);
ctx.moveTo(e.r * 0.5, -e.r * 0.5); ctx.lineTo(e.r * 0.25, 0); ctx.lineTo(e.r * 0.5, e.r * 0.45);
ctx.stroke();

// hollow eyes — glow red while charging
ctx.fillStyle = e.charging ? '#FF3B3B' : '#1A1A2E';
ctx.beginPath();
ctx.ellipse(-12, -10, 7, 9, 0, 0, 7);
ctx.ellipse(12, -10, 7, 9, 0, 0, 7);
ctx.fill();

// vast gaping mouth
ctx.fillStyle = '#3A0808';
ctx.beginPath();
ctx.ellipse(0, 14, 16, 13 + (e.charging ? 4 : Math.sin(t * 3) * 2), 0, 0, 7);
ctx.fill();
ctx.strokeStyle = '#0B0B14';
ctx.lineWidth = 2.5;
ctx.stroke();
// broken teeth
ctx.fillStyle = '#E8DCC8';
for (let i = -1; i <= 1; i++) {
ctx.beginPath();
ctx.moveTo(i * 9 - 3, 4);
ctx.lineTo(i * 9, 11);
ctx.lineTo(i * 9 + 3, 4);
ctx.fill();
}

ctx.restore();
}

// ---------------------------------------------------------------- projectiles

export function drawProjectile(ctx, p) {
const [glowCol, coreCol, midCol] = p.friendly
? ['rgba(78,202,255,0.35)', '#EAF9FF', '#7AD6FF']
: ['rgba(255,90,60,0.35)', '#FFE0B0', '#FF5A3C'];

// motion smear behind the shot
if (p.vx !== undefined || p.vy !== undefined) {
const vx = p.vx || 0;
const vy = p.vy || 0;
const m = Math.hypot(vx, vy) || 1;
ctx.strokeStyle = glowCol;
ctx.lineWidth = p.r * 1.3;
ctx.lineCap = 'round';
ctx.beginPath();
ctx.moveTo(p.x - (vx / m) * p.r * 2.6, p.y - (vy / m) * p.r * 2.6);
ctx.lineTo(p.x, p.y);
ctx.stroke();
}

// outer glow
const glow = ctx.createRadialGradient(p.x, p.y, p.r * 0.3, p.x, p.y, p.r * 2.4);
glow.addColorStop(0, glowCol);
glow.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = glow;
ctx.beginPath();
ctx.arc(p.x, p.y, p.r * 2.4, 0, 7);
ctx.fill();

// orb with hot core
const orb = ctx.createRadialGradient(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.15, p.x, p.y, p.r);
orb.addColorStop(0, coreCol);
orb.addColorStop(1, midCol);
ctx.fillStyle = orb;
ctx.beginPath();
ctx.arc(p.x, p.y, p.r, 0, 7);
ctx.fill();
ctx.strokeStyle = 'rgba(0,0,0,0.4)';
ctx.lineWidth = 1.5;
ctx.stroke();
}

// ---------------------------------------------------------------- pickups

const PICKUP_GLOW = {
heart: 'rgba(255,59,92,0.30)',
coin: 'rgba(255,208,36,0.28)',
speed: 'rgba(255,225,53,0.26)',
damage: 'rgba(255,122,53,0.26)',
firerate: 'rgba(255,78,184,0.26)',
item: 'rgba(185,78,255,0.34)',
trapdoor: 'rgba(78,202,255,0.30)',
};

export function drawPickup(ctx, pk, t) {
const bob = Math.sin(t * 4 + pk.x * 0.05) * 3;
const x = pk.x;
const y = pk.y + bob;

// grounding shadow + breathing glow so rewards read at a glance
drawShadow(ctx, x, pk.y + 4, 13, 0.25);
const ga = 0.7 + 0.3 * Math.sin(t * 5 + pk.x);
const glowCol = PICKUP_GLOW[pk.kind] || 'rgba(255,255,255,0.2)';
const glow = ctx.createRadialGradient(x, y, 3, x, y, 34);
glow.addColorStop(0, glowCol.replace(/[\d.]+\)$/, (m) => `${(parseFloat(m) * ga).toFixed(3)})`));
glow.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = glow;
ctx.beginPath();
ctx.arc(x, y, 34, 0, 7);
ctx.fill();

if (pk.kind === 'item') {
// pedestal
ctx.fillStyle = '#3A3A50';
roundRect(ctx, x - 20, pk.y + 12, 40, 12, 4);
ctx.fill();
// gift box
ctx.fillStyle = '#B94EFF';
roundRect(ctx, x - 14, y - 14, 28, 26, 5);
ctx.fill();
ctx.strokeStyle = '#101018';
ctx.lineWidth = 3;
ctx.stroke();
ctx.fillStyle = '#FFE135';
ctx.fillRect(x - 3, y - 14, 6, 26);
ctx.fillRect(x - 14, y - 4, 28, 6);
// sparkle
ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 6)})`;
ctx.beginPath();
ctx.arc(x + 11, y - 17, 2.5, 0, 7);
ctx.fill();
return;
}

if (pk.kind === 'trapdoor') {
ctx.fillStyle = '#05050A';
roundRect(ctx, x - 26, pk.y - 18, 52, 36, 8);
ctx.fill();
ctx.strokeStyle = '#4ECAFF';
ctx.lineWidth = 3;
ctx.stroke();
// ladder rungs
ctx.strokeStyle = '#3A3A5C';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(x - 10, pk.y - 12); ctx.lineTo(x + 10, pk.y - 12);
ctx.moveTo(x - 10, pk.y - 2); ctx.lineTo(x + 10, pk.y - 2);
ctx.moveTo(x - 10, pk.y + 8); ctx.lineTo(x + 10, pk.y + 8);
ctx.stroke();
return;
}

ctx.strokeStyle = '#101018';
ctx.lineWidth = 2.5;

switch (pk.kind) {
case 'heart':
ctx.fillStyle = '#FF3B5C';
heartPath(ctx, x, y - 8, 16);
ctx.fill();
ctx.stroke();
break;
case 'speed':
ctx.fillStyle = '#FFE135';
ctx.beginPath();
ctx.moveTo(x + 4, y - 13);
ctx.lineTo(x - 7, y + 2);
ctx.lineTo(x - 1, y + 2);
ctx.lineTo(x - 4, y + 13);
ctx.lineTo(x + 7, y - 2);
ctx.lineTo(x + 1, y - 2);
ctx.closePath();
ctx.fill();
ctx.stroke();
break;
case 'damage':
ctx.fillStyle = '#FF7A35';
ctx.beginPath();
ctx.moveTo(x, y - 13);
ctx.lineTo(x + 9, y - 2);
ctx.lineTo(x + 4, y - 2);
ctx.lineTo(x + 4, y + 12);
ctx.lineTo(x - 4, y + 12);
ctx.lineTo(x - 4, y - 2);
ctx.lineTo(x - 9, y - 2);
ctx.closePath();
ctx.fill();
ctx.stroke();
break;
case 'firerate':
ctx.fillStyle = '#FF4EB8';
for (let i = -1; i <= 1; i++) {
ctx.beginPath();
ctx.arc(x + i * 10, y + Math.abs(i) * 3, 5, 0, 7);
ctx.fill();
ctx.stroke();
}
break;
case 'coin':
ctx.fillStyle = '#FFD024';
ctx.beginPath();
ctx.arc(x, y, 10, 0, 7);
ctx.fill();
ctx.stroke();
ctx.strokeStyle = '#B8860B';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.arc(x, y, 6, 0, 7);
ctx.stroke();
break;
}
}

// ---------------------------------------------------------------- sound

let actx = null;

function ac() {
if (!actx) {
const AC = window.AudioContext || window.webkitAudioContext;
if (!AC) return null;
actx = new AC();
}
if (actx.state === 'suspended') actx.resume();
return actx;
}

function blip(f0, f1, dur, type = 'square', vol = 0.045, delay = 0) {
const ctx = ac();
if (!ctx) return;
try {
const t0 = ctx.currentTime + delay;
const osc = ctx.createOscillator();
const gain = ctx.createGain();
osc.type = type;
osc.frequency.setValueAtTime(f0, t0);
osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
gain.gain.setValueAtTime(vol, t0);
gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
osc.connect(gain).connect(ctx.destination);
osc.start(t0);
osc.stop(t0 + dur + 0.02);
} catch { /* audio is a luxury, not a requirement */ }
}

export const sfx = {
shoot: () => blip(720, 360, 0.06, 'triangle', 0.03),
eshoot: () => blip(260, 140, 0.12, 'sawtooth', 0.025),
hit: () => blip(220, 130, 0.06, 'square', 0.035),
kill: () => blip(340, 70, 0.16, 'square', 0.05),
hurt: () => blip(190, 55, 0.28, 'sawtooth', 0.08),
pickup: () => { blip(540, 540, 0.07, 'square', 0.04); blip(810, 810, 0.09, 'square', 0.04, 0.07); },
item: () => { blip(523, 523, 0.1, 'triangle', 0.05); blip(659, 659, 0.1, 'triangle', 0.05, 0.1); blip(784, 784, 0.16, 'triangle', 0.05, 0.2); },
door: () => blip(150, 75, 0.3, 'triangle', 0.05),
boss: () => blip(70, 38, 0.7, 'sawtooth', 0.09),
stairs: () => { blip(440, 220, 0.12, 'triangle', 0.05); blip(330, 165, 0.12, 'triangle', 0.05, 0.12); },
dead: () => { blip(220, 110, 0.3, 'sawtooth', 0.07); blip(110, 40, 0.6, 'sawtooth', 0.07, 0.25); },
};
