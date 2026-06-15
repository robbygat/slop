// Public profile page for /{username} — "social for games".
// Shows the creator's avatar, display name, follower count (never "following"),
// and their published games. Visitors can follow; the owner can edit their
// profile; moderators can remove games.

import { api, escapeHTML } from './api.js';
import { initAccount } from './account.js';
import { loadPlays, playCount, fmtPlays } from './plays.js';
import { showToast } from './toast.js';

const params = new URLSearchParams(location.search);
const username = params.get('u') || decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '');

const $ = (id) => document.getElementById(id);

let profile = null;   // the profile being viewed
let viewer = null;    // the signed-in user (or null)
let following = false;

function initial(name) { return (String(name || 'S')[0] || 'S').toUpperCase(); }

function avatarMarkup(url, name, cls) {
  return url
    ? `<img class="${cls}" src="${escapeHTML(url)}" alt="${escapeHTML(name)}">`
    : initial(name);
}

function gameCard(g, canModerate) {
  const thumb = g.thumb
    ? `<img src="${escapeHTML(g.thumb)}" alt="${escapeHTML(g.name)} screenshot" loading="lazy">`
    : `<span class="gthumb-fallback">${escapeHTML(g.name)}</span>`;
  return `
    <article class="gcard community gcard-v2" data-game-id="${escapeHTML(g.gameId)}" data-name="${escapeHTML(g.name)}">
      <div class="gthumb shot">
        ${thumb}
        <div class="gthumb-scrim"></div>
        <div class="gthumb-meta"><span class="gcat">Community</span><h3>${escapeHTML(g.name)}</h3></div>
        ${canModerate ? '<button class="gdel" title="remove this game (moderator)">X</button>' : ''}
        <div class="gplay" aria-hidden="true"></div>
      </div>
      <div class="gbody">
        <p class="gdesc">${escapeHTML(g.desc || 'cooked with grok')}</p>
        <div class="gmeta">
          <span class="gplays">${fmtPlays(playCount(g.slug) || g.play_count || 0)} plays</span>
        </div>
        <div class="gcta-row">
          <a class="gcta" href="/play/${escapeHTML(g.slug)}">Play &amp; Remix</a>
          <a class="gcta remix" href="studio.html?remix=${encodeURIComponent(g.slug)}">Remix in Studio</a>
        </div>
      </div>
    </article>`;
}

async function render() {
  if (username && location.pathname !== `/${username}`) history.replaceState(null, '', `/${username}`);
  document.title = username ? `@${username} — slop.game` : 'profile — slop.game';

  if (!username) { showMissing('no username given'); return; }

  [profile, viewer] = await Promise.all([
    api.profileByUsername(username),
    api.me().catch(() => null),
  ]);
  if (!profile) { showMissing(); return; }

  $('pf-body').hidden = false;
  $('pf-status').innerHTML = '';

  // header
  $('pf-name').textContent = profile.display_name || `@${profile.username}`;
  $('pf-handle').textContent = `@${profile.username}`;
  $('pf-avatar').innerHTML = avatarMarkup(profile.avatar_url, profile.username, 'pf-avatar');

  // stats + games + follow state in parallel
  const isOwner = viewer?.id === profile.id;
  const [followers, games, isFollowing] = await Promise.all([
    api.followerCount(profile.id),
    api.gamesByOwner(profile.id),
    isOwner ? Promise.resolve(false) : api.isFollowing(profile.id),
  ]);
  following = isFollowing;

  $('pf-followers').textContent = fmtPlays(followers);
  $('pf-games-count').textContent = games.length;
  $('pf-grid-count').textContent = games.length;

  renderActions(isOwner);

  await loadPlays().catch(() => {});
  const grid = $('pf-grid');
  grid.innerHTML = games.length
    ? games.map((g) => gameCard(g, !!viewer?.is_moderator)).join('')
    : `<p class="pf-empty">@${escapeHTML(profile.username)} hasn't published a game yet — <a href="studio.html">open the studio</a> and cook one.</p>`;
  grid.onclick = onGridClick;
}

