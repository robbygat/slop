// Accounts for slop.game, backed by Supabase Auth.
//
// Flows:
//   • Email + password sign up (then claim a unique username)
//   • Email + password sign in
//   • Google OAuth (Supabase redirect flow — works on the static GitHub Pages site)
//   • One intentional username per person: Google / unconfirmed users are forced
//     to pick a username the first time they have a session without one.

import { api, escapeHTML } from './api.js';
import { getSupabase } from './supabase.js';
import { showToast } from './toast.js';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const PENDING_KEY = 'slop:pending-username';

let currentUser = null; // { id, username, ... } or null
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
let mode = 'signup'; // 'signup' | 'login' | 'claim'

function ensureModal() {
  if (modal) return modal;
  modal = document.createElement('div');
  modal.className = 'auth-modal hidden';
  modal.innerHTML = `
    <div class="auth-card">
      <button class="auth-close" id="auth-close">X</button>
      <h3 class="auth-title" id="auth-title">join slop.game</h3>
      <p class="auth-sub" id="auth-sub">pick a username — it shows on everything you cook, post, and publish.</p>
      <div class="auth-tabs" id="auth-tabs">
        <button class="auth-tab active" data-mode="signup">Create account</button>
        <button class="auth-tab" data-mode="login">Sign in</button>
      </div>
      <form id="auth-form">
        <input id="auth-username" placeholder="username (3-20 chars)" autocomplete="username" maxlength="20">
        <input id="auth-email" type="email" placeholder="email" autocomplete="email">
        <input id="auth-password" type="password" placeholder="password (6+ chars)" autocomplete="current-password">
        <button type="submit" class="auth-submit" id="auth-submit">Create account</button>
      </form>
      <div class="auth-error" id="auth-error"></div>
      <div class="auth-divider" id="auth-divider"><span>or</span></div>
      <div id="google-btn-slot"></div>
      <p class="auth-note" id="auth-google-note"></p>
    </div>`;
  document.body.appendChild(modal);

  const err = modal.querySelector('#auth-error');

  // Closable in every mode — a stuck claim modal would trap the user; the nav's
  // "Finish signup" button re-opens it, and it re-prompts on the next load.
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  modal.querySelector('#auth-close').addEventListener('click', closeModal);

  modal.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => { setMode(tab.dataset.mode); err.textContent = ''; });
  });

  modal.querySelector('#auth-form').addEventListener('submit', onSubmit);
  wireGoogle();
  return modal;
}

