// Discovery: rotating "daily drop" + scroll reveal helpers.

// ---------------------------------------------------------------- daily drop
const DROPS = [
{ id: 'slopkart', title: 'SlopKart', kicker: 'brand new · fully 3D', badge: 'today\'s drop',
desc: 'a fully 3D kart racer — drift around neon circuits for turbo boost, grab item boxes, and battle AI racers or 4 friends online. built to be remixed live, mid-race.',
img: 'games/slopkart/thumb.png', href: 'games/slopkart/index.html' },
{ id: 'sloppy-zombies', title: 'Sloppy Zombies', kicker: 'co-op survival', badge: 'hot today',
desc: 'round-based undead survival — board the windows, bank your points, spin the mystery box, and hold out with up to 4 friends. fully live-remixable.',
img: 'games/sloppy-zombies/thumb.png', href: 'games/sloppy-zombies/index.html' },
{ id: 'dungeon-panic', title: 'Dungeon Panic', kicker: 'roguelike co-op', badge: 'staff pick',
desc: 'a twin-stick roguelike with rotating bosses, a blessing pool, and 4-player co-op. remix the whole game with a sentence while you play.',
img: 'games/dungeon-panic/thumb.png', href: 'games/dungeon-panic/index.html' },
];

export function initDailyDrop() {
const card = document.getElementById('daily-drop');
if (!card) return;
const day = Math.floor(Date.now() / 86400000);
const drop = DROPS[day % DROPS.length];
card.querySelector('#drop-title').textContent = drop.title;
card.querySelector('#drop-kicker').textContent = drop.kicker;
card.querySelector('#drop-badge').textContent = drop.badge;
card.querySelector('#drop-desc').textContent = drop.desc;
const img = card.querySelector('#drop-img');
img.src = drop.img; img.style.display = '';
img.onerror = () => { img.style.display = 'none'; };
card.querySelector('#drop-play').href = drop.href;
card.querySelector('#drop-remix').href = `${drop.href}?remix=1`;
}

// ---------------------------------------------------------------- scroll reveal
export function initReveal() {
const els = document.querySelectorAll('.reveal');
if (!els.length || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
const io = new IntersectionObserver((entries) => {
for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { threshold: 0.12 });
els.forEach((e) => io.observe(e));
}
