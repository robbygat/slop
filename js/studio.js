// SLOP STUDIO — the prompt-based game creator agent.
// Describe a game → the agent writes it (single- or multi-file), crash-tests
// it, and boots it in the playtest pane. Keep prompting to edit ANY aspect.
// Generate or upload sprites, flip on multiplayer, run a live collaborative
// jam, bring your own xAI key/model, and export the whole folder as a .zip.

import { chatStream, extractFence, extractMetaLine, imageGen, MODELS, MODEL_CHOICES, setUserKey } from './ai.js';
import { testGameHTML } from './sandbox.js';
import { attachFrameMonitor, createDebugPanel, injectRuntimeHook, injectPlayContext, MOD_RX, mountErrorOverlay } from './debug.js';
import { createSpeech } from './speech.js';
import { api, escapeHTML } from './api.js';
import { getCookedGame, addCookedGame, updateCookedGame } from './games-grid.js';
import { SLOPNET_INLINE } from './netcore.js';
import { SLOP_MP_INLINE, SLOP_MP_RULES } from './mp-boilerplate.js';
import { initCollab } from './studio-collab.js';
import { makeZip, dataUrlToBytes, downloadBlob } from './zip.js';
import { initAccount, getUser, onUser, openAuthModal, promptUsername } from './account.js';

const $ = (id) => document.getElementById(id);
let collab = null;
let agentShader = null; // live shader behind the agent header (loaded lazily)

// Drive the agent's "thinking" visuals: the header shader speeds up + brightens,
// and the orb spins faster / pulses while the agent works.
function setAgentThinking(on) {
document.querySelector('.agent-head')?.classList.toggle('thinking', on);
agentShader?.setThinking(on);
}

// ---------------------------------------------------------------- state
const game = {
id: null, name: 'untitled slop', desc: '', prompt: '',
srcHtml: null, // canonical entry (index.html), no injected tags
files: {}, // extra project files: { 'js/game.js': '...', 'css/style.css': '...' }
sprites: {}, // name → data URL
history: [], // [{ srcHtml, files }] (cap 6)
multiplayer: false,
model: localStorage.getItem('slop-model') || MODELS.studio,
};
let busy = false;
const PUBLISH_MAX_BYTES = 50 * 1024;
const MP_RE = /\b(multiplayer|multi-player|co-?op|cooperative|online|pvp|versus|vs\.?|with friends|play with friends|play against|real-?time|(?:2|4|8)[\s-]?player|party game|lobby|host a room|join room|slopnet|hotseat|take turns|over the internet)\b/i;
const MP_GAME_RE = /\b(chess|checkers|connect\s?four|battleship|card game|board game)\b.*\b(online|multiplayer|2[\s-]?player|friend|versus|pvp)\b|\b(online|multiplayer|2[\s-]?player)\b.*\b(chess|checkers)\b/i;
function detectMultiplayer(ask) { return MP_RE.test(ask || '') || MP_GAME_RE.test(ask || ''); }
function syncMP() { $('mp-toggle')?.classList.toggle('on', game.multiplayer); }
function projectBytes() { return new Blob([finalHTML()]).size; }
function projectSizeLabel() { return `${(projectBytes() / 1024).toFixed(1)} KB`; }
function enableMultiplayerFromPrompt(ask, run) {
if (!detectMultiplayer(ask)) return;
if (!game.multiplayer) {
game.multiplayer = true;
syncMP();
run?.detail?.('multiplayer detected — SlopNet room scaffolding enabled');
toast('multiplayer ON — your game gets host/join rooms');
}
}
function normalizeBuilt(built, meta) {
if (!built) return null;
built.meta = { ...built.meta, ...meta };
if (built.partial || (!built.entry && Object.keys(built.files || {}).length)) {
return mergeBuild({ entry: game.srcHtml, files: { ...game.files } }, built);
}
return built;
}
function addRunThought(run, text) {
const el = document.createElement('div'); el.className = 'run-thought'; el.textContent = text; run.body.appendChild(el);
}
function addSuggestChips(run, texts) {
const row = document.createElement('div'); row.className = 'run-suggest';
for (const t of texts) {
const b = document.createElement('button'); b.type = 'button'; b.className = 'run-suggest-chip'; b.textContent = t;
b.addEventListener('click', () => { $('prompt').value = t; $('prompt').focus(); });
row.appendChild(b);
}
run.body.appendChild(row);
}

// ---------------------------------------------------------------- assembly / bundling
const MOD_RECEIVER = MOD_RX;

