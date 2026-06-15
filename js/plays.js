// Real play counts. No fabricated/seeded numbers — a game shows the actual
// number of times it's been opened. The backend's `plays` table is the shared
// source of truth (global across everyone); when the backend is offline we fall
// back to a local-only tally so the UI still reflects your own plays.

import { api } from './api.js';

const KEY = 'slop-plays';

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
function save(o) { localStorage.setItem(KEY, JSON.stringify(o)); }

let counts = load(); // { id: count }

// Pull the authoritative global counts from the server (no-op when offline).
export async function loadPlays() {
const server = await api.allPlays().catch(() => null);
if (server) { counts = { ...counts, ...server }; save(counts); }
return counts;
}

export function recordPlay(id) {
if (!id) return;
counts[id] = (counts[id] || 0) + 1; // optimistic local bump
save(counts);
api.recordPlay(id).catch(() => { /* offline — local tally stands */ });
}

export function playCount(id) {
return counts[id] || 0;
}

export function fmtPlays(n) {
if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
return String(n);
}
