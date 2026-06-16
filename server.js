// slop.game backend — zero npm dependencies.
// Static file server + JSON API backed by SQLite (node:sqlite).
//
// node server.js → http://localhost:3000
// PORT=8080 node server.js → custom port
//
// Features: username/password accounts (scrypt-hashed), session cookies,
// optional Google Sign-In (set GOOGLE_CLIENT_ID), community posts, a shared
// catalog of published games, friends + studio invites, and a server-side
// xAI (Grok) proxy so the API key never ships to browsers in production.

import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

// Google sign-in: read the OAuth client ID from the environment OR a local
// slop.config.json ({ "googleClientId": "...apps.googleusercontent.com" }).
// The config file is the easy path — drop your ID in and restart, no env vars.
let fileConfig = {};
try { fileConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'slop.config.json'), 'utf8')); }
catch { /* no config file — fine */ }
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || fileConfig.googleClientId || '';

// The Grok key — set XAI_API_KEY in the environment or xaiApiKey in slop.config.json.
const XAI_API_KEY = process.env.XAI_API_KEY || fileConfig.xaiApiKey || '';
const XAI_BASE = 'https://api.x.ai/v1';

// Optional extra providers for the model picker (Claude / GPT). No baked-in dev
// fallback — these only work when their key is set, so selecting one without the
// key returns an honest "not configured" instead of pretending.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_BASE = 'https://api.openai.com/v1';
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

function providerFor(model) {
const m = String(model || '');
if (m.startsWith('claude')) return 'anthropic';
if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('chatgpt')) return 'openai';
return 'xai';
}

// ---------------------------------------------------------------- database

const db = new DatabaseSync(path.join(ROOT, process.env.DB_PATH || 'slop.db'));
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
id INTEGER PRIMARY KEY AUTOINCREMENT,
username TEXT UNIQUE NOT NULL,
pass_hash TEXT,
pass_salt TEXT,
google_sub TEXT UNIQUE,
created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
token TEXT PRIMARY KEY,
user_id INTEGER NOT NULL REFERENCES users(id),
created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER NOT NULL REFERENCES users(id),
body TEXT NOT NULL,
created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
id TEXT PRIMARY KEY,
user_id INTEGER NOT NULL REFERENCES users(id),
name TEXT NOT NULL,
desc TEXT NOT NULL,
prompt TEXT,
html TEXT NOT NULL,
thumb TEXT,
plays INTEGER NOT NULL DEFAULT 0,
created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS waitlist (
email TEXT PRIMARY KEY,
created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
id INTEGER PRIMARY KEY AUTOINCREMENT,
game_id TEXT NOT NULL,
game_name TEXT,
reason TEXT,
user_id INTEGER REFERENCES users(id),
created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friends (
user_id INTEGER NOT NULL REFERENCES users(id),
friend_id INTEGER NOT NULL REFERENCES users(id),
status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted (row direction = requester → requestee)
created_at INTEGER NOT NULL,
PRIMARY KEY (user_id, friend_id)
);
CREATE TABLE IF NOT EXISTS invites (
id INTEGER PRIMARY KEY AUTOINCREMENT,
from_id INTEGER NOT NULL REFERENCES users(id),
to_id INTEGER NOT NULL REFERENCES users(id),
kind TEXT NOT NULL, -- studio | game
payload TEXT NOT NULL DEFAULT '{}',
seen INTEGER NOT NULL DEFAULT 0,
created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plays (
id TEXT PRIMARY KEY,
count INTEGER NOT NULL DEFAULT 0
);
`);

// Real play counts: the plays table is the single source of truth (works for any
// game kind — launch slugs, cooked ids, community ids). Seed it once from the
// community catalog's historical counts so nothing is lost; from then on every
// real play increments it. No fabricated numbers anywhere.
db.exec('INSERT OR IGNORE INTO plays (id, count) SELECT id, plays FROM games');

// ---------------------------------------------------------------- helpers

const now = () => Date.now();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
const hash = crypto.scryptSync(password, salt, 64).toString('hex');
return { hash, salt };
}

function verifyPassword(password, salt, expected) {
const { hash } = hashPassword(password, salt);
return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected));
}

function publicUser(u) {
return { id: u.id, username: u.username };
}

function sessionUser(req) {
const cookies = Object.fromEntries(
(req.headers.cookie || '').split(';').map((c) => c.trim().split('=').map(decodeURIComponent)).filter((p) => p[0])
);
if (!cookies.slop_session) return null;
const row = db.prepare(
'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'
).get(cookies.slop_session);
return row || null;
}

function createSession(res, userId) {
const token = crypto.randomBytes(32).toString('hex');
db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, now());
res.setHeader('Set-Cookie', `slop_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
}

function json(res, status, data) {
const body = JSON.stringify(data);
res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
res.end(body);
}

function readBody(req, limit = 4 * 1024 * 1024) {
return new Promise((resolve, reject) => {
let size = 0;
const chunks = [];
req.on('data', (c) => {
size += c.length;
if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
chunks.push(c);
});
req.on('end', () => {
try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); }
catch { reject(new Error('invalid JSON')); }
});
req.on('error', reject);
});
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// in-memory sliding-window rate limiter (per IP per bucket)
const rateMap = new Map();
function rateLimit(req, bucket, max, windowMs) {
const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
const key = `${bucket}:${ip}`;
const t = now();
const hits = (rateMap.get(key) || []).filter((h) => t - h < windowMs);
if (hits.length >= max) return false;
hits.push(t);
rateMap.set(key, hits);
if (rateMap.size > 50000) rateMap.clear(); // crude memory guard
return true;
}