function injectHead(html, tag) {
if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + '\n' + tag);
if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + '\n<head>' + tag + '</head>');
return tag + html;
}
function stripInjected(html) {
return html
.replace(/<script id="slop-sprites">[\s\S]*?<\/script>\n?/i, '')
.replace(/<script id="slop-mod-rx">[\s\S]*?<\/script>\n?/i, '')
.replace(/<script id="slop-debug">[\s\S]*?<\/script>\n?/i, '')
.replace(/<script id="slop-play-ctx">[\s\S]*?<\/script>\n?/i, '')
.replace(/<!--slopnet-->[\s\S]*?<!--\/slopnet-->\n?/i, '')
.replace(/<!--slopmp-->[\s\S]*?<!--\/slopmp-->\n?/i, '')
.replace(/<style id="slop-mp-css">[\s\S]*?<\/style>\n?/i, '')
.replace(/<script id="slop-mp-js">[\s\S]*?<\/script>\n?/i, '')
.replace(/<div id="slop-mp-overlay">[\s\S]*?<\/div>\n?/i, '');
}
// inline local <script src> / <link href> from the project file map
function bundleFrom(entry, files) {
let html = entry || '';
const keys = Object.keys(files || {});
const find = (ref) => keys.find((k) => k === ref || k === ref.replace(/^\.?\//, '') || k.endsWith('/' + ref.replace(/^\.?\//, '')));
html = html.replace(/<script([^>]*?)src=["']([^"']+)["']([^>]*)><\/script>/gi, (m, pre, src, post) => {
if (/^https?:|^\/\//i.test(src)) return m;
const k = find(src); if (k == null) return m;
const keepType = /type=["']module["']/.test(pre + post) ? ' type="module"' : '';
return `<script${keepType}>\n${files[k].replace(/<\/script>/gi, '<\\/script>')}\n</script>`;
});
html = html.replace(/<link([^>]*?)href=["']([^"']+\.css)["']([^>]*)>/gi, (m, pre, href) => {
if (/^https?:|^\/\//i.test(href)) return m;
const k = find(href); if (k == null) return m;
return `<style>\n${files[k]}\n</style>`;
});
return html;
}
function assemble(html, { sprites = game.sprites, multiplayer = game.multiplayer } = {}) {
let out = stripInjected(html);
out = injectRuntimeHook(out);
out = injectHead(out, MOD_RECEIVER);
const shareBase = game.publishedAs
  ? `${location.origin}/play/${game.publishedAs}`
  : game.id ? `${location.origin}/play.html?id=${encodeURIComponent(game.id)}` : `${location.origin}${location.pathname}`;
out = injectPlayContext(out, {
  shareBase,
  room: new URLSearchParams(location.search).get('room'),
});
if (Object.keys(sprites).length) out = injectHead(out, `<script id="slop-sprites">window.SPRITES=${JSON.stringify(sprites)};</scr` + `ipt>`);
if (multiplayer) {
out = injectHead(out, `<!--slopnet-->${SLOPNET_INLINE}<!--/slopnet-->`);
out = injectHead(out, `<!--slopmp-->${SLOP_MP_INLINE}<!--/slopmp-->`);
}
return out;
}
const bundle = () => bundleFrom(game.srcHtml || '', game.files);
const finalHTML = () => assemble(bundle());

// parse an agent response into { entry, files } (multi-file or single)
function parseBuild(text) {
if (/^===\s*.+?\s*===\s*$/m.test(text)) {
const files = {};
const re = /^===\s*(.+?)\s*===\s*\n```[a-zA-Z0-9]*\s*\n([\s\S]*?)```/gm;
let m;
while ((m = re.exec(text))) files[m[1].trim()] = m[2].trim();
const entryKey = Object.keys(files).find((k) => /(^|\/)index\.html?$/i.test(k)) || Object.keys(files).find((k) => /\.html?$/i.test(k));
if (entryKey) { const entry = files[entryKey]; delete files[entryKey]; return { entry, files }; }
if (Object.keys(files).length) return { entry: null, files, partial: true };
}
let html = extractFence(text);
if (!html) { const d = text.indexOf('<!DOCTYPE'); if (d >= 0) html = text.slice(d).trim(); }
if (html && /<html/i.test(html)) return { entry: html, files: {} };
return null;
}
function currentSourceForPrompt() {
const fk = Object.keys(game.files);
if (!fk.length) return `\`\`\`html\n${game.srcHtml}\n\`\`\``;
let s = `=== index.html ===\n\`\`\`html\n${game.srcHtml}\n\`\`\``;
for (const p of fk) { const lang = p.endsWith('.css') ? 'css' : p.endsWith('.js') ? 'js' : ''; s += `\n\n=== ${p} ===\n\`\`\`${lang}\n${game.files[p]}\n\`\`\``; }
return s;
}

// ---------------------------------------------------------------- timeline UI
function tlAgent(text, cls = '') {
const wrap = document.createElement('div'); wrap.className = 'tl-agent-wrap';
wrap.innerHTML = `<div class="tl-agent-av" aria-hidden="true"></div>`;
const el = document.createElement('div'); el.className = `tl-agent ${cls}`; el.textContent = text;
wrap.appendChild(el);
$('timeline').appendChild(wrap);
wrap.scrollIntoView({ behavior: 'smooth', block: 'end' });
return el;
}
function tlUser(text) {
const wrap = document.createElement('div'); wrap.className = 'tl-user-wrap';
const el = document.createElement('div'); el.className = 'tl-user'; el.textContent = text;
wrap.appendChild(el);
$('timeline').appendChild(wrap);
wrap.scrollIntoView({ behavior: 'smooth', block: 'end' });
}
function showTyping(on) {
let el = document.getElementById('tl-typing');
if (!on) { el?.remove(); return; }
if (el) return;
el = document.createElement('div'); el.id = 'tl-typing'; el.className = 'tl-typing';
el.innerHTML = '<span class="tl-think-orb" aria-hidden="true"></span><span class="tl-think-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span>thinking…</span>';
$('timeline').appendChild(el);
el.scrollIntoView({ behavior: 'smooth', block: 'end' });
}
function toast(text) { const el = $('studio-toast'); el.textContent = text; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2800); }
function queueXP(e) { try { const q = JSON.parse(localStorage.getItem('slop-xp-queue') || '[]'); q.push(e); localStorage.setItem('slop-xp-queue', JSON.stringify(q)); } catch { /* */ } }

// ---------------------------------------------------------------- prompts
const CREATE_RULES = `HARD REQUIREMENTS:
- The game runs inside a sandboxed iframe: never use localStorage, cookies, alert/prompt/confirm, or top-level navigation. Attach key listeners to window. Canvas scales to fit the viewport. No external resources except (optionally) a CDN <script> when truly needed.
- It must not throw any runtime errors — the build is rejected if the console sees a single uncaught error. Guard everything.
- Playable instantly: show controls on screen, start on first input or a big start button, include score and a lose (and/or win) state with instant restart (key R + button).
- On game over, submit the score: window.dispatchEvent(new CustomEvent('slop:score', { detail: { score: yourScoreNumber } }));
- SIZE BUDGET: published games can be up to 50 KB bundled. Build substantial, feature-rich games — aim for 800–2500 lines split across files when the idea warrants it. Small arcade games can be one file; bigger games MUST split into index.html + js/game.js (+ css/style.css).
- QUALITY BAR: juicy feedback (particles, screen shake, hit-stop, escalating difficulty), readable HUD, on-screen tutorial, multiple enemy types / levels / upgrades where it fits the prompt.`;

function spriteRules() {
const names = Object.keys(game.sprites);
return `SPRITES (images the game can draw): the shell injects window.SPRITES = { name: dataURL }. Available now: ${names.length ? names.join(', ') : '(none yet)'}.
- To USE sprites: at boot do — const SPR={}; for(const k in (window.SPRITES||{})){const i=new Image();i.src=window.SPRITES[k];SPR[k]=i;} — then ctx.drawImage(SPR.player,x-w/2,y-h/2,w,h). ALWAYS keep a shape fallback so a missing sprite never breaks the game.
- If the request needs NEW art that doesn't exist, respond with ONLY this line (no code): {"sprites":[{"name":"short","prompt":"detailed, single centered subject, plain white background, no text"}]} (max 4). The shell generates them and re-invokes you.`;
}
const LIVE_MOD_RULES = `LIVE REMIX: expose the game's live state + tunables on window.GAME (e.g. window.GAME={state,player,config,...}) and keep difficulty/speed numbers in window.GAME.config, so a one-line patch like GAME.config.speed*=2 takes effect with no reload.`;
const MULTIFILE_RULES = `PROJECT STRUCTURE: games under ~12 KB = one \`\`\`html block. Bigger games MUST split: === index.html === (shell + canvas) + === js/game.js === (logic) + optional === css/style.css ===. index.html references others with relative <script src="js/game.js"> / <link href="css/style.css"> (the shell bundles them). Use folders (js/, css/) for anything substantial.`;
function multiplayerRules() {
return SLOP_MP_RULES;
}
function systemPrompt(isEdit) {
return `You are the build agent inside Slop Studio on SLOP.game — you turn plain-english prompts into complete, genuinely playable browser games. Default model reasoning: plan carefully, then output complete working code with no placeholders.

${CREATE_RULES}

${MULTIFILE_RULES}

${spriteRules()}

${LIVE_MOD_RULES}

${game.multiplayer ? multiplayerRules() : ''}

${isEdit ? `EDIT MODE: the game ALREADY WORKS. Apply the request with a SURGICAL PATCH — change only what the request needs.` : `CREATE MODE: build a complete, polished game from scratch. Think through the core loop before coding.`}

OUTPUT FORMAT (STRICT):
Line 1: single-line JSON: {"name":"Game Name","desc":"one punchy lowercase line, max 90 chars","summary":"what you did, max 60 chars"}
Then EITHER one \`\`\`html block (single-file) OR multiple \`=== path ===\` + fenced blocks (multi-file). Nothing else.
(EXCEPTION: a sprite request per SPRITES is line 1 JSON only.)`;
}
function editSystemPrompt() {
return `You are the LIVE EDIT agent in Slop Studio. The player has a WORKING game and wants a targeted change. PATCH IN PLACE — do NOT rewrite the whole project from scratch.

${CREATE_RULES}

${MULTIFILE_RULES}

${spriteRules()}

${LIVE_MOD_RULES}

${game.multiplayer ? multiplayerRules() : ''}

PATCH MODE (critical):
- Multi-file: return ONLY the file(s) that must change (=== path === + fenced block). Omit every unchanged file.
- Single-file: return the full HTML only if necessary; prefer minimal edits.
- Preserve all working logic, art, controls, scoring, multiplayer wiring, and feel.

OUTPUT FORMAT:
Line 1: JSON {"name":"...","desc":"...","summary":"what changed, max 60 chars"}
Then ONLY changed file block(s). Nothing else.`;
}
const LIVE_PATCH_SYSTEM = `You patch a RUNNING browser game with a tiny JavaScript snippet executed via new Function inside the game iframe — NO reload.
- Prefer mutating window.GAME (state, config, player) e.g. GAME.config.enemySpeed *= 1.5.
- Wrap risky work in try/catch. Keep it short.
- If the change needs new HTML/assets/full rewrite, respond with exactly: FULL
OUTPUT: either FULL, or one \`\`\`js fenced block. Nothing else.`;

// ---------------------------------------------------------------- the slop agent
// A real multi-step agent, not a single shot: PLAN → ART → BUILD → TEST & SELF-HEAL → SHIP.
// The headline feature is self-heal: the build runs in a hidden sandbox, and if it throws,
// the agent is handed the EXACT console error(s) and asked to fix the offending file — it
// debugs its own game (up to MAX_FIX passes) until the sandbox is clean. The whole run is
// streamed to a live "run card" stepper so players watch it think, paint, build, and debug.

const MAX_FIX = 5;
const STUDIO_BUILD_MAX = 49152;
const MAX_CONTINUE_PARTS = 8;
const CONTINUE_MSG = 'Your response was cut off mid-output. Continue EXACTLY where you stopped — no preamble, no repetition. Close every open ``` fence and finish ALL remaining files. Do not restart files you already completed.';
const STEP_DEFS = [['discuss', 'Discuss'], ['plan', 'Plan'], ['art', 'Art'], ['build', 'Build'], ['test', 'Test & heal'], ['ship', 'Ship']];

async function agentStream({ model, messages, temperature, maxTokens = STUDIO_BUILD_MAX, onDelta }) {
let full = '';
let convo = messages;
for (let part = 0; part < MAX_CONTINUE_PARTS; part++) {
const chunk = await chatStream({
model, messages: convo, temperature, maxTokens,
onDelta: (_, soFar) => onDelta?.(full + soFar),
});
full += chunk;
if (!chatStream.lastMeta?.truncated) return full;
convo = [
...messages,
{ role: 'assistant', content: full },
{ role: 'user', content: CONTINUE_MSG },
];
}
return full;
}

function makeRunCard() {
const card = document.createElement('div');
card.className = 'tl-run';
const steps = document.createElement('div'); steps.className = 'run-steps';
const nodes = {};
for (const [key, label] of STEP_DEFS) {
const s = document.createElement('div'); s.className = 'run-step'; s.dataset.step = key;
s.innerHTML = `<span class="run-dot"></span><span class="run-label">${label}</span>`;
steps.appendChild(s); nodes[key] = s;
}
const detail = document.createElement('div'); detail.className = 'run-detail';
const body = document.createElement('div'); body.className = 'run-body';
card.append(steps, detail, body);
$('timeline').appendChild(card);
card.scrollIntoView({ behavior: 'smooth', block: 'end' });
return {
el: card, body,
set(key, state, text) {
const n = nodes[key];
if (n) { n.classList.remove('active', 'done', 'bad'); if (state) n.classList.add(state); }
if (text != null) detail.textContent = text;
card.scrollIntoView({ behavior: 'smooth', block: 'end' });
},
detail(text) { detail.textContent = text; card.scrollIntoView({ behavior: 'smooth', block: 'end' }); },
};
}

function renderPlanCard(run, plan) {
const card = document.createElement('div'); card.className = 'run-plan';
const mech = (plan.mechanics || []).map((m) => `<li>${escapeHTML(m)}</li>`).join('');
const files = (plan.files || []).map((f) => `<li><code>${escapeHTML(f.path)}</code>${f.role ? ` — ${escapeHTML(f.role)}` : ''}</li>`).join('');
card.innerHTML =
`${plan.pitch ? `<p class="run-pitch">${escapeHTML(plan.pitch)}</p>` : ''}`
+ `${mech ? `<div class="run-plan-col"><h5>core loop</h5><ul>${mech}</ul></div>` : ''}`
+ `${files ? `<div class="run-plan-col"><h5>files</h5><ul class="run-files">${files}</ul></div>` : ''}`;
run.body.appendChild(card);
}

function parseDiscuss(text) {
const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
let obj = tryParse(text.trim());
if (!obj) { const f = extractFence(text); if (f) obj = tryParse(f.trim()); }
if (!obj) { const m = text.match(/\{[\s\S]*\}/); if (m) obj = tryParse(m[0]); }
if (!obj || !Array.isArray(obj.questions)) return null;
return {
intro: String(obj.intro || '').slice(0, 280),
questions: obj.questions.slice(0, 4).map((q) => ({
id: String(q.id || 'q').slice(0, 24),
text: String(q.text || '').slice(0, 120),
hint: String(q.hint || '').slice(0, 80),
options: Array.isArray(q.options) ? q.options.slice(0, 5).map((o) => String(o).slice(0, 48)) : [],
})).filter((q) => q.text && q.options.length),
};
}

function discussSystemPrompt() {
const mp = game.multiplayer ? 'Multiplayer is ON — ask about player count and co-op vs competitive.' : 'Include one question about single-player vs online multiplayer.';
return `You are the creative director of Slop Studio on SLOP.game. The player described a game idea. React warmly, then ask 3-4 planning questions so the build nails their vision. ${mp}

Respond with ONLY JSON (no markdown):
{"intro":"1-2 sentence enthusiastic reaction","questions":[{"id":"style","text":"What should it feel like?","options":["arcade & juicy","chill & minimal","hardcore skill"],"hint":"optional"}]}

Rules: exactly 3-4 questions, 3-5 options each, short labels. Cover: vibe/art, core mechanic depth, difficulty/progression, and multiplayer if relevant.`;
}

/** Interactive planning card — user picks options or types custom answers. */
function showDiscussUI(run, data) {
return new Promise((resolve) => {
const card = document.createElement('div'); card.className = 'plan-qa';
const answers = {};
let html = `<p class="plan-qa-intro">${escapeHTML(data.intro)}</p>`;
for (const q of data.questions) {
html += `<div class="plan-qa-item" data-qid="${escapeHTML(q.id)}">`
+ `<div class="plan-qa-q">${escapeHTML(q.text)}</div>`
+ (q.hint ? `<div class="plan-qa-hint">${escapeHTML(q.hint)}</div>` : '')
+ `<div class="plan-qa-opts">${q.options.map((o, i) => `<button type="button" class="plan-qa-opt" data-q="${escapeHTML(q.id)}" data-val="${escapeHTML(o)}">${escapeHTML(o)}</button>`).join('')}</div>`
+ `<input class="plan-qa-custom" data-q="${escapeHTML(q.id)}" placeholder="or type your own…" maxlength="80">`
+ `</div>`;
}
html += `<div class="plan-qa-actions">`
+ `<button type="button" class="plan-qa-go">Start building →</button>`
+ `<button type="button" class="plan-qa-skip">Skip — surprise me</button>`
+ `</div>`;
card.innerHTML = html;
run.body.appendChild(card);
card.scrollIntoView({ behavior: 'smooth', block: 'end' });

const pick = (qid, val) => {
answers[qid] = val;
card.querySelectorAll(`.plan-qa-opt[data-q="${qid}"]`).forEach((b) => b.classList.toggle('picked', b.dataset.val === val));
const inp = card.querySelector(`.plan-qa-custom[data-q="${qid}"]`);
if (inp) inp.value = val === inp.value.trim() ? val : inp.value;
};
card.querySelectorAll('.plan-qa-opt').forEach((btn) => {
btn.addEventListener('click', () => pick(btn.dataset.q, btn.dataset.val));
});
card.querySelectorAll('.plan-qa-custom').forEach((inp) => {
inp.addEventListener('input', () => { if (inp.value.trim()) pick(inp.dataset.q, inp.value.trim()); });
});
card.querySelector('.plan-qa-skip').addEventListener('click', () => { card.classList.add('done'); resolve({ skipped: true, answers: {} }); });
card.querySelector('.plan-qa-go').addEventListener('click', () => {
for (const q of data.questions) {
if (!answers[q.id]) {
const inp = card.querySelector(`.plan-qa-custom[data-q="${q.id}"]`);
answers[q.id] = inp?.value.trim() || q.options[0];
}
}
card.classList.add('done');
resolve({ skipped: false, answers });
});
});
}

async function runDiscussPhase(ask, run) {
run.set('discuss', 'active', 'reading your idea…');
showTyping(true);
try {
const full = await chatStream({
model: game.model, temperature: 0.65, maxTokens: 1400,
messages: [{ role: 'system', content: discussSystemPrompt() }, { role: 'user', content: ask }],
});
showTyping(false);
const data = parseDiscuss(full);
if (!data?.questions?.length) {
run.set('discuss', 'done', 'got it — planning…');
return ask;
}
run.set('discuss', 'active', 'your call — pick options below');
tlAgent(data.intro, 'working');
const { skipped, answers } = await showDiscussUI(run, data);
run.set('discuss', 'done', skipped ? 'surprise build!' : 'choices locked in');
if (skipped) return ask;
const lines = [ask, '--- player choices ---'];
for (const q of data.questions) {
if (answers[q.id]) lines.push(`${q.text}: ${answers[q.id]}`);
}
const enriched = lines.join('\n');
enableMultiplayerFromPrompt(enriched, run);
for (const q of data.questions) {
if (answers[q.id]) tlUser(`${q.text} → ${answers[q.id]}`);
}
return enriched;
} catch {
showTyping(false);
run.set('discuss', 'done', 'planning…');
return ask;
}
}
function addErrChip(run, msg) {
const chip = document.createElement('div'); chip.className = 'run-err'; chip.textContent = msg; run.body.appendChild(chip);
}

function normSprite(s) {
return { name: String(s.name || 'sprite').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24), prompt: String(s.prompt || s.name || '').slice(0, 200) };
}

// short, human label for the model that built this game ("powered by" disclosure)
function modelLabel(id) { const m = MODEL_CHOICES.find((x) => x.id === id); return m ? m.label.split(' — ')[0] : id; }

// -------- prompts (planner + debugger; build/edit reuse systemPrompt())
function planSystemPrompt() {
const mp = game.multiplayer ? ' This game MUST include online multiplayer (SlopNet host/join rooms, host-authoritative sync).' : '';
return `You are the lead designer of Slop Studio on SLOP.game. Turn the player's request into a BUILD PLAN for ONE polished browser game (HTML5 canvas/JS, sandboxed iframe).${mp} Think deep: core loop, juice, progression, file layout for a substantial build (up to 50 KB published).

Respond with ONLY a single JSON object — no prose, no markdown, no code fences:
{"name":"Game Name","desc":"one punchy lowercase line, max 90 chars","pitch":"one sentence on why it's fun, max 140 chars","files":[{"path":"index.html","role":"what it holds"},{"path":"js/game.js","role":"main logic"}],"sprites":[{"name":"player","prompt":"detailed art prompt, single centered subject, plain white background, no text"}],"mechanics":["core mechanic","progression","juice/feedback","win/lose","multiplayer flow if applicable"]}

Rules: prefer multi-file (index.html + js/game.js + optional css/) for anything beyond a tiny arcade game. index.html is always the entry. At most 4 sprites. mechanics: 4-8 bullets covering loop, escalation, and feel.`;
}
function healSystemPrompt() {
return `You are the debugger inside Slop Studio. A browser game throws uncaught runtime error(s) in a sandboxed iframe. Find the ROOT CAUSE and fix ONLY the broken code — do NOT rewrite unrelated files or restart from scratch.

${CREATE_RULES}

${MULTIFILE_RULES}

PATCH MODE (critical):
- Multi-file project: return ONLY the file(s) that contain the bug, each as === relative/path === + fenced block. Omit every unchanged file.
- Single-file game: return the complete corrected HTML in one \`\`\`html block.
- Preserve all working logic, art, and structure. Minimal diff.

Return ONLY the patch per OUTPUT FORMAT:
Line 1: single-line JSON: {"name":"...","desc":"...","summary":"what you fixed, max 60 chars"}
Then the patch file(s) — nothing else.`;
}

function parsePlan(text) {
const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
let obj = tryParse(text.trim());
if (!obj) { const f = extractFence(text); if (f) obj = tryParse(f.trim()); }
if (!obj) { const m = text.match(/\{[\s\S]*\}/); if (m) obj = tryParse(m[0]); }
if (!obj || typeof obj !== 'object') return null;
return {
name: String(obj.name || 'untitled slop').slice(0, 60),
desc: String(obj.desc || '').slice(0, 90),
pitch: String(obj.pitch || '').slice(0, 140),
files: Array.isArray(obj.files) ? obj.files.slice(0, 12).map((f) => ({ path: String(f.path || f.name || '').trim(), role: String(f.role || f.purpose || '').slice(0, 80) })).filter((f) => f.path) : [],
sprites: Array.isArray(obj.sprites) ? obj.sprites.slice(0, 4).map(normSprite).filter((s) => s.name && s.prompt) : [],
mechanics: Array.isArray(obj.mechanics) ? obj.mechanics.slice(0, 8).map((m) => String(m).slice(0, 80)) : [],
};
}

function mergeBuild(base, patch) {
const out = { entry: base.entry, files: { ...(base.files || {}) }, meta: patch.meta || base.meta };
if (patch.entry) out.entry = patch.entry;
if (patch.files) Object.assign(out.files, patch.files);
return out;
}

function sourceForPrompt(built) {
const fk = Object.keys(built.files || {});
if (!fk.length) return `\`\`\`html\n${built.entry}\n\`\`\``;
let s = `=== index.html ===\n\`\`\`html\n${built.entry}\n\`\`\``;
for (const p of fk) { const lang = p.endsWith('.css') ? 'css' : p.endsWith('.js') ? 'js' : ''; s += `\n\n=== ${p} ===\n\`\`\`${lang}\n${built.files[p]}\n\`\`\``; }
return s;
}

// -------- phases
async function getPlan(ask, run) {
let raf = null;
const full = await chatStream({
model: game.model, temperature: 0.5, maxTokens: 2000,
messages: [{ role: 'system', content: planSystemPrompt() }, { role: 'user', content: `Game request: ${ask}` }],
onDelta(_, soFar) { if (!raf) raf = requestAnimationFrame(() => { raf = null; run.detail(`designing… ${(soFar.length / 1024).toFixed(1)} KB`); }); },
});
return parsePlan(full) || { name: 'untitled slop', desc: ask.slice(0, 90), pitch: '', files: [{ path: 'index.html', role: 'the game' }], sprites: [], mechanics: [] };
}

async function makeSprites(sprites, run) {
const row = document.createElement('div'); row.className = 'run-sprites'; run.body.appendChild(row);
for (const s of sprites) {
const slot = document.createElement('div'); slot.className = 'run-sprite loading'; slot.title = s.name;
slot.innerHTML = `<span class="run-sprite-name">${escapeHTML(s.name)}</span>`;
row.appendChild(slot);
try {
const url = await imageGen(s.prompt, { maxSize: 192 });
game.sprites[s.name] = url;
const img = document.createElement('img'); img.src = url; slot.prepend(img); slot.classList.remove('loading');
} catch (err) { slot.classList.add('bad'); slot.classList.remove('loading'); slot.title = `${s.name}: ${err.message}`; }
}
renderSprites();
}

async function buildGame(ask, plan, run, depth = 0) {
addRunThought(run, `using ${modelLabel(game.model)} — planning output across ${(plan.files || []).length || 1} file(s)…`);
let raf = null;
const full = await agentStream({
model: game.model, temperature: 0.7,
messages: [
{ role: 'system', content: systemPrompt(false) },
{ role: 'user', content: `Build this game to the approved plan.\n\nPLAYER REQUEST: ${ask}\n\nPLAN:\n${JSON.stringify(plan)}\n\nBuild the complete project now, exactly per the OUTPUT FORMAT.` },
],
onDelta(soFar) { if (!raf) raf = requestAnimationFrame(() => { raf = null; run.detail(`writing… ${(soFar.length / 1024).toFixed(1)} KB`); $('code-view').textContent = soFar; }); },
});
const meta = extractMetaLine(full) || {};
// the build step may still discover it needs art — honor one round of sprite requests
if (Array.isArray(meta.sprites) && meta.sprites.length && depth < 1) {
run.set('art', 'active', `the agent needs ${meta.sprites.length} more sprite(s)…`);
await makeSprites(meta.sprites.slice(0, 4).map(normSprite), run);
run.set('art', 'done'); run.set('build', 'active', 'writing the game…');
return buildGame(ask, plan, run, depth + 1);
}
const built = parseBuild(full);
if (!built) throw new Error('the agent returned something unservable — try rephrasing');
built.meta = meta;
return built;
}

async function healBuild(built, errs, run) {
let raf = null;
const full = await agentStream({
model: game.model, temperature: 0.3,
messages: [
{ role: 'system', content: healSystemPrompt() },
{ role: 'user', content: `This project throws the following uncaught error(s) in a sandboxed iframe (the build is REJECTED if any uncaught error fires):\n\n${errs.map((e) => '- ' + e).join('\n')}\n\nCurrent project:\n${sourceForPrompt(built)}\n\nReturn ONLY the file(s) that need fixing — patch in place, do not rewrite the whole project.` },
],
onDelta(soFar) { if (!raf) raf = requestAnimationFrame(() => { raf = null; $('code-view').textContent = soFar; }); },
});
const fixed = parseBuild(full);
if (!fixed) return built;
fixed.meta = { ...built.meta, ...fixed.meta };
if (fixed.partial || (!fixed.entry && Object.keys(fixed.files || {}).length)) return mergeBuild(built, fixed);
return fixed;
}

async function healUntilClean(built, run) {
for (let attempt = 0; attempt <= MAX_FIX; attempt++) {
const test = await testGameHTML(assemble(bundleFrom(built.entry, built.files)));
if (test.ok) {
built.thumb = test.thumb;
run.set('test', 'done', attempt ? `crash-tested clean (self-healed ${attempt} bug${attempt > 1 ? 's' : ''})` : 'crash-tested clean');
return { built, ok: true, fixes: attempt };
}
if (attempt === MAX_FIX) { run.set('test', 'bad', `couldn't stabilize after ${MAX_FIX} fixes`); return { built, ok: false, error: test.error }; }
const errs = (test.errors && test.errors.length ? test.errors : [test.error]).filter(Boolean);
run.set('test', 'active', `debugging: ${errs[0]} · fix ${attempt + 1}/${MAX_FIX}`);
addErrChip(run, errs[0]);
built = await healBuild(built, errs, run);
}
return { built, ok: false };
}

function commitBuild(built, plan, ask, isEdit) {
if (!isEdit) queueXP({ xp: 50, reason: 'cooked a game in the studio!', unlock: 'first_cook' });
game.history.push({ srcHtml: game.srcHtml, files: { ...game.files } });
if (game.history.length > 6) game.history.shift();
game.srcHtml = built.entry; game.files = built.files || {};
const meta = built.meta || {};
if (!isEdit && (plan?.name || meta.name)) game.name = plan?.name || meta.name;
if (meta.desc || plan?.desc) game.desc = meta.desc || plan.desc;
if (!game.prompt) game.prompt = ask;
if (built.thumb) game.thumb = built.thumb;
game.lastPlan = plan || game.lastPlan;
game.lastModel = game.model;
$('game-title').value = game.name;
refreshFrame(); persist(); renderFiles();
collab?.broadcastBuild();
}

// -------- orchestration
async function runPrompt(ask) {
return game.srcHtml ? runEdit(ask) : runCreate(ask);
}

async function tryStudioLivePatch(ask, run) {
if (!game.srcHtml || !/slop-mod-rx/.test(finalHTML())) return false;
run.set('build', 'active', 'trying a live patch (no rebuild)…');
try {
const full = await chatStream({
model: MODELS.remix, temperature: 0.25, maxTokens: 900,
messages: [
{ role: 'system', content: LIVE_PATCH_SYSTEM },
{ role: 'user', content: `Game source:\n\`\`\`html\n${game.srcHtml}\n\`\`\`\n\nChange (apply live, no reload): ${ask}` },
],
});
if (/^\s*FULL\s*$/i.test(full.trim())) return false;
const code = extractFence(full);
if (!code) return false;
$('play-frame').contentWindow?.postMessage({ __slopmod: code }, '*');
run.set('build', 'done', 'live patch applied');
run.set('test', 'done', 'skipped — runtime patch only');
run.set('ship', 'done', 'game updated in place');
run.el.classList.add('run-done');
run.detail(`live patch: ${ask} — no full rebuild needed`);
addSuggestChips(run, ['sync this change into the source code', 'make it harder', 'add screen shake']);
return true;
} catch { return false; }
}

async function runCreate(ask) {
const run = makeRunCard();
enableMultiplayerFromPrompt(ask, run);
const enriched = await runDiscussPhase(ask, run);
run.set('plan', 'active', 'designing your game…');
const plan = await getPlan(enriched, run);
run.set('plan', 'done', plan.name);
renderPlanCard(run, plan);

if (plan.sprites?.length) { run.set('art', 'active', `painting ${plan.sprites.length} sprite${plan.sprites.length > 1 ? 's' : ''}…`); await makeSprites(plan.sprites, run); }
run.set('art', 'done', Object.keys(game.sprites).length ? `${Object.keys(game.sprites).length} sprite(s) ready` : 'pure shapes — no art needed');

run.set('build', 'active', 'writing the game…');
const built = await buildGame(enriched, plan, run);
run.set('build', 'done');

run.set('test', 'active', 'crash-testing…');
const res = await healUntilClean(built, run);
if (!res.ok) { run.el.classList.add('run-failed'); throw new Error(`couldn't get it running cleanly (last error: ${res.error || 'unknown'}) — try rephrasing or simplifying it.`); }

run.set('ship', 'active', 'plating…');
commitBuild(res.built, plan, enriched, false);
run.set('ship', 'done');
run.el.classList.add('run-done');
const nf = Object.keys(game.files).length;
run.detail(`${game.name} is live — ${projectSizeLabel()}${res.fixes ? ` · self-healed ${res.fixes} bug${res.fixes > 1 ? 's' : ''}` : ''}${nf ? ` · ${nf + 1} files` : ''} · ${modelLabel(game.model)}`);
addSuggestChips(run, ['make it harder and faster', 'add a boss every 5 waves', 'add screen shake and particles', game.multiplayer ? 'add more AI bots in empty slots' : 'add multiplayer co-op']);
}

async function runEdit(ask, depth = 0) {
const run = makeRunCard();
run.set('discuss', 'done', 'editing existing build');
enableMultiplayerFromPrompt(ask, run);
if (depth === 0 && await tryStudioLivePatch(ask, run)) return;

run.set('plan', 'done', 'patching the current build'); run.set('art', 'done');
run.set('build', 'active', 'applying a surgical edit…');
addRunThought(run, 'only changed files will be rewritten — the rest stays intact');
let raf = null;
const full = await agentStream({
model: game.model, temperature: 0.35,
messages: [
{ role: 'system', content: editSystemPrompt() },
{ role: 'user', content: `Current project (${projectSizeLabel()}):\n${currentSourceForPrompt()}\n\nEdit request: ${ask}\n\nReturn ONLY the file(s) that need to change.` },
],
onDelta(soFar) {
if (!raf) raf = requestAnimationFrame(() => {
raf = null;
const kb = (soFar.length / 1024).toFixed(1);
run.detail(`patching… ${kb} KB streamed`);
$('code-view').textContent = soFar;
});
},
});
const meta = extractMetaLine(full) || {};
if (Array.isArray(meta.sprites) && meta.sprites.length && depth < 1) {
run.set('art', 'active', 'generating sprites…');
await makeSprites(meta.sprites.slice(0, 4).map(normSprite), run);
run.set('art', 'done');
return runEdit(ask, depth + 1);
}
let built = parseBuild(full);
if (!built) throw new Error('the agent returned something unservable — try rephrasing');
built = normalizeBuilt(built, meta);
run.set('build', 'done', `patched ${Object.keys(built.files || {}).length ? 'file(s)' : 'build'}`);
run.set('test', 'active', 'crash-testing the patch…');
const res = await healUntilClean(built, run);
if (!res.ok) { run.el.classList.add('run-failed'); throw new Error(`that edit kept crashing (${res.error || 'unknown'}) — your last good build is untouched.`); }
run.set('ship', 'active', 'saving…');
commitBuild(res.built, null, ask, true);
run.set('ship', 'done');
run.el.classList.add('run-done');
run.detail(`${meta.summary || 'edit applied'} — ${projectSizeLabel()}${res.fixes ? ` · self-healed ${res.fixes} bug${res.fixes > 1 ? 's' : ''}` : ''} · ${modelLabel(game.model)}`);
addSuggestChips(run, ['make it harder', 'add more juice', 'generate a sprite for the boss']);
}

// ---------------------------------------------------------------- frame / persist
let frameMonitor = null;
let debugPanel = null;
let errOverlay = null;

function refreshFrame() {
$('play-empty').style.display = 'none';
$('play-frame').style.display = '';
frameMonitor?.destroy();
frameMonitor = attachFrameMonitor($('play-frame'), {
onErrors(errs) {
debugPanel?.setErrors(errs);
errOverlay?.show(errs);
},
});
$('play-frame').srcdoc = finalHTML();
$('code-view').textContent = game.srcHtml || '';
$('restart-btn').disabled = !game.srcHtml;
if (game.srcHtml && isMobileStudio()) setStudioView('preview');
$('open-play').disabled = !game.id;
$('undo-btn').disabled = !game.history.length;
$('download-btn').disabled = !game.srcHtml;
debugPanel?.setErrors([]);
errOverlay?.hide();
}
function persist() {
const record = { name: game.name, desc: game.desc || game.prompt.slice(0, 90), prompt: game.prompt, html: finalHTML(), srcHtml: game.srcHtml, files: game.files, sprites: game.sprites, thumb: game.thumb, multiplayer: game.multiplayer, model: game.model, studio: true };
try {
if (game.id && getCookedGame(game.id)) updateCookedGame(game.id, record);
else { game.id = game.id || `studio-${Math.random().toString(36).slice(2, 8)}`; addCookedGame({ id: game.id, createdAt: Date.now(), ...record }); }
$('open-play').disabled = false;
} catch (err) { toast('storage is full — delete some games from the grid'); console.warn(err); }
}

// ---------------------------------------------------------------- file tree
function renderFiles() {
const tree = $('file-tree');
if (!tree) return;
const all = ['index.html', ...Object.keys(game.files).sort()];
if (!game.srcHtml) { tree.innerHTML = '<div class="ft-item folder">no project yet</div>'; return; }
// group by folder
const groups = {};
for (const p of all) { const i = p.lastIndexOf('/'); const dir = i < 0 ? '' : p.slice(0, i); (groups[dir] ||= []).push(p); }
let html = '';
for (const dir of Object.keys(groups).sort()) {
if (dir) html += `<div class="ft-item folder"> ${dir}/</div>`;
for (const p of groups[dir]) html += `<div class="ft-item${dir ? ' indent' : ''}" data-path="${p}">${p === 'index.html' ? '' : p.endsWith('.css') ? '' : p.endsWith('.js') ? '' : ''} ${p.split('/').pop()}</div>`;
}
tree.innerHTML = html;
tree.querySelectorAll('[data-path]').forEach((el) => el.addEventListener('click', () => {
tree.querySelectorAll('.ft-item').forEach((x) => x.classList.remove('active')); el.classList.add('active');
$('file-content').textContent = el.dataset.path === 'index.html' ? (game.srcHtml || '') : (game.files[el.dataset.path] || '');
}));
const first = tree.querySelector('[data-path]'); if (first) first.click();
}

// ---------------------------------------------------------------- sprites
function downscaleDataUrl(dataUrl, maxSize = 192) {
return new Promise((resolve) => {
const img = new Image();
img.onload = () => { const s = Math.min(1, maxSize / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL('image/png')); };
img.onerror = () => resolve(dataUrl);
img.src = dataUrl;
});
}
function renderSprites() {
const grid = $('sprite-grid');
const names = Object.keys(game.sprites);
// selector
const selRow = $('sprite-select-row'); const sel = $('sprite-select');
selRow.style.display = names.length ? 'flex' : 'none';
sel.innerHTML = names.map((n) => `<option value="${n}">${n}</option>`).join('');
grid.innerHTML = names.length ? '' : '<p class="sprite-intro">no sprites yet — generate one above, upload your own, or just ask for one in the prompt.</p>';
for (const name of names) {
const card = document.createElement('div'); card.className = 'sprite-card';
card.innerHTML = `<img alt="${name}"><span class="sname">${name}</span><div class="srow"><button data-act="use">+ use</button><button data-act="regen"></button><button data-act="del">X</button></div>`;
card.querySelector('img').src = game.sprites[name];
card.querySelector('[data-act="del"]').addEventListener('click', () => { delete game.sprites[name]; renderSprites(); if (game.srcHtml) { refreshFrame(); persist(); } });
card.querySelector('[data-act="use"]').addEventListener('click', () => { addSpriteToPrompt(name); });
card.querySelector('[data-act="regen"]').addEventListener('click', async (e) => { const b = e.target; b.textContent = '…'; try { game.sprites[name] = await imageGen(`game sprite: ${name}, single centered subject, plain white background, no text`, { maxSize: 192 }); renderSprites(); if (game.srcHtml) { refreshFrame(); persist(); } toast(`"${name}" regenerated`); } catch (err) { toast(err.message); b.textContent = ''; } });
grid.appendChild(card);
}
}
function addSpriteToPrompt(name) {
const p = $('prompt'); p.value = (p.value ? p.value.trim() + ' ' : '') + `use the "${name}" sprite for `; p.focus();
document.querySelector('.tab[data-panel="play"]')?.click();
}
async function generateSpriteFromForm() {
const name = $('sprite-name').value.trim().replace(/[^a-zA-Z0-9_]/g, '_');
const prompt = $('sprite-prompt').value.trim();
if (!name || !prompt) { toast('give the sprite a name and a description'); return; }
const btn = $('sprite-gen'); btn.disabled = true; btn.textContent = 'painting…';
try {
game.sprites[name] = await imageGen(`${prompt} — single game sprite, centered, plain white background, no text`, { maxSize: 192 });
queueXP({ xp: 40, reason: 'generated a sprite!', unlock: 'studio_rat' });
renderSprites();
if (game.srcHtml) { refreshFrame(); persist(); toast(`"${name}" is live — tell the agent to use it`); } else toast(`"${name}" saved — it'll wire in when you build`);
$('sprite-prompt').value = '';
} catch (err) { toast(err.message); }
btn.disabled = false; btn.textContent = 'Generate';
}
async function handleSpriteUpload(fileList) {
for (const f of [...fileList].slice(0, 8)) {
if (!f.type.startsWith('image/')) continue;
const name = (f.name.replace(/\.[^.]+$/, '') || 'sprite').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24);
const raw = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
game.sprites[name] = await downscaleDataUrl(raw, 256);
}
renderSprites();
if (game.srcHtml) { refreshFrame(); persist(); }
toast('sprites uploaded — use them in your prompt');
}

// ---------------------------------------------------------------- export
function exportZip() {
if (!game.srcHtml) { toast('build something first'); return; }
const slug = (game.name || 'slop-game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
const files = [
{ name: `${slug}/index.html`, data: finalHTML() }, // standalone, double-click to play
{ name: `${slug}/src/index.html`, data: game.srcHtml }, // raw entry
{ name: `${slug}/README.txt`, data: `${game.name}\n\n${game.desc || ''}\n\nprompt: ${game.prompt}\n\nopen index.html in any browser to play. raw source is in src/.\nmade with slop studio — SLOP.game` },
];
for (const [p, c] of Object.entries(game.files)) files.push({ name: `${slug}/src/${p}`, data: c });
for (const [n, url] of Object.entries(game.sprites)) { try { files.push({ name: `${slug}/sprites/${n}.png`, data: dataUrlToBytes(url) }); } catch { /* */ } }
downloadBlob(makeZip(files), `${slug}.zip`);
toast(`exported ${slug}.zip (${files.length} files)`);
}

// ---------------------------------------------------------------- publish & invites
async function publish() {
if (!game.srcHtml) { toast('build something first'); return null; }
const bytes = projectBytes();
if (bytes > PUBLISH_MAX_BYTES) {
toast(`too big to publish (${(bytes / 1024).toFixed(1)} KB) — max is 50 KB. ask the agent to trim or split files.`);
return null;
}
const me = await api.me();
if (me === null) { toast('sign in on the homepage first, then come back'); return null; }
if (!me.username) { toast('finish setup — pick a username on the homepage first'); return null; }
let res;
try {
res = await api.publishGame({ name: game.name, desc: game.desc || game.prompt.slice(0, 90), prompt: game.prompt, html: finalHTML(), thumb: game.thumb });
} catch (err) { toast(err.message || 'publish failed'); return null; }
game.publishedAs = res.slug; persist();
queueXP({ xp: 60, reason: 'published a game!', unlock: 'publisher' });
try { await navigator.clipboard.writeText(res.url); } catch { /* clipboard optional */ }
toast(`published! link copied — ${res.url}`);
return res.slug;
}
async function openInvite() {
if (!game.srcHtml && !collab?.isHost) { toast('build something first — then invite a friend'); return; }
const modal = $('invite-modal'); const list = $('friend-list'); const note = $('invite-note');
modal.classList.remove('hidden'); list.innerHTML = '<p class="modal-note">loading your friends…</p>'; note.textContent = '';
const data = await api.friends().catch(() => null);
if (!data) { list.innerHTML = '<p class="modal-note">sign in on the homepage to use friends (backend must be running).</p>'; return; }
if (!data.friends?.length) { list.innerHTML = '<p class="modal-note">no friends yet — add some in the Friends panel on the homepage.</p>'; return; }
list.innerHTML = '';
for (const f of data.friends) {
const row = document.createElement('div'); row.className = 'friend-row';
row.innerHTML = `<span>@${f.username}</span><button>Send Invite</button>`;
row.querySelector('button').addEventListener('click', async (e) => {
e.target.disabled = true; e.target.textContent = 'sending…';
try {
let url, blurb;
if (collab?.isHost && collab.roomLink) { url = collab.roomLink; blurb = `@${f.username} gets a link to join your LIVE jam.`; }
else { const cid = game.publishedAs || await publish(); if (!cid) throw new Error('publish failed'); url = `${location.origin}/studio.html?remix=${encodeURIComponent(cid)}`; blurb = `@${f.username} can open your game in their own studio and remix it.`; }
const ok = await api.sendInvite(f.username, 'studio', { name: game.name, url });
if (!ok) throw new Error('backend offline');
e.target.textContent = 'OK sent'; note.textContent = blurb;
} catch (err) { e.target.disabled = false; e.target.textContent = 'Send Invite'; note.textContent = `! ${err.message}`; }
});
list.appendChild(row);
}
}

// ---------------------------------------------------------------- prompt submit
const STUDIO_PROMPT_KEY = 'slop:pending-studio-prompt';

// Building a game requires an account. Stash the prompt, route them to sign-up /
// username, and restore it once they're back (see maybeResumeStudioPrompt).
function ensureAccount(ask) {
const user = getUser();
if (user && user.username) return true;
try { localStorage.setItem(STUDIO_PROMPT_KEY, ask || ''); } catch { /* private mode */ }
toast('create a free account to build a game');
if (user && !user.username) promptUsername(); else openAuthModal();
return false;
}

// When the account becomes ready, drop a stashed prompt back into the box. We
// don't auto-build (studio runs are heavy) — just tee it up to hit Build It.
function maybeResumeStudioPrompt(u) {
if (!u || !u.username) return;
let pend = null; try { pend = localStorage.getItem(STUDIO_PROMPT_KEY); } catch { /* */ }
if (!pend) return;
try { localStorage.removeItem(STUDIO_PROMPT_KEY); } catch { /* */ }
const box = $('prompt');
if (box && !box.value.trim()) { box.value = pend; box.focus(); }
toast('you\'re in — hit Build It to cook your game 🍲');
}

async function submitPrompt() {
const ask = $('prompt').value.trim();
if (!ask || busy) return;
if (collab?.isClient) { collab.postToBoard(ask); tlUser(ask); tlAgent('posted to the host\'s prompt board — they can click it to build it in.', 'good'); $('prompt').value = ''; return; }
if (!ensureAccount(ask)) return;
await runHostPrompt(ask, true);
}
async function runHostPrompt(ask, fromInput) {
if (busy) { toast('still building the last one…'); return; }
busy = true; setAgentThinking(true); $('build-btn').disabled = true; $('build-btn').textContent = game.srcHtml ? 'Editing…' : 'Cooking…';
if (fromInput) { tlUser(ask); $('prompt').value = ''; }
try { await runPrompt(ask); }
catch (err) { tlAgent(`! ${err.message}`, 'bad'); console.error(err); }
finally { busy = false; setAgentThinking(false); setTimeout(() => { $('build-btn').disabled = false; $('build-btn').textContent = collab?.isClient ? 'Post to board' : (game.srcHtml ? 'Apply Edit' : 'Build It'); }, 700); }
}

function initTabs() {
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
tab.classList.add('active'); $(`panel-${tab.dataset.panel}`).classList.add('active');
if (isMobileStudio()) setStudioView('preview');
}));
}

