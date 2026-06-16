// SLOP.game — homepage entry point. boots every module on DOM ready.

import { initHero } from './hero.js';
import { initGamesGrid } from './games-grid.js';
import { initNav } from './nav.js';
import { initStats } from './stats.js';
import { initAccount, openAuthModal, getUser } from './account.js';
import { initUpload } from './upload.js';
import { initXP } from './xp.js';
import { initDailyDrop, initReveal } from './discover.js';
import { initFeatureCarousel } from './feature-carousel.js';
import { initAppStore } from './appstore.js';
import { initPricing } from './pricing.js';
import { initAds } from './ads.js';
import { showToast } from './toast.js';

function init() {
initAccount();
initXP();
initHero();

// interactive Three.js shader showpiece — dynamically imported so a CDN/WebGL
// failure only drops the visual (CSS gradient fallback) instead of the page JS.
import('./hero-shader.js').then((m) => m.initHeroShader()).catch(() => {});

initGamesGrid();
initUpload();
initFeatureCarousel();
initDailyDrop();
initAppStore();
initReveal();
initStats();

// the hero top-bar auth control (#hero-auth) is rendered + wired by account.js,
// so it reflects sign-in state instead of always showing "Sign in".

document.getElementById('footer-signup')?.addEventListener('click', (e) => {
e.preventDefault();
if (getUser()) showToast(`you're already signed in as ${getUser().username}`);
else openAuthModal();
});

// global search + mobile nav drawer
initNav({ filterGrid: true });

// Pro membership pill + credits, and ads (free tier only — off until enabled)
initPricing();
initAds();
}

if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
