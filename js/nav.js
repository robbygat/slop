// Shared site nav: mobile drawer, burger toggle, and search wiring.
// Import on every page that uses `.site-nav` (homepage, profile, etc.).

import { initSearch } from './search.js';

export function initNav(options = {}) {
  const { filterGrid = false } = options;

  initSearch({ filterGrid });

  // On pages with a hero (homepage), the global nav stays hidden over the hero
  // and slides in only after you scroll past it. Elsewhere it's a normal nav.
  const nav = document.querySelector('.site-nav');
  const hero = document.querySelector('.hero');
  if (nav && hero) {
    nav.classList.add('nav--hideable');

    const browseDock = document.getElementById('nav-browse-dock');
    const gamesSec = document.getElementById('games');
    const browseAnchor = document.querySelector('.mq-wrap');
    let browseActive = false;

    const positionBrowseDock = () => {
      if (!browseDock || !nav.classList.contains('nav--show')) return;
      const navRect = nav.getBoundingClientRect();
      browseDock.style.top = `${Math.round(navRect.bottom)}px`;
    };

    const setBrowseActive = (on) => {
      if (on === browseActive || !browseDock) return;
      browseActive = on;
      nav.classList.toggle('nav--browse', on);
      browseDock.toggleAttribute('hidden', !on);
      browseDock.setAttribute('aria-hidden', on ? 'false' : 'true');
      if (on) positionBrowseDock();
      else browseDock.style.top = '';
    };

    const measureNavHeight = () => {
      if (browseActive && browseDock) {
        return Math.ceil(browseDock.getBoundingClientRect().bottom);
      }
      return Math.ceil(nav.getBoundingClientRect().bottom);
    };

    let ticking = false;
    const update = () => {
      const trigger = Math.max(120, hero.offsetHeight - nav.offsetHeight - 24);
      nav.classList.toggle('nav--show', window.scrollY > trigger);

      if (browseDock && gamesSec && browseAnchor && nav.classList.contains('nav--show')) {
        const navBottom = nav.getBoundingClientRect().bottom;
        const anchorTop = browseAnchor.getBoundingClientRect().top;
        const gamesBottom = gamesSec.getBoundingClientRect().bottom;
        // show browse row when the tag marquee under the hero reaches the nav —
        // before "try out what's live" so the dock doesn't pop over that headline
        setBrowseActive(anchorTop <= navBottom + 2 && gamesBottom > navBottom + 48);
      } else {
        setBrowseActive(false);
      }

      if (browseActive) positionBrowseDock();
      document.documentElement.style.setProperty('--nav-height', `${measureNavHeight()}px`);
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

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
    if (e.target.closest('a')) close();
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