const MOBILE_STUDIO_MQ = window.matchMedia('(max-width: 720px)');
function isMobileStudio() { return MOBILE_STUDIO_MQ.matches; }

function setStudioView(view) {
const main = $('studio-main');
if (!main || !isMobileStudio()) return;
main.classList.remove('view-build', 'view-preview');
main.classList.add(view === 'preview' ? 'view-preview' : 'view-build');
document.querySelectorAll('.studio-mtab').forEach((btn) => {
const on = btn.dataset.studioView === view;
btn.classList.toggle('active', on);
btn.setAttribute('aria-selected', on ? 'true' : 'false');
});
}

function initMobileStudio() {
const drawer = $('topbar-actions');
const menu = $('bar-menu');
if (!drawer || !menu) return;

const closeDrawer = () => {
drawer.classList.remove('open');
menu.setAttribute('aria-expanded', 'false');
};

menu.addEventListener('click', (e) => {
e.stopPropagation();
const open = drawer.classList.toggle('open');
menu.setAttribute('aria-expanded', open ? 'true' : 'false');
});

drawer.addEventListener('click', (e) => {
if (e.target.closest('.bar-btn, .mp-switch')) closeDrawer();
});

document.addEventListener('click', (e) => {
if (!drawer.classList.contains('open')) return;
if (e.target.closest('#topbar-actions, #bar-menu')) return;
closeDrawer();
});

document.querySelectorAll('.studio-mtab').forEach((btn) => {
btn.addEventListener('click', () => setStudioView(btn.dataset.studioView));
});

MOBILE_STUDIO_MQ.addEventListener('change', () => {
if (!isMobileStudio()) {
closeDrawer();
$('studio-main')?.classList.remove('view-build', 'view-preview');
return;
}
if (!$('studio-main')?.classList.contains('view-preview')) setStudioView('build');
});

if (isMobileStudio()) setStudioView('build');
}

