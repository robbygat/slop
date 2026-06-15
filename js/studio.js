// SLOP STUDIO — the prompt-based game creator agent.
// Describe a game → the agent writes it (single- or multi-file), crash-tests
// it, and boots it in the playtest pane. Keep prompting to edit ANY aspect.
// Generate or upload sprites, flip on multiplayer, run a live collaborative
// jam, bring your own xAI key/model, and export the whole folder as a .zip.

import { chatStream, extractFence, extractMetaLine, imageGen, MODELS, MODEL_CHOICES, setUserKey } from './ai.js';
import { testGameHTML } from './sandbox.js';
import { createSpeech } from './speech.js';
import { api } from './api.js';
import { getCookedGame, addCookedGame, updateCookedGame } from './games-grid.js';
import { SLOPNET_INLINE } from './netcore.js';
import { initCollab } from './studio-collab.js';
import { makeZip, dataUrlToBytes, downloadBlob } from './zip.js';

const $ = (id) => document.getElementById(id);
let collab = null;

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

// ---------------------------------------------------------------- assembly / bundling
const MOD_RECEIVER = `<script id="slop-mod-rx">window.addEventListener('message',function(e){if(e&&e.data&&e.data.__slopmod){try{(new Function(e.data.__slopmod))();}catch(err){console.warn('slopmod',err);}}});<\/script>`;

function injectHead(html, tag) {
if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + '\n' + tag);
if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + '\n<head>' + tag + '</head>');
return tag + html;
}
function stripInjected(html) {
return html
.replace(/<script id="slop-sprites">[\s\S]*?<\/script>\n?/i, '')
.replace(/<script id="slop-mod-rx">[\s\S]*?<\/script>\n?/i, '')
.replace(/<!--slopnet-->[\s\S]*?<!--\/slopnet-->\n?/i, '');
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
out = injectHead(out, MOD_RECEIVER);
if (Object.keys(sprites).length) out = injectHead(out, `<script id="slop-sprites">window.SPRITES=${JSON.stringify(sprites)};</scr` + `ipt>`);
if (multiplayer) out = injectHead(out, `<!--slopnet-->${SLOPNET_INLINE}<!--/slopnet-->`);
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
function tlUser(text) { const el = document.createElement('div'); el.className = 'tl-user'; el.textContent = text; $('timeline').appendChild(el); el.scrollIntoView({ behavior: 'smooth', block: 'end' }); }
function tlAgent(text, cls = '') { const el = document.createElement('div'); el.className = `tl-agent ${cls}`; el.textContent = text; $('timeline').appendChild(el); el.scrollIntoView({ behavior: 'smooth', block: 'end' }); return el; }
function toast(text) { const el = $('studio-toast'); el.textContent = text; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2800); }
function queueXP(e) { try { const q = JSON.parse(localStorage.getItem('slop-xp-queue') || '[]'); q.push(e); localStorage.setItem('slop-xp-queue', JSON.stringify(q)); } catch { /* */ } }

// ---------------------------------------------------------------- prompts
const CREATE_RULES = `HARD REQUIREMENTS:
- The game runs inside a sandboxed iframe: never use localStorage, cookies, alert/prompt/confirm, or top-level navigation. Attach key listeners to window. Canvas scales to fit the viewport. No external resources except (optionally) a CDN <script> when truly needed.
- It must not throw any runtime errors — the build is rejected if the console sees a single uncaught error. Guard everything.
- Playable instantly: show controls on screen, start on first input or a big start button, include score and a lose (and/or win) state with instant restart (key R + button).
- Make it FUN and JUICY: screen shake, particles, color pops, escalating difficulty.`;