// ---------------------------------------------------------------- AI proxy

const SSE_HEADERS = {
'Content-Type': 'text/event-stream; charset=utf-8',
'Cache-Control': 'no-cache',
'X-Accel-Buffering': 'no',
};

// Streams chat completions to the browser without exposing keys. Routes to the
// right provider by model id: Grok→xAI, gpt-*→OpenAI (both OpenAI-style SSE,
// piped straight through), claude-*→Anthropic (translated to OpenAI-style SSE so
// the browser client needs no per-provider parsing).
async function aiChat(req, res) {
if (!rateLimit(req, 'ai', 30, 5 * 60 * 1000)) {
return json(res, 429, { error: 'easy there, chef — too many AI requests, try again in a few minutes' });
}
const body = await readBody(req, 6 * 1024 * 1024);
const { model, messages, max_tokens, temperature } = body;
if (!Array.isArray(messages) || !model) return json(res, 400, { error: 'bad AI request' });

const provider = providerFor(model);
if (provider === 'anthropic') return aiChatAnthropic(res, { model, messages, max_tokens, temperature });

const maxOut = Math.min(Number(max_tokens) || 16384, 49152);
const reasoning = provider === 'openai' && /^(gpt-5|o[0-9])/.test(String(model));
const cfg = provider === 'openai'
? { url: `${OPENAI_BASE}/chat/completions`, key: OPENAI_API_KEY, name: 'OpenAI', env: 'OPENAI_API_KEY' }
: { url: `${XAI_BASE}/chat/completions`, key: XAI_API_KEY, name: 'xAI', env: 'XAI_API_KEY' };
if (!cfg.key) return json(res, 501, { error: `${cfg.name} models aren't set up on this server — set ${cfg.env} to enable them` });

const upstream = await fetch(cfg.url, {
method: 'POST',
headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
body: JSON.stringify(reasoning ? {
model: String(model).slice(0, 64),
messages,
max_completion_tokens: maxOut,
stream: true,
stream_options: { include_usage: true },
reasoning_effort: 'low',
} : {
model: String(model).slice(0, 64),
messages,
max_tokens: maxOut,
temperature: Math.max(0, Math.min(Number(temperature) ?? 0.6, 1.5)),
stream: true,
stream_options: { include_usage: true },
}),
});

if (!upstream.ok) {
const text = await upstream.text().catch(() => '');
return json(res, upstream.status, { error: `${cfg.name} error ${upstream.status}: ${text.slice(0, 300)}` });
}

res.writeHead(200, SSE_HEADERS);
const reader = upstream.body.getReader();
try {
for (;;) {
const { done, value } = await reader.read();
if (done) break;
res.write(value);
}
} catch { /* client disconnected */ }
res.end();
}

