// SLOP STUDIO — live collaborative sessions ("jams").
//
// The host runs the studio; friends join via a link. Everyone sees the live
// build in their own playtest pane and posts ideas to a shared PROMPT BOARD.
// The host clicks any posted prompt to feed it straight into the build agent.
// Built on the slop netcore (PeerJS, host-authoritative).
//
// const collab = initCollab({ onAddPrompt, getBuild, setClientBuild, tl, toast });
// collab.startHost(); collab.joinSession(code); collab.broadcastBuild();

import { NetCore } from './netcore.js';

const STYLE = `
#collab-panel {
position: fixed; top: 0; right: 0; bottom: 0; z-index: 90;
width: min(380px, 94vw); transform: translateX(105%);
transition: transform .28s cubic-bezier(.2,.8,.2,1);
background: var(--wh); border-left: 3px solid var(--ink);
box-shadow: -10px 0 40px rgba(26,26,46,.18);
display: flex; flex-direction: column; font-family: 'Nunito', sans-serif;
}
#collab-panel.open { transform: translateX(0); }
.cp-head { display: flex; align-items: center; gap: 10px; padding: 16px; border-bottom: 3px solid var(--ink); background: var(--bl); }
.cp-head h2 { font-family: 'Fredoka One', cursive; font-size: 17px; flex: 1; }
.cp-close { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--ink); }
.cp-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.cp-sect-t { font-family: 'Space Mono', monospace; font-size: 10.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--soft); margin-bottom: 7px; }
.cp-status { font-weight: 800; font-size: 13.5px; }
.cp-code { font-family: 'Space Mono', monospace; font-weight: 700; font-size: 18px; color: var(--ink); background: var(--cr); border: 2.5px solid var(--ink); border-radius: 12px; padding: 10px 14px; text-align: center; letter-spacing: 1px; }
.cp-share { display: flex; gap: 8px; }
.cp-share input { flex: 1; min-width: 0; font-family: 'Space Mono', monospace; font-size: 11px; background: var(--cr); border: 2.5px solid var(--ink); border-radius: 100px; padding: 9px 12px; outline: none; }
.cp-btn { font-family: 'Fredoka One', cursive; font-size: 13px; color: var(--ink); background: var(--y); border: 2.5px solid var(--ink); border-radius: 100px; padding: 9px 16px; cursor: pointer; box-shadow: 3px 3px 0 var(--ink); transition: transform .12s; white-space: nowrap; }
.cp-btn:hover { transform: translate(-2px,-2px); }
.cp-btn.pk { background: var(--pk); color: #fff; }
.cp-btn.full { width: 100%; }
.cp-roster { display: flex; flex-wrap: wrap; gap: 6px; }
.cp-peer { display: inline-flex; align-items: center; gap: 6px; font-family: 'Space Mono', monospace; font-weight: 700; font-size: 12px; background: var(--cr); border: 2px solid var(--ink); border-radius: 100px; padding: 5px 12px; }
.cp-peer .av { width: 16px; height: 16px; border-radius: 50%; }
.cp-board { display: flex; flex-direction: column; gap: 8px; }
.cp-card { background: var(--cr); border: 2.5px solid var(--ink); border-radius: 12px; padding: 10px 12px; }
.cp-card .who { font-family: 'Space Mono', monospace; font-size: 10.5px; font-weight: 700; color: var(--pk); }
.cp-card .txt { font-size: 13.5px; font-weight: 700; margin: 3px 0 8px; line-height: 1.4; }
.cp-card .row { display: flex; gap: 6px; }
.cp-card .add { flex: 1; font-family: 'Fredoka One', cursive; font-size: 12px; color: #fff; background: var(--pk); border: 2px solid var(--ink); border-radius: 100px; padding: 6px; cursor: pointer; }
.cp-card .dismiss { font-family: 'Space Mono', monospace; font-size: 11px; font-weight: 700; color: var(--soft); background: var(--wh); border: 2px solid var(--ink); border-radius: 100px; padding: 6px 12px; cursor: pointer; }
.cp-card.done { opacity: .6; }
.cp-card.done .txt::before { content: 'OK '; color: #0A7A4A; }
.cp-post { display: flex; flex-direction: column; gap: 8px; }
.cp-post textarea { min-height: 56px; resize: vertical; font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 13.5px; background: var(--cr); border: 2.5px solid var(--ink); border-radius: 12px; padding: 10px; outline: none; }
.cp-empty { font-size: 12.5px; color: var(--soft); font-weight: 600; line-height: 1.6; }
#collab-toggle.live { background: var(--mt) !important; }
.cp-live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--red); display: inline-block; animation: cpPulse 1.1s infinite alternate; }
@keyframes cpPulse { to { opacity: .3; } }
`;