function spriteRules() {
const names = Object.keys(game.sprites);
return `SPRITES (images the game can draw): the shell injects window.SPRITES = { name: dataURL }. Available now: ${names.length ? names.join(', ') : '(none yet)'}.
- To USE sprites: at boot do — const SPR={}; for(const k in (window.SPRITES||{})){const i=new Image();i.src=window.SPRITES[k];SPR[k]=i;} — then ctx.drawImage(SPR.player,x-w/2,y-h/2,w,h). ALWAYS keep a shape fallback so a missing sprite never breaks the game.
- If the request needs NEW art that doesn't exist, respond with ONLY this line (no code): {"sprites":[{"name":"short","prompt":"detailed, single centered subject, plain white background, no text"}]} (max 4). The shell generates them and re-invokes you.`;
}
const LIVE_MOD_RULES = `LIVE REMIX: expose the game's live state + tunables on window.GAME (e.g. window.GAME={state,player,config,...}) and keep difficulty/speed numbers in window.GAME.config, so a one-line patch like GAME.config.speed*=2 takes effect with no reload.`;
const MULTIFILE_RULES = `PROJECT STRUCTURE: small games = a single \`\`\`html block. For bigger games you MAY split into multiple files and folders. To do that, output one fenced block per file, each immediately preceded by a line: === relative/path.ext === (e.g. === index.html ===, === js/game.js ===, === css/style.css ===). index.html is the entry and must reference the others with relative <script src="js/game.js"> / <link href="css/style.css"> (the shell bundles them for play). Use folders (js/, css/) when it helps.`;
function multiplayerRules() {
return `MULTIPLAYER (REQUIRED): the shell injects window.SlopNet (host-authoritative WebRTC). Build with it: SlopNet.available(); SlopNet.host(code=>{}); SlopNet.join(roomCode,()=>{}); SlopNet.on('join'|'leave'|'input'|'state'|'init'|'connected'|'disconnected'|'error',fn); SlopNet.assignId(conn,id); SlopNet.broadcastState(obj); SlopNet.sendInput(obj); SlopNet.isHost; SlopNet.shareLink(). HOST simulates + broadcastState ~20Hz; CLIENTS sendInput ~30Hz and render received 'state'. Title screen with Single Player + Host buttons; show shareLink() to copy; auto-join from ?room=CODE; fill empty slots with AI; fall back to single-player if unavailable.`;
}
function systemPrompt(isEdit) {
return `You are the build agent inside Slop Studio on slop.game — you turn plain-english prompts into complete, genuinely playable browser games and edit them on request. The player prompts EVERY aspect: rules, art, sprites, sound, difficulty, levels.

${CREATE_RULES}

${MULTIFILE_RULES}

${spriteRules()}

${LIVE_MOD_RULES}

${game.multiplayer ? multiplayerRules() : ''}

${isEdit ? `EDIT MODE: you receive the project's current files. Apply the request, change only what it needs, preserve everything else, and return the COMPLETE UPDATED project (same file layout, or refactor into files if asked).` : `CREATE MODE: build from scratch.`}

OUTPUT FORMAT (STRICT):
Line 1: single-line JSON: {"name":"Game Name","desc":"one punchy lowercase line, max 90 chars","summary":"what you did, max 60 chars"}
Then EITHER one \`\`\`html block (single-file) OR multiple \`=== path ===\` + fenced blocks (multi-file). Nothing else.
(EXCEPTION: a sprite request per SPRITES is line 1 JSON only.)`;
}

// ---------------------------------------------------------------- agent loop
async function runPrompt(ask, depth = 0) {
const isEdit = !!game.srcHtml;
const status = tlAgent(isEdit ? 'reading the current build…' : 'cooking from scratch…', 'working');
const messages = [
{ role: 'system', content: systemPrompt(isEdit) },
{ role: 'user', content: isEdit ? `Current project:\n${currentSourceForPrompt()}\n\nRequest: ${ask}` : `Build this game: ${ask}` },
];
let raf = null;
const full = await chatStream({
model: game.model, messages, temperature: isEdit ? 0.4 : 0.7,
onDelta(_, soFar) { if (!raf) raf = requestAnimationFrame(() => { raf = null; status.textContent = `writing… ${(soFar.length / 1024).toFixed(1)} KB`; $('code-view').textContent = soFar; }); },
});

const meta = extractMetaLine(full) || {};
if (Array.isArray(meta.sprites) && meta.sprites.length && depth < 1) {
status.textContent = `the agent wants ${meta.sprites.length} sprite${meta.sprites.length > 1 ? 's' : ''} — generating…`;
const row = document.createElement('div'); row.className = 'tl-sprite-row'; status.appendChild(row);
for (const s of meta.sprites.slice(0, 4)) {
const name = String(s.name || 'sprite').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24);
try { const url = await imageGen(s.prompt || name, { maxSize: 192 }); game.sprites[name] = url; const img = document.createElement('img'); img.src = url; img.title = name; row.appendChild(img); }
catch (err) { tlAgent(`sprite "${name}" failed: ${err.message}`, 'bad'); }
}
renderSprites(); status.textContent = 'sprites ready — continuing…'; return runPrompt(ask, depth + 1);
}

