// Player page for AI-cooked games: runs the game in a sandboxed iframe and
// powers the live remix drawer — typed or spoken edits go to Grok, the rewrite
// is crash-tested in a hidden sandbox, and only a passing build gets
// hot-swapped into the iframe (so remixes can't brick your game).

import { chatStream, extractFence, extractMetaLine, MODELS } from './ai.js';
import { getCookedGame, updateCookedGame, addCookedGame } from './games-grid.js';
import { recordPlay } from './plays.js';
import { testGameHTML } from './sandbox.js';
import { createSpeech } from './speech.js';
import { api, escapeHTML, timeAgo } from './api.js';

const REMIX_SYSTEM = `You are the live remix engine for slop.game. You receive the COMPLETE source of an existing self-contained browser game plus a player's edit request. Apply the edit and return the COMPLETE UPDATED document.

RULES:
- Keep it ONE self-contained HTML file: inline <style>/<script>, no external resources, no localStorage/alert/prompt, must run in a sandboxed iframe.
- It must not throw any runtime errors — the rewrite is automatically rejected if a single uncaught error occurs. Guard everything.
- Change only what the request requires; preserve everything else (controls, scoring, restart, feel).
- Keep it working — broken output is the only failure mode.

OUTPUT FORMAT (STRICT):
Line 1: single-line JSON: {"summary":"what changed, max 60 chars","name":"Game Name","desc":"one-line description"} (keep name/desc the same unless the edit changes the game's identity)
Then exactly one \`\`\`html fenced code block with the full updated document. Nothing else.`;

const $ = (id) => document.getElementById(id);
const frame = $('game-frame');

const params = new URLSearchParams(location.search);
const id = params.get('id');
// Resolve a published game from the pretty path /play/{slug}, ?slug=, or the
// legacy ?cid= query. Local AI-cooked games still come in via ?id=.
const pathSlug = (location.pathname.match(/^\/play\/([a-z0-9-]+)\/?$/i) || [])[1];
const slug = pathSlug || params.get('slug') || params.get('cid');
let game = id ? getCookedGame(id) : null;
let isCommunity = false;

async function boot() {
if (slug) {
const cg = await api.communityGame(slug);
if (cg) {
game = { ...cg, id: cg.slug };
isCommunity = true;
// normalise the address bar to the shareable pretty URL
if (location.pathname !== `/play/${cg.slug}`) history.replaceState(null, '', `/play/${cg.slug}`);
}
}
if (!game) {
$('game-name').textContent = slug
? 'game not found — it may have been removed by a moderator'
: 'game not found — cook one on the homepage';
$('remix-toggle').style.display = 'none';
$('publish-btn').style.display = 'none';
return;
}
$('game-name').textContent = game.name;
$('game-pill').textContent = isCommunity
? `by @${game.username}`
: (game.remixOf ? 'remix' : 'AI-cooked');
document.title = `${game.name} — slop.game`;
frame.srcdoc = game.html;
recordPlay(isCommunity ? game.slug : id); // count this as a real play

// hand off to the full studio (cooked games open directly; community games fork)
const studioBtn = $('studio-btn');
studioBtn.style.display = '';
studioBtn.href = isCommunity
? `studio.html?remix=${encodeURIComponent(game.slug)}`
: `studio.html?id=${encodeURIComponent(game.id)}`;

initPublish();
if (isCommunity && game.gameId) initComments(game.gameId);
if (params.get('remix') === '1') openDrawer(true);
}

// ---------------------------------------------------------------- comments
function commentHTML(c, viewer) {
  const canDel = viewer && (viewer.id === c.user_id || viewer.is_moderator);
  const av = c.avatar_url
    ? `<img class="comment-av" src="${escapeHTML(c.avatar_url)}" alt="">`
    : `<span class="comment-av comment-av-fb">${escapeHTML((c.username[0] || 'S').toUpperCase())}</span>`;
  return `<div class="comment" data-id="${escapeHTML(c.id)}">
    ${av}
    <div class="comment-body">
      <div class="comment-head">
        <a class="comment-user" href="/${escapeHTML(c.username)}">@${escapeHTML(c.username)}</a>
        <span class="comment-time">${timeAgo(c.created_at)}</span>
        ${canDel ? '<button class="comment-del" title="delete">delete</button>' : ''}
      </div>
      <div class="comment-text">${escapeHTML(c.body)}</div>
    </div>
  </div>`;
}