// Anthropic Messages API → translated into OpenAI-style SSE chunks so the
// existing browser stream parser works unchanged.
async function aiChatAnthropic(res, { model, messages, max_tokens, temperature }) {
if (!ANTHROPIC_API_KEY) return json(res, 501, { error: "Claude models aren't set up on this server — set ANTHROPIC_API_KEY to enable them" });

// Anthropic takes the system prompt as a top-level field, not a message role.
const system = messages.filter((m) => m.role === 'system').map((m) => String(m.content ?? '')).join('\n\n');
const msgs = messages.filter((m) => m.role !== 'system')
.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content ?? '') }));

const upstream = await fetch(`${ANTHROPIC_BASE}/messages`, {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
body: JSON.stringify({
model: String(model).slice(0, 64),
...(system ? { system } : {}),
messages: msgs,
max_tokens: Math.min(Number(max_tokens) || 16384, 64000),
temperature: Math.max(0, Math.min(Number(temperature) ?? 0.6, 1)),
stream: true,
}),
});

if (!upstream.ok) {
const text = await upstream.text().catch(() => '');
return json(res, upstream.status, { error: `Anthropic error ${upstream.status}: ${text.slice(0, 300)}` });
}

res.writeHead(200, SSE_HEADERS);
const reader = upstream.body.getReader();
const dec = new TextDecoder();
let buf = '';
try {
for (;;) {
const { done, value } = await reader.read();
if (done) break;
buf += dec.decode(value, { stream: true });
const lines = buf.split('\n');
buf = lines.pop();
for (const line of lines) {
const s = line.trim();
if (!s.startsWith('data:')) continue;
const payload = s.slice(5).trim();
if (!payload) continue;
try {
const ev = JSON.parse(payload);
if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: ev.delta.text } }] })}\n\n`);
}
} catch { /* keep-alive / non-JSON */ }
}
}
} catch { /* client disconnected */ }
res.write('data: [DONE]\n\n');
res.end();
}

async function aiImage(req, res) {
if (!rateLimit(req, 'img', 20, 5 * 60 * 1000)) {
return json(res, 429, { error: 'too many image requests — try again in a few minutes' });
}
const { prompt } = await readBody(req);
if (!prompt || String(prompt).length > 2000) return json(res, 400, { error: 'bad image prompt' });

const upstream = await fetch(`${XAI_BASE}/images/generations`, {
method: 'POST',
headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${XAI_API_KEY}` },
body: JSON.stringify({ model: 'grok-imagine-image', prompt: String(prompt), n: 1, response_format: 'b64_json' }),
});
const data = await upstream.json().catch(() => ({}));
if (!upstream.ok || !data.data?.[0]?.b64_json) {
return json(res, upstream.ok ? 502 : upstream.status, { error: data.error || 'image generation failed' });
}
json(res, 200, { b64: data.data[0].b64_json, mime: data.data[0].mime_type || 'image/jpeg' });
}

// ---------------------------------------------------------------- api routes

const routes = {
'GET /api/config': (req, res) => {
json(res, 200, { googleClientId: GOOGLE_CLIENT_ID || null, ai: true });
},

'POST /api/ai/chat': aiChat,
'POST /api/ai/image': aiImage,

'POST /api/signup': async (req, res) => {
if (!rateLimit(req, 'signup', 10, 10 * 60 * 1000)) return json(res, 429, { error: 'slow down' });
const { username, password } = await readBody(req);
if (!USERNAME_RE.test(username || '')) return json(res, 400, { error: 'username must be 3-20 chars: letters, numbers, _' });
if (!password || password.length < 6) return json(res, 400, { error: 'password must be at least 6 characters' });
if (db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username)) {
return json(res, 409, { error: 'that username is taken' });
}
const { hash, salt } = hashPassword(password);
const info = db.prepare('INSERT INTO users (username, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?)')
.run(username, hash, salt, now());
createSession(res, info.lastInsertRowid);
json(res, 200, { user: { id: Number(info.lastInsertRowid), username } });
},