const built = parseBuild(full);
if (!built) throw new Error('the agent returned something unservable — try rephrasing');

status.textContent = 'crash-testing the build…';
const test = await testGameHTML(assemble(bundleFrom(built.entry, built.files)));
if (!test.ok) throw new Error(`build rejected — it crashed in testing (${test.error}). your last good build is untouched.`);
if (!isEdit) queueXP({ xp: 50, reason: 'cooked a game in the studio!', unlock: 'first_cook' });

game.history.push({ srcHtml: game.srcHtml, files: { ...game.files } });
if (game.history.length > 6) game.history.shift();
game.srcHtml = built.entry; game.files = built.files || {};
if (meta.name && !isEdit) game.name = meta.name;
if (meta.desc) game.desc = meta.desc;
if (!game.prompt) game.prompt = ask;
game.thumb = test.thumb || game.thumb;

$('game-title').value = game.name;
refreshFrame(); persist(); renderFiles();
collab?.broadcastBuild();
status.className = 'tl-agent good';
const nf = Object.keys(game.files).length;
status.textContent = `OK ${meta.summary || (isEdit ? 'edit applied' : `${game.name} is live`)} — crash-tested · ${nf ? (nf + 1) + ' files · ' : ''}${(built.entry.length / 1024).toFixed(1)} KB`;
}

// ---------------------------------------------------------------- frame / persist
function refreshFrame() {
$('play-empty').style.display = 'none';
$('play-frame').style.display = '';
$('play-frame').srcdoc = finalHTML();
$('code-view').textContent = game.srcHtml || '';
$('restart-btn').disabled = !game.srcHtml;
$('open-play').disabled = !game.id;
$('undo-btn').disabled = !game.history.length;
$('download-btn').disabled = !game.srcHtml;
}
function persist() {
const record = { name: game.name, desc: game.desc || game.prompt.slice(0, 90), prompt: game.prompt, html: finalHTML(), srcHtml: game.srcHtml, files: game.files, sprites: game.sprites, thumb: game.thumb, multiplayer: game.multiplayer, studio: true };
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
{ name: `${slug}/README.txt`, data: `${game.name}\n\n${game.desc || ''}\n\nprompt: ${game.prompt}\n\nopen index.html in any browser to play. raw source is in src/.\nmade with slop studio — slop.game` },
];
for (const [p, c] of Object.entries(game.files)) files.push({ name: `${slug}/src/${p}`, data: c });
for (const [n, url] of Object.entries(game.sprites)) { try { files.push({ name: `${slug}/sprites/${n}.png`, data: dataUrlToBytes(url) }); } catch { /* */ } }
downloadBlob(makeZip(files), `${slug}.zip`);
toast(`exported ${slug}.zip (${files.length} files)`);
}

