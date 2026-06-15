// Community board: real posts from real accounts, stored in the database.

import { api, timeAgo, escapeHTML } from './api.js';
import { getUser, onUser, openAuthModal } from './account.js';
import { showToast } from './toast.js';

function postHTML(p) {
return `
<article class="post">
<div class="post-head">
<span class="post-user">@${escapeHTML(p.username)}</span>
<span class="post-time">${timeAgo(p.created_at)}</span>
</div>
<p class="post-body">${escapeHTML(p.body)}</p>
</article>`;
}

async function loadPosts() {
const list = document.getElementById('post-list');
const posts = await api.posts();
if (posts === null) {
list.innerHTML = `<div class="post-empty">the community board needs the backend — run <code>node server.js</code> and refresh.</div>`;
return;
}
list.innerHTML = posts.length
? posts.map(postHTML).join('')
: `<div class="post-empty">nothing here yet. be the first post on slop.game — make it count (or don't).</div>`;
}

export function initCommunity() {
const form = document.getElementById('post-form');
const input = document.getElementById('post-input');
const btn = document.getElementById('post-submit');
if (!form) return;

onUser((user) => {
input.placeholder = user
? `share something, @${user.username} — a game, a high score, a hot take…`
: 'create an account to post…';
btn.textContent = user ? 'Post' : 'Sign in to post';
});

form.addEventListener('submit', async (e) => {
e.preventDefault();
if (!getUser()) { openAuthModal(); return; }
const body = input.value.trim();
if (!body) return;
btn.disabled = true;
try {
await api.createPost(body);
input.value = '';
await loadPosts();
showToast('posted to the board');
} catch (err) {
showToast(err.message);
} finally {
btn.disabled = false;
}
});

loadPosts();
}
