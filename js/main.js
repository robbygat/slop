// SLOP.game — homepage entry point. boots every module on DOM ready.

import { initHero } from './hero.js';
import { initGamesGrid } from './games-grid.js';
import { initNav } from './nav.js';
import { initAccount, openAuthModal, getUser } from './account.js';
import { initXP } from './xp.js';
import { initPricing } from './pricing.js';
import { showToast } from './toast.js';

function deferIdle(fn, timeout = 2500) {
  if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout });
  else setTimeout(fn, Math.min(timeout, 1200));
}

function lazyGamesShader() {
  const sec = document.getElementById('games');
  if (!sec) return;
  let started = false;
  const boot = () => {
    if (started) return;
    started = true;
    io.disconnect();
    import('./hero-shader.js').then((m) => m.initGamesShader()).catch(() => {});
  };
  const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) boot(); }, { rootMargin: '80px 0px', threshold: 0 });
  io.observe(sec);
}

function init() {
  initAccount();
  initXP();
  initHero();
  initGamesGrid();
  lazyGamesShader();

  deferIdle(() => import('./stats.js').then((m) => m.initStats()).catch(() => {}));

  document.getElementById('footer-signup')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (getUser()) showToast(`you're already signed in as ${getUser().username}`);
    else openAuthModal();
  });

  initNav({ filterGrid: true });
  initPricing();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
