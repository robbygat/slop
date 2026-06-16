// The real cook: prompt → Grok → complete playable HTML game, streamed live
// into a kitchen modal, crash-tested in a hidden sandbox, screenshotted for
// its grid thumbnail, then plated into the games grid.

import { chatStream, extractFence, extractMetaLine, MODELS, MODEL_CHOICES } from './ai.js';
import { addCookedGame, rerenderGrid } from './games-grid.js';
import { testGameHTML } from './sandbox.js';
import { launchConfetti } from './confetti.js';
import { showToast } from './toast.js';

const SYSTEM_PROMPT = `You are the game engine behind slop.game — you turn plain-english prompts into complete, genuinely playable browser games.

HARD REQUIREMENTS:
- Output ONE complete self-contained HTML document: inline <style> and <script>, nothing external. No CDNs, no fonts, no images, no fetch. Draw all art with <canvas> (or DOM), synthesize any audio with the Web Audio API.
- It must run inside a sandboxed iframe: never use localStorage, cookies, alert/prompt/confirm, or top-level navigation. Attach key listeners to window. Canvas should scale to fit the viewport.
- It must not throw any runtime errors — the build is automatically rejected if the console sees a single uncaught error. Guard everything.
- Playable instantly: show the controls on screen, start on first input or a big start button, include score and a lose (and/or win) state with instant restart (key R + button).
- Make it FUN and JUICY: screen shake, particles, color pops, escalating difficulty. Cute neo-brutalist palette (#FFE135 #FF4EB8 #4ECAFF #3DFFB0 #FF7A35 #1A1A2E) unless the prompt wants a different vibe.
- Keep it tight: aim for 200-500 lines. Working and fun beats sprawling and broken. No TODOs, no placeholders.

OUTPUT FORMAT (STRICT):
Line 1: a single-line JSON object: {"name":"Game Name","desc":"one punchy lowercase line, max 90 chars"}
Then exactly one fenced code block:
\`\`\`html
<!DOCTYPE html>
... the complete game ...
\`\`\`
No other commentary before or after.`;

const HEAL_PROMPT = `You are debugging a single-file HTML5 canvas game that throws an uncaught error inside a sandboxed iframe (no localStorage/cookies/alert/confirm; all art drawn on canvas; no external resources). You are given the exact console error(s). Find the ROOT CAUSE and fix it. Return ONLY the COMPLETE corrected HTML document inside one \`\`\`html code block — no commentary.`;

const STEPS = [
['01', 'reading your prompt'],
['02', 'grok is writing the code'],
['03', 'crash-testing the build'],
['04', 'plating your game'],
];

// receiver that lets the player hot-patch the running game with no reload
const MOD_RX = `<script id="slop-mod-rx">window.addEventListener('message',function(e){if(e&&e.data&&e.data.__slopmod){try{(new Function(e.data.__slopmod))();}catch(err){console.warn('slopmod',err);}}});<\/script>`;
function injectModReceiver(html) {
if (/slop-mod-rx/.test(html)) return html;
if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + MOD_RX);
if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (m) => m + MOD_RX);
return MOD_RX + html;
}

let modal = null;

function ensureModal() {
if (modal) return modal;
modal = document.createElement('div');
modal.id = 'cook-modal';
modal.className = 'cook-modal hidden';
modal.innerHTML = `
<div class="cook-card">
<div class="cook-head">
<span class="cook-title" id="cook-title">cooking your game…</span>
<button class="cook-close" id="cook-close">X</button>
</div>
<div class="cook-steps" id="cook-steps"></div>
<pre class="cook-code" id="cook-code"></pre>
<div class="cook-foot">
<span class="cook-status" id="cook-status">contacting grok…</span>
<div class="cook-actions hidden" id="cook-actions">
<a class="cook-play" id="cook-play" href="#">Play Now</a>
<button class="cook-stay" id="cook-stay">see it in the grid ↓</button>
</div>
</div>
</div>`;
document.body.appendChild(modal);
modal.querySelector('#cook-close').addEventListener('click', () => modal.classList.add('hidden'));
return modal;
}

function setStep(n) {
const el = modal.querySelector('#cook-steps');
el.innerHTML = STEPS.map(([num, label], i) => `
<span class="cook-step ${i < n ? 'done' : i === n ? 'active' : ''}">
${i < n ? 'OK' : num} ${label}
</span>${i < STEPS.length - 1 ? '<span class="cook-arrow">→</span>' : ''}`).join('');
}

