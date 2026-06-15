// Global search: live results for both PLAYERS and GAMES from Supabase, shown in
// a dropdown under the nav search box. Games also filter the browse grid (so the
// existing grid search keeps working), but the dropdown is the thing that makes
// "search a player" / "jump straight to a game" actually work.

import { api, escapeHTML } from './api.js';
import { setSearchQuery } from './games-grid.js';
import { fmtPlays } from './plays.js';

let pop = null;
let input = null;
let token = 0; // guards against out-of-order async responses
let activeIndex = -1;
let items = []; // flat list of { type, href } for keyboard nav

function ensurePop() {
  if (pop) return pop;
  pop = document.createElement('div');
  pop.className = 'search-pop hidden';
  pop.addEventListener('mousedown', (e) => e.preventDefault()); // keep input focus
  document.body.appendChild(pop);
  return pop;
}

function position() {
  if (!pop || !input) return;
  const r = input.getBoundingClientRect();
  const width = Math.max(r.width, 320);
  let left = r.left;
  // keep within viewport on mobile
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
  pop.style.left = `${left}px`;
  pop.style.top = `${r.bottom + 8}px`;
  pop.style.width = `${width}px`;
}

function close() {
  pop?.classList.add('hidden');
  activeIndex = -1;
  items = [];
}

function avatar(url, name) {
  return url
    ? `<img class="sp-av" src="${escapeHTML(url)}" alt="">`
    : `<span class="sp-av sp-av-fb">${escapeHTML((name?.[0] || 'S').toUpperCase())}</span>`;
}

function render(players, games, q) {
  ensurePop();
  items = [];
  let html = '';

  if (players.length) {
    html += `<div class="sp-head">Players</div>`;
    for (const p of players) {
      const href = `/${p.username}`;
      items.push({ href });
      html += `<a class="sp-row" href="${escapeHTML(href)}" data-i="${items.length - 1}">
        ${avatar(p.avatar_url, p.username)}
        <span class="sp-main"><b>@${escapeHTML(p.username)}</b>${p.display_name ? `<span class="sp-sub">${escapeHTML(p.display_name)}</span>` : ''}</span>
        <span class="sp-tag">player</span></a>`;
    }
  }

  if (games.length) {
    html += `<div class="sp-head">Games</div>`;
    for (const g of games) {
      const href = `/play/${g.slug}`;
      items.push({ href });
      const t = g.thumb
        ? `<img class="sp-av sp-thumb" src="${escapeHTML(g.thumb)}" alt="">`
        : `<span class="sp-av sp-av-fb">${escapeHTML((g.name?.[0] || 'G').toUpperCase())}</span>`;
      html += `<a class="sp-row" href="${escapeHTML(href)}" data-i="${items.length - 1}">
        ${t}
        <span class="sp-main"><b>${escapeHTML(g.name)}</b><span class="sp-sub">@${escapeHTML(g.username)} · ${fmtPlays(g.play_count || 0)} plays</span></span>
        <span class="sp-tag">game</span></a>`;
    }
  }

  if (!html) {
    html = `<div class="sp-empty">no players or games match “${escapeHTML(q)}”.</div>`;
  }

  pop.innerHTML = html;
  pop.classList.remove('hidden');
  position();
  activeIndex = -1;
  pop.querySelectorAll('.sp-row').forEach((row) => {
    row.addEventListener('click', () => { window.location.href = row.getAttribute('href'); });
  });
}

async function run(q) {
  const mine = ++token;
  const [players, games] = await Promise.all([
    api.searchProfiles(q).catch(() => []),
    api.searchGames(q).catch(() => []),
  ]);
  if (mine !== token) return; // a newer query superseded this one
  render(players, games, q);
}

function highlight(next) {
  const rows = pop?.querySelectorAll('.sp-row') || [];
  if (!rows.length) return;
  activeIndex = (next + rows.length) % rows.length;
  rows.forEach((r, i) => r.classList.toggle('active', i === activeIndex));
  rows[activeIndex]?.scrollIntoView({ block: 'nearest' });
}

export function initSearch() {
  input = document.getElementById('nav-search-input');
  if (!input) return;
  let debounce = null;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    setSearchQuery(input.value); // keep filtering the browse grid too
    clearTimeout(debounce);
    if (q.length < 1) { close(); return; }
    debounce = setTimeout(() => run(q), 160);
  });

  input.addEventListener('keydown', (e) => {
    if (pop && !pop.classList.contains('hidden')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight(activeIndex + 1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); highlight(activeIndex - 1); return; }
      if (e.key === 'Enter' && activeIndex >= 0 && items[activeIndex]) {
        e.preventDefault();
        window.location.href = items[activeIndex].href;
        return;
      }
      if (e.key === 'Escape') { close(); return; }
    }
  });

  input.addEventListener('focus', () => { if (input.value.trim()) run(input.value.trim()); });
  document.addEventListener('click', (e) => {
    if (e.target !== input && !pop?.contains(e.target)) close();
  });
  window.addEventListener('resize', position);
  window.addEventListener('scroll', () => { if (pop && !pop.classList.contains('hidden')) position(); }, true);
}
