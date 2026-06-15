// Public profile page — polished creator layout.

import { api, escapeHTML } from './api.js';
import { initAccount } from './account.js';
import { loadPlays, playCount, fmtPlays } from './plays.js';
import { initNav } from './nav.js';
import { initXP, renderProfileXP } from './xp.js';
import { showToast } from './toast.js';

const params = new URLSearchParams(location.search);
const username = params.get('u') || decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '');

const $ = (id) => document.getElementById(id);

const DEFAULT_BG = '#FFFFFF';

const BG_PRESETS = [
  '#FFFFFF', '#F7F9F9', '#EFF3F4', '#E7ECF0',
  '#F0F4F8', '#E8EEF2', '#15202B', '#0F172A', '#111827',
];

let profile = null;
let viewer = null;
let following = false;
let ownerGames = [];
let pendingAvatarUrl;
let pendingBannerUrl;
let bannerCleared = false;

function initial(name) { return (String(name || 'S')[0] || 'S').toUpperCase(); }

/** Muted blue-gray fallback — never pink. */
function avatarFallbackColor(name) {
  let h = 0;
  const s = String(name || 'user');
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  const hue = 195 + (Math.abs(h) % 50);
  return `hsl(${hue}, 12%, 44%)`;
}

function renderAvatar(elId, url, name) {
  const el = $(elId);
  if (!el) return;
  if (url) {
    el.style.background = '';
    el.innerHTML = `<img src="${escapeHTML(url)}" alt="${escapeHTML(name || '')}">`;
  } else {
    el.innerHTML = '';
    el.style.background = avatarFallbackColor(name);
    el.textContent = initial(name);
  }
}

function renderAvatarPreview(elId, url, name) {
  const el = $(elId);
  if (!el) return;
  if (url) {
    el.style.background = '';
    el.innerHTML = `<img src="${escapeHTML(url)}" alt="">`;
  } else {
    el.innerHTML = '';
    el.style.background = avatarFallbackColor(name);
    el.textContent = initial(name);
  }
}

function fmtMemberSince(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `Joined ${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
}

function isDarkHex(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

function applyLook(data) {
  const bg = data.bg_color || DEFAULT_BG;
  const page = $('pf-page');
  const dark = isDarkHex(bg);
  page.style.setProperty('--pf-bg-custom', bg);
  page.style.setProperty('--pf-surface', bg);
  page.style.background = bg;
  page.classList.toggle('pf-dark', dark);

  const bannerImg = $('pf-banner-img');
  if (data.banner_url) {
    bannerImg.src = data.banner_url;
    bannerImg.alt = `${data.display_name || data.username}'s banner`;
    bannerImg.hidden = false;
  } else {
    bannerImg.hidden = true;
    bannerImg.removeAttribute('src');
  }
}

