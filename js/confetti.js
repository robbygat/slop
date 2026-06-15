// Canvas confetti engine — 120 pieces per burst, hard physics, brand colors only.

const COLORS = ['#FFE135', '#FF4EB8', '#4ECAFF', '#3DFFB0', '#FF7A35', '#B94EFF'];

let canvas = null;
let ctx = null;
let pieces = [];
let raf = null;

function ensureCanvas() {
if (!canvas) {
canvas = document.getElementById('confetti-canvas');
ctx = canvas.getContext('2d');
}
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
canvas.style.display = 'block';
}

export function launchConfetti() {
ensureCanvas();

for (let i = 0; i < 120; i++) {
const maxLife = 140 + Math.random() * 120;
pieces.push({
x: Math.random() * canvas.width,
y: -10 - Math.random() * 60,
vx: (Math.random() - 0.5) * 3.2,
vy: 1 + Math.random() * 3,
rotation: Math.random() * Math.PI * 2,
rotVel: (Math.random() - 0.5) * 0.22,
color: COLORS[Math.floor(Math.random() * COLORS.length)],
size: 6 + Math.random() * 7,
life: maxLife,
maxLife,
});
}

if (!raf) raf = requestAnimationFrame(frame);
}

function frame() {
ctx.clearRect(0, 0, canvas.width, canvas.height);

pieces = pieces.filter((p) => p.life > 0 && p.y < canvas.height + 20);

for (const p of pieces) {
p.vy += 0.08; // gravity
p.x += p.vx;
p.y += p.vy;
p.rotation += p.rotVel;
p.life -= 1;

ctx.save();
ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
ctx.translate(p.x, p.y);
ctx.rotate(p.rotation);
ctx.fillStyle = p.color;
ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
ctx.restore();
}

if (pieces.length > 0) {
raf = requestAnimationFrame(frame);
} else {
raf = null;
canvas.style.display = 'none';
}
}