async function initComments(gameId) {
  const sec = document.getElementById('comments-sec');
  if (!sec) return;
  sec.hidden = false;
  const list = document.getElementById('comments-list');
  const input = document.getElementById('comment-input');
  const sendBtn = document.getElementById('comment-send');
  const compose = document.getElementById('comment-compose');
  const signin = document.getElementById('comments-signin');

  const viewer = await api.me().catch(() => null);
  const signedIn = !!viewer?.username;
  compose.style.display = signedIn ? '' : 'none';
  signin.hidden = signedIn;

  async function refresh() {
    const comments = await api.gameComments(gameId);
    document.getElementById('comments-count').textContent = comments.length;
    list.innerHTML = comments.length
      ? comments.map((c) => commentHTML(c, viewer)).join('')
      : `<div class="comments-empty">no comments yet — be the first.</div>`;
  }

  sendBtn?.addEventListener('click', async () => {
    const body = input.value.trim();
    if (!body) return;
    sendBtn.disabled = true;
    try {
      await api.addComment(gameId, body);
      input.value = '';
      await refresh();
    } catch (err) {
      $('status') && ($('status').textContent = err.message);
    } finally {
      sendBtn.disabled = false;
    }
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendBtn.click();
  });

  list.addEventListener('click', async (e) => {
    const del = e.target.closest('.comment-del');
    if (!del) return;
    const row = del.closest('.comment');
    if (!window.confirm('Delete this comment?')) return;
    const ok = await api.deleteComment(row.dataset.id);
    if (ok) { row.remove(); const n = list.querySelectorAll('.comment').length; document.getElementById('comments-count').textContent = n; }
  });

  refresh();
}

// ---------------------------------------------------------------- publish

function initPublish() {
const btn = $('publish-btn');
if (isCommunity || game.publishedAs) btn.style.display = 'none';
btn.addEventListener('click', async () => {
if (isCommunity || game.publishedAs) return;
btn.disabled = true;
btn.textContent = 'Publishing…';
try {
const me = await api.me();
if (me === null) throw new Error('sign in on the homepage first, then come back to publish');
if (!me.username) throw new Error('pick a username on the homepage first, then come back to publish');
const res = await api.publishGame({
name: game.name, desc: game.desc, prompt: game.prompt, html: game.html, thumb: game.thumb,
});
game = updateCookedGame(game.id, { publishedAs: res.slug }) || game;
try { await navigator.clipboard.writeText(res.url); } catch { /* clipboard optional */ }
btn.textContent = 'OK Published';
$('status').textContent = `published — link copied: ${res.url}`;
} catch (err) {
btn.disabled = false;
btn.textContent = 'Publish';
$('status').textContent = `! ${err.message}`;
}
});
}

function openDrawer(open) {
$('drawer').classList.toggle('open', open);
$('remix-toggle').classList.toggle('on', open);
}

$('remix-toggle').addEventListener('click', () =>
openDrawer(!$('drawer').classList.contains('open')));

// ---------------------------------------------------------------- select-to-remix
// Let the player drag a box over the running game to target a change at a
// specific area. The iframe is sandboxed (opaque), so we can't read its pixels —
// instead we capture the box as a normalized region and hand grok a spatial hint.

const selOverlay = $('sel-overlay');
const selBox = $('sel-box');
const frameWrap = $('frame-wrap');
let selection = null; // { x, y, w, h } in 0..1 of the game frame, or null

function regionLabel(s) {
const cx = s.x + s.w / 2;
const cy = s.y + s.h / 2;
// a near-full-frame box is "the whole screen"
if (s.w > 0.8 && s.h > 0.8) return 'the whole screen';
const col = cx < 0.34 ? 'left' : cx > 0.66 ? 'right' : 'center';
const row = cy < 0.34 ? 'top' : cy > 0.66 ? 'bottom' : 'middle';
if (row === 'middle' && col === 'center') return 'the center';
if (row === 'middle') return `the ${col} side`;
if (col === 'center') return `the ${row} ${col}`.replace('center', 'middle');
return `the ${row}-${col}`;
}

// A spatial sentence prepended to the model request when a region is selected.
function selectionContext() {
if (!selection) return '';
const s = selection;
const pct = (n) => Math.round(n * 100);
return `The player boxed a specific area of the game screen to focus this change on: ${regionLabel(s)} — roughly x ${pct(s.x)}%–${pct(s.x + s.w)}%, y ${pct(s.y)}%–${pct(s.y + s.h)}% of the play area. Concentrate the change on whatever is in that region.`;
}

