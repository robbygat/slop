// Universal scoreboard for AI-cooked and community games on slop.game.
// Games submit scores by dispatching: window.dispatchEvent(new CustomEvent('slop:score', { detail: { score: N } }))

import { api, escapeHTML } from './api.js';

const RANK = ['🥇', '🥈', '🥉'];
const panels = new Map(); // gameKey → element
let busy = false;

function scoreLabel(score, unit) {
  const n = Math.floor(Number(score) || 0);
  return unit ? `${n} ${unit}` : String(n);
}

function renderPanel(el, rows, me, unit) {
  let body;
  if (!rows.length) {
    body = `<div class="lb-empty">no scores yet — finish a run to claim #1</div>`;
  } else {
    body = rows.map((r, i) => {
      const mine = me?.username && r.username === me.username;
      return `<div class="lb-row${mine ? ' me' : ''}">
        <span class="lb-rank">${RANK[i] || (i + 1)}</span>
        <span class="lb-name">@${escapeHTML(r.username)}</span>
        <span class="lb-score">${scoreLabel(r.score, unit)}</span>
      </div>`;
    }).join('');
  }
  const foot = me?.username
    ? ''
    : `<div class="lb-foot"><a href="/">sign in on slop.game</a> to save your score</div>`;
  el.innerHTML = `<div class="lb-head">🏆 Leaderboard</div>${body}${foot}`;
}

async function refresh(gameKey) {
  const el = panels.get(gameKey);
  if (!el) return;
  const unit = el.dataset.unit || '';
  const [rows, me] = await Promise.all([
    api.topScores(gameKey, 15).catch(() => []),
    api.me().catch(() => null),
  ]);
  renderPanel(el, rows, me, unit);
}

/** Mount a leaderboard panel. Returns the game key used for scores. */
export function mountLeaderboard(container, gameKey, { unit = 'pts' } = {}) {
  if (!container || !gameKey) return null;
  const el = document.createElement('div');
  el.className = 'slop-lb';
  el.dataset.game = gameKey;
  el.dataset.unit = unit;
  container.appendChild(el);
  panels.set(gameKey, el);
  refresh(gameKey);
  return gameKey;
}

/** Listen for slop:score events from any game iframe (via postMessage relay). */
export function listenForScores(gameKey) {
  window.addEventListener('slop:score', onScore);
  window.addEventListener('message', onMsg);

  async function onScore(e) {
    if (busy) return;
    const score = Math.floor(Number(e.detail?.score) || 0);
    if (score <= 0) return;
    busy = true;
    try {
      await api.submitScore(gameKey, score, e.detail?.meta || null);
    } catch { /* signed out / offline */ }
    await refresh(gameKey);
    busy = false;
  }

  function onMsg(e) {
    if (e.data?.__slopScore != null) {
      window.dispatchEvent(new CustomEvent('slop:score', {
        detail: { score: e.data.__slopScore, meta: e.data.meta || null },
      }));
    }
  }

  return () => {
    window.removeEventListener('slop:score', onScore);
    window.removeEventListener('message', onMsg);
  };
}
