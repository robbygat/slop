// Public profile page for /{username}: shows the creator's published games.
// Moderators get a "remove" control on each card (soft-delete via RLS).

import { api, escapeHTML } from './api.js';
import { initAccount } from './account.js';
import { loadPlays, playCount, fmtPlays } from './plays.js';
import { showToast } from './toast.js';

// username from ?u= (set by 404.html) or directly from the path /{username}
const params = new URLSearchParams(location.search);
const username = params.get('u') || decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '');

const $ = (id) => document.getElementById(id);

function cardHTML(g, canModerate) {
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
  // tidy the address bar to the pretty /{username}
  if (username && location.pathname !== `/${username}`) {
    history.replaceState(null, '', `/${username}`);
  }
  document.title = username ? `@${username} — slop.game` : 'profile — slop.game';

  if (!username) { showMissing('no username given'); return; }

  const profile = await api.profileByUsername(username);
  if (!profile) { showMissing(); return; }

  // header
  $('profile-head').hidden = false;
  $('profile-name').textContent = profile.display_name || `@${profile.username}`;
  $('profile-handle').textContent = `@${profile.username}`;
  const avatar = $('profile-avatar');
  if (profile.avatar_url) {
    avatar.outerHTML = `<img class="profile-avatar" id="profile-avatar" src="${escapeHTML(profile.avatar_url)}" alt="@${escapeHTML(profile.username)}">`;
  } else {
    avatar.textContent = (profile.username[0] || 'S').toUpperCase();
  }

  await loadPlays().catch(() => {});
  const games = await api.gamesByOwner(profile.id);
  $('profile-stat').textContent = `${games.length} published game${games.length === 1 ? '' : 's'}`;

  const me = await api.me().catch(() => null);
  const canModerate = !!me?.is_moderator;
  const grid = $('profile-grid');
  grid.innerHTML = games.length
    ? games.map((g) => cardHTML(g, canModerate)).join('')
    : `<p class="profile-empty">@${escapeHTML(profile.username)} hasn't published a game yet — <a href="studio.html">open the studio</a> and cook one.</p>`;

  grid.addEventListener('click', onGridClick);
}

function showMissing(msg) {
  $('profile-head').hidden = true;
  $('profile-status').innerHTML = `<p class="profile-missing">${escapeHTML(msg || `no creator named “${username}” on slop.game`)} — <a href="/">back to the homepage</a>.</p>`;
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
  if (e.target.closest('.gcta')) return; // let the play/remix links work
  const card = e.target.closest('.gcard');
  if (card) {
    const link = card.querySelector('.gcta');
    if (link) window.location.href = link.getAttribute('href');
  }
}

// boot: nav auth (sign-in button) alongside the profile render.
initAccount();
render();
