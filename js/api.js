// Thin client for the slop.game backend. Every helper resolves to null/[] when
// the backend isn't running (e.g. the site opened as static files), so the
// frontend degrades gracefully instead of crashing.

async function call(method, path, body) {
try {
const res = await fetch(path, {
method,
headers: body ? { 'Content-Type': 'application/json' } : undefined,
body: body ? JSON.stringify(body) : undefined,
credentials: 'same-origin',
});
const data = await res.json().catch(() => ({}));
if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
return data;
} catch (err) {
if (err instanceof TypeError) return null; // network error → backend offline
throw err;
}
}

export const api = {
config: () => call('GET', '/api/config'),
me: async () => (await call('GET', '/api/me'))?.user ?? null,
signup: (username, password) => call('POST', '/api/signup', { username, password }),
login: (username, password) => call('POST', '/api/login', { username, password }),
logout: () => call('POST', '/api/logout'),
googleSignIn: (credential) => call('POST', '/api/auth/google', { credential }),

posts: async () => (await call('GET', '/api/posts'))?.posts ?? null,
createPost: (body) => call('POST', '/api/posts', { body }),

communityGames: async () => (await call('GET', '/api/games'))?.games ?? null,
communityGame: async (id) => (await call('GET', `/api/games/${id}`))?.game ?? null,
publishGame: (game) => call('POST', '/api/games', game),
allPlays: async () => (await call('GET', '/api/plays'))?.counts ?? null,
recordPlay: (id) => call('POST', '/api/plays', { id }),
reportGame: (id, name, reason) => call('POST', '/api/report', { id, name, reason }),

joinWaitlist: (email) => call('POST', '/api/waitlist', { email }),

// friends + invites
friends: () => call('GET', '/api/friends'),
searchUsers: async (q) => (await call('GET', `/api/users/search?q=${encodeURIComponent(q)}`))?.users ?? [],
friendRequest: (username) => call('POST', '/api/friends/request', { username }),
friendRespond: (userId, accept) => call('POST', '/api/friends/respond', { userId, accept }),
friendRemove: (userId) => call('POST', '/api/friends/remove', { userId }),
sendInvite: (toUsername, kind, payload) => call('POST', '/api/invites', { toUsername, kind, payload }),
inviteSeen: (id) => call('POST', '/api/invites/seen', { id }),
};

export function timeAgo(ts) {
const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
if (s < 60) return `${s}s ago`;
if (s < 3600) return `${Math.floor(s / 60)}m ago`;
if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
return `${Math.floor(s / 86400)}d ago`;
}

export function escapeHTML(s) {
return String(s ?? '').replace(/[&<>"']/g, (c) => (
{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
}
