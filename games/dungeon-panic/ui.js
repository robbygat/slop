// HUD: hearts, floor indicator, coins, minimap, boss bar, item-choice overlay.

import { W, H, roundRect } from './assets.js';

export function loadFont() {
// FontFace API first; the page <link> acts as a fallback for canvas text.
try {
const f = new FontFace(
'Fredoka One',
'url(https://fonts.gstatic.com/s/fredokaone/v15/k3kUo8kEI-tA1RRcTZGmTlHGCaen8wf-.woff2)'
);
f.load().then((ff) => document.fonts.add(ff)).catch(() => {});
} catch { /* canvas falls back to sans-serif */ }
}

const FREDOKA = '"Fredoka One", sans-serif';
const MONO = '"Space Mono", monospace';

// ---------------------------------------------------------------- hearts

function heartPath(ctx, x, y, s) {
ctx.beginPath();
ctx.moveTo(x, y + s * 0.32);
ctx.bezierCurveTo(x, y - s * 0.05, x - s * 0.55, y - s * 0.05, x - s * 0.55, y + 0.32 * s);
ctx.bezierCurveTo(x - s * 0.55, y + s * 0.6, x - s * 0.25, y + s * 0.8, x, y + s);
ctx.bezierCurveTo(x + s * 0.25, y + s * 0.8, x + s * 0.55, y + s * 0.6, x + s * 0.55, y + 0.32 * s);
ctx.bezierCurveTo(x + s * 0.55, y - s * 0.05, x, y - s * 0.05, x, y + s * 0.32);
ctx.closePath();
}

export function drawHUD(ctx, me, floorNum, score, roomLabel) {
// hearts — top-left
if (me) {
for (let i = 0; i < me.maxHp; i++) {
const x = 34 + i * 30;
heartPath(ctx, x, 18, 22);
ctx.fillStyle = i < me.hp ? '#FF3B5C' : 'rgba(255,255,255,0.13)';
ctx.fill();
ctx.strokeStyle = '#0F0F1A';
ctx.lineWidth = 3;
ctx.stroke();
}
// coins
ctx.fillStyle = '#FFD024';
ctx.beginPath();
ctx.arc(32, 62, 9, 0, 7);
ctx.fill();
ctx.strokeStyle = '#0F0F1A';
ctx.lineWidth = 2.5;
ctx.stroke();
ctx.fillStyle = '#FFFFFF';
ctx.font = `16px ${FREDOKA}`;
ctx.textAlign = 'left';
ctx.fillText(`× ${me.coins}`, 48, 68);
}

// floor — top-right
ctx.fillStyle = '#FFE135';
ctx.font = `22px ${FREDOKA}`;
ctx.textAlign = 'right';
ctx.fillText(`FLOOR ${floorNum}`, W - 26, 36);
ctx.fillStyle = 'rgba(255,255,255,0.75)';
ctx.font = `14px ${FREDOKA}`;
ctx.fillText(`score ${score}`, W - 26, 58);

// room status — bottom-left
if (roomLabel) {
ctx.fillStyle = 'rgba(255,255,255,0.65)';
ctx.font = `13px ${MONO}`;
ctx.textAlign = 'left';
ctx.fillText(roomLabel, 28, H - 22);
}
ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- minimap

export function drawMinimap(ctx, rooms, currentKey) {
const cell = 15;
const gap = 3;
const size = 5 * cell + 4 * gap;
const ox = W - size - 22;
const oy = H - size - 22;

ctx.fillStyle = 'rgba(10,10,20,0.72)';
roundRect(ctx, ox - 8, oy - 8, size + 16, size + 16, 8);
ctx.fill();
ctx.strokeStyle = 'rgba(255,255,255,0.18)';
ctx.lineWidth = 2;
ctx.stroke();

const visited = new Set(rooms.filter((r) => r.visited).map((r) => r.key));
const discovered = new Set(visited);
for (const r of rooms) {
if (!visited.has(r.key)) continue;
for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
discovered.add(`${r.gx + dx},${r.gy + dy}`);
}
}

for (const r of rooms) {
if (!discovered.has(r.key)) continue;
const x = ox + r.gx * (cell + gap);
const y = oy + r.gy * (cell + gap);

if (r.key === currentKey) ctx.fillStyle = '#4ECAFF';
else if (visited.has(r.key)) ctx.fillStyle = 'rgba(255,255,255,0.55)';
else ctx.fillStyle = 'rgba(255,255,255,0.16)';
roundRect(ctx, x, y, cell, cell, 3);
ctx.fill();

// type markers
if (r.type === 'boss') {
ctx.fillStyle = '#FF3B3B';
ctx.beginPath();
ctx.arc(x + cell / 2, y + cell / 2, 3.4, 0, 7);
ctx.fill();
} else if (r.type === 'treasure') {
ctx.fillStyle = '#FFE135';
ctx.beginPath();
ctx.arc(x + cell / 2, y + cell / 2, 3, 0, 7);
ctx.fill();
}
}
}

