// iPhone section — embeds Run Infinite in the mockup with working touch controls.

import { showToast } from './toast.js';

// Run Infinite maps A/D to tube rotation; stick ←/→ were inverted on the old d-pad.
const ROTATE_LEFT = 'd';
const ROTATE_RIGHT = 'a';
const JUMP = ' ';

export function initAppStore() {
const iframe = document.getElementById('delta-game');
const idle = document.getElementById('ds-idle');
const delta = document.querySelector('.delta');
const stickBase = document.getElementById('stick-base');
const stickKnob = document.getElementById('stick-knob');
if (!iframe) return;

let playing = false;
let iframeReady = false;
let pendingStart = false;
let heldRotate = null;

function post(payload) {
iframe.contentWindow?.postMessage({ type: 'r3-input', ...payload }, location.origin);
}

function sendStart() {
post({ action: 'start' });
}

function startGame() {
if (playing) return;
playing = true;
pendingStart = false;
delta?.classList.add('playing');
idle?.classList.add('hide');
if (iframeReady) sendStart();
else pendingStart = true;
try { iframe.contentWindow?.focus(); } catch { /* */ }
}

function restartGame() {
if (!playing) return startGame();
sendStart();
}

function keyDown(key) {
if (!playing) return;
post({ action: 'down', key });
}

function keyUp(key) {
if (!playing) return;
post({ action: 'up', key });
}

function setRotate(key) {
if (heldRotate === key) return;
if (heldRotate) keyUp(heldRotate);
heldRotate = key;
if (key) keyDown(key);
}

function releaseRotate() {
if (!heldRotate) return;
keyUp(heldRotate);
heldRotate = null;
}

function bindHold(el, key) {
const down = (e) => {
e.preventDefault();
if (!playing) return;
el.classList.add('pressed');
keyDown(key);
};
const up = (e) => {
e.preventDefault();
el.classList.remove('pressed');
keyUp(key);
};

el.addEventListener('pointerdown', down);
el.addEventListener('pointerup', up);
el.addEventListener('pointerleave', up);
el.addEventListener('pointercancel', up);
}

function initAnalogStick(base, knob) {
if (!base || !knob) return;

const radius = () => base.clientWidth * 0.36;
const dead = 0.18;
let pointerId = null;

function moveStick(clientX, clientY) {
const rect = base.getBoundingClientRect();
const cx = rect.left + rect.width / 2;
const cy = rect.top + rect.height / 2;
let dx = clientX - cx;
let dy = clientY - cy;
const max = radius();
const dist = Math.hypot(dx, dy);
if (dist > max) {
dx = (dx / dist) * max;
dy = (dy / dist) * max;
}
knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

if (!playing) return;

const nx = dx / max;
if (nx < -dead) setRotate(ROTATE_LEFT);
else if (nx > dead) setRotate(ROTATE_RIGHT);
else releaseRotate();
}

function resetStick() {
pointerId = null;
knob.style.transform = 'translate(-50%, -50%)';
base.classList.remove('active');
releaseRotate();
}

base.addEventListener('pointerdown', (e) => {
e.preventDefault();
pointerId = e.pointerId;
base.classList.add('active');
base.setPointerCapture(e.pointerId);
moveStick(e.clientX, e.clientY);
});

base.addEventListener('pointermove', (e) => {
if (pointerId !== e.pointerId) return;
moveStick(e.clientX, e.clientY);
});

base.addEventListener('pointerup', (e) => {
if (pointerId !== e.pointerId) return;
resetStick();
});

base.addEventListener('pointercancel', (e) => {
if (pointerId !== e.pointerId) return;
resetStick();
});
}

function bindStart(el) {
if (!el) return;
el.addEventListener('click', (e) => {
e.preventDefault();
e.stopPropagation();
startGame();
});
}

bindStart(document.getElementById('ds-start-btn'));
idle?.addEventListener('click', (e) => {
if (e.target.closest('#ds-start-btn')) return;
startGame();
});

document.querySelectorAll('.delta [data-input="start"]').forEach(bindStart);

document.querySelectorAll('.delta [data-input="restart"]').forEach((el) => {
el.addEventListener('click', (e) => {
e.preventDefault();
restartGame();
});
});

document.querySelectorAll('.delta [data-input="jump"]').forEach((el) => {
bindHold(el, JUMP);
});

initAnalogStick(stickBase, stickKnob);

iframe.addEventListener('load', () => {
iframeReady = true;
if (pendingStart) sendStart();
});

document.querySelectorAll('.app-notify').forEach((btn) => {
btn.addEventListener('click', () => {
document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
setTimeout(() => document.getElementById('waitlist-email')?.focus(), 500);
showToast("we'll email you the second the app drops ");
});
});
}
