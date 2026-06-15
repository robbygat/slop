// Player progression: XP, levels, and achievements.
// Lives client-side (localStorage) so it works signed-out; namespaced by
// username when signed in so each account keeps its own progress on the device.
// Other modules call awardXP() / unlock() and listen for 'slop:xp'.

import { getUser } from './account.js';

const BASE_KEY = 'slop-progress';

function key() {
const u = getUser();
return u ? `${BASE_KEY}:${u.username}` : `${BASE_KEY}:guest`;
}

function load() {
try { return JSON.parse(localStorage.getItem(key())) || fresh(); }
catch { return fresh(); }
}
function fresh() { return { xp: 0, achievements: {}, counters: {} }; }
function save(p) { localStorage.setItem(key(), JSON.stringify(p)); window.dispatchEvent(new CustomEvent('slop:xp', { detail: p })); }

// level curve: each level needs a bit more than the last
export function levelFromXP(xp) {
let lvl = 1; let need = 100; let acc = 0;
while (xp >= acc + need) { acc += need; lvl++; need = Math.round(need * 1.35); }
return { level: lvl, into: xp - acc, need, pct: Math.round(((xp - acc) / need) * 100) };
}

export function getProgress() {
const p = load();
return { ...p, ...levelFromXP(p.xp) };
}

export function awardXP(amount, reason = '') {
const p = load();
const before = levelFromXP(p.xp).level;
p.xp += amount;
const after = levelFromXP(p.xp).level;
save(p);
if (after > before) {
import('./toast.js').then(({ showToast }) => showToast(` level ${after}! ${reason}`.trim()));
import('./confetti.js').then((m) => m.launchConfetti?.()).catch(() => {});
}
return p.xp;
}

// achievement registry
export const ACHIEVEMENTS = {
first_cook: { icon: '', name: 'First Cook', desc: 'cooked your first game', xp: 50 },
remixer: { icon: '', name: 'Remixer', desc: 'applied a live mod', xp: 40 },
publisher: { icon: '', name: 'Published!', desc: 'published a game to the grid', xp: 60 },
host: { icon: '', name: 'Party Host', desc: 'hosted a multiplayer room', xp: 50 },
social: { icon: '', name: 'Loud in Chat', desc: 'posted on the community board', xp: 20 },
befriend: { icon: '', name: 'Squad Up', desc: 'made a friend', xp: 30 },
speedster: { icon: '', name: 'Speedster', desc: 'won a SlopKart race', xp: 70 },
survivor: { icon: '', name: 'Survivor', desc: 'reached round 5 in Sloppy Zombies', xp: 70 },
studio_rat: { icon: '', name: 'Studio Rat', desc: 'generated an AI sprite', xp: 40 },
};

export function unlock(id) {
const a = ACHIEVEMENTS[id];
if (!a) return false;
const p = load();
if (p.achievements[id]) return false;
p.achievements[id] = Date.now();
p.xp += a.xp;
save(p);
import('./toast.js').then(({ showToast }) => showToast(`${a.icon} achievement: ${a.name} (+${a.xp} XP)`));
import('./confetti.js').then((m) => m.launchConfetti?.()).catch(() => {});
return true;
}

export function bump(counter, by = 1) {
const p = load();
p.counters[counter] = (p.counters[counter] || 0) + by;
save(p);
return p.counters[counter];
}

// ---------------------------------------------------------------- nav pill
export function renderXPPill() {
const slot = document.getElementById('nav-xp');
if (!slot) return;
const p = getProgress();
slot.innerHTML = `
<span class="xp-pill" title="level ${p.level} · ${p.xp} XP">
<span class="lvl">${p.level}</span>
<span class="xpb"><i style="width:${p.pct}%"></i></span>
<span class="xpn">${p.xp} XP</span>
</span>`;
}

export function initXP() {
renderXPPill();
window.addEventListener('slop:xp', renderXPPill);
window.addEventListener('slop:auth', renderXPPill);

// pick up XP/achievements earned inside game pages (they write a queue)
try {
const q = JSON.parse(localStorage.getItem('slop-xp-queue') || '[]');
if (q.length) {
localStorage.removeItem('slop-xp-queue');
for (const e of q) {
if (e.xp) awardXP(e.xp, e.reason || '');
if (e.unlock) unlock(e.unlock);
}
}
} catch { /* ignore */ }
}
