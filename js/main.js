// slop.game — homepage entry point. boots every module on DOM ready.

import { initHero } from './hero.js';
import { initGamesGrid, setSearchQuery } from './games-grid.js';
import { initAccount, openAuthModal, getUser } from './account.js';
import { initUpload } from './upload.js';
import { initXP } from './xp.js';
import { initDailyDrop, initReveal } from './discover.js';
import { initFeatureCarousel } from './feature-carousel.js';
import { initAppStore } from './appstore.js';
import { showToast } from './toast.js';

function init() {
initAccount();
initXP();
initHero();
initGamesGrid();
initUpload();
initFeatureCarousel();
initDailyDrop();
initAppStore();
initReveal();

// remix CTA → SlopKart with the live remix dock open
document.getElementById('remix-btn')?.addEventListener('click', () => {
showToast('opening SlopKart with the remix dock...');
setTimeout(() => { window.location.href = 'games/slopkart/index.html?remix=1'; }, 400);
});

document.getElementById('footer-signup')?.addEventListener('click', (e) => {
e.preventDefault();
if (getUser()) showToast(`you're already signed in as ${getUser().username}`);
else openAuthModal();
});

// global search (nav)
const search = document.getElementById('nav-search-input');
let debounce = null;
search?.addEventListener('input', () => {
clearTimeout(debounce);
debounce = setTimeout(() => setSearchQuery(search.value), 140);
});
search?.addEventListener('focus', () => {
if (window.scrollY < 200) document.getElementById('games')?.scrollIntoView({ behavior: 'smooth' });
});
search?.addEventListener('keydown', (e) => {
if (e.key === 'Enter') { e.preventDefault(); document.getElementById('games')?.scrollIntoView({ behavior: 'smooth' }); }
});

// mobile nav
const burger = document.getElementById('nav-burger');
const links = document.getElementById('nav-links');
burger?.addEventListener('click', () => links.classList.toggle('open'));
links?.addEventListener('click', (e) => { if (e.target.closest('a')) links.classList.remove('open'); });
}

if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