// ---------------------------------------------------------------- publish & invites
async function publish() {
if (!game.srcHtml) { toast('build something first'); return null; }
const me = await api.me();
if (me === null) { toast('sign in on the homepage first, then come back'); return null; }
const res = await api.publishGame({ name: game.name, desc: game.desc || game.prompt.slice(0, 90), prompt: game.prompt, html: finalHTML(), thumb: game.thumb });
if (!res) { toast('the backend is offline — run node server.js'); return null; }
game.publishedAs = res.id; persist();
queueXP({ xp: 60, reason: 'published a game!', unlock: 'publisher' });
return res.id;
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
async function submitPrompt() {
const ask = $('prompt').value.trim();
if (!ask || busy) return;
if (collab?.isClient) { collab.postToBoard(ask); tlUser(ask); tlAgent('posted to the host\'s prompt board — they can click it to build it in.', 'good'); $('prompt').value = ''; return; }
await runHostPrompt(ask, true);
}
async function runHostPrompt(ask, fromInput) {
if (busy) { toast('still building the last one…'); return; }
busy = true; $('build-btn').disabled = true; $('build-btn').textContent = game.srcHtml ? 'Editing…' : 'Cooking…';
if (fromInput) { tlUser(ask); $('prompt').value = ''; }
try { await runPrompt(ask); }
catch (err) { tlAgent(`! ${err.message}`, 'bad'); console.error(err); }
finally { busy = false; setTimeout(() => { $('build-btn').disabled = false; $('build-btn').textContent = collab?.isClient ? 'Post to board' : (game.srcHtml ? 'Apply Edit' : 'Build It'); }, 700); }
}

function initTabs() {
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
tab.classList.add('active'); $(`panel-${tab.dataset.panel}`).classList.add('active');
}));
}

// ---------------------------------------------------------------- settings
function initSettings() {
const sel = $('model-select');
sel.innerHTML = MODEL_CHOICES.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
sel.value = game.model;
$('api-key').value = localStorage.getItem('slop-key') || '';
setUserKey(localStorage.getItem('slop-key') || '');
$('settings-btn').addEventListener('click', () => $('settings-modal').classList.remove('hidden'));
$('settings-close').addEventListener('click', () => $('settings-modal').classList.add('hidden'));
$('settings-save').addEventListener('click', () => {
const key = $('api-key').value.trim();
game.model = sel.value;
localStorage.setItem('slop-model', game.model);
if (key) localStorage.setItem('slop-key', key); else localStorage.removeItem('slop-key');
setUserKey(key);
$('settings-note').textContent = key ? 'OK using your own key & model' : 'OK model saved — using slop\'s shared access';
setTimeout(() => $('settings-modal').classList.add('hidden'), 900);
toast('settings saved');
});
}

// ---------------------------------------------------------------- boot
async function boot() {
initTabs(); initSettings(); renderSprites(); renderFiles();
tlAgent('welcome to the studio. describe a game — any game — and I\'ll build it. then keep talking: "make it harder", "the hero is a dragon", "generate a sprite for the boss", "split this into files", "add multiplayer". every aspect is promptable.', '');

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

const mpToggle = $('mp-toggle'); const syncMP = () => mpToggle.classList.toggle('on', game.multiplayer);
mpToggle.addEventListener('click', () => { game.multiplayer = !game.multiplayer; syncMP(); if (game.srcHtml) { refreshFrame(); persist(); } toast(game.multiplayer ? 'multiplayer ON — your next build gets a shareable room' : 'multiplayer off'); });
syncMP();

$('game-title').addEventListener('change', () => { game.name = $('game-title').value.trim() || 'untitled slop'; if (game.srcHtml) persist(); });
$('undo-btn').addEventListener('click', () => { if (!game.history.length) return; const prev = game.history.pop(); game.srcHtml = prev.srcHtml; game.files = prev.files || {}; refreshFrame(); persist(); renderFiles(); tlAgent('rolled back to the previous build', 'good'); });
$('restart-btn').addEventListener('click', () => { if (game.srcHtml) refreshFrame(); });
$('download-btn').addEventListener('click', exportZip);
$('open-play').addEventListener('click', () => { if (game.id) window.open(`play.html?id=${encodeURIComponent(game.id)}`, '_blank'); });
$('publish-btn').addEventListener('click', async () => { $('publish-btn').disabled = true; $('publish-btn').textContent = 'Publishing…'; const cid = await publish(); $('publish-btn').disabled = false; $('publish-btn').textContent = cid ? 'OK Published' : 'Publish'; if (cid) toast('published — it\'s in the community grid'); });
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
['publish-btn', 'invite-btn', 'undo-btn', 'mp-toggle', 'sprite-gen', 'download-btn', 'sprite-upload-btn'].forEach((id) => { const e = $(id); if (e) { e.disabled = true; e.style.opacity = .5; e.style.pointerEvents = 'none'; } });
}

boot();