async function warnIfStudioNeedsKey() {
const hasKey = !!localStorage.getItem('slop-key');
let proxy = false;
try {
const res = await fetch('/api/config');
if (res.ok) proxy = !!(await res.json())?.ai;
} catch { /* static hosting */ }
if (!hasKey && !proxy) {
tlAgent('on SLOP.game mobile you need your own xAI key — tap Menu → Settings, paste your key, save, then build.', 'bad');
}
}

// ---------------------------------------------------------------- settings
function modelOptionsHTML() {
return MODEL_CHOICES.map((m) => `<option value="${m.id}">${m.tier === 'pro' ? '🔒 ' : ''}${m.label}</option>`).join('');
}

function setBuildModel(id) {
if (!MODEL_CHOICES.some((m) => m.id === id)) id = MODELS.studio;
game.model = id;
localStorage.setItem('slop-model', id);
$('studio-model') && ($('studio-model').value = id);
$('model-select') && ($('model-select').value = id);
}

function initModelPickers() {
const saved = localStorage.getItem('slop-model');
const pick = MODEL_CHOICES.some((m) => m.id === saved) ? saved : 'gpt-5.5';
setBuildModel(pick);
const html = modelOptionsHTML();
for (const id of ['studio-model', 'model-select']) {
const sel = $(id);
if (!sel) continue;
sel.innerHTML = html;
sel.value = game.model;
sel.addEventListener('change', () => setBuildModel(sel.value));
}
}