function setMode(next) {
  mode = next;
  if (!modal) return;
  const claim = mode === 'claim';
  const signup = mode === 'signup';
  modal.querySelector('#auth-tabs').style.display = claim ? 'none' : '';
  modal.querySelector('#auth-divider').style.display = claim ? 'none' : '';
  modal.querySelector('#google-btn-slot').style.display = claim ? 'none' : '';
  modal.querySelector('#auth-email').style.display = claim ? 'none' : '';
  modal.querySelector('#auth-password').style.display = claim ? 'none' : '';
  modal.querySelector('#auth-username').style.display = (signup || claim) ? '' : 'none';
  modal.querySelector('#auth-email').required = !claim;
  modal.querySelector('#auth-password').required = !claim;
  modal.querySelector('#auth-username').required = signup || claim;

  modal.querySelectorAll('.auth-tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
  const title = modal.querySelector('#auth-title');
  const sub = modal.querySelector('#auth-sub');
  const submit = modal.querySelector('#auth-submit');
  if (claim) {
    title.textContent = 'pick your username';
    sub.textContent = 'one username per person — it becomes your profile at slop.game/yourname.';
    submit.textContent = 'Claim username';
  } else if (signup) {
    title.textContent = 'join slop.game';
    sub.textContent = 'pick a username — it shows on everything you cook, post, and publish.';
    submit.textContent = 'Create account';
  } else {
    title.textContent = 'welcome back';
    sub.textContent = 'sign in to publish games and keep your library in sync.';
    submit.textContent = 'Sign in';
  }
}

async function onSubmit(e) {
  e.preventDefault();
  const err = modal.querySelector('#auth-error');
  err.textContent = '';
  const username = modal.querySelector('#auth-username').value.trim();
  const email = modal.querySelector('#auth-email').value.trim();
  const password = modal.querySelector('#auth-password').value;
  const submit = modal.querySelector('#auth-submit');
  submit.disabled = true;
  try {
    if (mode === 'claim') {
      await doClaim(username);
    } else if (mode === 'signup') {
      await doSignup(username, email, password);
    } else {
      await doLogin(email, password);
    }
  } catch (e2) {
    err.textContent = e2.message;
  } finally {
    submit.disabled = false;
  }
}

async function doSignup(username, email, password) {
  if (!USERNAME_RE.test(username)) throw new Error('username must be 3-20 chars: letters, numbers, _');
  const s = getSupabase();
  if (!s) throw new Error('cannot reach slop.game servers — check your connection');
  // Pre-check availability for a friendly message (the RPC is the real guard).
  const taken = await api.profileByUsername(username);
  if (taken) throw new Error('that username is taken');

  const { data, error } = await s.auth.signUp({ email, password });
  if (error) throw new Error(error.message);

  localStorage.setItem(PENDING_KEY, username);
  if (data.session) {
    // Email confirmation disabled → we have a session right now: claim + go.
    await doClaim(username);
  } else {
    // Confirmation required → finish after they click the email link.
    closeModal();
    showToast('check your email to confirm, then your username is waiting');
  }
}

async function doLogin(email, password) {
  const s = getSupabase();
  if (!s) throw new Error('cannot reach slop.game servers — check your connection');
  const { error } = await s.auth.signInWithPassword({ email, password });
  if (error) throw new Error(/invalid login/i.test(error.message) ? 'wrong email or password' : error.message);
  const me = await api.me();
  setUser(me);
  if (!me?.username) { promptUsername(); return; }
  closeModal();
  showToast(`back in the kitchen, ${me.username}`);
}

async function doClaim(username) {
  const claimed = await api.claimUsername(username);
  localStorage.removeItem(PENDING_KEY);
  const me = await api.me();
  setUser(me);
  closeModal();
  showToast(`welcome, ${claimed}!`);
}

export function openAuthModal() {
  ensureModal();
  setMode('signup');
  modal.classList.remove('hidden');
  setTimeout(() => modal.querySelector('#auth-username').focus(), 60);
}

// Force the username picker for a signed-in user who has no handle yet.
export function promptUsername() {
  ensureModal();
  setMode('claim');
  modal.querySelector('#auth-error').textContent = '';
  const pending = localStorage.getItem(PENDING_KEY);
  if (pending) modal.querySelector('#auth-username').value = pending;
  modal.classList.remove('hidden');
  setTimeout(() => modal.querySelector('#auth-username').focus(), 60);
}

function closeModal() { modal?.classList.add('hidden'); }

// ---------------------------------------------------------------- google
function wireGoogle() {
  const slot = modal.querySelector('#google-btn-slot');
  const note = modal.querySelector('#auth-google-note');
  slot.innerHTML = `<button class="auth-google-fallback" id="google-oauth" type="button">
    <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 5.1 29.5 3 24 3 16 3 9.1 7.6 6.3 14.7z"/><path fill="#4CAF50" d="M24 45c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 36 26.7 37 24 37c-5.3 0-9.7-2.6-11.3-7l-6.5 5C9 40.3 15.9 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.7 36 45 30.6 45 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
    Continue with Google</button>`;
  note.textContent = '';
  slot.querySelector('#google-oauth').addEventListener('click', async () => {
    const s = getSupabase();
    if (!s) { note.textContent = 'cannot reach slop.game servers — check your connection.'; return; }
    const { error } = await s.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/` },
    });
    if (error) note.textContent = error.message;
  });
}

// ---------------------------------------------------------------- nav state
async function signOut() {
  await getSupabase()?.auth.signOut();
  setUser(null);
  showToast('signed out — come back soon');
}

function renderNavAuth() {
  const slot = document.getElementById('nav-auth');
  if (!slot) return;
  if (currentUser?.username) {
    const av = currentUser.avatar_url
      ? `<img class="nav-avatar" src="${escapeHTML(currentUser.avatar_url)}" alt="">`
      : `<span class="nav-avatar nav-avatar-fallback">${escapeHTML((currentUser.username[0] || 'S').toUpperCase())}</span>`;
    slot.innerHTML = `
      <a class="nav-user" href="/${escapeHTML(currentUser.username)}" title="your profile">${av}<span>@${escapeHTML(currentUser.username)}</span></a>`;
  } else if (currentUser) {
    slot.innerHTML = `<button class="nav-signin" id="nav-finish">Finish signup</button>`;
    slot.querySelector('#nav-finish').addEventListener('click', promptUsername);
  } else {
    slot.innerHTML = `<button class="nav-signin" id="nav-signin">Sign in</button>`;
    slot.querySelector('#nav-signin').addEventListener('click', openAuthModal);
  }

  const drawerOut = document.getElementById('nav-drawer-signout');
  if (!drawerOut) return;
  const signedIn = !!currentUser;
  drawerOut.hidden = !signedIn;
  if (signedIn && !drawerOut.dataset.wired) {
    drawerOut.dataset.wired = '1';
    drawerOut.addEventListener('click', () => { signOut(); });
  }
}

export async function initAccount() {
  renderNavAuth();
  const s = getSupabase();
  if (!s) { showToast('offline — sign in needs a connection to slop.game'); return; }

  // React to OAuth redirects, token refreshes, and sign-out across tabs.
  // IMPORTANT: never call another supabase method (getSession/from/…) directly
  // inside this callback — it runs while auth-js holds its storage lock, so a
  // nested getSession() deadlocks the whole client (nav stuck, pages hang).
  // We defer with setTimeout(…, 0) and use the `session` handed to us.
  s.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => { resolveSession(session).catch(() => {}); }, 0);
  });

  // Initial restore from the persisted session (this is OUTSIDE the callback,
  // so getSession is safe here and keeps you signed in across refreshes).
  const { data: { session } } = await s.auth.getSession();
  await resolveSession(session).catch(() => {});
}

// Turn a raw session into our profile object + nav state, fetching the profile
// row directly (no getSession here, so it's safe to call from anywhere).
async function resolveSession(session) {
  if (!session?.user) { setUser(null); return; }
  const s = getSupabase();
  const { data } = await s.from('profiles')
    .select('id, username, display_name, avatar_url, is_moderator')
    .eq('id', session.user.id)
    .maybeSingle();
  const me = { id: session.user.id, email: session.user.email, username: null, ...(data || {}) };
  await maybeClaimPending(me);
}

// If a session exists but the profile has no username, either auto-claim a
// pending one (from a just-confirmed signup) or force the picker.
async function maybeClaimPending(me) {
  if (!me) { setUser(null); return; }
  if (me.username) { setUser(me); return; }
  setUser(me);
  const pending = localStorage.getItem(PENDING_KEY);
  if (pending && USERNAME_RE.test(pending) && !(await api.profileByUsername(pending))) {
    try { await doClaim(pending); return; } catch { /* fall through to manual picker */ }
  }
  promptUsername();
}
