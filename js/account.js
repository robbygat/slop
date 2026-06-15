// Accounts: sign up / log in modal, nav state, optional Google Sign-In.

import { api, escapeHTML } from './api.js';
import { showToast } from './toast.js';

let currentUser = null;
let backendUp = true;
const listeners = new Set();

export function getUser() { return currentUser; }

export function onUser(cb) {
listeners.add(cb);
cb(currentUser);
}

function setUser(u) {
currentUser = u;
renderNavAuth();
listeners.forEach((cb) => cb(u));
window.dispatchEvent(new Event('slop:auth'));
}

// ---------------------------------------------------------------- modal

let modal = null;

function ensureModal() {
if (modal) return modal;
modal = document.createElement('div');
modal.className = 'auth-modal hidden';
modal.innerHTML = `
<div class="auth-card">
<button class="auth-close" id="auth-close">X</button>
<h3 class="auth-title" id="auth-title">join slop.game</h3>
<p class="auth-sub">pick a username — it shows on everything you cook, post, and publish.</p>
<div class="auth-tabs">
<button class="auth-tab active" data-mode="signup">Create account</button>
<button class="auth-tab" data-mode="login">Sign in</button>
</div>
<form id="auth-form">
<input id="auth-username" placeholder="username (3-20 chars)" autocomplete="username" maxlength="20" required>
<input id="auth-password" type="password" placeholder="password (6+ chars)" autocomplete="current-password" required>
<button type="submit" class="auth-submit" id="auth-submit">Create account</button>
</form>
<div class="auth-error" id="auth-error"></div>
<div class="auth-divider"><span>or</span></div>
<div id="google-btn-slot"></div>
<p class="auth-note" id="auth-google-note"></p>
</div>`;
document.body.appendChild(modal);

let mode = 'signup';
const err = modal.querySelector('#auth-error');

modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
modal.querySelector('#auth-close').addEventListener('click', closeModal);

modal.querySelectorAll('.auth-tab').forEach((tab) => {
tab.addEventListener('click', () => {
mode = tab.dataset.mode;
modal.querySelectorAll('.auth-tab').forEach((t) => t.classList.toggle('active', t === tab));
modal.querySelector('#auth-submit').textContent = mode === 'signup' ? 'Create account' : 'Sign in';
err.textContent = '';
});
});

modal.querySelector('#auth-form').addEventListener('submit', async (e) => {
e.preventDefault();
err.textContent = '';
const username = modal.querySelector('#auth-username').value.trim();
const password = modal.querySelector('#auth-password').value;
try {
const data = mode === 'signup' ? await api.signup(username, password) : await api.login(username, password);
if (!data) { err.textContent = 'the server is offline — run `node server.js` first'; return; }
setUser(data.user);
closeModal();
showToast(mode === 'signup' ? `welcome, ${data.user.username}!` : `back in the kitchen, ${data.user.username}`);
} catch (e2) {
err.textContent = e2.message;
}
});

initGoogle();
return modal;
}

export function openAuthModal() {
ensureModal().classList.remove('hidden');
setTimeout(() => modal.querySelector('#auth-username').focus(), 60);
}

function closeModal() { modal?.classList.add('hidden'); }

// ---------------------------------------------------------------- google

let googleReady = false;

async function initGoogle() {
if (googleReady) return;
const cfg = await api.config();
const note = modal.querySelector('#auth-google-note');
const slot = modal.querySelector('#google-btn-slot');
if (!cfg?.googleClientId) {
// wiring is complete — it just needs a client ID. Show an honest setup path.
slot.innerHTML = `<button class="auth-google-fallback" id="google-setup" type="button">
<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 5.1 29.5 3 24 3 16 3 9.1 7.6 6.3 14.7z"/><path fill="#4CAF50" d="M24 45c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 36 26.7 37 24 37c-5.3 0-9.7-2.6-11.3-7l-6.5 5C9 40.3 15.9 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.7 36 45 30.6 45 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
Continue with Google</button>`;
slot.querySelector('#google-setup').addEventListener('click', () => {
note.innerHTML = 'to switch on Google sign-in, drop your OAuth client ID into <b>slop.config.json</b> (or set the <b>GOOGLE_CLIENT_ID</b> env var) and restart the server — full steps in the README. username sign-in works right now.';
});
note.textContent = 'Google sign-in is wired & ready — add a client ID to activate it.';
return;
}
const render = () => {
window.google.accounts.id.initialize({
client_id: cfg.googleClientId,
callback: async (resp) => {
try {
const data = await api.googleSignIn(resp.credential);
setUser(data.user);
closeModal();
showToast(`welcome, ${data.user.username}!`);
} catch (e) {
modal.querySelector('#auth-error').textContent = e.message;
}
},
});
window.google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', shape: 'pill', width: 300, text: 'continue_with' });
try { window.google.accounts.id.prompt(); } catch { /* One Tap optional */ }
note.textContent = '';
googleReady = true;
};
if (window.google?.accounts?.id) return render();
const script = document.createElement('script');
script.src = 'https://accounts.google.com/gsi/client';
script.async = true;
script.onload = render;
script.onerror = () => { note.textContent = 'could not reach Google — check your connection. username sign-in still works.'; };
document.head.appendChild(script);
}

// ---------------------------------------------------------------- nav state

function renderNavAuth() {
const slot = document.getElementById('nav-auth');
if (!slot) return;
if (currentUser) {
slot.innerHTML = `
<span class="nav-user">@${escapeHTML(currentUser.username)}</span>
<button class="nav-signout" id="nav-signout" title="sign out">sign out</button>`;
slot.querySelector('#nav-signout').addEventListener('click', async () => {
await api.logout();
setUser(null);
showToast('signed out — come back soon');
});
} else {
slot.innerHTML = `<button class="nav-signin" id="nav-signin">${backendUp ? 'Sign in' : 'Sign in'}</button>`;
slot.querySelector('#nav-signin').addEventListener('click', openAuthModal);
}
}

export async function initAccount() {
const me = await api.me();
backendUp = me !== undefined; // api.me returns null both for signed-out and offline; treat as up
setUser(me);
}
