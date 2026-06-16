// Public profile page — polished creator layout.

import { api, escapeHTML } from './api.js';
import { initAccount } from './account.js';
import { loadPlays, playCount, fmtPlays } from './plays.js';
import { initNav } from './nav.js';
import { initXP, renderProfileXP, getProgress } from './xp.js';
import { initPricing } from './pricing.js';
import { initAds } from './ads.js';
import { showToast } from './toast.js';

const params = new URLSearchParams(location.search);
const username = params.get('u') || decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '');

const $ = (id) => document.getElementById(id);

const DEFAULT_BG = '#FFFBF0';

const BG_PRESETS = [
  '#FFFBF0', '#FFFFFF', '#FAFAFA', '#F5F0EB',
  '#F0F4FF', '#F0FFF4', '#FFF8F0', '#F5F0FF',
  '#1A1A2E', '#0F172A',
];

let profile = null;
let viewer = null;
let following = false;
let ownerGames = [];
let pendingAvatarUrl;
let pendingBannerUrl;
let bannerCleared = false;

function initial(name) { return (String(name || 'S')[0] || 'S').toUpperCase(); }

function avatarMarkup(url, name, cls) {
  return url
    ? `<img class="${cls}" src="${escapeHTML(url)}" alt="${escapeHTML(name)}">`
    : initial(name);
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
  page.style.setProperty('--pf-bg', bg);
  page.style.background = bg;
  page.classList.toggle('pf-dark', dark);

  const bannerImg = $('pf-banner-img');
  const hasBanner = !!data.banner_url;
  if (hasBanner) {
    bannerImg.src = data.banner_url;
    bannerImg.alt = `${data.display_name || data.username}'s banner`;
    bannerImg.hidden = false;
  } else {
    bannerImg.hidden = true;
    bannerImg.removeAttribute('src');
  }
  const def = $('pf-banner-default');
  if (def) def.hidden = hasBanner;
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
    <div class="pf-game-tile" data-game-id="${escapeHTML(g.gameId)}" data-slug="${escapeHTML(g.slug)}" data-name="${escapeHTML(g.name)}" data-href="/play/${escapeHTML(g.slug)}" role="link" tabindex="0">
      ${canModerate ? '<button class="gdel" type="button" title="remove (moderator)">×</button>' : ''}
      <div class="pf-tile-thumb">${thumb}</div>
      <div class="pf-tile-body">
        <h3>${escapeHTML(g.name)}</h3>
        <p>${escapeHTML(g.desc || 'cooked with grok')}</p>
        <div class="pf-tile-meta">${fmtPlays(plays)} plays</div>
      </div>
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
  $('pf-grid-count').textContent = `${games.length} total`;
}

function showXP(isOwner) {
  const xpEl = $('pf-xp');
  const badge = $('pf-level-badge');
  if (!isOwner) {
    xpEl.hidden = true;
    badge.hidden = true;
    return;
  }
  xpEl.hidden = false;
  renderProfileXP();
  const { level } = getProgress();
  badge.textContent = `Lv ${level}`;
  badge.hidden = false;
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
  $('pf-avatar').innerHTML = avatarMarkup(profile.avatar_url, profile.username, 'pf-avatar-img');
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
    const row = e.target.closest('.pf-game-tile');
    if (row && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      if (!e.target.closest('.gdel')) window.location.href = row.dataset.href;
    }
  };
}