function slugify(name) {
const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

// Hand the model its own crash + ask for the complete corrected document.
async function healOnce(html, errs, codeEl) {
let raf = null;
const full = await chatStream({
model: localStorage.getItem('slop-model') || MODELS.cook,
temperature: 0.3,
messages: [
{ role: 'system', content: HEAL_PROMPT },
{ role: 'user', content: `This game throws uncaught error(s) in a sandboxed iframe:\n\n${errs.map((e) => '- ' + e).join('\n')}\n\nFix the root cause and return the COMPLETE corrected HTML document.\n\n\`\`\`html\n${html}\n\`\`\`` },
],
onDelta(_, soFar) { if (!raf) raf = requestAnimationFrame(() => { raf = null; codeEl.textContent = soFar; codeEl.scrollTop = codeEl.scrollHeight; }); },
});
let fixed = extractFence(full);
if (!fixed) { const d = full.indexOf('<!DOCTYPE'); if (d >= 0) fixed = full.slice(d).trim(); }
return (fixed && /<html/i.test(fixed)) ? fixed : null;
}

export async function cookGameForReal(prompt) {
ensureModal();
modal.classList.remove('hidden');

const code = modal.querySelector('#cook-code');
const status = modal.querySelector('#cook-status');
const title = modal.querySelector('#cook-title');
const actions = modal.querySelector('#cook-actions');

code.textContent = '';
actions.classList.add('hidden');
title.textContent = 'cooking your game…';
status.textContent = 'contacting grok…';
setStep(0);

let chars = 0;
let raf = null;

try {
const full = await chatStream({
model: localStorage.getItem('slop-model') || MODELS.cook, // hero picker (shared w/ studio)
messages: [
{ role: 'system', content: SYSTEM_PROMPT },
{ role: 'user', content: `Cook this game: ${prompt}` },
],
temperature: 0.7,
onDelta(_, soFar) {
if (chars === 0) setStep(1);
chars = soFar.length;
if (!raf) {
raf = requestAnimationFrame(() => {
raf = null;
code.textContent = soFar;
code.scrollTop = code.scrollHeight;
status.textContent = `cooking… ${(chars / 1024).toFixed(1)} KB of game written`;
});
}
},
});

const meta = extractMetaLine(full) || {};
let html = extractFence(full);
if (!html) {
const docStart = full.indexOf('<!DOCTYPE');
if (docStart >= 0) html = full.slice(docStart).trim();
}
if (!html || !/<html/i.test(html)) throw new Error('grok returned something unservable — try again');

// inject the live-remix receiver so this game can be hot-patched mid-play
html = injectModReceiver(html);

// crash-test the build before it touches the grid — and if it crashes, let the
// model debug its own game (self-heal) using the exact error, up to MAX_FIX passes.
setStep(2);
status.textContent = 'crash-testing the build…';
let test = await testGameHTML(html);
const MAX_FIX = 2;
for (let fixes = 1; !test.ok && fixes <= MAX_FIX; fixes++) {
const errs = (test.errors && test.errors.length ? test.errors : [test.error]).filter(Boolean);
status.textContent = `self-healing: ${errs[0]} (fix ${fixes}/${MAX_FIX})…`;
const fixed = await healOnce(html, errs, code);
if (!fixed) break;
html = injectModReceiver(fixed);
status.textContent = 'crash-testing the fix…';
test = await testGameHTML(html);
}
if (!test.ok) throw new Error(`the build kept crashing (${test.error}) — try again`);

setStep(3);
status.textContent = 'plating…';

const game = addCookedGame({
id: slugify(meta.name || prompt.slice(0, 24)),
name: meta.name || 'Untitled Slop',
desc: meta.desc || prompt.slice(0, 90),
prompt,
html,
thumb: test.thumb,
createdAt: Date.now(),
});

setStep(4);
const mid = localStorage.getItem('slop-model') || MODELS.cook;
const mlabel = MODEL_CHOICES.find((m) => m.id === mid)?.label.split(' — ')[0] || mid;
title.textContent = `${game.name} — served!`;
status.textContent = `${(html.length / 1024).toFixed(1)} KB · crash-tested · made with ${mlabel}`;
actions.classList.remove('hidden');
modal.querySelector('#cook-play').href = `play.html?id=${encodeURIComponent(game.id)}`;
modal.querySelector('#cook-stay').onclick = () => {
modal.classList.add('hidden');
rerenderGrid();
const card = document.querySelector(`[data-cooked-id="${game.id}"]`);
if (card) {
card.scrollIntoView({ behavior: 'smooth', block: 'center' });
card.classList.add('fresh-pop');
setTimeout(() => card.classList.remove('fresh-pop'), 2600);
}
};

launchConfetti();
showToast(`${game.name} is live!`);
return game;
} catch (err) {
status.textContent = `! ${err.message}`;
title.textContent = 'kitchen fire';
showToast('cooking failed — try again');
console.error(err);
return null;
}
}
