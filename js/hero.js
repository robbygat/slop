// Hero: hint-chip typewriter, the model picker, the cook-game flow, and the waitlist.

import { showToast } from './toast.js';
import { cookGameForReal } from './cook.js';
import { MODELS, MODEL_CHOICES } from './ai.js';

let typeTimer = null;

const MODEL_KEY = 'slop-model'; // shared with Slop Studio

// Populate the hero model dropdown and persist the choice (used by cook.js).
function initModelPicker() {
const sel = document.getElementById('hero-model');
if (!sel) return;
sel.innerHTML = MODEL_CHOICES.map((m) => `<option value="${m.id}">${m.tier === 'pro' ? '🔒 ' : ''}${m.label}</option>`).join('');
const saved = localStorage.getItem(MODEL_KEY) || MODELS.cook;
if (MODEL_CHOICES.some((m) => m.id === saved)) sel.value = saved;

const note = document.getElementById('hero-model-note');
const updateNote = () => {
const choice = MODEL_CHOICES.find((m) => m.id === sel.value);
if (note) note.textContent = choice?.tier === 'pro' ? '· Pro' : '';
};
updateNote();
sel.addEventListener('change', () => { localStorage.setItem(MODEL_KEY, sel.value); updateNote(); });
}

export function setPrompt(text) {
const textarea = document.getElementById('prompt-input');
clearInterval(typeTimer);
textarea.value = '';
textarea.focus();

let i = 0;
typeTimer = setInterval(() => {
textarea.value = text.slice(0, ++i);
if (i >= text.length) clearInterval(typeTimer);
}, 28);
}

export async function cookGame() {
const textarea = document.getElementById('prompt-input');
const btn = document.getElementById('generate-btn');
const pwin = document.getElementById('pwin');

if (!textarea.value.trim()) {
showToast('describe your game first! the pot is empty');
pwin.classList.remove('shake');
void pwin.offsetWidth; // restart animation
pwin.classList.add('shake');
return;
}

btn.disabled = true;
btn.textContent = 'Cooking…';

const game = await cookGameForReal(textarea.value.trim());

if (game) {
btn.textContent = 'OK Published!';
btn.classList.add('done');
}
setTimeout(() => {
btn.disabled = false;
btn.classList.remove('done');
btn.textContent = 'Generate →';
}, 1200);
}

function initWaitlist() {
const form = document.getElementById('waitlist-form');
const email = document.getElementById('waitlist-email');
const note = document.getElementById('waitlist-note');

// remember a previous signup
const saved = localStorage.getItem('slop-waitlist-email');
if (saved) {
email.value = saved;
note.textContent = `you're on the list as ${saved}`;
}

form.addEventListener('submit', async (e) => {
e.preventDefault();
const value = email.value.trim();
if (!value) return;
try {
const { api } = await import('./api.js');
await api.joinWaitlist(value); // lands in the database when the server is up
} catch (err) {
note.textContent = err.message;
return;
}
localStorage.setItem('slop-waitlist-email', value);
note.textContent = `you're on the list as ${value} — we'll email you at launch`;
showToast('welcome aboard — you are on the waitlist');
});
}

export function initHero() {
initModelPicker();

// hint chips typewriter
document.querySelectorAll('.hint-chip').forEach((chip) => {
chip.addEventListener('click', () => setPrompt(chip.dataset.prompt));
});

document.getElementById('generate-btn').addEventListener('click', cookGame);

// nav "Cook a Game" scrolls to the prompt window and focuses it
document.getElementById('nav-cook').addEventListener('click', () => {
document.getElementById('pwin').scrollIntoView({ behavior: 'smooth', block: 'center' });
setTimeout(() => document.getElementById('prompt-input').focus(), 600);
});

initWaitlist();
}