function setSelectMode(on) {
selOverlay.classList.toggle('active', on);
const btn = $('select-btn');
btn.classList.toggle('on', on);
btn.textContent = on ? 'OK drag a box on the game…' : 'Select a part to change';
}

function clearSelection() {
selection = null;
selBox.classList.remove('show');
$('sel-chip').hidden = true;
}
$('sel-clear').addEventListener('click', clearSelection);

$('select-btn').addEventListener('click', () => setSelectMode(!selOverlay.classList.contains('active')));

// drag to draw the box (pointer events cover mouse + touch)
let dragStart = null;
selOverlay.addEventListener('pointerdown', (e) => {
dragStart = { x: e.clientX, y: e.clientY };
selOverlay.setPointerCapture(e.pointerId);
selBox.classList.add('show');
drawBox(e.clientX, e.clientY);
});
selOverlay.addEventListener('pointermove', (e) => { if (dragStart) drawBox(e.clientX, e.clientY); });
selOverlay.addEventListener('pointerup', (e) => {
if (!dragStart) return;
const rect = frameWrap.getBoundingClientRect();
const x1 = Math.min(dragStart.x, e.clientX), x2 = Math.max(dragStart.x, e.clientX);
const y1 = Math.min(dragStart.y, e.clientY), y2 = Math.max(dragStart.y, e.clientY);
dragStart = null;
const w = (x2 - x1) / rect.width, h = (y2 - y1) / rect.height;
if (w < 0.03 || h < 0.03) { clearSelection(); setSelectMode(false); return; } // a stray click
selection = {
x: Math.max(0, (x1 - rect.left) / rect.width),
y: Math.max(0, (y1 - rect.top) / rect.height),
w: Math.min(1, w), h: Math.min(1, h),
};
$('sel-label').textContent = regionLabel(selection);
$('sel-chip').hidden = false;
setSelectMode(false);
});

function drawBox(cx, cy) {
const rect = frameWrap.getBoundingClientRect();
const x1 = Math.min(dragStart.x, cx) - rect.left, x2 = Math.max(dragStart.x, cx) - rect.left;
const y1 = Math.min(dragStart.y, cy) - rect.top, y2 = Math.max(dragStart.y, cy) - rect.top;
selBox.style.left = `${x1}px`;
selBox.style.top = `${y1}px`;
selBox.style.width = `${x2 - x1}px`;
selBox.style.height = `${y2 - y1}px`;
}

// ---------------------------------------------------------------- voice input

const mic = createSpeech({
onText(text) { $('remix-input').value = text; },
onState(listening) {
$('mic-btn').classList.toggle('listening', listening);
$('status').textContent = listening ? 'listening… speak your edit' : '';
},
});

$('mic-btn').addEventListener('click', () => {
if (!mic) {
$('status').textContent = 'this browser has no speech recognition — type instead';
return;
}
mic.toggle();
});

// ---------------------------------------------------------------- remix

let busy = false;

const LIVE_SYSTEM = `You are the LIVE remix engine for slop.game. You get a running browser game's full source and a player's change request. Respond with a tiny JavaScript patch that applies the change to the ALREADY-RUNNING game with NO reload. It is executed inside the game via new Function(yourCode).
- Prefer mutating the game's exposed state/tunables (look for a global like window.GAME, GAME.config, GAME.player, etc. in the source) — e.g. GAME.config.speed *= 2.
- You may patch functions/prototypes the source defines (capture the original in a local const first, then call it — never re-look-up the same property inside the replacement, that's infinite recursion).
- Wrap risky work in try/catch. Keep it short and focused on the request. Do NOT return HTML.
- If the change genuinely cannot be done as a live patch (needs a full rewrite / new assets), respond with exactly: FULL

OUTPUT: either the single word FULL, or one \`\`\`js fenced code block with the patch. Nothing else.`;

