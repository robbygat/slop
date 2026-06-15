// Friends panel — search players, send/accept requests, see studio invites.
// Lives in the community section; degrades to a sign-in nudge when logged out
// and hides entirely when the backend is offline.

import { api, escapeHTML } from './api.js';
import { showToast } from './toast.js';
import { getUser, openAuthModal } from './account.js';

const $ = (id) => document.getElementById(id);

let data = null; // { friends, incoming, outgoing, invites }

async function refresh() {
// skip the request entirely when signed out — /api/friends 401s otherwise and
// litters the console on every page load and 45s poll.
if (!getUser()) { data = null; render(); return; }
data = await api.friends().catch(() => null);
render();
}

function render() {
const list = $('friends-list');
const invites = $('invites-list');
if (!list) return;

if (!getUser()) {
list.innerHTML = `<p class="friends-empty">sign in to add friends, see invites, and build games together.</p>`;
invites.innerHTML = '';
return;
}
if (!data) {
list.innerHTML = `<p class="friends-empty">friends need the backend — run <code>node server.js</code>.</p>`;
invites.innerHTML = '';
return;
}

const rows = [];
for (const f of data.incoming || []) {
rows.push(`
<div class="friend-item pending">
<span class="fi-name">@${escapeHTML(f.username)}</span>
<span class="fi-tag">wants to be friends</span>
<button class="fi-btn yes" data-accept="${f.id}">accept</button>
<button class="fi-btn" data-decline="${f.id}">X</button>
</div>`);
}
for (const f of data.friends || []) {
rows.push(`
<div class="friend-item">
<span class="fi-name">@${escapeHTML(f.username)}</span>
<span class="fi-tag online-dot">friend</span>
<button class="fi-btn" data-invite="${escapeHTML(f.username)}" title="invite to slop studio">studio</button>
<button class="fi-btn" data-remove="${f.id}" title="remove friend">X</button>
</div>`);
}
for (const f of data.outgoing || []) {
rows.push(`
<div class="friend-item dim">
<span class="fi-name">@${escapeHTML(f.username)}</span>
<span class="fi-tag">request sent…</span>
</div>`);
}
list.innerHTML = rows.join('') || `<p class="friends-empty">no friends yet — search a username above. friends can invite each other into Slop Studio builds and co-op rooms.</p>`;

const inv = (data.invites || []).map((i) => `
<div class="friend-item invite">
<span class="fi-name">@${escapeHTML(i.from_username)}</span>
<span class="fi-tag">invited you to ${i.kind === 'studio' ? 'build' : 'play'} “${escapeHTML(i.payload?.name || 'a game')}”</span>
${i.payload?.url ? `<a class="fi-btn yes" href="${escapeHTML(i.payload.url)}" data-seen="${i.id}">open</a>` : ''}
<button class="fi-btn" data-dismiss="${i.id}">X</button>
</div>`).join('');
invites.innerHTML = inv ? `<h4 class="friends-sub">invites</h4>${inv}` : '';
}

async function wireSearch() {
const input = $('friend-search');
const results = $('friend-results');
let t = null;
input.addEventListener('input', () => {
clearTimeout(t);
const q = input.value.trim();
if (q.length < 2) { results.innerHTML = ''; return; }
t = setTimeout(async () => {
if (!getUser()) { results.innerHTML = ''; return; }
const users = await api.searchUsers(q).catch(() => []);
results.innerHTML = users.map((u) => `
<button class="friend-result" data-add="${escapeHTML(u.username)}">+ @${escapeHTML(u.username)}</button>`).join('')
|| '<span class="friends-empty">no players match</span>';
}, 250);
});

results.addEventListener('click', async (e) => {
const btn = e.target.closest('[data-add]');
if (!btn) return;
try {
const res = await api.friendRequest(btn.dataset.add);
showToast(res?.accepted ? `you and @${btn.dataset.add} are now friends` : `friend request sent to @${btn.dataset.add}`);
input.value = '';
results.innerHTML = '';
refresh();
} catch (err) { showToast(err.message); }
});
}

export function initFriends() {
const panel = $('friends-panel');
if (!panel) return;

wireSearch();

panel.addEventListener('click', async (e) => {
const t = e.target;
try {
if (t.dataset.accept) { await api.friendRespond(Number(t.dataset.accept), true); showToast('friend added'); refresh(); }
else if (t.dataset.decline) { await api.friendRespond(Number(t.dataset.decline), false); refresh(); }
else if (t.dataset.remove) { await api.friendRemove(Number(t.dataset.remove)); refresh(); }
else if (t.dataset.dismiss) { await api.inviteSeen(Number(t.dataset.dismiss)); refresh(); }
else if (t.dataset.seen) { api.inviteSeen(Number(t.dataset.seen)); /* navigating anyway */ }
else if (t.dataset.invite) {
const ok = await api.sendInvite(t.dataset.invite, 'studio', { name: 'a fresh studio session', url: 'studio.html' });
showToast(ok ? `studio invite sent to @${t.dataset.invite}` : 'backend offline');
}
} catch (err) { showToast(err.message); }
});

$('friends-signin')?.addEventListener('click', () => {
if (!getUser()) openAuthModal();
});

refresh();
// refresh when auth state changes (account.js dispatches this)
window.addEventListener('slop:auth', refresh);
setInterval(refresh, 45000); // catch new invites while the page sits open
}
