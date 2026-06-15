// Live platform stats for the homepage: total games played + creators + games.
// Numbers count up on first reveal so it feels alive.

import { api } from './api.js';
import { fmtPlays } from './plays.js';

function animate(el, to) {
  const dur = 900;
  const start = performance.now();
  const from = 0;
  function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmtPlays(Math.floor(from + (to - from) * eased));
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = fmtPlays(to);
  }
  requestAnimationFrame(tick);
}

export async function initStats() {
  const box = document.getElementById('platform-stats');
  if (!box) return;
  const stats = await api.platformStats();
  if (!stats) return; // offline / schema not applied → leave hidden
  box.hidden = false;
  animate(document.getElementById('pstat-plays'), stats.plays || 0);
  animate(document.getElementById('pstat-accounts'), stats.accounts || 0);
  animate(document.getElementById('pstat-games'), stats.games || 0);
}