function initSettings() {
initModelPickers();
$('api-key').value = localStorage.getItem('slop-key') || '';
setUserKey(localStorage.getItem('slop-key') || '');
$('settings-btn').addEventListener('click', () => $('settings-modal').classList.remove('hidden'));
$('settings-close').addEventListener('click', () => $('settings-modal').classList.add('hidden'));
$('settings-save').addEventListener('click', () => {
const key = $('api-key').value.trim();
setBuildModel($('model-select').value);
if (key) localStorage.setItem('slop-key', key); else localStorage.removeItem('slop-key');
setUserKey(key);
$('settings-note').textContent = key ? 'OK using your own key & model' : 'OK model saved — using slop\'s shared access';
setTimeout(() => $('settings-modal').classList.add('hidden'), 900);
toast('settings saved');
});
}

// ---------------------------------------------------------------- boot
async function boot() {
initTabs(); initSettings(); initMobileStudio(); renderSprites(); renderFiles();

// account state powers the build-button gate; resume a stashed prompt on return
initAccount();
onUser(maybeResumeStudioPrompt);

// live shader behind the agent header — dynamically imported so a CDN/WebGL
// failure only drops the visual (CSS gradient fallback) instead of the studio.
import('./hero-shader.js').then(({ mountShader }) => {
const bg = $('studio-shader');
if (bg) agentShader = mountShader(bg, { interactionEl: document.body, ripples: true });
}).catch(() => {});
const wrap = $('play-frame-wrap');
debugPanel = createDebugPanel(wrap);
errOverlay = mountErrorOverlay(wrap, {
onFix(err) {
if (!game.srcHtml || busy) return;
$('prompt').value = `Fix this runtime error:\n${err}`;
$('prompt').focus();
toast('error sent to prompt — hit Build It to patch in place');
},
});
tlAgent('hey — I\'m your game agent. describe anything and I\'ll ask a few planning questions, then build it live. edits patch in place; say "online multiplayer" for shareable rooms.', 'good');
warnIfStudioNeedsKey();

const params = new URLSearchParams(location.search);
const id = params.get('id');
if (id) { const g = getCookedGame(id); if (g) { Object.assign(game, { id: g.id, name: g.name, desc: g.desc, prompt: g.prompt || '', srcHtml: g.srcHtml || g.html, files: g.files || {}, sprites: g.sprites || {}, multiplayer: !!g.multiplayer }); $('game-title').value = game.name; refreshFrame(); renderSprites(); renderFiles(); tlAgent(`loaded "${g.name}" — keep prompting to change it.`, 'good'); } }

const remix = params.get('remix');
if (remix) { tlAgent('pulling that game from the community…', 'working'); const cg = await api.communityGame(remix); if (cg) { Object.assign(game, { id: `studio-${Math.random().toString(36).slice(2, 8)}`, name: `${cg.name} (remix)`, desc: cg.desc, prompt: cg.prompt || '', srcHtml: cg.html, files: {}, sprites: {} }); $('game-title').value = game.name; refreshFrame(); persist(); renderFiles(); tlAgent(`forked "${cg.name}" by @${cg.username} — remix away.`, 'good'); } else tlAgent('couldn\'t fetch that game — is the backend running?', 'bad'); }

const seed = params.get('prompt');
if (seed) { $('prompt').value = seed; if (params.get('auto') === '1') submitPrompt(); }

$('build-btn').addEventListener('click', submitPrompt);
$('prompt').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitPrompt(); });
document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { $('prompt').value = c.textContent; $('prompt').focus(); }));
document.querySelectorAll('.template').forEach((t) => t.addEventListener('click', () => { $('prompt').value = t.dataset.prompt; $('prompt').focus(); }));