const AV_COLORS = ['#FF4EB8', '#4ECAFF', '#FFE135', '#3DFFB0', '#FF7A35', '#B94EFF'];
const avatar = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AV_COLORS.length; return AV_COLORS[h]; };

export function initCollab(hooks) {
const myName = localStorage.getItem('slop-username') || ('guest_' + Math.random().toString(36).slice(2, 5));
let net = null, mode = null; // 'host' | 'client'
let board = []; // { id, text, author, status }
let roster = [myName];

// ---- UI ----
const style = document.createElement('style'); style.textContent = STYLE; document.head.appendChild(style);
const panel = document.createElement('aside');
panel.id = 'collab-panel';
panel.innerHTML = `
<div class="cp-head"><h2>jam session</h2><button class="cp-close">X</button></div>
<div class="cp-body">
<div>
<div class="cp-status" id="cp-status">not connected</div>
<div id="cp-host-ui" style="display:none;margin-top:10px;display:flex;flex-direction:column;gap:8px">
<div class="cp-code" id="cp-code">·····</div>
<div class="cp-share"><input id="cp-link" readonly><button class="cp-btn" id="cp-copy">copy</button></div>
</div>
</div>
<div><div class="cp-sect-t">in the jam</div><div class="cp-roster" id="cp-roster"></div></div>
<div>
<div class="cp-sect-t">prompt board</div>
<div class="cp-board" id="cp-board"></div>
<div class="cp-empty" id="cp-board-empty">no ideas posted yet. anyone in the jam can drop a prompt here — the host clicks one to build it into the game.</div>
</div>
<div class="cp-post" id="cp-post" style="display:none">
<div class="cp-sect-t">post an idea to the board</div>
<textarea id="cp-post-input" placeholder="e.g. add a grappling hook · make the boss a giant duck · rainbow trails"></textarea>
<button class="cp-btn pk full" id="cp-post-btn">Post to board</button>
</div>
</div>`;
document.body.appendChild(panel);
const q = (s) => panel.querySelector(s);
const setOpen = (o) => panel.classList.toggle('open', o);
q('.cp-close').addEventListener('click', () => setOpen(false));

function renderRoster() {
q('#cp-roster').innerHTML = roster.map((n) =>
`<span class="cp-peer"><span class="av" style="background:${avatar(n)}"></span>${n === myName ? 'you' : n}</span>`).join('')
|| '<span class="cp-empty">just you</span>';
}
function renderBoard() {
const el = q('#cp-board');
q('#cp-board-empty').style.display = board.length ? 'none' : '';
el.innerHTML = board.map((b) => `
<div class="cp-card ${b.status === 'done' ? 'done' : ''}" data-id="${b.id}">
<div class="who"><span class="av" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${avatar(b.author)}"></span> ${b.author === myName ? 'you' : b.author}</div>
<div class="txt"></div>
${mode === 'host' && b.status !== 'done' ? `<div class="row"><button class="add">add to game</button><button class="dismiss">dismiss</button></div>` : ''}
</div>`).join('');
// set text safely (avoid HTML injection from peers)
el.querySelectorAll('.cp-card').forEach((card) => {
const b = board.find((x) => String(x.id) === card.dataset.id);
card.querySelector('.txt').textContent = b.text;
card.querySelector('.add')?.addEventListener('click', () => {
b.status = 'done'; renderBoard(); broadcastBoard();
hooks.onAddPrompt?.(b.text, b.author);
});
card.querySelector('.dismiss')?.addEventListener('click', () => {
b.status = 'done'; renderBoard(); broadcastBoard();
});
});
}
function broadcastBoard() { if (mode === 'host') net.broadcast({ t: 'board', board }); }
function broadcastRoster() { if (mode === 'host') net.broadcast({ t: 'roster', roster }); }

function addPost(text, author) {
board.unshift({ id: Date.now() + Math.random().toString(36).slice(2, 5), text: String(text).slice(0, 200), author, status: 'new' });
if (board.length > 30) board.pop();
renderBoard();
}

// ---- host ----
function startHost() {
if (mode) { setOpen(true); return; }
if (!NetCore.available()) { hooks.toast?.('multiplayer needs internet (PeerJS)'); return; }
mode = 'host';
net = new NetCore({ prefix: 'slop-studio' });
net.on('join', (conn) => {
net.broadcast({ t: 'roster', roster });
const b = hooks.getBuild?.(); if (b?.html) conn.send({ t: 'build', html: b.html, name: b.name });
conn.send({ t: 'board', board });
})
.on('leave', () => {})
.on('data', (conn, m) => {
if (m.t === 'hello') { conn._name = m.name; if (!roster.includes(m.name)) roster.push(m.name); renderRoster(); broadcastRoster(); }
else if (m.t === 'post') { addPost(m.text, m.author); broadcastBoard(); hooks.tl?.(`${m.author} posted an idea to the board`); }
})
.on('error', (t) => hooks.toast?.('net: ' + t));
q('#cp-host-ui').style.display = 'flex';
q('#cp-status').innerHTML = '<span class="cp-live-dot"></span> hosting a live jam';
document.getElementById('collab-toggle')?.classList.add('live');
net.host((code) => { q('#cp-code').textContent = code; q('#cp-link').value = `${location.origin}/${code}`; });
setOpen(true);
renderRoster(); renderBoard();
hooks.toast?.('jam started — invite friends with the link');
}

// ---- client ----
function joinSession(code) {
if (mode) return;
if (!NetCore.available()) { hooks.toast?.('multiplayer needs internet (PeerJS)'); return; }
mode = 'client';
net = new NetCore({ prefix: 'slop-studio' });
net.on('connected', () => { net.send({ t: 'hello', name: myName }); q('#cp-status').innerHTML = '<span class="cp-live-dot"></span> in the jam — host is driving'; })
.on('disconnected', () => { q('#cp-status').textContent = 'host left the jam'; })
.on('data', (conn, m) => {
if (m.t === 'build') hooks.setClientBuild?.(m.html, m.name);
else if (m.t === 'board') { board = m.board || []; renderBoard(); }
else if (m.t === 'roster') { roster = m.roster || roster; renderRoster(); }
})
.on('error', (t) => { q('#cp-status').textContent = t === 'peer-unavailable' ? 'jam not found — check the link' : 'net: ' + t; });
q('#cp-post').style.display = 'flex';
q('#cp-status').textContent = 'connecting to the jam…';
net.join(code, () => {});
setOpen(true);
renderRoster(); renderBoard();
}

q('#cp-copy').addEventListener('click', () => { navigator.clipboard?.writeText(q('#cp-link').value).then(() => hooks.toast?.('link copied — send it to friends'), () => {}); });
q('#cp-post-btn').addEventListener('click', () => {
const v = q('#cp-post-input').value.trim(); if (!v) return;
net.send({ t: 'post', text: v, author: myName });
addPost(v, myName); // optimistic
q('#cp-post-input').value = '';
hooks.toast?.('posted to the board!');
});

function broadcastBuild() {
if (mode !== 'host') return;
const b = hooks.getBuild?.(); if (b?.html) net.broadcast({ t: 'build', html: b.html, name: b.name });
}

return {
startHost, joinSession, broadcastBuild,
open: () => setOpen(true),
get mode() { return mode; },
get isClient() { return mode === 'client'; },
get isHost() { return mode === 'host'; },
get roomLink() { return q('#cp-link').value; },
postToBoard(text) { if (mode === 'client') { net.send({ t: 'post', text, author: myName }); addPost(text, myName); } },
};
}