function renderBioLink() {
  const bioEl = $('pf-bio');
  const linkEl = $('pf-link');
  const tagEl = $('pf-tagline');
  const memberEl = $('pf-member');

  tagEl.hidden = !profile.tagline;
  if (profile.tagline) tagEl.textContent = profile.tagline;

  bioEl.hidden = !profile.bio;
  if (profile.bio) bioEl.textContent = profile.bio;

  if (profile.link) {
    linkEl.href = profile.link;
    linkEl.textContent = profile.link.replace(/^https?:\/\//, '').replace(/\/$/, '');
    linkEl.hidden = false;
  } else {
    linkEl.hidden = true;
  }

  const since = fmtMemberSince(profile.created_at);
  memberEl.hidden = !since;
  if (since) memberEl.textContent = since;
}

function totalPlaysForGames(games) {
  return games.reduce((sum, g) => sum + (playCount(g.slug) || g.play_count || 0), 0);
}

function gameRow(g, canModerate) {
  const plays = playCount(g.slug) || g.play_count || 0;
  const thumb = g.thumb
    ? `<img src="${escapeHTML(g.thumb)}" alt="" loading="lazy">`
    : `<span>${escapeHTML(g.name)}</span>`;
  return `
    <div class="pf-game" data-game-id="${escapeHTML(g.gameId)}" data-slug="${escapeHTML(g.slug)}" data-name="${escapeHTML(g.name)}" data-href="/play/${escapeHTML(g.slug)}" role="link" tabindex="0">
      <div class="pf-game-thumb">${thumb}</div>
      <div class="pf-game-body">
        <h3>${escapeHTML(g.name)}</h3>
        <p>${escapeHTML(g.desc || 'cooked with grok')}</p>
        <div class="pf-game-meta">${fmtPlays(plays)} plays</div>
      </div>
      ${canModerate ? '<button class="gdel" type="button" title="remove (moderator)">×</button>' : ''}
    </div>`;
}

function renderGamesGrid(games, canModerate) {
  const grid = $('pf-grid');
  if (!games.length) {
    grid.innerHTML = `<p class="pf-empty">No published games yet — <a href="studio.html">cook one in the studio</a>.</p>`;
    return;
  }
  grid.innerHTML = games.map((g) => gameRow(g, canModerate)).join('');
}

function updateStats(games) {
  $('pf-plays').textContent = fmtPlays(totalPlaysForGames(games));
  $('pf-games-count').textContent = games.length;
  $('pf-grid-count').textContent = String(games.length);
}

function showXP(isOwner) {
  const xpEl = $('pf-xp');
  if (!isOwner) {
    xpEl.hidden = true;
    return;
  }
  xpEl.hidden = false;
  renderProfileXP();
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

  $('pf-shell').hidden = false;
  $('pf-status').innerHTML = '';

  applyLook(profile);

  $('pf-name').textContent = profile.display_name || profile.username;
  $('pf-handle').textContent = `@${profile.username}`;
  renderAvatar('pf-avatar', profile.avatar_url, profile.username);
  renderBioLink();

  const isOwner = viewer?.id === profile.id;
  const [followers, games, isFollowing] = await Promise.all([
    api.followerCount(profile.id),
    api.gamesByOwner(profile.id),
    isOwner ? Promise.resolve(false) : api.isFollowing(profile.id),
  ]);
  following = isFollowing;
  ownerGames = games;

  await loadPlays().catch(() => {});

  $('pf-followers').textContent = fmtPlays(followers);
  updateStats(games);
  renderActions(isOwner);
  showXP(isOwner);
  renderGamesGrid(games, !!viewer?.is_moderator);
  $('pf-grid').onclick = onGridClick;
  $('pf-grid').onkeydown = (e) => {
    const row = e.target.closest('.pf-game');
    if (row && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      if (!e.target.closest('.gdel')) window.location.href = row.dataset.href;
    }
  };
}

function renderActions(isOwner) {
  const slot = $('pf-actions');
  if (isOwner) {
    slot.innerHTML = `<button class="pf-btn" id="pf-edit-btn" type="button">Edit profile</button>`;
    $('pf-edit-btn').onclick = openEdit;
    return;
  }
  if (!viewer) {
    slot.innerHTML = `<button class="pf-btn primary" id="pf-follow" type="button">Follow</button>`;
    $('pf-follow').onclick = () => showToast('sign in to follow creators');
    return;
  }
  slot.innerHTML = `<button class="pf-btn ${following ? 'following' : 'primary'}" id="pf-follow" type="button">${following ? 'Following' : 'Follow'}</button>`;
  $('pf-follow').onclick = toggleFollow;
}

async function toggleFollow() {
  const btn = $('pf-follow');
  btn.disabled = true;
  const next = !following;
  try {
    if (next) await api.follow(profile.id); else await api.unfollow(profile.id);
    following = next;
    $('pf-followers').textContent = fmtPlays(await api.followerCount(profile.id));
    btn.classList.toggle('following', following);
    btn.classList.toggle('primary', !following);
    btn.textContent = following ? 'Following' : 'Follow';
  } catch (err) {
    showToast(err.message || 'could not update follow');
  } finally {
    btn.disabled = false;
  }
}

function showMissing(msg) {
  $('pf-shell').hidden = true;
  $('pf-status').innerHTML = `<p class="pf-missing">${escapeHTML(msg || `No creator named “${username}”`)} — <a href="/">back home</a></p>`;
}

async function onGridClick(e) {
  const del = e.target.closest('.gdel');
  if (del) {
    e.preventDefault();
    e.stopPropagation();
    const row = del.closest('.pf-game');
    if (!window.confirm(`Remove “${row.dataset.name}” from slop.game?`)) return;
    const ok = await api.removeGame(row.dataset.gameId);
    if (ok) {
      row.remove();
      ownerGames = ownerGames.filter((g) => g.gameId !== row.dataset.gameId);
      updateStats(ownerGames);
      if (!ownerGames.length) renderGamesGrid([], false);
      showToast('game removed');
    } else {
      showToast('could not remove — are you signed in as a moderator?');
    }
    return;
  }
  const row = e.target.closest('.pf-game');
  if (row?.dataset.href) window.location.href = row.dataset.href;
}

// ---------------------------------------------------------------- edit

function buildBgPresets() {
  const el = $('pf-edit-bg-presets');
  if (!el || el.childElementCount) return;
  el.innerHTML = BG_PRESETS.map((hex) =>
    `<button type="button" class="pf-bg-swatch" role="radio" aria-checked="false" data-bg="${hex}" style="background:${hex}"></button>`
  ).join('');
  el.onclick = (e) => {
    const btn = e.target.closest('[data-bg]');
    if (!btn) return;
    $('pf-edit-bg').value = btn.dataset.bg;
    el.querySelectorAll('[data-bg]').forEach((s) => {
      s.setAttribute('aria-checked', s === btn ? 'true' : 'false');
    });
  };
}

function setBgPicker(hex) {
  const color = hex || DEFAULT_BG;
  $('pf-edit-bg').value = color;
  $('pf-edit-bg-presets')?.querySelectorAll('[data-bg]').forEach((s) => {
    s.setAttribute('aria-checked', s.dataset.bg.toUpperCase() === color.toUpperCase() ? 'true' : 'false');
  });
}

function renderBannerPreview(url) {
  const box = $('pf-edit-banner-preview');
  box.innerHTML = url
    ? `<img src="${escapeHTML(url)}" alt="banner preview">`
    : `<span class="pf-cover-placeholder">Add a header photo</span>`;
}

function openEdit() {
  buildBgPresets();
  $('pf-edit-name').value = profile.display_name || '';
  $('pf-edit-tagline').value = profile.tagline || '';
  $('pf-edit-bio').value = profile.bio || '';
  $('pf-edit-link').value = profile.link || '';
  renderAvatarPreview('pf-edit-prev', profile.avatar_url, profile.username);
  $('pf-edit-error').textContent = '';
  pendingAvatarUrl = undefined;
  pendingBannerUrl = undefined;
  bannerCleared = false;
  setBgPicker(profile.bg_color || DEFAULT_BG);
  renderBannerPreview(profile.banner_url);
  $('pf-edit').classList.remove('hidden');
}

function closeEdit() { $('pf-edit').classList.add('hidden'); }

$('pf-edit-cancel').onclick = closeEdit;
$('pf-edit').addEventListener('click', (e) => { if (e.target.id === 'pf-edit') closeEdit(); });
$('pf-edit-bg').addEventListener('input', (e) => setBgPicker(e.target.value));
$('pf-edit-banner-clear').addEventListener('click', () => {
  pendingBannerUrl = undefined;
  bannerCleared = true;
  renderBannerPreview(null);
  $('pf-edit-banner-file').value = '';
});

$('pf-edit-banner-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const err = $('pf-edit-error');
  if (file.size > 5 * 1024 * 1024) { err.textContent = 'banner too big — max 5 MB'; return; }
  err.textContent = 'uploading…';
  try {
    pendingBannerUrl = await api.uploadBanner(file);
    bannerCleared = false;
    renderBannerPreview(pendingBannerUrl);
    err.textContent = '';
  } catch (e2) {
    err.textContent = e2.message || 'upload failed';
    pendingBannerUrl = undefined;
  }
});