const mic = createSpeech({ onText(t) { $('prompt').value = t; }, onState(on) { $('mic-btn').classList.toggle('listening', on); } });
$('mic-btn').addEventListener('click', () => { if (!mic) { toast('no speech recognition here — type instead'); return; } mic.toggle(); });

$('sprite-gen').addEventListener('click', generateSpriteFromForm);
$('sprite-upload-btn').addEventListener('click', () => $('sprite-file').click());
$('sprite-file').addEventListener('change', (e) => { if (e.target.files.length) handleSpriteUpload(e.target.files); e.target.value = ''; });
$('sprite-use').addEventListener('click', () => { const n = $('sprite-select').value; if (n) addSpriteToPrompt(n); });

const mpToggle = $('mp-toggle');
mpToggle.addEventListener('click', () => { game.multiplayer = !game.multiplayer; syncMP(); if (game.srcHtml) { refreshFrame(); persist(); } toast(game.multiplayer ? 'multiplayer ON — SlopNet rooms injected on next build/edit' : 'multiplayer off'); });
syncMP();

$('game-title').addEventListener('change', () => { game.name = $('game-title').value.trim() || 'untitled slop'; if (game.srcHtml) persist(); });
$('undo-btn').addEventListener('click', () => { if (!game.history.length) return; const prev = game.history.pop(); game.srcHtml = prev.srcHtml; game.files = prev.files || {}; refreshFrame(); persist(); renderFiles(); tlAgent('rolled back to the previous build', 'good'); });
$('restart-btn').addEventListener('click', () => { if (game.srcHtml) refreshFrame(); });
$('download-btn').addEventListener('click', exportZip);
$('thumb-btn').addEventListener('click', () => $('thumb-file').click());
$('thumb-file').addEventListener('change', async (e) => {
const file = e.target.files?.[0];
e.target.value = '';
if (!file) return;
if (file.size > 3 * 1024 * 1024) { toast('thumbnail too big — max 3 MB'); return; }
const btn = $('thumb-btn');
btn.disabled = true; btn.textContent = 'Uploading…';
try {
game.thumb = await api.uploadThumb(file);
if (game.srcHtml) persist();
toast('custom thumbnail set — it shows when you publish');
} catch (err) {
toast(err.message || 'thumbnail upload failed');
} finally {
btn.disabled = false; btn.textContent = 'Thumbnail';
}
});
$('open-play').addEventListener('click', () => { if (game.id) window.open(`play.html?id=${encodeURIComponent(game.id)}`, '_blank'); });
$('publish-btn').addEventListener('click', async () => { $('publish-btn').disabled = true; $('publish-btn').textContent = 'Publishing…'; const slug = await publish(); $('publish-btn').disabled = false; $('publish-btn').textContent = slug ? 'OK Published' : 'Publish'; });
$('invite-btn').addEventListener('click', openInvite);
$('invite-close').addEventListener('click', () => $('invite-modal').classList.add('hidden'));

