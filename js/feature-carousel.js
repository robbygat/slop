// Horizontal slideshow for homepage feature sections.

const SLIDES = [
{ id: 'how-it-works', theme: 'how' },
{ id: 'studio', theme: 'studio' },
{ id: 'publish', theme: 'ship' },
{ id: 'multiplayer', theme: 'play' },
{ id: 'remix', theme: 'remix' },
];

const AUTO_MS = 9000;

export function initFeatureCarousel() {
const root = document.getElementById('feature-carousel');
const track = document.getElementById('fc-track');
if (!root || !track) return;

const tabs = [...root.querySelectorAll('.fc-tab')];
const dots = [...root.querySelectorAll('.fc-dot')];
const prev = root.querySelector('#fc-prev');
const next = root.querySelector('#fc-next');
const progress = root.querySelector('.fc-progress-bar');
const viewport = root.querySelector('.fc-viewport');

let index = 0;
let timer = null;
let progressRaf = null;
let progressStart = 0;
let paused = false;
let userNav = false;

function slideIndexForHash() {
const id = location.hash.replace(/^#/, '');
const aliases = {
'remix-engine': 'remix',
'ship-it': 'publish',
'play-together': 'multiplayer',
'slop-studio': 'studio',
};
const key = aliases[id] || id;
const i = SLIDES.findIndex((s) => s.id === key);
return i >= 0 ? i : null;
}

function syncHash(i) {
if (!userNav) return;
userNav = false;
const id = SLIDES[i]?.id;
if (!id || location.hash === `#${id}`) return;
history.replaceState(null, '', `#${id}`);
}

function paint(i) {
index = ((i % SLIDES.length) + SLIDES.length) % SLIDES.length;
track.style.transform = `translateX(-${index * 100}%)`;

const theme = SLIDES[index]?.theme || track.children[index]?.dataset.theme || 'how';
root.dataset.theme = theme;

tabs.forEach((t, j) => {
const on = j === index;
t.classList.toggle('active', on);
t.setAttribute('aria-selected', on ? 'true' : 'false');
});

dots.forEach((d, j) => {
const on = j === index;
d.classList.toggle('active', on);
d.setAttribute('aria-selected', on ? 'true' : 'false');
});

prev.disabled = false;
next.disabled = false;

syncHash(index);
restartAutoplay();
}

function goTo(i, fromUser = false) {
if (fromUser) userNav = true;
paint(i);
}

function step(dir, fromUser = false) { goTo(index + dir, fromUser); }

function restartAutoplay() {
cancelAnimationFrame(progressRaf);
if (timer) clearTimeout(timer);
if (progress) progress.style.width = '0%';
if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

progressStart = performance.now();

function tick(now) {
const t = Math.min(1, (now - progressStart) / AUTO_MS);
if (progress) progress.style.width = `${t * 100}%`;
if (t < 1) progressRaf = requestAnimationFrame(tick);
};

progressRaf = requestAnimationFrame(tick);

timer = setTimeout(() => step(1), AUTO_MS);
}

tabs.forEach((t) => t.addEventListener('click', () => goTo(Number(t.dataset.index), true)));
dots.forEach((d) => d.addEventListener('click', () => goTo(Number(d.dataset.index), true)));
prev?.addEventListener('click', () => step(-1, true));
next?.addEventListener('click', () => step(1, true));

root.addEventListener('mouseenter', () => { paused = true; if (timer) clearTimeout(timer); cancelAnimationFrame(progressRaf); });
root.addEventListener('mouseleave', () => { paused = false; restartAutoplay(); });
root.addEventListener('focusin', () => { paused = true; if (timer) clearTimeout(timer); cancelAnimationFrame(progressRaf); });
root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget)) { paused = false; restartAutoplay(); } });

window.addEventListener('hashchange', () => {
const i = slideIndexForHash();
if (i != null) goTo(i, true);
});

document.addEventListener('keydown', (e) => {
if (!root.matches(':hover') && document.activeElement && !root.contains(document.activeElement)) return;
if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1, true); }
if (e.key === 'ArrowRight') { e.preventDefault(); step(1, true); }
});

// touch swipe
let touchX = null;
viewport?.addEventListener('touchstart', (e) => { touchX = e.changedTouches[0]?.clientX; }, { passive: true });
viewport?.addEventListener('touchend', (e) => {
if (touchX == null) return;
const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
touchX = null;
if (Math.abs(dx) < 48) return;
step(dx < 0 ? 1 : -1, true);
}, { passive: true });

const fromHash = slideIndexForHash();
goTo(fromHash ?? 0, fromHash != null);
}
