// Games grid: the real launch games (with actual gameplay screenshots as
// thumbnails), community-published games from the database, and your own
// AI-cooked games persisted in localStorage.

import { showToast } from './toast.js';
import { api } from './api.js';
import { playCount, fmtPlays, recordPlay, loadPlays } from './plays.js';
import { LAUNCH_THUMBS } from './launch-thumbs.js';

// ---------------------------------------------------------------- cooked games store

const COOKED_KEY = 'slop-cooked-games';

export function getCookedGames() {
try { return JSON.parse(localStorage.getItem(COOKED_KEY)) || []; }
catch { return []; }
}

export function getCookedGame(id) {
return getCookedGames().find((g) => g.id === id) || null;
}

export function saveCookedGames(list) {
localStorage.setItem(COOKED_KEY, JSON.stringify(list));
}

export function addCookedGame(game) {
const list = getCookedGames();
list.unshift(game);
saveCookedGames(list);
rerenderGrid();
return game;
}

export function updateCookedGame(id, patch) {
const list = getCookedGames();
const idx = list.findIndex((g) => g.id === id);
if (idx < 0) return null;
list[idx] = { ...list[idx], ...patch };
saveCookedGames(list);
return list[idx];
}

export function deleteCookedGame(id) {
saveCookedGames(getCookedGames().filter((g) => g.id !== id));
rerenderGrid();
}

// ---------------------------------------------------------------- launch games

const games = [
{
id: 'run3',
name: 'Run 3',
thumb: LAUNCH_THUMBS.run3,
previewVideo: 'assets/run3-preview.mp4',
desc: 'a gravity-bending space tunnel runner — flip gravity onto the walls, dodge the crumbling holes, and race a friend side by side over a shared seeded track. live-remixable mid-run.',
creator: 'slop.game team',
tags: ['Multiplayer', 'Action'],
href: 'games/run3/index.html',
multi: true,
featured: true,
createdAt: Date.now(),
remixHref: 'games/run3/index.html?remix=1',
},
{
id: 'slopkart',
name: 'SlopKart',
thumb: LAUNCH_THUMBS.slopkart,
desc: 'a fully 3D kart racer — drift for turbo boost, grab item boxes, sling shells, and battle AI racers or 4 friends online across a neon circuit. remixable mid-race.',
creator: 'slop.game team',
tags: ['Multiplayer', 'Racing'],
href: 'games/slopkart/index.html',
multi: true,
remixHref: 'games/slopkart/index.html?remix=1',
},
{
id: 'sloppy-zombies',
name: 'Sloppy Zombies',
thumb: LAUNCH_THUMBS['sloppy-zombies'],
desc: 'round-based undead survival — board the windows, bank your points, spin the mystery box, and hold out with up to 4 friends. fully live-remixable.',
creator: 'slop.game team',
tags: ['Multiplayer', 'Action'],
href: 'games/sloppy-zombies/index.html',
multi: true,
remixHref: 'games/sloppy-zombies/index.html?remix=1',
},
{
id: 'dungeon-panic',
name: 'Dungeon Panic',
thumb: LAUNCH_THUMBS['dungeon-panic'],
desc: 'roguelike dungeon crawler. fight horrors. collect power-ups. die gloriously. up to 4 players via shared link.',
creator: 'slop.game team',
tags: ['Multiplayer', 'RPG'],
href: 'games/dungeon-panic/index.html',
multi: true,
remixHref: 'games/dungeon-panic/index.html?remix=1',
},
{
id: 'umbral-red',
name: 'Umbral Red',
thumb: LAUNCH_THUMBS['umbral-red'],
desc: 'a creature-taming RPG from an alternate universe — roam the tall grass, battle wild umbrae, and bind them to your lantern.',
creator: 'slop.game team',
tags: ['RPG'],
href: 'games/umbral-red/index.html',
remixHref: 'games/umbral-red/index.html?remix=1',
},
{
id: 'slopcraft',
name: 'Slopcraft',
thumb: LAUNCH_THUMBS.slopcraft,
desc: 'a first-person voxel sandbox — mine, build, and reshape a fully destructible blocky world. your builds save automatically.',
creator: 'slop.game team',
tags: ['Sandbox'],
href: 'games/slopcraft/index.html',
remixHref: 'games/slopcraft/index.html?remix=1',
},
];