const SHARE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>`;

function renderActions(isOwner) {
  const slot = $('pf-actions');
  const shareBtn = `<button class="pf-btn icon pf-share" id="pf-share" type="button" aria-label="share this profile" title="share profile">${SHARE_SVG}</button>`;
  let main;
  if (isOwner) {
    main = `<button class="pf-btn ghost" id="pf-edit-btn" type="button">Edit page</button>`;
  } else if (!viewer) {
    main = `<button class="pf-btn primary" id="pf-follow" type="button">Follow</button>`;
  } else {
    main = `<button class="pf-btn ${following ? 'following' : 'primary'}" id="pf-follow" type="button">${following ? 'Following' : 'Follow'}</button>`;
  }
  slot.innerHTML = main + shareBtn;

  if (isOwner) $('pf-edit-btn').onclick = openEdit;
  else if (!viewer) $('pf-follow').onclick = () => showToast('sign in to follow creators');
  else $('pf-follow').onclick = toggleFollow;
  $('pf-share').onclick = shareProfile;
}

// One-click share: native share sheet where supported, else copy the link.
async function shareProfile() {
  const url = `${location.origin}/${profile.username}`;
  const title = `${profile.display_name || profile.username} on slop.game`;
  if (navigator.share) {
    try {
      await navigator.share({ title, text: `check out @${profile.username}'s games on slop.game`, url });
    } catch { /* user cancelled the share sheet — do nothing */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('profile link copied!');
  } catch {
    showToast(url);
  }
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
    const row = del.closest('.pf-game-tile');
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
  const row = e.target.closest('.pf-game-tile');
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
    : `<span class="pf-banner-placeholder">upload a banner</span>`;
}

function openEdit() {
  buildBgPresets();
  $('pf-edit-name').value = profile.display_name || '';
  $('pf-edit-tagline').value = profile.tagline || '';
  $('pf-edit-bio').value = profile.bio || '';
  $('pf-edit-link').value = profile.link || '';
  $('pf-edit-prev').innerHTML = avatarMarkup(profile.avatar_url, profile.username, 'pf-avatar-prev');
  $('pf-edit-error').textContent = '';
  pendingAvatarUrl = undefined;
  pendingBannerUrl = undefined;
  bannerCleared = false;
  setBgPicker(profile.bg_color || DEFAULT_BG);
  renderBannerPreview(profile.banner_url);
  const sv = $('pf-edit-save');
  sv.disabled = false; sv.textContent = 'Save profile'; sv.classList.remove('saved');
  $('pf-edit').classList.remove('hidden');
}

function closeEdit() { $('pf-edit').classList.add('hidden'); }

$('pf-edit-cancel').onclick = closeEdit;
$('pf-edit-cancel-foot').onclick = closeEdit;
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
  err.textContent = 'uploading banner…';
  $('pf-edit-save').disabled = true;
  try {
    pendingBannerUrl = await api.uploadBanner(file);
    bannerCleared = false;
    renderBannerPreview(pendingBannerUrl);
    err.textContent = '';
  } catch (e2) {
    err.textContent = e2.message || 'upload failed';
    pendingBannerUrl = undefined;
  } finally {
    $('pf-edit-save').disabled = false;
  }
});

$('pf-edit-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const err = $('pf-edit-error');
  if (file.size > 3 * 1024 * 1024) { err.textContent = 'image too big — max 3 MB'; return; }
  err.textContent = 'uploading photo…';
  $('pf-edit-save').disabled = true;
  try {
    pendingAvatarUrl = await api.uploadAvatar(file);
    $('pf-edit-prev').innerHTML = `<img class="pf-avatar-prev" src="${escapeHTML(pendingAvatarUrl)}" alt="preview">`;
    err.textContent = '';
  } catch (e2) {
    err.textContent = e2.message || 'upload failed';
    pendingAvatarUrl = undefined;
  } finally {
    $('pf-edit-save').disabled = false;
  }
});

$('pf-edit-save').addEventListener('click', async () => {
  const btn = $('pf-edit-save');
  const err = $('pf-edit-error');
  err.textContent = '';
  btn.disabled = true;
  btn.classList.remove('saved');
  btn.textContent = 'Saving…';
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
    $('pf-avatar').innerHTML = avatarMarkup(profile.avatar_url, profile.username, 'pf-avatar-img');
    renderBioLink();
    btn.textContent = 'Saved ✓';
    btn.classList.add('saved');
    showToast('profile updated');
    setTimeout(() => { closeEdit(); btn.textContent = 'Save profile'; btn.classList.remove('saved'); btn.disabled = false; }, 600);
  } catch (e2) {
    err.textContent = e2.message || 'could not save';
    btn.textContent = 'Save profile';
    btn.disabled = false;
  }
});

initAccount();
initNav({ filterGrid: false });
initXP();
initPricing();
initAds();
render().catch((err) => {
  console.error('[profile] render failed', err);
  showMissing('something broke — try refreshing');
});