// ---------------------------------------------------------------- boss bar

export function drawBossBar(ctx, boss) {
const w = 360;
const x = W / 2 - w / 2;
const y = 24;
const frac = Math.max(0, boss.hp / boss.maxHp);

ctx.fillStyle = '#FFE135';
ctx.font = `15px ${FREDOKA}`;
ctx.textAlign = 'center';
ctx.fillText(boss.name || 'BOSS', W / 2, y - 6);

ctx.fillStyle = 'rgba(0,0,0,0.55)';
roundRect(ctx, x, y, w, 14, 7);
ctx.fill();
if (frac > 0) {
ctx.fillStyle = '#FF3B3B';
roundRect(ctx, x + 2, y + 2, Math.max(6, (w - 4) * frac), 10, 5);
ctx.fill();
}
ctx.strokeStyle = '#0F0F1A';
ctx.lineWidth = 2.5;
roundRect(ctx, x, y, w, 14, 7);
ctx.stroke();
ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- item choice

const CARD_W = 190;
const CARD_H = 220;
const CARD_GAP = 28;

export function choiceBoxes(n = 3) {
const total = n * CARD_W + (n - 1) * CARD_GAP;
const x0 = W / 2 - total / 2;
return Array.from({ length: n }, (_, i) => ({
x: x0 + i * (CARD_W + CARD_GAP),
y: H / 2 - CARD_H / 2,
w: CARD_W,
h: CARD_H,
}));
}

export function drawChoice(ctx, options, hoverIdx = -1) {
ctx.fillStyle = 'rgba(10,10,20,0.82)';
ctx.fillRect(0, 0, W, H);

ctx.fillStyle = '#FFE135';
ctx.font = `30px ${FREDOKA}`;
ctx.textAlign = 'center';
ctx.fillText('CHOOSE YOUR BLESSING', W / 2, H / 2 - CARD_H / 2 - 36);

const boxes = choiceBoxes(options.length);
options.forEach((item, i) => {
const b = boxes[i];
const hov = i === hoverIdx;

ctx.fillStyle = hov ? '#2E2E4A' : '#222238';
roundRect(ctx, b.x, b.y, b.w, b.h, 14);
ctx.fill();
ctx.strokeStyle = hov ? '#FFE135' : '#4ECAFF';
ctx.lineWidth = hov ? 4 : 3;
ctx.stroke();

drawItemIcon(ctx, item, b.x + b.w / 2, b.y + 62);

ctx.fillStyle = '#FFFFFF';
ctx.font = `18px ${FREDOKA}`;
ctx.fillText(item.name, b.x + b.w / 2, b.y + 122);

ctx.fillStyle = 'rgba(255,255,255,0.7)';
ctx.font = `12px ${MONO}`;
wrapText(ctx, item.desc, b.x + b.w / 2, b.y + 148, b.w - 28, 17);

ctx.fillStyle = '#FF4EB8';
ctx.font = `15px ${FREDOKA}`;
ctx.fillText(`[ ${i + 1} ]`, b.x + b.w / 2, b.y + b.h - 18);
});

ctx.textAlign = 'left';
return boxes;
}

// ---------------------------------------------------------------- item icons
// hand-drawn icons instead of emoji — keyed by item id, with a generic
// fallback so AI-added remix items still render.

function dropPath(ctx, x, y, s) {
ctx.beginPath();
ctx.moveTo(x, y - s);
ctx.quadraticCurveTo(x + s * 0.9, y + s * 0.15, x, y + s * 0.85);
ctx.quadraticCurveTo(x - s * 0.9, y + s * 0.15, x, y - s);
}

export function drawItemIcon(ctx, item, cx, cy) {
ctx.save();
ctx.lineWidth = 3;
ctx.strokeStyle = '#0F0F1A';
ctx.lineJoin = 'round';

switch (item.id) {
case 'big-tears':
ctx.fillStyle = '#7AD6FF';
dropPath(ctx, cx, cy, 22);
ctx.fill(); ctx.stroke();
ctx.fillStyle = 'rgba(255,255,255,0.55)';
ctx.beginPath(); ctx.arc(cx - 6, cy - 4, 4, 0, 7); ctx.fill();
break;
case 'caffeine':
ctx.fillStyle = '#FFF';
ctx.beginPath(); ctx.moveTo(cx - 14, cy - 10); ctx.lineTo(cx + 10, cy - 10);
ctx.lineTo(cx + 8, cy + 14); ctx.lineTo(cx - 12, cy + 14); ctx.closePath();
ctx.fill(); ctx.stroke();
ctx.beginPath(); ctx.arc(cx + 13, cy - 1, 7, -1.2, 1.2); ctx.stroke();
ctx.fillStyle = '#7A4A28';
ctx.beginPath(); ctx.ellipse(cx - 2, cy - 10, 11, 3.5, 0, 0, 7); ctx.fill(); ctx.stroke();
break;
case 'glass-cannon': {
const orb = ctx.createRadialGradient(cx - 6, cy - 6, 3, cx, cy, 19);
orb.addColorStop(0, '#E8C8FF'); orb.addColorStop(1, '#8C2BD9');
ctx.fillStyle = orb;
ctx.beginPath(); ctx.arc(cx, cy, 18, 0, 7); ctx.fill(); ctx.stroke();
ctx.fillStyle = 'rgba(255,255,255,0.7)';
ctx.beginPath(); ctx.arc(cx - 6, cy - 7, 4.5, 0, 7); ctx.fill();
break;
}
case 'extra-heart':
ctx.fillStyle = '#FF3B5C';
heartPath(ctx, cx, cy - 14, 30);
ctx.fill(); ctx.stroke();
break;
case 'triple-shot':
ctx.fillStyle = '#7AD6FF';
for (let i = -1; i <= 1; i++) {
dropPath(ctx, cx + i * 14, cy + Math.abs(i) * 5, 11);
ctx.fill(); ctx.stroke();
}
break;
case 'piercing':
ctx.fillStyle = 'rgba(122,214,255,0.35)';
ctx.beginPath(); ctx.arc(cx, cy, 13, 0, 7); ctx.fill(); ctx.stroke();
ctx.strokeStyle = '#FFE135'; ctx.lineWidth = 4;
ctx.beginPath(); ctx.moveTo(cx - 22, cy); ctx.lineTo(cx + 18, cy); ctx.stroke();
ctx.fillStyle = '#FFE135';
ctx.beginPath(); ctx.moveTo(cx + 24, cy); ctx.lineTo(cx + 13, cy - 7); ctx.lineTo(cx + 13, cy + 7); ctx.closePath(); ctx.fill();
break;
case 'rapid-fire':
ctx.fillStyle = '#FF7A35';
ctx.beginPath();
ctx.moveTo(cx, cy - 20);
ctx.quadraticCurveTo(cx + 16, cy - 2, cx + 9, cy + 12);
ctx.quadraticCurveTo(cx + 5, cy + 18, cx, cy + 18);
ctx.quadraticCurveTo(cx - 14, cy + 16, cx - 10, cy + 2);
ctx.quadraticCurveTo(cx - 7, cy - 8, cx, cy - 20);
ctx.fill(); ctx.stroke();
ctx.fillStyle = '#FFE135';
ctx.beginPath(); ctx.ellipse(cx, cy + 8, 6, 8, 0, 0, 7); ctx.fill();
break;
case 'sniper':
ctx.strokeStyle = '#FF4EB8'; ctx.lineWidth = 3.5;
ctx.beginPath(); ctx.arc(cx, cy, 15, 0, 7); ctx.stroke();
ctx.beginPath();
ctx.moveTo(cx, cy - 21); ctx.lineTo(cx, cy - 8);
ctx.moveTo(cx, cy + 8); ctx.lineTo(cx, cy + 21);
ctx.moveTo(cx - 21, cy); ctx.lineTo(cx - 8, cy);
ctx.moveTo(cx + 8, cy); ctx.lineTo(cx + 21, cy);
ctx.stroke();
ctx.fillStyle = '#FF4EB8';
ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, 7); ctx.fill();
break;
case 'brimstone-brew':
ctx.fillStyle = '#C42B2B';
ctx.beginPath(); ctx.arc(cx, cy + 4, 14, 0, 7); ctx.fill(); ctx.stroke();
ctx.fillStyle = '#FFF';
ctx.fillRect(cx - 5, cy - 18, 10, 8); ctx.strokeRect(cx - 5, cy - 18, 10, 8);
ctx.fillStyle = 'rgba(255,255,255,0.35)';
ctx.beginPath(); ctx.arc(cx - 5, cy, 4, 0, 7); ctx.fill();
break;
case 'feather-boots':
ctx.fillStyle = '#2A2A3E';
ctx.beginPath(); ctx.moveTo(cx - 10, cy - 14); ctx.lineTo(cx + 2, cy - 14);
ctx.lineTo(cx + 2, cy + 4); ctx.lineTo(cx + 16, cy + 4); ctx.lineTo(cx + 16, cy + 14);
ctx.lineTo(cx - 10, cy + 14); ctx.closePath(); ctx.fill(); ctx.stroke();
ctx.strokeStyle = '#7AD6FF'; ctx.lineWidth = 2.5;
ctx.beginPath();
ctx.moveTo(cx - 14, cy - 4); ctx.quadraticCurveTo(cx - 24, cy - 8, cx - 18, cy - 16);
ctx.moveTo(cx - 14, cy + 2); ctx.quadraticCurveTo(cx - 26, cy - 2, cx - 22, cy - 10);
ctx.stroke();
break;
case 'stone-tears':
ctx.fillStyle = '#8C8C9E';
dropPath(ctx, cx, cy, 21);
ctx.fill(); ctx.stroke();
ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2;
ctx.beginPath(); ctx.moveTo(cx - 5, cy - 6); ctx.lineTo(cx + 1, cy); ctx.lineTo(cx - 3, cy + 8); ctx.stroke();
break;
case 'cursed-eye':
ctx.fillStyle = '#B94EFF';
ctx.beginPath(); ctx.ellipse(cx, cy, 19, 12, 0, 0, 7); ctx.fill(); ctx.stroke();
ctx.fillStyle = '#1A1A2E';
ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 7); ctx.fill();
ctx.fillStyle = '#FF3B3B';
ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, 7); ctx.fill();
break;
case 'spread-doctrine':
ctx.strokeStyle = '#7AD6FF'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
for (let i = -1.5; i <= 1.5; i++) {
const a = -Math.PI / 2 + i * 0.4;
ctx.beginPath();
ctx.moveTo(cx, cy + 14);
ctx.lineTo(cx + Math.cos(a) * 26, cy + 14 + Math.sin(a) * 26);
ctx.stroke();
}
break;
case 'adrenaline':
ctx.fillStyle = '#FFE135';
ctx.beginPath();
ctx.moveTo(cx + 6, cy - 20); ctx.lineTo(cx - 10, cy + 3); ctx.lineTo(cx - 1, cy + 3);
ctx.lineTo(cx - 6, cy + 20); ctx.lineTo(cx + 10, cy - 3); ctx.lineTo(cx + 1, cy - 3);
ctx.closePath(); ctx.fill(); ctx.stroke();
break;
case 'iron-skin':
ctx.fillStyle = '#8C8C9E';
ctx.beginPath();
ctx.moveTo(cx, cy - 18); ctx.lineTo(cx + 15, cy - 12); ctx.lineTo(cx + 13, cy + 6);
ctx.quadraticCurveTo(cx + 8, cy + 16, cx, cy + 20);
ctx.quadraticCurveTo(cx - 8, cy + 16, cx - 13, cy + 6);
ctx.lineTo(cx - 15, cy - 12); ctx.closePath();
ctx.fill(); ctx.stroke();
ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2.5;
ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 13); ctx.stroke();
break;
case 'soul-siphon':
ctx.strokeStyle = '#3DFFB0'; ctx.lineWidth = 4; ctx.lineCap = 'round';
ctx.beginPath();
for (let a = 0; a < Math.PI * 2.4; a += 0.15) {
const r = 3 + a * 5.2;
const px = cx + Math.cos(a) * r;
const py = cy + Math.sin(a) * r;
if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
}
ctx.stroke();
break;
default:
// fallback for items invented by live remixes
if (item.emoji) {
ctx.font = '44px serif';
ctx.textAlign = 'center';
ctx.fillText(item.emoji, cx, cy + 16);
} else {
ctx.fillStyle = '#FFE135';
ctx.beginPath();
for (let i = 0; i < 10; i++) {
const a = -Math.PI / 2 + (i * Math.PI) / 5;
const r = i % 2 === 0 ? 19 : 8.5;
const px = cx + Math.cos(a) * r;
const py = cy + Math.sin(a) * r;
if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
}
ctx.closePath(); ctx.fill(); ctx.stroke();
}
}
ctx.restore();
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
const words = text.split(' ');
let line = '';
for (const word of words) {
const test = line ? `${line} ${word}` : word;
if (ctx.measureText(test).width > maxW && line) {
ctx.fillText(line, cx, y);
line = word;
y += lineH;
} else {
line = test;
}
}
if (line) ctx.fillText(line, cx, y);
}