// the built-in launch games, exposed for other modules (e.g. the App Store phone)
export function getLaunchGames() { return games.slice(); }

function escapeHTML(s) {
return String(s ?? '').replace(/[&<>"']/g, (c) => (
{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
}

function thumbMedia(g, { video = false } = {}) {
if (video && g.previewVideo) {
return `<video class="gthumb-video" src="${escapeHTML(g.previewVideo)}" autoplay muted loop playsinline preload="auto" aria-label="${escapeHTML(g.name)} gameplay preview"></video>`;
}
if (g.thumb) {
return `<img src="${g.thumb}" alt="${escapeHTML(g.name)} gameplay screenshot" loading="lazy">`;
}
return `<span class="gthumb-fallback">${escapeHTML(g.name)}</span>`;
}

function cardHTML(g, opts = {}) {
const useVideo = opts.video && g.previewVideo;
const v2 = opts.v2 !== false;
const cardClass = `gcard${g.featured ? ' featured' : ''}${v2 ? ' gcard-v2' : ''}`;
const overlayMeta = v2
? `<div class="gthumb-scrim"></div>
<div class="gthumb-meta"><span class="gcat">${escapeHTML(g.tags?.[0] || 'Game')}</span><h3>${escapeHTML(g.name)}</h3></div>`
: '';
return `
<article class="${cardClass}" data-id="${g.id}" data-href="${g.href}">
<div class="gthumb shot">
${thumbMedia(g, { video: useVideo })}
${overlayMeta}
${opts.hot ? '<span class="gbadge hot">#1 on slop.game</span>' : ''}
${g.multi ? '<span class="gmulti">MULTIPLAYER</span>' : ''}
<div class="gplay" aria-hidden="true"></div>
<button class="greport" data-report="${g.id}" data-report-name="${escapeHTML(g.name)}" title="report this game"></button>
</div>
<div class="gbody">
${v2 ? '' : `<span class="gcat">${escapeHTML(g.tags?.[0] || 'Game')}</span><div class="gtitle-row"><h3>${escapeHTML(g.name)}</h3></div>`}
<p class="gdesc">${escapeHTML(g.desc)}</p>
<div class="gmeta">
<span class="gcreator">${escapeHTML(g.creator)}</span>
<span class="gplays">${fmtPlays(playCount(g.id))} plays</span>
</div>
<div class="gcta-row">
<a class="gcta" href="${g.href}">Play Now</a>
${g.remixHref ? `<a class="gcta remix" href="${g.remixHref}">Remix Live</a>` : ''}
</div>
</div>
</article>`;
}

function cookedCardHTML(g) {
const thumb = g.thumb
? `<img src="${g.thumb}" alt="${escapeHTML(g.name)} gameplay screenshot" loading="lazy">`
: `<span class="gthumb-fallback">${escapeHTML(g.name)}</span>`;
return `
<article class="gcard cooked gcard-v2" data-cooked-id="${g.id}">
<div class="gthumb shot">
${thumb}
<div class="gthumb-scrim"></div>
<div class="gthumb-meta"><span class="gcat">AI-Gen</span><h3>${escapeHTML(g.name)}</h3></div>
<span class="gbadge">AI-cooked</span>
<button class="gdel" title="delete this game">X</button>
<div class="gplay" aria-hidden="true"></div>
<button class="greport" data-report="${g.id}" data-report-name="${escapeHTML(g.name)}" title="report this game"></button>
</div>
<div class="gbody">
<p class="gdesc">${escapeHTML(g.desc || g.prompt || 'cooked with grok')}</p>
<div class="gmeta">
<span class="gcreator">you${g.remixOf ? ' · remix' : ''}</span>
<span class="gplays">${fmtPlays(playCount(g.id))} plays</span>
</div>
<div class="gcta-row">
<a class="gcta" href="play.html?id=${encodeURIComponent(g.id)}">Play &amp; Remix</a>
<a class="gcta remix" href="studio.html?id=${encodeURIComponent(g.id)}">Open in Studio</a>
</div>
</div>
</article>`;
}

function communityCardHTML(g) {
const thumb = g.thumb
? `<img src="${g.thumb}" alt="${escapeHTML(g.name)} gameplay screenshot" loading="lazy">`
: `<span class="gthumb-fallback">${escapeHTML(g.name)}</span>`;
return `
<article class="gcard community gcard-v2" data-community-id="${g.id}">
<div class="gthumb shot">
${thumb}
<div class="gthumb-scrim"></div>
<div class="gthumb-meta"><span class="gcat">Community</span><h3>${escapeHTML(g.name)}</h3></div>
<span class="gbadge">community</span>
<div class="gplay" aria-hidden="true"></div>
<button class="greport" data-report="${g.id}" data-report-name="${escapeHTML(g.name)}" title="report this game"></button>
</div>
<div class="gbody">
<p class="gdesc">${escapeHTML(g.desc || 'cooked with grok')}</p>
<div class="gmeta">
<span class="gcreator">@${escapeHTML(g.username)}</span>
<span class="gplays">${fmtPlays(totalPlays(g))} plays</span>
</div>
<div class="gcta-row">
<a class="gcta" href="play.html?cid=${encodeURIComponent(g.id)}">Play &amp; Remix</a>
<a class="gcta remix" href="studio.html?remix=${encodeURIComponent(g.id)}">Remix in Studio</a>
</div>
</div>
</article>`;
}

let currentTag = 'All';
let currentSort = 'popular'; // 'popular' | 'newest'
let query = '';
let communityGames = [];

const matchesQuery = (g, q) => {
if (!q) return true;
const hay = `${g.name} ${g.desc || ''} ${g.prompt || ''} ${(g.tags || []).join(' ')} ${g.creator || g.username || ''}`.toLowerCase();
return hay.includes(q);
};

// Real play count for any game kind — the shared server tally keyed by id (falls
// back to the catalog's `plays` for community games when the backend is offline).
function totalPlays(g) {
return playCount(g.id) || (typeof g.plays === 'number' ? g.plays : 0);
}

// Newest-first key. Launch games have no timestamp (id 0) so fresh user/community
// creations rise to the top under the Newest sort.
const createdAt = (g) => g.createdAt || g.created_at || 0;

// Tag each game with the right card renderer so a merged list can be sorted as one.
function decorate(g, render) { return { g, render }; }

// The full, filtered set of games for the browse grid as one merged list.
function browseItems() {
const q = query.trim().toLowerCase();
const showUGC = !q ? (currentTag === 'All' || currentTag === 'AI-Gen') : true;
const launchList = (currentTag === 'All' || currentTag === 'AI-Gen' || query)
? games
: games.filter((g) => g.tags.includes(currentTag));
const cooked = (showUGC ? getCookedGames() : []).filter((g) => matchesQuery(g, q)).map((g) => decorate(g, cookedCardHTML));
const community = (showUGC ? communityGames : []).filter((g) => matchesQuery(g, q)).map((g) => decorate(g, communityCardHTML));
const launch = launchList.filter((g) => matchesQuery(g, q)).map((g) => decorate(g, cardHTML));
const items = [...cooked, ...launch, ...community];
if (currentSort === 'newest') items.sort((a, b) => createdAt(b.g) - createdAt(a.g));
else items.sort((a, b) => totalPlays(b.g) - totalPlays(a.g));
return items;
}

function renderGames() {
const grid = document.getElementById('games-grid');
if (!grid) return; // store helpers are also used on pages without the grid
const items = browseItems();
const html = items.map((it) => it.render(it.g)).join('');
grid.innerHTML = html || `<p style="grid-column:1/-1;text-align:center;color:var(--soft);font-weight:700;padding:40px">no games match “${escapeHTML(query)}” — try a different search, or <a href="#pwin" style="color:var(--pk)">cook one</a>.</p>`;
}

// Most Popular — Run 3 only, live gameplay video.
function renderPopular() {
const grid = document.getElementById('popular-grid');
if (!grid) return;
const run3 = games.find((g) => g.id === 'run3');
if (!run3) {
grid.innerHTML = '';
return;
}
grid.innerHTML = cardHTML({ ...run3, featured: true }, { video: true, hot: true, v2: false });
grid.querySelector('video.gthumb-video')?.play().catch(() => {});
}

export function rerenderGrid() {
renderGames();
renderPopular();
// hide the static "most popular" row while searching so the results grid is
// the only thing on screen — otherwise search looks like it did nothing.
const searching = !!query.trim();
const pop = document.getElementById('popular-grid');
const popHead = document.querySelector('.pop-head');
if (pop) pop.style.display = searching ? 'none' : '';
if (popHead) popHead.style.display = searching ? 'none' : '';
}

export function setSort(sort) {
currentSort = sort === 'newest' ? 'newest' : 'popular';
document.querySelectorAll('#sort-row .sbtn').forEach((b) => b.classList.toggle('active', b.dataset.sort === currentSort));
renderGames();
}

function filterGames(tag, buttonEl) {
document.querySelectorAll('.fbtn').forEach((b) => b.classList.remove('active'));
buttonEl.classList.add('active');
currentTag = tag;
rerenderGrid();
}

export function setSearchQuery(q) {
query = q || '';
rerenderGrid();
}

async function reportGame(id, name) {
const reason = window.prompt(`Report “${name}”\n\nWhat's wrong with this game? (broken, offensive, stolen, spam…)`, '');
if (reason === null) return; // cancelled
try {
const res = await api.reportGame(id, name, reason);
showToast(res ? 'thanks — our team will take a look ' : 'report saved locally (backend offline)');
} catch (err) {
showToast(err.message || 'could not send report');
}
}

// shared click handler for both the browse grid and the popular row
function onGridClick(e) {
// report button — handle before the play-record / navigation logic
const rep = e.target.closest('.greport');
if (rep) {
e.preventDefault();
e.stopPropagation();
reportGame(rep.dataset.report, rep.dataset.reportName || 'this game');
return;
}

// Count a play when opening a launch game (their standalone pages don't
// self-report). Cooked & community games are counted by play.html on boot, so
// we don't also count them here — that would double-count.
const anyCard = e.target.closest('.gcard');
if (anyCard && anyCard.dataset.id && !e.target.closest('.gdel')) {
recordPlay(anyCard.dataset.id);
}
if (e.target.closest('.gcta')) return; // let the real links work

const del = e.target.closest('.gdel');
if (del) {
const cookedCard = del.closest('.gcard');
deleteCookedGame(cookedCard.dataset.cookedId);
showToast('game tossed back in the pot');
return;
}

const card = e.target.closest('.gcard');
if (!card) return;
if (card.dataset.cookedId) {
window.location.href = `play.html?id=${encodeURIComponent(card.dataset.cookedId)}`;
} else if (card.dataset.communityId) {
window.location.href = `play.html?cid=${encodeURIComponent(card.dataset.communityId)}`;
} else if (card.dataset.href) {
window.location.href = card.dataset.href;
}
}

export function initGamesGrid() {
rerenderGrid();

// pull the real, global play counts then repaint with honest numbers
loadPlays().then(rerenderGrid);

// pull community-published games from the backend (no-op when offline)
api.communityGames().then((list) => {
if (list?.length) {
communityGames = list;
rerenderGrid();
}
});

document.querySelectorAll('#filter-row .fbtn').forEach((btn) => {
btn.addEventListener('click', () => filterGames(btn.dataset.tag, btn));
});

document.querySelectorAll('#sort-row .sbtn').forEach((btn) => {
btn.addEventListener('click', () => setSort(btn.dataset.sort));
});

document.getElementById('games-grid').addEventListener('click', onGridClick);
document.getElementById('popular-grid')?.addEventListener('click', onGridClick);
}
