// Player page for AI-cooked games: runs the game in a sandboxed iframe and
// powers the live remix drawer — typed or spoken edits go to Grok, the rewrite
// is crash-tested in a hidden sandbox, and only a passing build gets
// hot-swapped into the iframe (so remixes can't brick your game).

import { chatStream, extractFence, extractMetaLine, MODELS, MODEL_CHOICES } from './ai.js';
import { getCookedGame, updateCookedGame, addCookedGame, getCookedGames, getLaunchGames, getLaunchGame } from './games-grid.js';
import { recordPlay, fmtPlays, playCount } from './plays.js';
import { showToast } from './toast.js';
import { testGameHTML } from './sandbox.js';
import { createSpeech } from './speech.js';
import { api, escapeHTML, timeAgo } from './api.js';
import { attachFrameMonitor, mountErrorOverlay, prepareGameHTML } from './debug.js';
import { listenForScores, mountLeaderboard } from './leaderboard.js';

const REMIX_SYSTEM = `You are the live remix engine for SLOP.game. You receive the COMPLETE source of an existing self-contained browser game plus a player's edit request. Apply the edit and return the COMPLETE UPDATED document.

RULES:
- Keep it ONE self-contained HTML file: inline <style>/<script>, no external resources, no localStorage/alert/prompt, must run in a sandboxed iframe.
- It must not throw any runtime errors — the rewrite is automatically rejected if a single uncaught error occurs. Guard everything.
- Change only what the request requires; preserve everything else (controls, scoring, restart, feel).
- On game over, submit the score: window.dispatchEvent(new CustomEvent('slop:score', { detail: { score: yourScoreNumber } }));
- Keep it working — broken output is the only failure mode.

OUTPUT FORMAT (STRICT):
Line 1: single-line JSON: {"summary":"what changed, max 60 chars","name":"Game Name","desc":"one-line description"} (keep name/desc the same unless the edit changes the game's identity)
Then exactly one \`\`\`html fenced code block with the full updated document. Nothing else.`;

const $ = (id) => document.getElementById(id);
const frame = $('game-frame');
let frameMonitor = null;
let errOverlay = null;
let scoreKey = null;

function loadHTML(html) {
  const shareBase = `${location.origin}${location.pathname}`;
  const room = params.get('room');
  return prepareGameHTML(html || '', { shareBase, room });
}

function configureFrame({ launch = false } = {}) {
  if (launch) {
    frame.removeAttribute('sandbox');
    frame.setAttribute('allow', 'fullscreen; autoplay; gamepad; pointer-lock');
    frame.setAttribute('allowfullscreen', '');
  } else {
    frame.setAttribute('sandbox', 'allow-scripts allow-pointer-lock');
    frame.removeAttribute('allow');
    frame.removeAttribute('allowfullscreen');
  }
}

function mountLaunchGame(launch) {
  configureFrame({ launch: true });
  frameMonitor?.destroy();
  frameMonitor = attachFrameMonitor(frame, {
    onErrors(errs) { errOverlay?.show(errs); },
  });
  frame.removeAttribute('srcdoc');
  const qs = new URLSearchParams();
  qs.set('play', '1');
  const room = params.get('room');
  if (room) qs.set('room', room);
  if (params.get('remix') === '1') qs.set('remix', '1');
  let src = launch.href;
  const extra = qs.toString();
  if (extra) src += (src.includes('?') ? '&' : '?') + extra;
  frame.src = src;
  errOverlay?.hide();
}

function mountGame(html) {
  if (isLaunch) {
    mountLaunchGame(game);
    return;
  }
  configureFrame({ launch: false });
  frameMonitor?.destroy();
  frameMonitor = attachFrameMonitor(frame, {
    onErrors(errs) { errOverlay?.show(errs); },
  });
  frame.removeAttribute('src');
  frame.srcdoc = loadHTML(html);
  errOverlay?.hide();
}

const params = new URLSearchParams(location.search);
const id = params.get('id');
// Resolve a published game from the pretty path /play/{slug}, ?slug=, or the
// legacy ?cid= query. Local AI-cooked games still come in via ?id=.
const pathSlug = (location.pathname.match(/^\/play\/([a-z0-9-]+)\/?$/i) || [])[1];
const slug = pathSlug || params.get('slug') || params.get('cid');
let game = id ? getCookedGame(id) : null;
let isCommunity = false;
let isLaunch = false;
let following = false;
let viewer = null;
let creatorGameCount = 0;
let sideCreatorGames = [];

function gameDiscoverKey(g, kind) {
  return kind === 'community' ? g.slug : g.id;
}

function discoverCardHTML(item, i) {
  const { g, kind, fromCreator } = item;
  const href = playHref(item);
  const tag = g.tags?.[0] || (kind === 'community' ? 'Community' : kind === 'cooked' ? 'AI-Gen' : 'Game');
  const upNext = i === 0 ? ' up-next' : '';
  const badge = i === 0
    ? '<span class="similar-badge">Up next</span>'
    : (fromCreator ? '<span class="similar-badge similar-badge-creator">Same creator</span>' : '');
  return `
    <a class="similar-card${upNext}" href="${escapeHTML(href)}">
      <div class="similar-thumb">
        ${badge}
        ${g.thumb ? `<img src="${escapeHTML(g.thumb)}" alt="" loading="lazy">` : ''}
      </div>
      <div class="similar-meta">
        <span class="similar-name">${escapeHTML(g.name)}</span>
        <span class="similar-tag">${escapeHTML(tag)} · ${fmtPlays(totalPlays(g))} plays</span>
      </div>
    </a>`;
}