'POST /api/login': async (req, res) => {
if (!rateLimit(req, 'login', 20, 10 * 60 * 1000)) return json(res, 429, { error: 'slow down' });
const { username, password } = await readBody(req);
const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username || '');
if (!user || !user.pass_hash || !verifyPassword(password || '', user.pass_salt, user.pass_hash)) {
return json(res, 401, { error: 'wrong username or password' });
}
createSession(res, user.id);
json(res, 200, { user: publicUser(user) });
},

'POST /api/logout': (req, res) => {
const user = sessionUser(req);
if (user) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
res.setHeader('Set-Cookie', 'slop_session=; Path=/; HttpOnly; Max-Age=0');
json(res, 200, { ok: true });
},

'GET /api/me': (req, res) => {
const user = sessionUser(req);
json(res, 200, { user: user ? publicUser(user) : null });
},

'POST /api/auth/google': async (req, res) => {
if (!GOOGLE_CLIENT_ID) return json(res, 501, { error: 'Google sign-in is not configured on this server' });
const { credential } = await readBody(req);
if (!credential) return json(res, 400, { error: 'missing credential' });
const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
if (!r.ok) return json(res, 401, { error: 'invalid Google credential' });
const info = await r.json();
if (info.aud !== GOOGLE_CLIENT_ID) return json(res, 401, { error: 'credential issued for another app' });

let user = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(info.sub);
if (!user) {
let base = (info.email || 'player').split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 16) || 'player';
let username = base;
let n = 1;
while (db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username)) {
username = `${base}_${n++}`;
}
const ins = db.prepare('INSERT INTO users (username, google_sub, created_at) VALUES (?, ?, ?)')
.run(username, info.sub, now());
user = { id: Number(ins.lastInsertRowid), username };
}
createSession(res, user.id);
json(res, 200, { user: publicUser(user) });
},

'GET /api/posts': (req, res) => {
const rows = db.prepare(`
SELECT p.id, p.body, p.created_at, u.username
FROM posts p JOIN users u ON u.id = p.user_id
ORDER BY p.id DESC LIMIT 50
`).all();
json(res, 200, { posts: rows });
},

'POST /api/posts': async (req, res) => {
const user = sessionUser(req);
if (!user) return json(res, 401, { error: 'sign in to post' });
if (!rateLimit(req, 'post', 15, 5 * 60 * 1000)) return json(res, 429, { error: 'slow down' });
const { body } = await readBody(req);
const text = String(body || '').trim().slice(0, 280);
if (!text) return json(res, 400, { error: 'say something first' });
const info = db.prepare('INSERT INTO posts (user_id, body, created_at) VALUES (?, ?, ?)').run(user.id, text, now());
json(res, 200, { post: { id: Number(info.lastInsertRowid), body: text, created_at: now(), username: user.username } });
},

// ---- friends ----