async function liveTweak(request, displayReq = request) {
const status = $('status');
const codeView = $('code-view');
status.textContent = 'writing a live patch…';
let raf = null;
const full = await chatStream({
model: MODELS.remix,
messages: [
{ role: 'system', content: LIVE_SYSTEM },
{ role: 'user', content: `Game source:\n\`\`\`html\n${game.html}\n\`\`\`\n\nChange (apply live): ${request}` },
],
maxTokens: 1400,
temperature: 0.3,
onDelta(_, soFar) { if (!raf) raf = requestAnimationFrame(() => { raf = null; codeView.textContent = soFar; codeView.scrollTop = codeView.scrollHeight; }); },
});
if (/^\s*FULL\s*$/i.test(full)) return false; // model wants a full rewrite
const code = extractFence(full);
if (!code) return false;
// fire it into the running game (the injected receiver runs it; no reload)
frame.contentWindow?.postMessage({ __slopmod: code }, '*');
status.textContent = 'patched the running game — no reload';
const chip = document.createElement('div');
chip.className = 'edit-chip';
chip.textContent = `${displayReq}`;
$('edits-list').prepend(chip);
$('remix-input').value = '';
clearSelection();
try { const q = JSON.parse(localStorage.getItem('slop-xp-queue') || '[]'); q.push({ xp: 30, reason: 'remixed live!', unlock: 'remixer' }); localStorage.setItem('slop-xp-queue', JSON.stringify(q)); } catch { /* */ }
return true;
}

async function applyRemix() {
const request = $('remix-input').value.trim();
if (!request || busy || !game) return;

// when an area is boxed, hand the model a spatial hint but keep chips readable
const region = selectionContext();
const modelRequest = region ? `${region}\n\n${request}` : request;

busy = true;
const btn = $('apply-btn');
const status = $('status');
const codeView = $('code-view');
btn.disabled = true;
btn.textContent = 'Remixing…';
codeView.textContent = '';
status.textContent = 'grok is rewriting the game…';

// live mode: try a no-reload JS patch first (game must carry the receiver)
if ($('live-mode')?.checked && !$('save-as-new').checked && /slop-mod-rx/.test(game.html || '')) {
try {
if (await liveTweak(modelRequest, request)) { busy = false; btn.disabled = false; btn.textContent = 'Apply Remix'; return; }
status.textContent = 'that one needs a full rebuild — rewriting…';
} catch (e) { status.textContent = 'live patch failed — falling back to full rewrite…'; }
}

let raf = null;

try {
const full = await chatStream({
model: MODELS.remix,
messages: [
{ role: 'system', content: REMIX_SYSTEM },
{
role: 'user',
content: `Current game source:\n\`\`\`html\n${game.html}\n\`\`\`\n\nEdit request: ${modelRequest}`,
},
],
temperature: 0.4,
onDelta(_, soFar) {
if (!raf) {
raf = requestAnimationFrame(() => {
raf = null;
codeView.textContent = soFar;
codeView.scrollTop = codeView.scrollHeight;
status.textContent = `rewriting… ${(soFar.length / 1024).toFixed(1)} KB`;
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
if (!html || !/<html/i.test(html)) throw new Error('remix came back unservable — try rephrasing');

// crash-test the rewrite before it replaces the running game
status.textContent = 'crash-testing the remix…';
const test = await testGameHTML(html);
if (!test.ok) {
throw new Error(`remix rejected — it crashed in testing (${test.error}). your game is untouched, try rephrasing`);
}

const patch = {
html,
name: meta.name || game.name,
desc: meta.desc || game.desc,
thumb: test.thumb || game.thumb,
};

if ($('save-as-new').checked || isCommunity) {
// remixing someone else's community game always forks it into your library
const fresh = addCookedGame({
name: game.name,
desc: game.desc,
...patch,
id: `${game.id}-rmx-${Math.random().toString(36).slice(2, 6)}`,
remixOf: game.id,
prompt: request,
createdAt: Date.now(),
});
history.replaceState(null, '', `play.html?id=${encodeURIComponent(fresh.id)}`);
game = fresh;
isCommunity = false;
$('game-pill').textContent = 'remix';
$('publish-btn').style.display = '';
$('publish-btn').disabled = false;
$('publish-btn').textContent = 'Publish';
} else {
game = updateCookedGame(game.id, patch) || { ...game, ...patch };
}

// the visible moment: hot-swap the running game
frame.srcdoc = game.html;
$('game-name').textContent = game.name;
status.textContent = `OK ${meta.summary || 'remix applied'} — crash-tested and live`;

const chip = document.createElement('div');
chip.className = 'edit-chip';
chip.textContent = `OK ${meta.summary || request}`;
$('edits-list').prepend(chip);
$('remix-input').value = '';
clearSelection();
} catch (err) {
status.textContent = `! ${err.message}`;
console.error(err);
} finally {
busy = false;
btn.disabled = false;
btn.textContent = 'Apply Remix';
}
}

$('apply-btn').addEventListener('click', applyRemix);
$('remix-input').addEventListener('keydown', (e) => {
if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) applyRemix();
});

boot();