function renderSideDiscover(creatorItems, similarItems) {
  const sec = $('side-discover');
  const row = $('side-discover-row');
  if (!sec || !row) return;

  const activeKey = game.slug || game.id;
  const seen = new Set();
  const merged = [];

  for (const item of creatorItems) {
    const k = gameDiscoverKey(item.g, item.kind);
    if (!k || k === activeKey || seen.has(k)) continue;
    seen.add(k);
    merged.push({ ...item, fromCreator: true });
  }
  for (const item of similarItems) {
    const k = gameDiscoverKey(item.g, item.kind);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    merged.push(item);
  }

  if (!merged.length) {
    sec.hidden = true;
    syncSidePanelVisibility();
    return;
  }

  row.innerHTML = merged.map((item, i) => discoverCardHTML(item, i)).join('');
  sec.hidden = false;
  syncSidePanelVisibility();
}

function totalPlays(g) {
  if (!g) return 0;
  const key = g.slug || g.id;
  return playCount(key) || g.play_count || g.plays || 0;
}

function playHref(item) {
  const { g, kind } = item;
  if (kind === 'cooked') return `play.html?id=${encodeURIComponent(g.id)}`;
  if (kind === 'community') return `/play/${encodeURIComponent(g.slug || g.id)}`;
  return `play.html?game=${encodeURIComponent(g.id)}`;
}

function gameShareUrl() {
  if (isCommunity && game.slug) return `${location.origin}/play/${encodeURIComponent(game.slug)}`;
  if (isLaunch && game.id) return `${location.origin}/play.html?game=${encodeURIComponent(game.id)}`;
  if (game.id) return `${location.origin}/play.html?id=${encodeURIComponent(game.id)}`;
  return location.href;
}

function initShare() {
  const input = $('share-url');
  const btn = $('share-copy');
  if (!input) return;
  const url = gameShareUrl();
  input.value = url;
  btn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('link copied');
    } catch {
      input.focus();
      input.select();
      document.execCommand('copy');
      showToast('link copied');
    }
  });
}

const MODEL_KEY = 'slop-model';

function shortModelLabel(choice) {
  if (!choice) return 'Model';
  const dash = choice.label.indexOf(' — ');
  return dash >= 0 ? choice.label.slice(0, dash) : choice.label;
}

function getRemixModel() {
  const saved = localStorage.getItem(MODEL_KEY);
  if (saved && MODEL_CHOICES.some((m) => m.id === saved)) return saved;
  return MODELS.remix;
}

function setRemixModelMenuOpen(open) {
  const wrap = $('remix-model-wrap');
  const btn = $('remix-model-btn');
  const menu = $('remix-model-menu');
  if (!wrap || !btn || !menu) return;
  wrap.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  menu.toggleAttribute('hidden', !open);
}

function paintRemixModelMenu(sel, list) {
  if (!list || !sel) return;
  list.innerHTML = MODEL_CHOICES.map((m) => {
    const on = m.id === sel.value;
    const lock = m.tier === 'pro' ? '<span class="remix-model-lock" aria-hidden="true">🔒</span>' : '';
    return `<button type="button" class="remix-model-opt${on ? ' active' : ''}" role="option" aria-selected="${on}" data-id="${m.id}">${lock}<span class="remix-model-opt-label">${escapeHTML(m.label)}</span></button>`;
  }).join('');
}

function syncRemixModelButton(sel) {
  const btn = $('remix-model-btn');
  const choice = MODEL_CHOICES.find((m) => m.id === sel?.value);
  if (!btn) return;
  const name = shortModelLabel(choice);
  btn.textContent = name;
  btn.title = choice ? `${choice.label}${choice.tier === 'pro' ? ' (Pro)' : ''}` : 'Choose AI model';
  btn.setAttribute('aria-label', choice ? `Model: ${name}. Choose remix model` : 'Choose remix model');
}

function initRemixModelPicker() {
  const sel = $('remix-model');
  const list = $('remix-model-list');
  const btn = $('remix-model-btn');
  const wrap = $('remix-model-wrap');
  if (!sel || !list || !btn || !wrap) return;

  sel.innerHTML = MODEL_CHOICES.map((m) => `<option value="${escapeHTML(m.id)}">${escapeHTML(m.label)}</option>`).join('');
  sel.value = getRemixModel();

  const refresh = () => {
    paintRemixModelMenu(sel, list);
    syncRemixModelButton(sel);
  };
  refresh();

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setRemixModelMenuOpen(!wrap.classList.contains('open'));
  });

  list.addEventListener('click', (e) => {
    const opt = e.target.closest('.remix-model-opt');
    if (!opt) return;
    sel.value = opt.dataset.id;
    localStorage.setItem(MODEL_KEY, sel.value);
    refresh();
    setRemixModelMenuOpen(false);
  });

  document.addEventListener('click', (e) => {
    if (!wrap.classList.contains('open')) return;
    if (wrap.contains(e.target)) return;
    setRemixModelMenuOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setRemixModelMenuOpen(false);
  });
}

function initRemixForm() {
  const form = $('remix-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    applyRemix();
  });
}

function isDesktopPlayLayout() {
  return window.innerWidth >= 1100;
}

function syncSidePanelVisibility() {
  const panel = $('side-panel');
  const discover = $('side-discover');
  if (!panel) return;
  const creatorReady = !$('creator-sec')?.hasAttribute('data-empty');
  const showDiscover = discover && !discover.hidden;
  panel.hidden = !creatorReady && !showDiscover;
  syncPlayBand();
}