function renderActions(isOwner) {
  const slot = $('pf-actions');
  if (isOwner) {
    slot.innerHTML = `<button class="pf-btn ghost" id="pf-edit-btn">Edit profile</button>`;
    $('pf-edit-btn').onclick = openEdit;
    return;
  }
  if (!viewer) {
    slot.innerHTML = `<button class="pf-btn" id="pf-follow">Follow</button>`;
    $('pf-follow').onclick = () => showToast('sign in on the homepage to follow creators');
    return;
  }
  slot.innerHTML = `<button class="pf-btn ${following ? 'following' : ''}" id="pf-follow">${following ? 'Following' : 'Follow'}</button>`;
  $('pf-follow').onclick = toggleFollow;
}

async function toggleFollow() {
  const btn = $('pf-follow');
  btn.disabled = true;
  const next = !following;
  try {
    if (next) await api.follow(profile.id); else await api.unfollow(profile.id);
    following = next;
    // optimistic follower count nudge
    const el = $('pf-followers');
    const base = (await api.followerCount(profile.id));
    el.textContent = fmtPlays(base);
    btn.classList.toggle('following', following);
    btn.textContent = following ? 'Following' : 'Follow';
  } catch (err) {
    showToast(err.message || 'could not update follow');
  } finally {
    btn.disabled = false;
  }
}

function showMissing(msg) {
  $('pf-body').hidden = true;
  $('pf-status').innerHTML = `<p class="pf-missing">${escapeHTML(msg || `no creator named “${username}” on slop.game`)} — <a href="/">back to the homepage</a>.</p>`;
}

async function onGridClick(e) {
  const del = e.target.closest('.gdel');
  if (del) {
    e.preventDefault();
    const card = del.closest('.gcard');
    if (!window.confirm(`Remove “${card.dataset.name}” from slop.game?`)) return;
    const ok = await api.removeGame(card.dataset.gameId);
    if (ok) { card.remove(); showToast('game removed'); }
    else showToast('could not remove — are you signed in as a moderator?');
    return;
  }
  if (e.target.closest('.gcta')) return;
  const card = e.target.closest('.gcard');
  if (card) {
    const link = card.querySelector('.gcta');
    if (link) window.location.href = link.getAttribute('href');
  }
}

// ---------------------------------------------------------------- edit profile
function openEdit() {
  $('pf-edit-name').value = profile.display_name || '';
  $('pf-edit-prev').innerHTML = avatarMarkup(profile.avatar_url, profile.username, 'pf-avatar-prev');
  $('pf-edit-error').textContent = '';
  pendingAvatarUrl = undefined;
  $('pf-edit').classList.remove('hidden');
}
function closeEdit() { $('pf-edit').classList.add('hidden'); }

let pendingAvatarUrl; // set after a successful upload, before save

$('pf-edit-cancel').onclick = closeEdit;
$('pf-edit').addEventListener('click', (e) => { if (e.target.id === 'pf-edit') closeEdit(); });

$('pf-edit-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const err = $('pf-edit-error');
  if (file.size > 3 * 1024 * 1024) { err.textContent = 'image too big — keep it under 3 MB'; return; }
  err.textContent = 'uploading…';
  try {
    pendingAvatarUrl = await api.uploadAvatar(file);
    $('pf-edit-prev').innerHTML = `<img class="pf-avatar-prev" src="${escapeHTML(pendingAvatarUrl)}" alt="preview">`;
    err.textContent = '';
  } catch (e2) {
    err.textContent = e2.message || 'upload failed';
    pendingAvatarUrl = undefined;
  }
});

$('pf-edit-save').addEventListener('click', async () => {
  const btn = $('pf-edit-save');
  const err = $('pf-edit-error');
  btn.disabled = true;
  try {
    const patch = { display_name: $('pf-edit-name').value.trim() };
    if (pendingAvatarUrl !== undefined) patch.avatar_url = pendingAvatarUrl;
    await api.updateProfile(patch);
    profile = { ...profile, ...patch };
    $('pf-name').textContent = profile.display_name || `@${profile.username}`;
    $('pf-avatar').innerHTML = avatarMarkup(profile.avatar_url, profile.username, 'pf-avatar');
    closeEdit();
    showToast('profile updated');
  } catch (e2) {
    err.textContent = e2.message || 'could not save';
  } finally {
    btn.disabled = false;
  }
});

// boot
initAccount();
render().catch((err) => {
  console.error('[profile] render failed', err);
  showMissing('something broke loading this profile — try refreshing');
});
