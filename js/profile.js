// Public profile page for /{username} — "social for games".
// Shows the creator's avatar, display name, follower count (never "following"),
// and their published games. Visitors can follow; the owner can edit their
// profile; moderators can remove games.

import { api, escapeHTML } from './api.js';
import { initAccount } from './account.js';
import { loadPlays, playCount, fmtPlays } from './plays.js';
import { initNav } from './nav.js';
import { showToast } from './toast.js';

const params = new URLSearchParams(location.search);
const username = params.get('u') || decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '');

const $ = (id) => document.getElementById(id);

const COVER_THEMES = [
  { id: 'sunset', label: 'Sunset' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'neon', label: 'Neon' },
  { id: 'mint', label: 'Mint' },
  { id: 'purple', label: 'Purple' },
  { id: 'fire', label: 'Fire' },
  { id: 'candy', label: 'Candy' },
  { id: 'mono', label: 'Mono' },
];

const ACCENT_COLORS = [
  { id: 'pink', label: 'Pink' },
  { id: 'blue', label: 'Blue' },
  { id: 'mint', label: 'Mint' },
  { id: 'orange', label: 'Orange' },
  { id: 'purple', label: 'Purple' },
  { id: 'yellow', label: 'Yellow' },
  { id: 'ink', label: 'Ink' },
];

let profile = null;
let viewer = null;
let following = false;
let ownerGames = [];
let pendingAvatarUrl;

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
  return `since ${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
}

function applyTheme(profileData) {
  const cover = $('pf-cover');
  const body = $('pf-body');
  const theme = profileData.cover_theme || 'sunset';
  const accent = profileData.accent_color || 'pink';

  cover.className = `pf-cover theme-${theme}`;
  body.className = `accent-${accent}`;
}

function renderBioLink() {
  const bioEl = $('pf-bio');
  const linkEl = $('pf-link');
  const tagEl = $('pf-tagline');
  const memberEl = $('pf-member');

  if (profile.tagline) {
    tagEl.textContent = profile.tagline;
    tagEl.hidden = false;
  } else {
    tagEl.hidden = true;
  }

  if (profile.bio) {
    bioEl.textContent = profile.bio;
    bioEl.hidden = false;
  } else {
    bioEl.hidden = true;
  }

  if (profile.link) {
    linkEl.href = profile.link;
    linkEl.textContent = profile.link.replace(/^https?:\/\//, '').replace(/\/$/, '');
    linkEl.hidden = false;
  } else {
    linkEl.hidden = true;
  }

  const since = fmtMemberSince(profile.created_at);
  if (since) {
    memberEl.textContent = since;
    memberEl.hidden = false;
  } else {
    memberEl.hidden = true;
  }
}

function totalPlaysForGames(games) {
  return games.reduce((sum, g) => sum + (playCount(g.slug) || g.play_count || 0), 0);
}

function gameCard(g, canModerate) {
  const plays = playCount(g.slug) || g.play_count || 0;
  const thumb = g.thumb
    ? `<img src="${escapeHTML(g.thumb)}" alt="${escapeHTML(g.name)} screenshot" loading="lazy">`
    : `<span class="gthumb-fallback">${escapeHTML(g.name)}</span>`;
  return `
    <article class="gcard community gcard-v2" data-game-id="${escapeHTML(g.gameId)}" data-slug="${escapeHTML(g.slug)}" data-name="${escapeHTML(g.name)}">
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
          <span class="gplays">${fmtPlays(plays)} plays</span>
        </div>
        <div class="gcta-row">
          <a class="gcta" href="/play/${escapeHTML(g.slug)}">Play &amp; Remix</a>
          <a class="gcta remix" href="studio.html?remix=${encodeURIComponent(g.slug)}">Remix in Studio</a>
        </div>
      </div>
    </article>`;
}

function renderGamesGrid(games, canModerate) {
  const grid = $('pf-grid');
  if (!games.length) {
    grid.innerHTML = `<p class="pf-empty">@${escapeHTML(profile.username)} hasn't published a game yet — <a href="studio.html">open the studio</a> and cook one.</p>`;
    return;
  }
  grid.innerHTML = games.map((g) => gameCard(g, canModerate)).join('');
}

function updateStats(games) {
  $('pf-plays').textContent = fmtPlays(totalPlaysForGames(games));
  $('pf-games-count').textContent = games.length;
  $('pf-grid-count').textContent = games.length;
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

  applyTheme(profile);

  $('pf-name').textContent = profile.display_name || `@${profile.username}`;
  $('pf-handle').textContent = `@${profile.username}`;
  $('pf-avatar').innerHTML = avatarMarkup(profile.avatar_url, profile.username, 'pf-avatar');
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
  renderGamesGrid(games, !!viewer?.is_moderator);
  $('pf-grid').onclick = onGridClick;
}

function renderActions(isOwner) {
  const slot = $('pf-actions');
  if (isOwner) {
    slot.innerHTML = `<button class="pf-btn ghost" id="pf-edit-btn">Customize profile</button>`;
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
    $('pf-followers').textContent = fmtPlays(await api.followerCount(profile.id));
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
    if (ok) {
      card.remove();
      ownerGames = ownerGames.filter((g) => g.gameId !== card.dataset.gameId);
      updateStats(ownerGames);
      if (!ownerGames.length) renderGamesGrid([], false);
      showToast('game removed');
    } else {
      showToast('could not remove — are you signed in as a moderator?');
    }
    return;
  }
  if (e.target.closest('.gcta')) return;
  const card = e.target.closest('.gcard');
  if (card) {
    const link = card.querySelector('.gcta');
    if (link) window.location.href = link.getAttribute('href');
  }
}