function syncPlayBand() {
  const band = $('play-band');
  const theater = document.querySelector('.play-theater');
  const meta = document.querySelector('.play-meta');
  const leftRail = $('play-rail-left');
  const rightRail = $('play-rail-right');
  const leftPanel = $('side-panel');
  const rightPanel = document.querySelector('.play-rail-right .remix-panel');

  if (!band || !theater || !meta || !isDesktopPlayLayout()) {
    [leftRail, rightRail].forEach((rail) => { if (rail) rail.style.paddingTop = ''; });
    if (leftPanel) leftPanel.style.height = '';
    if (rightPanel) rightPanel.style.height = '';
    return;
  }

  const bandTop = band.getBoundingClientRect().top;
  const tTop = theater.getBoundingClientRect().top;
  const mBottom = meta.getBoundingClientRect().bottom;
  const offset = Math.max(0, Math.round(tTop - bandTop));
  const h = Math.max(0, Math.round(mBottom - tTop));

  [leftRail, rightRail].forEach((rail) => {
    if (rail) rail.style.paddingTop = `${offset}px`;
  });
  if (leftPanel && !leftPanel.hidden) leftPanel.style.height = `${h}px`;
  else if (leftPanel) leftPanel.style.height = '';
  if (rightPanel) rightPanel.style.height = `${h}px`;
}

function watchPlayBand() {
  const center = $('play-band-center');
  const band = $('play-band');
  const drawer = $('drawer');
  const sidePanel = $('side-panel');
  if (!center || !band) return;
  const run = () => syncPlayBand();
  run();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(run);
    ro.observe(center);
    ro.observe(band);
    if (drawer) ro.observe(drawer);
    if (sidePanel) ro.observe(sidePanel);
  }
  window.addEventListener('resize', run);
}

function applyTheaterAspect(aspect) {
  const page = document.querySelector('.play-page');
  const inner = document.querySelector('.play-theater-inner');
  const fsStage = document.querySelector('.play-fs-stage');
  if (!page && !inner) return;
  const [w, h] = Array.isArray(aspect) ? aspect : [4, 3];
  [page, inner, fsStage].filter(Boolean).forEach((el) => {
    el.style.setProperty('--play-aspect', `${w} / ${h}`);
    el.style.setProperty('--play-ar-w', String(w));
    el.style.setProperty('--play-ar-h', String(h));
  });
}

function renderMeta() {
  const descEl = $('game-desc');
  const desc = game.desc || game.description || '';
  if (descEl) {
    descEl.textContent = desc;
    descEl.hidden = !desc;
  }
  syncPlayBand();
  const plays = totalPlays(game);
  const playsPill = $('game-plays-pill');
  if (playsPill && plays) {
    playsPill.textContent = `${fmtPlays(plays)} plays`;
    playsPill.hidden = false;
  }
}

async function boot() {
const launchId = params.get('game') || params.get('launch');
if (!game && launchId) {
  const lg = getLaunchGame(launchId);
  if (lg) {
    game = { ...lg };
    isLaunch = true;
    if (location.pathname.endsWith('play.html')) {
      history.replaceState(null, '', `play.html?game=${encodeURIComponent(launchId)}`);
    }
  }
}
if (slug) {
const cg = await api.communityGame(slug);
if (cg) {
game = { ...cg, id: cg.slug };
isCommunity = true;
// normalise the address bar to the shareable pretty URL
if (location.pathname !== `/play/${cg.slug}`) history.replaceState(null, '', `/play/${cg.slug}`);
}
}
if (!game) {
$('game-name').textContent = slug
? 'game not found — it may have been removed by a moderator'
: 'game not found — cook one on the homepage';
$('publish-btn').style.display = 'none';
$('play-rail-right').hidden = true;
return;
}
$('game-name').textContent = game.name;
$('game-pill').textContent = isCommunity
? `@${game.username}`
: isLaunch
? (game.tags?.[0] || 'Launch')
: (game.remixOf ? 'remix' : 'AI-cooked');
document.title = `${game.name} — SLOP.game`;
applyTheaterAspect(game.aspect || [4, 3]);
renderMeta();
mountGame(game.html);
scoreKey = isCommunity ? game.slug : (game.id || id);
const lbSec = $('leaderboard-sec');
if (lbSec && scoreKey && !isLaunch) {
  lbSec.hidden = false;
  mountLeaderboard($('leaderboard-mount'), scoreKey);
  listenForScores(scoreKey);
}
recordPlay(isCommunity ? game.slug : (isLaunch ? game.id : id)); // count this as a real play

// hand off to the full studio (cooked games open directly; community games fork)
const studioBtn = $('studio-btn');
if (isLaunch) {
  studioBtn.style.display = 'none';
  $('publish-btn').style.display = 'none';
} else {
  studioBtn.style.display = '';
  studioBtn.href = isCommunity
  ? `studio.html?remix=${encodeURIComponent(game.slug)}`
  : `studio.html?id=${encodeURIComponent(game.id)}`;
}

if (!isLaunch) initPublish();
initRemixComments();
await initCreator();
await initSimilarGames(scoreKey);
initShare();
initRemixModelPicker();
initRemixForm();
watchPlayBand();
$('drawer')?.classList.add('open');
if (params.get('remix') === '1') focusRemixInput();
}

