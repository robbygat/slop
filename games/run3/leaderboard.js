// Run Infinite — global leaderboard, backed by Supabase and tied to real
// accounts. Same-origin with SLOP.game, so the persisted auth session is shared:
// a signed-in player's run is submitted as a verified score (RLS enforces it's
// attributed to their account). Renders into every .run-lb panel on the page.

import { api, escapeHTML } from '../../js/api.js';

const GAME = 'run3';
const RANK = ['🥇', '🥈', '🥉'];

let busy = false;

async function render() {
  const slots = document.querySelectorAll('.run-lb');
  if (!slots.length) return;
  const [rows, me] = await Promise.all([
    api.topScores(GAME, 15).catch(() => []),
    api.me().catch(() => null),
  ]);

  let body;
  if (!rows.length) {
    body = `<div class="lb-empty">no runs on the board yet — be the first!</div>`;
  } else {
    body = rows.map((r, i) => {
      const mine = me?.username && r.username === me.username;
      return `<div class="lb-row${mine ? ' me' : ''}">
        <span class="lb-rank">${RANK[i] || (i + 1)}</span>
        <span class="lb-name">@${escapeHTML(r.username)}</span>
        <span class="lb-score">${Math.floor(r.score)} m</span>
      </div>`;
    }).join('');
  }
  const foot = me?.username
    ? ''
    : `<div class="lb-foot"><a href="/" target="_top">sign in on SLOP.game</a> to put your runs on the board</div>`;

  slots.forEach((s) => { s.innerHTML = `<div class="lb-head">🏆 Leaderboard</div>${body}${foot}`; });
}

// The game dispatches this when a solo run ends (see endRun in game.js).
window.addEventListener('run3:end', async (e) => {
  if (busy) return;
  busy = true;
  try {
    const dist = Math.floor(e.detail?.dist || 0);
    if (dist > 0) await api.submitScore(GAME, dist, { difficulty: e.detail?.difficulty || 'normal' });
  } catch { /* offline / signed out → leaderboard still shows */ }
  await render();
  busy = false;
});

render();