'GET /api/users/search': (req, res, url) => {
const user = sessionUser(req);
if (!user) return json(res, 401, { error: 'sign in first' });
const q = (url.searchParams.get('q') || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
if (q.length < 2) return json(res, 200, { users: [] });
const rows = db.prepare(
'SELECT id, username FROM users WHERE username LIKE ? COLLATE NOCASE AND id != ? LIMIT 8'
).all(`${q}%`, user.id);
json(res, 200, { users: rows });
},

'GET /api/friends': (req, res) => {
const user = sessionUser(req);
if (!user) return json(res, 401, { error: 'sign in first' });
const friends = db.prepare(`
SELECT u.id, u.username FROM friends f
JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
`).all(user.id, user.id, user.id);
const incoming = db.prepare(`
SELECT u.id, u.username FROM friends f JOIN users u ON u.id = f.user_id
WHERE f.friend_id = ? AND f.status = 'pending'
`).all(user.id);
const outgoing = db.prepare(`
SELECT u.id, u.username FROM friends f JOIN users u ON u.id = f.friend_id
WHERE f.user_id = ? AND f.status = 'pending'
`).all(user.id);
const invites = db.prepare(`
SELECT i.id, i.kind, i.payload, i.created_at, u.username AS from_username
FROM invites i JOIN users u ON u.id = i.from_id
WHERE i.to_id = ? AND i.seen = 0 ORDER BY i.id DESC LIMIT 20
`).all(user.id).map((i) => ({ ...i, payload: JSON.parse(i.payload || '{}') }));
json(res, 200, { friends, incoming, outgoing, invites });
},

'POST /api/friends/request': async (req, res) => {
const user = sessionUser(req);
if (!user) return json(res, 401, { error: 'sign in first' });
const { username } = await readBody(req);
const target = db.prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE').get(username || '');
if (!target) return json(res, 404, { error: 'no player with that username' });
if (target.id === user.id) return json(res, 400, { error: "that's you, chef" });
const existing = db.prepare(
'SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'
).get(user.id, target.id, target.id, user.id);
if (existing?.status === 'accepted') return json(res, 409, { error: 'already friends' });
if (existing?.user_id === user.id) return json(res, 409, { error: 'request already sent' });
if (existing) {
// they already asked us — auto-accept
db.prepare('UPDATE friends SET status = ? WHERE user_id = ? AND friend_id = ?')
.run('accepted', target.id, user.id);
return json(res, 200, { accepted: true, friend: target });
}
db.prepare('INSERT INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, ?, ?)')
.run(user.id, target.id, 'pending', now());
json(res, 200, { requested: true });
},

'POST /api/friends/respond': async (req, res) => {
const user = sessionUser(req);
if (!user) return json(res, 401, { error: 'sign in first' });
const { userId, accept } = await readBody(req);
const row = db.prepare('SELECT * FROM friends WHERE user_id = ? AND friend_id = ? AND status = ?')
.get(Number(userId), user.id, 'pending');
if (!row) return json(res, 404, { error: 'no such request' });
if (accept) {
db.prepare('UPDATE friends SET status = ? WHERE user_id = ? AND friend_id = ?')
.run('accepted', Number(userId), user.id);
} else {
db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(Number(userId), user.id);
}
json(res, 200, { ok: true });
},

'POST /api/friends/remove': async (req, res) => {
const user = sessionUser(req);
if (!user) return json(res, 401, { error: 'sign in first' });
const { userId } = await readBody(req);
db.prepare('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)')
.run(user.id, Number(userId), Number(userId), user.id);
json(res, 200, { ok: true });
},

// studio / game invites between friends
'POST /api/invites': async (req, res) => {
const user = sessionUser(req);
if (!user) return json(res, 401, { error: 'sign in first' });
if (!rateLimit(req, 'invite', 20, 5 * 60 * 1000)) return json(res, 429, { error: 'slow down' });
const { toUsername, kind, payload } = await readBody(req);
const target = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(toUsername || '');
if (!target) return json(res, 404, { error: 'no player with that username' });
const friendship = db.prepare(`
SELECT 1 FROM friends WHERE status = 'accepted'
AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
`).get(user.id, target.id, target.id, user.id);
if (!friendship) return json(res, 403, { error: 'add them as a friend first' });
db.prepare('INSERT INTO invites (from_id, to_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)')
.run(user.id, target.id, String(kind || 'studio').slice(0, 16), JSON.stringify(payload || {}).slice(0, 2000), now());
json(res, 200, { ok: true });
},

'POST /api/invites/seen': async (req, res) => {
const user = sessionUser(req);
if (!user) return json(res, 401, { error: 'sign in first' });
const { id } = await readBody(req);
db.prepare('UPDATE invites SET seen = 1 WHERE id = ? AND to_id = ?').run(Number(id), user.id);
json(res, 200, { ok: true });
},

// ---- community game catalog ----

'GET /api/games': (req, res) => {
const rows = db.prepare(`
SELECT g.id, g.name, g.desc, g.thumb, g.plays, g.created_at, u.username
FROM games g JOIN users u ON u.id = g.user_id
ORDER BY g.created_at DESC LIMIT 60
`).all();
json(res, 200, { games: rows });
},

'POST /api/games': async (req, res) => {
const user = sessionUser(req);
if (!user) return json(res, 401, { error: 'sign in to publish' });
if (!rateLimit(req, 'publish', 10, 10 * 60 * 1000)) return json(res, 429, { error: 'slow down' });
const { name, desc, prompt, html, thumb } = await readBody(req);
if (!name || !html || html.length > 2 * 1024 * 1024) return json(res, 400, { error: 'invalid game payload' });
const id = `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'game'}-${crypto.randomBytes(3).toString('hex')}`;
db.prepare('INSERT INTO games (id, user_id, name, desc, prompt, html, thumb, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
.run(id, user.id, String(name).slice(0, 60), String(desc || '').slice(0, 140), String(prompt || '').slice(0, 500), html, thumb || null, now());
json(res, 200, { id });
},

// dev helper (localhost only): refresh a launch game's grid thumbnail
'POST /api/dev/thumb': async (req, res) => {
const remote = req.socket.remoteAddress;
if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') {
return json(res, 403, { error: 'localhost only' });
}
const { game, dataUrl } = await readBody(req, 8 * 1024 * 1024);
if (!/^[a-z0-9-]+$/.test(game || '') || !String(dataUrl || '').startsWith('data:image/png;base64,')) {
return json(res, 400, { error: 'bad payload' });
}
const dir = path.join(ROOT, 'games', game);
if (!fs.existsSync(dir)) return json(res, 404, { error: 'no such game' });
fs.writeFileSync(path.join(dir, 'thumb.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
json(res, 200, { ok: true });
},

// flag a game (any kind: launch / cooked / community). Open to anyone — we just
// log it for a human to review. Rate-limited so it can't be spammed.
'POST /api/report': async (req, res) => {
if (!rateLimit(req, 'report', 20, 10 * 60 * 1000)) return json(res, 429, { error: 'too many reports — try again later' });
const user = sessionUser(req);
const { id, name, reason } = await readBody(req);
if (!id || String(id).length > 80) return json(res, 400, { error: 'missing game id' });
db.prepare('INSERT INTO reports (game_id, game_name, reason, user_id, created_at) VALUES (?, ?, ?, ?, ?)')
.run(String(id).slice(0, 80), String(name || '').slice(0, 80), String(reason || '').slice(0, 500), user?.id ?? null, now());
json(res, 200, { ok: true });
},

// real play counts — global, shared, keyed by game id (any kind)
'GET /api/plays': (req, res) => {
const counts = {};
for (const r of db.prepare('SELECT id, count FROM plays').all()) counts[r.id] = r.count;
json(res, 200, { counts });
},

'POST /api/plays': async (req, res) => {
if (!rateLimit(req, 'play', 240, 60 * 1000)) return json(res, 200, { ok: true }); // soft-ignore floods
const { id } = await readBody(req);
if (!id || String(id).length > 80) return json(res, 400, { error: 'bad game id' });
const gid = String(id).slice(0, 80);
db.prepare('INSERT INTO plays (id, count) VALUES (?, 1) ON CONFLICT(id) DO UPDATE SET count = count + 1').run(gid);
const row = db.prepare('SELECT count FROM plays WHERE id = ?').get(gid);
json(res, 200, { count: row?.count || 1 });
},

'POST /api/waitlist': async (req, res) => {
if (!rateLimit(req, 'wait', 10, 10 * 60 * 1000)) return json(res, 429, { error: 'slow down' });
const { email } = await readBody(req);
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) return json(res, 400, { error: 'enter a valid email' });
db.prepare('INSERT OR IGNORE INTO waitlist (email, created_at) VALUES (?, ?)').run(email, now());
json(res, 200, { ok: true });
},
};

// dynamic routes: /api/games/:id (full html) and /api/games/:id/play
function dynamicRoute(req, res, url) {
let m = url.pathname.match(/^\/api\/games\/([a-z0-9-]+)$/);
if (m && req.method === 'GET') {
const row = db.prepare(`
SELECT g.*, u.username FROM games g JOIN users u ON u.id = g.user_id WHERE g.id = ?
`).get(m[1]);
if (!row) return json(res, 404, { error: 'game not found' });
return json(res, 200, { game: { id: row.id, name: row.name, desc: row.desc, prompt: row.prompt, html: row.html, thumb: row.thumb, plays: row.plays, username: row.username } });
}
m = url.pathname.match(/^\/api\/games\/([a-z0-9-]+)\/play$/);
if (m && req.method === 'POST') {
db.prepare('UPDATE games SET plays = plays + 1 WHERE id = ?').run(m[1]);
return json(res, 200, { ok: true });
}
return false;
}

// ---------------------------------------------------------------- static files

const MIME = {
'.html': 'text/html; charset=utf-8',
'.js': 'text/javascript; charset=utf-8',
'.css': 'text/css; charset=utf-8',
'.png': 'image/png',
'.jpg': 'image/jpeg',
'.svg': 'image/svg+xml',
'.json': 'application/json',
'.ico': 'image/x-icon',
'.woff2': 'font/woff2',
'.txt': 'text/plain; charset=utf-8',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

function serveStatic(req, res, url) {
let filePath = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
if (url.pathname === '/' || url.pathname === '') filePath = path.join(ROOT, 'index.html');
// never serve the database or server internals
const base = path.basename(filePath);
if (base.startsWith('slop.db') || base === 'server.js' || base.startsWith('.')) {
res.writeHead(404); res.end('not found'); return;
}

// pretty jam links: slop.game/<code> → open the collaborative studio for that
// session. Only for single-segment, file-less paths (real files/dirs win).
const seg = url.pathname.slice(1);
if (/^[A-Za-z0-9][A-Za-z0-9-]{3,48}$/.test(seg) && !fs.existsSync(path.join(ROOT, seg))) {
fs.readFile(path.join(ROOT, 'studio.html'), (e, data) => {
if (e) { res.writeHead(404); res.end('not found'); return; }
res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
res.end(data);
});
return;
}

fs.stat(filePath, (err, stat) => {
if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
fs.readFile(filePath, (err2, data) => {
if (err2) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
const ext = path.extname(filePath).toLowerCase();
const headers = {
'Content-Type': MIME[ext] || 'application/octet-stream',
// images cache briefly; html/js/css revalidate so deploys land instantly
'Cache-Control': ['.png', '.jpg', '.svg', '.woff2'].includes(ext) ? 'public, max-age=600' : 'no-cache',
};
// gzip text assets when the client supports it — matters at 1000 users
const accepts = (req.headers['accept-encoding'] || '').includes('gzip');
if (accepts && COMPRESSIBLE.has(ext) && data.length > 1400) {
zlib.gzip(data, { level: 6 }, (gzErr, gz) => {
if (gzErr) { res.writeHead(200, headers); res.end(data); return; }
headers['Content-Encoding'] = 'gzip';
res.writeHead(200, headers);
res.end(gz);
});
return;
}
res.writeHead(200, headers);
res.end(data);
});
});
}

// ---------------------------------------------------------------- server

const server = http.createServer(async (req, res) => {
const url = new URL(req.url, `http://${req.headers.host}`);
try {
const handler = routes[`${req.method} ${url.pathname}`];
if (handler) return await handler(req, res, url);
if (url.pathname.startsWith('/api/')) {
if (dynamicRoute(req, res, url) !== false) return;
return json(res, 404, { error: 'no such endpoint' });
}
serveStatic(req, res, url);
} catch (err) {
console.error(err);
if (!res.headersSent) json(res, 500, { error: err.message || 'server error' });
else res.end();
}
});

server.listen(PORT, () => {
console.log(`slop.game serving on http://localhost:${PORT}`);
console.log(GOOGLE_CLIENT_ID ? 'Google sign-in: ENABLED' : 'Google sign-in: disabled (set GOOGLE_CLIENT_ID to enable)');
console.log(XAI_API_KEY ? 'xAI key: configured' : 'xAI key: not set (set XAI_API_KEY or xaiApiKey in slop.config.json)');
});