// ---------------------------------------------------------------- customization pickers

let editCoverTheme = 'sunset';
let editAccentColor = 'pink';

function buildPickers() {
  const themesEl = $('pf-edit-themes');
  const accentsEl = $('pf-edit-accents');
  if (!themesEl || themesEl.childElementCount) return;

  themesEl.innerHTML = COVER_THEMES.map((t) =>
    `<button type="button" class="pf-swatch theme-${t.id}" role="radio" aria-checked="false" aria-label="${t.label}" data-theme="${t.id}"></button>`
  ).join('');

  accentsEl.innerHTML = ACCENT_COLORS.map((a) =>
    `<button type="button" class="pf-swatch accent-${a.id}" role="radio" aria-checked="false" aria-label="${a.label}" data-accent="${a.id}"></button>`
  ).join('');

  themesEl.onclick = (e) => {
    const btn = e.target.closest('[data-theme]');
    if (!btn) return;
    editCoverTheme = btn.dataset.theme;
    themesEl.querySelectorAll('[data-theme]').forEach((el) => {
      el.setAttribute('aria-checked', el === btn ? 'true' : 'false');
    });
    $('pf-preview-cover').className = `pf-preview-cover theme-${editCoverTheme}`;
  };

  accentsEl.onclick = (e) => {
    const btn = e.target.closest('[data-accent]');
    if (!btn) return;
    editAccentColor = btn.dataset.accent;
    accentsEl.querySelectorAll('[data-accent]').forEach((el) => {
      el.setAttribute('aria-checked', el === btn ? 'true' : 'false');
    });
    $('pf-preview-avatar').style.background = getAccentHex(editAccentColor);
  };
}

function getAccentHex(id) {
  return {
    pink: '#FF4EB8', blue: '#4ECAFF', mint: '#3DFFB0',
    orange: '#FF7A35', purple: '#B94EFF', yellow: '#FFE135', ink: '#1A1A2E',
  }[id] || '#FF4EB8';
}

function setPickerState(theme, accent) {
  editCoverTheme = theme || 'sunset';
  editAccentColor = accent || 'pink';
  $('pf-edit-themes')?.querySelectorAll('[data-theme]').forEach((el) => {
    el.setAttribute('aria-checked', el.dataset.theme === editCoverTheme ? 'true' : 'false');
  });
  $('pf-edit-accents')?.querySelectorAll('[data-accent]').forEach((el) => {
    el.setAttribute('aria-checked', el.dataset.accent === editAccentColor ? 'true' : 'false');
  });
  $('pf-preview-cover').className = `pf-preview-cover theme-${editCoverTheme}`;
  $('pf-preview-avatar').style.background = getAccentHex(editAccentColor);
}

function updateEditPreview() {
  const name = $('pf-edit-name').value.trim() || profile.display_name || `@${profile.username}`;
  $('pf-preview-name').textContent = name;
  const prevUrl = pendingAvatarUrl ?? profile.avatar_url;
  $('pf-preview-avatar').innerHTML = avatarMarkup(prevUrl, profile.username, 'pf-preview-avatar');
  $('pf-preview-avatar').style.background = getAccentHex(editAccentColor);
}

// ---------------------------------------------------------------- edit profile

function openEdit() {
  buildPickers();
  $('pf-edit-name').value = profile.display_name || '';
  $('pf-edit-tagline').value = profile.tagline || '';
  $('pf-edit-bio').value = profile.bio || '';
  $('pf-edit-link').value = profile.link || '';
  $('pf-bio-count').textContent = ($('pf-edit-bio').value || '').length;
  $('pf-tagline-count').textContent = ($('pf-edit-tagline').value || '').length;
  $('pf-edit-prev').innerHTML = avatarMarkup(profile.avatar_url, profile.username, 'pf-avatar-prev');
  $('pf-edit-error').textContent = '';
  pendingAvatarUrl = undefined;
  setPickerState(profile.cover_theme, profile.accent_color);
  updateEditPreview();
  $('pf-edit').classList.remove('hidden');
}

document.getElementById('pf-edit-bio')?.addEventListener('input', (e) => {
  $('pf-bio-count').textContent = e.target.value.length;
});
document.getElementById('pf-edit-tagline')?.addEventListener('input', (e) => {
  $('pf-tagline-count').textContent = e.target.value.length;
});
document.getElementById('pf-edit-name')?.addEventListener('input', updateEditPreview);

function closeEdit() { $('pf-edit').classList.add('hidden'); }

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
    updateEditPreview();
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
      cover_theme: editCoverTheme,
      accent_color: editAccentColor,
    };
    if (pendingAvatarUrl !== undefined) patch.avatar_url = pendingAvatarUrl;
    await api.updateProfile(patch);
    const fresh = await api.profileByUsername(profile.username).catch(() => null);
    profile = fresh || { ...profile, ...patch };
    applyTheme(profile);
    $('pf-name').textContent = profile.display_name || `@${profile.username}`;
    $('pf-avatar').innerHTML = avatarMarkup(profile.avatar_url, profile.username, 'pf-avatar');
    renderBioLink();
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
initNav({ filterGrid: false });
render().catch((err) => {
  console.error('[profile] render failed', err);
  showMissing('something broke loading this profile — try refreshing');
});