function focusRemixInput() {
  $('drawer')?.classList.add('open');
  $('remix-input')?.focus();
  if (!isDesktopPlayLayout()) {
    $('drawer')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function setCreatorStats({ plays, followers, games }) {
  const p = $('creator-stat-plays');
  const f = $('creator-stat-followers');
  const g = $('creator-stat-games');
  if (p) p.textContent = fmtPlays(plays ?? 0);
  if (f) f.textContent = followers == null ? '—' : fmtPlays(followers);
  if (g) g.textContent = String(games ?? 0);
}

function sumGamePlays(list) {
  return (list || []).reduce((n, g) => n + totalPlays(g), 0);
}

function showCreatorMore(games, kind) {
  sideCreatorGames = (games || []).map((g) => ({ g, kind }));
}

function setCreatorLinks(profileUrl) {
  const avLink = $('creator-av-link');
  const nameLink = $('creator-link');
  if (avLink) avLink.href = profileUrl;
  if (nameLink) nameLink.href = profileUrl;
}

function followButtons() {
  return ['creator-follow', 'meta-follow'].map((id) => $(id)).filter(Boolean);
}

function hideFollowButtons() {
  followButtons().forEach((btn) => { btn.hidden = true; });
}

function syncFollowButtons() {
  const label = following ? 'Following' : 'Follow';
  const metaLabel = game?.username
    ? (following ? `Following @${game.username}` : `Follow @${game.username}`)
    : label;

  followButtons().forEach((btn) => {
    btn.classList.toggle('following', following);
    if (btn.id === 'meta-follow') {
      const span = btn.querySelector('.meta-follow-label');
      if (span) span.textContent = metaLabel;
    } else {
      btn.textContent = label;
    }
  });
}

function setupFollowButton({ ownerId, username, isSelf }) {
  const btns = followButtons();
  if (!btns.length) return;

  btns.forEach((btn) => {
    btn.classList.remove('following');
    btn.disabled = false;
  });

  if (!ownerId || isSelf) {
    hideFollowButtons();
    return;
  }

  btns.forEach((btn) => { btn.hidden = false; });
  syncFollowButtons();

  if (!viewer) {
    const handler = () => showToast('sign in to follow creators');
    btns.forEach((btn) => { btn.onclick = handler; });
    return;
  }

  btns.forEach((btn) => { btn.onclick = toggleFollow; });
}

// ---------------------------------------------------------------- creator + follow loop
async function initCreator() {
  const sec = $('creator-sec');
  if (!sec || !game) return;

  const av = $('creator-av');
  const bioEl = $('creator-bio');

  if (isCommunity && game.owner_id) {
    viewer = await api.me().catch(() => null);
    const profile = await api.profileByUsername(game.username).catch(() => null);
    const [followers, ownerGames, isFollowing] = await Promise.all([
      api.followerCount(game.owner_id),
      api.gamesByOwner(game.owner_id),
      viewer?.id === game.owner_id ? Promise.resolve(false) : api.isFollowing(game.owner_id),
    ]);
    following = isFollowing;
    creatorGameCount = ownerGames.length;

    const initial = (game.username?.[0] || 'S').toUpperCase();
    const profileUrl = `/${encodeURIComponent(game.username)}`;
    setCreatorLinks(profileUrl);
    $('creator-name').textContent = `@${game.username}`;

    if (profile?.avatar_url) {
      av.innerHTML = `<img src="${escapeHTML(profile.avatar_url)}" alt="">`;
    } else {
      av.textContent = initial;
    }

    if (bioEl) {
      const bio = profile?.bio || '';
      bioEl.textContent = bio;
      bioEl.hidden = !bio;
    }

    setCreatorStats({
      plays: sumGamePlays(ownerGames),
      followers,
      games: ownerGames.length,
    });

    setupFollowButton({
      ownerId: game.owner_id,
      username: game.username,
      isSelf: viewer?.id === game.owner_id,
    });

    showCreatorMore(ownerGames.filter((g) => g.slug !== game.slug).slice(0, 6), 'community');
    sec.removeAttribute('data-empty');
    syncSidePanelVisibility();
    return;
  }

  if (isLaunch) {
    setCreatorLinks('index.html#games');
    av.textContent = 'S';
    $('creator-name').textContent = 'SLOP.game team';
    if (bioEl) {
      bioEl.textContent = 'Official launch games from the SLOP.game team.';
      bioEl.hidden = false;
    }
    const launchList = getLaunchGames();
    setCreatorStats({
      plays: sumGamePlays(launchList),
      followers: null,
      games: launchList.length,
    });
    hideFollowButtons();
    showCreatorMore(launchList.filter((g) => g.id !== game.id).slice(0, 6), 'launch');
    sec.removeAttribute('data-empty');
    syncSidePanelVisibility();
    return;
  }

  // AI-cooked (local)
  viewer = await api.me().catch(() => null);
  const profileUrl = viewer?.username ? `/${encodeURIComponent(viewer.username)}` : 'index.html#games';
  setCreatorLinks(profileUrl);
  av.textContent = (viewer?.username?.[0] || 'Y').toUpperCase();
  $('creator-name').textContent = viewer?.username ? `@${viewer.username}` : 'You';
  if (bioEl) {
    bioEl.textContent = game.remixOf ? 'AI remix · cooked on SLOP.game' : 'AI-cooked on SLOP.game';
    bioEl.hidden = false;
  }

  let followers = null;
  if (viewer?.username && viewer.id) {
    followers = await api.followerCount(viewer.id).catch(() => null);
    const profile = await api.profileByUsername(viewer.username).catch(() => null);
    if (profile?.avatar_url) {
      av.innerHTML = `<img src="${escapeHTML(profile.avatar_url)}" alt="">`;
    }
  }
  const cooked = getCookedGames();
  setCreatorStats({
    plays: sumGamePlays(cooked),
    followers,
    games: cooked.length,
  });
  hideFollowButtons();
  showCreatorMore(cooked.filter((g) => g.id !== game.id).slice(0, 6), 'cooked');
  sec.removeAttribute('data-empty');
  syncSidePanelVisibility();
}

async function toggleFollow() {
  const btns = followButtons();
  if (!game.owner_id) return;
  const next = !following;
  btns.forEach((btn) => { btn.disabled = true; });
  try {
    if (next) await api.follow(game.owner_id);
    else await api.unfollow(game.owner_id);
    following = next;
    const followers = await api.followerCount(game.owner_id);
    setCreatorStats({
      plays: sumGamePlays(await api.gamesByOwner(game.owner_id)),
      followers,
      games: creatorGameCount,
    });
    syncFollowButtons();
    showToast(following ? `following @${game.username}` : `unfollowed @${game.username}`);
  } catch (err) {
    showToast(err.message || 'could not update follow');
  } finally {
    btns.forEach((btn) => { btn.disabled = false; });
  }
}

// ---------------------------------------------------------------- discover rail (creator + similar)
async function initSimilarGames(currentKey) {
  let community = [];
  try { community = (await api.communityGames()) || []; } catch { /* offline */ }

  const tags = game.tags || [];
  const ownerId = game.owner_id || null;

  const all = [
    ...getLaunchGames().map((g) => ({ g, kind: 'launch' })),
    ...getCookedGames().map((g) => ({ g, kind: 'cooked' })),
    ...community.map((g) => ({ g, kind: 'community' })),
  ];

  const activeKey = currentKey || game.id || game.slug;
  const picks = all
    .filter(({ g, kind }) => {
      const key = gameDiscoverKey(g, kind);
      return key && key !== activeKey;
    })
    .map((item) => {
      let score = totalPlays(item.g) * 0.02 + Math.random() * 2;
      const gTags = item.g.tags || [];
      if (tags.length && gTags.some((t) => tags.includes(t))) score += 40;
      if (ownerId && item.g.owner_id === ownerId) score += 60;
      if (item.kind === 'community' && item.g.username === game.username) score += 30;
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  renderSideDiscover(sideCreatorGames, picks);
}

// ---------------------------------------------------------------- comments (remix panel)
function commentHTML(c, viewer) {
  const canDel = viewer && (viewer.id === c.user_id || viewer.is_moderator);
  const av = c.avatar_url
    ? `<img class="remix-comment-av" src="${escapeHTML(c.avatar_url)}" alt="">`
    : `<span class="remix-comment-av remix-comment-av-fb">${escapeHTML((c.username[0] || 'S').toUpperCase())}</span>`;
  return `<div class="remix-comment" data-id="${escapeHTML(c.id)}">
    ${av}
    <div class="remix-comment-body">
      <div class="remix-comment-head">
        <a class="remix-comment-user" href="/${escapeHTML(c.username)}">@${escapeHTML(c.username)}</a>
        <span class="remix-comment-time">${timeAgo(c.created_at)}</span>
        ${canDel ? '<button class="remix-comment-del" title="delete">delete</button>' : ''}
      </div>
      <div class="remix-comment-text">${escapeHTML(c.body)}</div>
    </div>
  </div>`;
}

function getCommentGameId() {
  if (game?.gameId) return game.gameId;
  return null;
}

let remixCommentsBound = false;

async function initRemixComments() {
  const list = $('remix-comments-list');
  const input = $('remix-comment-input');
  const sendBtn = $('remix-comment-send');
  const compose = $('remix-comment-compose');
  const signin = $('remix-comments-signin');
  const unavailable = $('remix-comments-unavailable');
  const countEl = $('remix-comment-char');
  const gameId = getCommentGameId();
  if (!list) return;

  if (!gameId) {
    if (unavailable) unavailable.hidden = isLaunch;
    if (compose) compose.hidden = true;
    if (signin) signin.hidden = true;
    list.innerHTML = isLaunch
      ? ''
      : '<div class="remix-comments-empty">No comments yet — publish to start the thread.</div>';
    const count = $('remix-comments-count');
    if (count) count.textContent = '0';
    return;
  }

  if (unavailable) unavailable.hidden = true;

  const viewer = await api.me().catch(() => null);
  const signedIn = !!viewer?.username;
  if (compose) compose.hidden = !signedIn;
  if (signin) signin.hidden = signedIn;

  function syncCompose() {
    if (!input) return;
    const n = input.value.length;
    if (countEl) {
      countEl.textContent = `${n}/500`;
      countEl.classList.toggle('warn', n > 450);
    }
    if (sendBtn) sendBtn.disabled = !input.value.trim();
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }

  async function refresh() {
    const activeId = getCommentGameId();
    if (!activeId) return;
    const comments = await api.gameComments(activeId);
    const count = $('remix-comments-count');
    if (count) count.textContent = comments.length;
    list.innerHTML = comments.length
      ? comments.map((c) => commentHTML(c, viewer)).join('')
      : '<div class="remix-comments-empty">no comments yet — be the first.</div>';
  }

  if (!remixCommentsBound) {
    remixCommentsBound = true;
    input?.addEventListener('input', syncCompose);
    sendBtn?.addEventListener('click', async () => {
      const activeId = getCommentGameId();
      if (!activeId || !input) return;
      const body = input.value.trim();
      if (!body) return;
      sendBtn.disabled = true;
      try {
        await api.addComment(activeId, body);
        input.value = '';
        syncCompose();
        await refresh();
      } catch (err) {
        const status = $('status');
        if (status) status.textContent = err.message;
        else showToast(err.message);
      } finally {
        syncCompose();
      }
    });
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendBtn?.click();
    });
    list.addEventListener('click', async (e) => {
      const del = e.target.closest('.remix-comment-del');
      if (!del) return;
      const row = del.closest('.remix-comment');
      if (!window.confirm('Delete this comment?')) return;
      const ok = await api.deleteComment(row.dataset.id);
      if (ok) {
        row.remove();
        const n = list.querySelectorAll('.remix-comment').length;
        const count = $('remix-comments-count');
        if (count) count.textContent = n;
        if (!n) list.innerHTML = '<div class="remix-comments-empty">no comments yet — be the first.</div>';
      }
    });
  }

  syncCompose();
  refresh();
}

// ---------------------------------------------------------------- publish

function initPublish() {
const btn = $('publish-btn');
if (isCommunity || game.publishedAs) btn.style.display = 'none';
btn.addEventListener('click', async () => {
if (isCommunity || game.publishedAs) return;
btn.disabled = true;
btn.textContent = 'Publishing…';
try {
const me = await api.me();
if (me === null) throw new Error('sign in on the homepage first, then come back to publish');
if (!me.username) throw new Error('pick a username on the homepage first, then come back to publish');
const res = await api.publishGame({
name: game.name, desc: game.desc, prompt: game.prompt, html: game.html, thumb: game.thumb,
});
game = updateCookedGame(game.id, { publishedAs: res.slug }) || game;
game.gameId = res.id;
try { await navigator.clipboard.writeText(res.url); } catch { /* clipboard optional */ }
btn.textContent = 'OK Published';
$('status').textContent = `published — link copied: ${res.url}`;
initRemixComments();
} catch (err) {
btn.disabled = false;
btn.textContent = 'Publish';
$('status').textContent = `! ${err.message}`;
}
});
}

// ---------------------------------------------------------------- select-to-remix
// Let the player drag a box over the running game to target a change at a
// specific area. The iframe is sandboxed (opaque), so we can't read its pixels —
// instead we capture the box as a normalized region and hand grok a spatial hint.

const selOverlay = $('sel-overlay');
const selBox = $('sel-box');
const frameWrap = $('frame-wrap');
let selection = null; // { x, y, w, h } in 0..1 of the game frame, or null

function regionLabel(s) {
const cx = s.x + s.w / 2;
const cy = s.y + s.h / 2;
// a near-full-frame box is "the whole screen"
if (s.w > 0.8 && s.h > 0.8) return 'the whole screen';
const col = cx < 0.34 ? 'left' : cx > 0.66 ? 'right' : 'center';
const row = cy < 0.34 ? 'top' : cy > 0.66 ? 'bottom' : 'middle';
if (row === 'middle' && col === 'center') return 'the center';
if (row === 'middle') return `the ${col} side`;
if (col === 'center') return `the ${row} ${col}`.replace('center', 'middle');
return `the ${row}-${col}`;
}

// A spatial sentence prepended to the model request when a region is selected.
function selectionContext() {
if (!selection) return '';
const s = selection;
const pct = (n) => Math.round(n * 100);
return `The player boxed a specific area of the game screen to focus this change on: ${regionLabel(s)} — roughly x ${pct(s.x)}%–${pct(s.x + s.w)}%, y ${pct(s.y)}%–${pct(s.y + s.h)}% of the play area. Concentrate the change on whatever is in that region.`;
}

function setSelectMode(on) {
selOverlay.classList.toggle('active', on);
const btn = $('select-btn');
btn.classList.toggle('on', on);
btn.textContent = on ? 'OK drag a box on the game…' : 'Select a part to change';
}

function clearSelection() {
selection = null;
selBox.classList.remove('show');
$('sel-chip').hidden = true;
}
$('sel-clear').addEventListener('click', clearSelection);

$('select-btn').addEventListener('click', () => setSelectMode(!selOverlay.classList.contains('active')));

// drag to draw the box (pointer events cover mouse + touch)
let dragStart = null;
selOverlay.addEventListener('pointerdown', (e) => {
dragStart = { x: e.clientX, y: e.clientY };
selOverlay.setPointerCapture(e.pointerId);
selBox.classList.add('show');
drawBox(e.clientX, e.clientY);
});
selOverlay.addEventListener('pointermove', (e) => { if (dragStart) drawBox(e.clientX, e.clientY); });
selOverlay.addEventListener('pointerup', (e) => {
if (!dragStart) return;
const rect = frameWrap.getBoundingClientRect();
const x1 = Math.min(dragStart.x, e.clientX), x2 = Math.max(dragStart.x, e.clientX);
const y1 = Math.min(dragStart.y, e.clientY), y2 = Math.max(dragStart.y, e.clientY);
dragStart = null;
const w = (x2 - x1) / rect.width, h = (y2 - y1) / rect.height;
if (w < 0.03 || h < 0.03) { clearSelection(); setSelectMode(false); return; } // a stray click
selection = {
x: Math.max(0, (x1 - rect.left) / rect.width),
y: Math.max(0, (y1 - rect.top) / rect.height),
w: Math.min(1, w), h: Math.min(1, h),
};
$('sel-label').textContent = regionLabel(selection);
$('sel-chip').hidden = false;
setSelectMode(false);
});

function drawBox(cx, cy) {
const rect = frameWrap.getBoundingClientRect();
const x1 = Math.min(dragStart.x, cx) - rect.left, x2 = Math.max(dragStart.x, cx) - rect.left;
const y1 = Math.min(dragStart.y, cy) - rect.top, y2 = Math.max(dragStart.y, cy) - rect.top;
selBox.style.left = `${x1}px`;
selBox.style.top = `${y1}px`;
selBox.style.width = `${x2 - x1}px`;
selBox.style.height = `${y2 - y1}px`;
}

// ---------------------------------------------------------------- voice input

const mic = createSpeech({
onText(text) { $('remix-input').value = text; },
onState(listening) {
$('mic-btn').classList.toggle('listening', listening);
$('status').textContent = listening ? 'listening… speak your edit' : '';
},
});

$('mic-btn').addEventListener('click', () => {
if (!mic) {
$('status').textContent = 'this browser has no speech recognition — type instead';
return;
}
mic.toggle();
});

// ---------------------------------------------------------------- remix

let busy = false;

const LIVE_SYSTEM = `You are the LIVE remix engine for SLOP.game. You get a running browser game's full source and a player's change request. Respond with a tiny JavaScript patch that applies the change to the ALREADY-RUNNING game with NO reload. It is executed inside the game via new Function(yourCode).
- Prefer mutating the game's exposed state/tunables (look for a global like window.GAME, GAME.config, GAME.player, etc. in the source) — e.g. GAME.config.speed *= 2.
- You may patch functions/prototypes the source defines (capture the original in a local const first, then call it — never re-look-up the same property inside the replacement, that's infinite recursion).
- Wrap risky work in try/catch. Keep it short and focused on the request. Do NOT return HTML.
- If the change genuinely cannot be done as a live patch (needs a full rewrite / new assets), respond with exactly: FULL

OUTPUT: either the single word FULL, or one \`\`\`js fenced code block with the patch. Nothing else.`;

async function liveTweak(request, displayReq = request) {
const status = $('status');
status.textContent = 'writing a live patch…';
let raf = null;
const full = await chatStream({
model: getRemixModel(),
messages: [
{ role: 'system', content: LIVE_SYSTEM },
{ role: 'user', content: `Game source:\n\`\`\`html\n${game.html}\n\`\`\`\n\nChange (apply live): ${request}` },
],
maxTokens: 1400,
temperature: 0.3,
onDelta(_, soFar) {
  if (!raf) raf = requestAnimationFrame(() => {
    raf = null;
    status.textContent = `writing live patch… ${(soFar.length / 1024).toFixed(1)} KB`;
  });
},
});
if (/^\s*FULL\s*$/i.test(full)) return false; // model wants a full rewrite
const code = extractFence(full);
if (!code) return false;
// fire it into the running game (the injected receiver runs it; no reload)
frame.contentWindow?.postMessage({ __slopmod: code }, '*');
status.textContent = 'patched the running game — no reload';
const chip = document.createElement('div');
chip.className = 'edit-chip';
chip.textContent = `${displayReq}`;
$('edits-list').prepend(chip);
$('remix-input').value = '';
clearSelection();
try { const q = JSON.parse(localStorage.getItem('slop-xp-queue') || '[]'); q.push({ xp: 30, reason: 'remixed live!', unlock: 'remixer' }); localStorage.setItem('slop-xp-queue', JSON.stringify(q)); } catch { /* */ }
return true;
}

const HEAL_PROMPT = `You are debugging a single-file HTML5 browser game that throws an uncaught error inside a sandboxed iframe. You get the exact error(s). Fix ONLY the broken code — minimal diff, preserve everything that works. Return ONLY the complete corrected HTML in one \`\`\`html block — no commentary.`;

async function healRemix(html, errs, status) {
  let raf = null;
  const full = await chatStream({
    model: getRemixModel(),
    temperature: 0.3,
    messages: [
      { role: 'system', content: HEAL_PROMPT },
      { role: 'user', content: `Error(s):\n${errs.map((e) => '- ' + e).join('\n')}\n\nFix in place:\n\`\`\`html\n${html}\n\`\`\`` },
    ],
    onDelta(_, soFar) {
      if (!raf) raf = requestAnimationFrame(() => {
        raf = null;
        if (status) status.textContent = `self-healing… ${(soFar.length / 1024).toFixed(1)} KB`;
      });
    },
  });
  let fixed = extractFence(full);
  if (!fixed) { const d = full.indexOf('<!DOCTYPE'); if (d >= 0) fixed = full.slice(d).trim(); }
  return (fixed && /<html/i.test(fixed)) ? fixed : null;
}

async function applyRemix() {
const request = $('remix-input').value.trim();
if (!request || busy || !game) return;
if (isLaunch || !game.html) {
  showToast('launch games remix inside the player — use the in-game remix panel');
  return;
}

// when an area is boxed, hand the model a spatial hint but keep chips readable
const region = selectionContext();
const modelRequest = region ? `${region}\n\n${request}` : request;

busy = true;
const btn = $('apply-btn');
const status = $('status');
btn.disabled = true;
btn.textContent = 'Remixing…';
status.textContent = 'rewriting the game…';

// live mode: try a no-reload JS patch first (game must carry the receiver)
if ($('live-mode')?.checked && !$('save-as-new').checked && /slop-mod-rx/.test(game.html || '')) {
try {
if (await liveTweak(modelRequest, request)) { busy = false; btn.disabled = false; btn.textContent = 'Apply remix'; return; }
status.textContent = 'that one needs a full rebuild — rewriting…';
} catch (e) { status.textContent = 'live patch failed — falling back to full rewrite…'; }
}

let raf = null;

try {
const full = await chatStream({
model: getRemixModel(),
messages: [
{ role: 'system', content: REMIX_SYSTEM },
{
role: 'user',
content: `Current game source:\n\`\`\`html\n${game.html}\n\`\`\`\n\nEdit request: ${modelRequest}`,
},
],
temperature: 0.4,
onDelta(_, soFar) {
if (!raf) {
raf = requestAnimationFrame(() => {
raf = null;
status.textContent = `rewriting… ${(soFar.length / 1024).toFixed(1)} KB`;
});
}
},
});

const meta = extractMetaLine(full) || {};
let html = extractFence(full);
if (!html) {
const docStart = full.indexOf('<!DOCTYPE');
if (docStart >= 0) html = full.slice(docStart).trim();
}
if (!html || !/<html/i.test(html)) throw new Error('remix came back unservable — try rephrasing');

// crash-test the rewrite before it replaces the running game — self-heal on failure
status.textContent = 'crash-testing the remix…';
const MAX_FIX = 3;
let test = await testGameHTML(html);
for (let fix = 1; !test.ok && fix <= MAX_FIX; fix++) {
  const errs = (test.errors?.length ? test.errors : [test.error]).filter(Boolean);
  status.textContent = `self-healing remix: ${errs[0]} (${fix}/${MAX_FIX})…`;
  const fixed = await healRemix(html, errs, status);
  if (!fixed) break;
  html = fixed;
  status.textContent = 'crash-testing the fix…';
  test = await testGameHTML(html);
}
if (!test.ok) {
  throw new Error(`remix kept crashing (${test.error}) — your game is untouched, try rephrasing`);
}

const patch = {
html,
name: meta.name || game.name,
desc: meta.desc || game.desc,
thumb: test.thumb || game.thumb,
};

if ($('save-as-new').checked || isCommunity) {
// remixing someone else's community game always forks it into your library
const fresh = addCookedGame({
name: game.name,
desc: game.desc,
...patch,
id: `${game.id}-rmx-${Math.random().toString(36).slice(2, 6)}`,
remixOf: game.id,
prompt: request,
createdAt: Date.now(),
});
history.replaceState(null, '', `play.html?id=${encodeURIComponent(fresh.id)}`);
game = fresh;
isCommunity = false;
$('game-pill').textContent = 'remix';
$('publish-btn').style.display = '';
$('publish-btn').disabled = false;
$('publish-btn').textContent = 'Publish';
} else {
game = updateCookedGame(game.id, patch) || { ...game, ...patch };
}

// the visible moment: hot-swap the running game
mountGame(game.html);
$('game-name').textContent = game.name;
status.textContent = `OK ${meta.summary || 'remix applied'} — crash-tested and live`;

const chip = document.createElement('div');
chip.className = 'edit-chip';
chip.textContent = `OK ${meta.summary || request}`;
$('edits-list').prepend(chip);
$('remix-input').value = '';
clearSelection();
} catch (err) {
status.textContent = `! ${err.message}`;
console.error(err);
} finally {
busy = false;
btn.disabled = false;
btn.textContent = 'Apply remix';
}
}

$('remix-input').addEventListener('keydown', (e) => {
if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) applyRemix();
});

errOverlay = mountErrorOverlay($('frame-wrap'), {
onFix(err) {
focusRemixInput();
$('remix-input').value = `Fix this runtime error:\n${err}`;
},
});

let frameHost = null;
let framePlaceholder = null;
let fsShaderReady = false;

function initPlayShader() {
  import('./hero-shader.js').then(({ mountShader }) => {
    const el = $('play-page-shader');
    if (el) mountShader(el, { interactionEl: document.body, ripples: true });
  }).catch(() => {});
}

function mountFsShader() {
  if (fsShaderReady) return;
  const el = $('play-fs-shader');
  const fs = $('play-fs');
  if (!el || !fs) return;
  import('./hero-shader.js').then(({ mountShader }) => {
    mountShader(el, { interactionEl: fs, ripples: true });
    fsShaderReady = true;
  }).catch(() => {});
}

function moveFrameToFullscreen() {
  const wrap = $('frame-wrap');
  const slot = $('play-fs-slot');
  if (!wrap || !slot || framePlaceholder) return false;
  frameHost = wrap.parentElement;
  framePlaceholder = document.createElement('div');
  framePlaceholder.id = 'frame-wrap-placeholder';
  frameHost.insertBefore(framePlaceholder, wrap);
  slot.appendChild(wrap);
  return true;
}

function restoreFrameFromFullscreen() {
  const wrap = $('frame-wrap');
  if (!wrap || !framePlaceholder || !frameHost) return;
  frameHost.insertBefore(wrap, framePlaceholder);
  framePlaceholder.remove();
  framePlaceholder = null;
  frameHost = null;
  $('play-fs')?.setAttribute('hidden', '');
  syncPlayBand();
}

$('fs-btn')?.addEventListener('click', async () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }
  const fs = $('play-fs');
  if (!fs || !moveFrameToFullscreen()) return;
  mountFsShader();
  fs.removeAttribute('hidden');
  try {
    await fs.requestFullscreen();
  } catch {
    restoreFrameFromFullscreen();
    showToast('fullscreen not available in this browser');
  }
});

document.addEventListener('fullscreenchange', () => {
  $('fs-btn')?.classList.toggle('on', !!document.fullscreenElement);
  if (!document.fullscreenElement) restoreFrameFromFullscreen();
});

initPlayShader();
boot();