// collaborative jam
collab = initCollab({
onAddPrompt: (text, author) => { tlUser(`${author}: ${text}`); runHostPrompt(text, false); },
getBuild: () => ({ html: finalHTML(), name: game.name }),
setClientBuild: (html, name) => { $('play-empty').style.display = 'none'; $('play-frame').style.display = ''; $('play-frame').srcdoc = html; if (name) { $('game-title').value = name; game.name = name; } },
tl: (t) => tlAgent(t, ''), toast,
});
const pathSeg = location.pathname.slice(1);
const sessionCode = params.get('session') || (/^[A-Za-z0-9][A-Za-z0-9-]{3,48}$/.test(pathSeg) && !pathSeg.includes('.') ? pathSeg : null);
if (sessionCode) { enterClientMode(); collab.joinSession(sessionCode); tlAgent('you joined a live jam! the host is driving. type ideas below — they land on the host\'s prompt board, and you\'ll see every change here live.', 'good'); }
$('collab-toggle').addEventListener('click', () => { if (collab.mode) collab.open(); else collab.startHost(); });
}

function enterClientMode() {
$('build-btn').textContent = 'Post to board';
$('prompt').placeholder = 'suggest an idea — it goes to the host\'s prompt board…';
['publish-btn', 'invite-btn', 'undo-btn', 'mp-toggle', 'sprite-gen', 'download-btn', 'sprite-upload-btn', 'thumb-btn'].forEach((id) => { const e = $(id); if (e) { e.disabled = true; e.style.opacity = .5; e.style.pointerEvents = 'none'; } });
}

boot();