$('pf-edit-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const err = $('pf-edit-error');
  if (file.size > 3 * 1024 * 1024) { err.textContent = 'image too big — max 3 MB'; return; }
  err.textContent = 'uploading…';
  try {
    pendingAvatarUrl = await api.uploadAvatar(file);
    renderAvatarPreview('pf-edit-prev', pendingAvatarUrl, profile.username);
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
    const patch = {
      display_name: $('pf-edit-name').value.trim(),
      tagline: $('pf-edit-tagline').value.trim(),
      bio: $('pf-edit-bio').value.trim(),
      link: $('pf-edit-link').value.trim(),
      bg_color: $('pf-edit-bg').value,
    };
    if (pendingAvatarUrl !== undefined) patch.avatar_url = pendingAvatarUrl;
    if (bannerCleared) patch.banner_url = null;
    else if (pendingBannerUrl !== undefined) patch.banner_url = pendingBannerUrl;

    await api.updateProfile(patch);
    const fresh = await api.profileByUsername(profile.username).catch(() => null);
    profile = fresh || { ...profile, ...patch };

    applyLook(profile);
    $('pf-name').textContent = profile.display_name || profile.username;
    renderAvatar('pf-avatar', profile.avatar_url, profile.username);
    renderBioLink();
    closeEdit();
    showToast('profile updated');
  } catch (e2) {
    err.textContent = e2.message || 'could not save';
  } finally {
    btn.disabled = false;
  }
});

initAccount();
initNav({ filterGrid: false });
initXP();
render().catch((err) => {
  console.error('[profile] render failed', err);
  showMissing('something broke — try refreshing');
});
