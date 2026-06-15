// Shared site nav: mobile drawer, burger toggle, and search wiring.
// Import on every page that uses `.site-nav` (homepage, profile, etc.).

import { initSearch } from './search.js';

export function initNav(options = {}) {
  const { filterGrid = false } = options;

  initSearch({ filterGrid });

  const burger = document.getElementById('nav-burger');
  const links = document.getElementById('nav-links');
  if (!burger || !links) return;

  const close = () => {
    links.classList.remove('open');
    burger.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
  };

  const open = () => {
    links.classList.add('open');
    burger.classList.add('open');
    burger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open');
    links.querySelector('#nav-drawer-search-input, #nav-search-input')?.focus();
  };

  burger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (links.classList.contains('open')) close();
    else open();
  });

  links.addEventListener('click', (e) => {
    if (e.target.closest('a, .nav-drawer-signout')) close();
  });

  document.addEventListener('click', (e) => {
    if (!links.classList.contains('open')) return;
    if (e.target.closest('.site-nav')) return;
    close();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}
