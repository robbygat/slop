// Shared xAI (Grok) client.
//
// When the slop.game backend is running, every call routes through /api/ai/*
// so the API key stays on the server (this is the production path). When the
// site is opened as static files with no backend, direct calls require a
// user-supplied key (Slop Studio settings) — no baked-in key ships in the repo.

import { getSupabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';

const DIRECT_URL = 'https://api.x.ai/v1/chat/completions';
const DIRECT_IMG_URL = 'https://api.x.ai/v1/images/generations';
// Production path: the metered Supabase Edge Functions (hold the secret keys,
// check the signed-in user's credits, and bill real token usage).
const EDGE_CHAT = `${SUPABASE_URL}/functions/v1/ai-proxy`;
const EDGE_IMAGE = `${SUPABASE_URL}/functions/v1/image-proxy`;

// Defaults are FREE-tier models so a brand-new (free) account can cook immediately
// without hitting the Pro gate. Pro members can pick the frontier models in the
// picker (grok-4.3, claude-opus-4-8, …). Keep these in the 'free' tier of MODEL_CHOICES.
export const MODELS = {
cook: 'gpt-5.5', // homepage quick-cook — OpenAI flagship (strongest)
remix: 'grok-4.20-0309-non-reasoning', // live code edits — latency first (kept on fast Grok)
studio: 'gpt-5.5', // studio builds — OpenAI flagship (strongest)
};

// Every model the picker offers (label → id). `tier` mirrors the server gate in
// supabase/functions/_shared/models.ts: 'free' models are open to everyone (cheap/
// fast); 'pro' models (the frontier ones) need a Pro membership. Keep this list in
// sync with that file. Selecting a Pro model while signed out / on the free tier
// returns an honest 403 from the proxy.
export const MODEL_CHOICES = [
{ id: 'gpt-5.5', label: 'GPT-5.5 — OpenAI flagship', provider: 'openai', tier: 'free' },
{ id: 'grok-4.20-0309-non-reasoning', label: 'Grok 4.20 — fast', provider: 'xai', tier: 'free' },
{ id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fast', provider: 'anthropic', tier: 'free' },
{ id: 'gpt-4o-mini', label: 'GPT-4o mini — fast', provider: 'openai', tier: 'free' },
{ id: 'grok-4.3', label: 'Grok 4.3 — best quality', provider: 'xai', tier: 'pro' },
{ id: 'claude-opus-4-8', label: 'Claude Opus 4.8 — Anthropic flagship', provider: 'anthropic', tier: 'pro' },
{ id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — Anthropic', provider: 'anthropic', tier: 'pro' },
{ id: 'gpt-4o', label: 'GPT-4o — OpenAI', provider: 'openai', tier: 'pro' },
];

// quick lookup: is this model a Pro-only model? (used to lock the picker UI)
export function isProModel(id) {
return MODEL_CHOICES.find((m) => m.id === id)?.tier === 'pro';
}

// Which provider a model id belongs to (used to route + to fail fast client-side).
export function providerFor(model) {
const m = String(model || '');
if (m.startsWith('claude')) return 'anthropic';
if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('chatgpt')) return 'openai';
return 'xai';
}

// Bring-your-own key: when a user supplies their own xAI key in the studio,
// calls go DIRECT to xAI with it (bypassing the shared server proxy/credits).
let userKey = null;
export function setUserKey(k) { userKey = (k && k.trim()) || null; }
export function hasUserKey() { return !!userKey; }

// probe once per page: is the backend (and its AI proxy) up?
let proxyPromise = null;
function hasProxy() {
proxyPromise ??= fetch('/api/config')
.then((r) => (r.ok ? r.json() : null))
.then((cfg) => !!cfg?.ai)
.catch(() => false);
return proxyPromise;
}

// Resolve the signed-in user's Supabase access token (for the metered edge proxy).
async function sessionToken() {
try { const sb = getSupabase(); if (!sb) return null; const { data: { session } } = await sb.auth.getSession(); return session?.access_token || null; }
catch { return null; }
}

// Read an OpenAI-style SSE stream: data: {choices:[{delta:{content}}]}. All three
// transports below emit this shape (the edge proxy normalises Anthropic for us).
async function readSSE(res, onDelta) {
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let full = '';
for (;;) {
const { done, value } = await reader.read();
if (done) break;
buffer += decoder.decode(value, { stream: true });
const lines = buffer.split('\n');
buffer = lines.pop(); // keep the trailing partial line
for (const line of lines) {
const s = line.trim();
if (!s.startsWith('data:')) continue;
const payload = s.slice(5).trim();
if (!payload || payload === '[DONE]') continue;
try {
const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
if (delta) { full += delta; onDelta?.(delta, full); }
} catch { /* ignore malformed keep-alive frames */ }
}
}
return full;
}

// POST and surface a clean error message (the edge proxy returns {error, code}).
async function postOrThrow(url, headers, body, signal) {
const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
if (!res.ok) {
let msg = `AI error ${res.status}`; let code;
try { const j = await res.json(); msg = j.error || msg; code = j.code; } catch { /* non-JSON */ }
const err = new Error(msg); err.status = res.status; err.code = code;
throw err;
}
return res;
}

/**
* Streaming chat completion. Calls onDelta(chunk, fullSoFar) as tokens arrive.
* Resolves with the complete response text. Transport order:
*   1. your own xAI key (Settings) → straight to xAI, no credits used (xAI models only)
*   2. local dev server.js proxy (carries the dev keys, no auth)
*   3. production: the metered Supabase edge function (needs a signed-in session)
*/
export async function chatStream({ model, messages, maxTokens = 16384, temperature = 0.6, signal, onDelta }) {
if (userKey) {
if (providerFor(model) !== 'xai') throw new Error(`${model} runs on slop credits — remove your own key to use it, or pick a Grok model.`);
const res = await postOrThrow(DIRECT_URL, { Authorization: `Bearer ${userKey}` }, { model, messages, max_tokens: maxTokens, temperature, stream: true }, signal);
return readSSE(res, onDelta);
}
if (await hasProxy()) {
const res = await postOrThrow('/api/ai/chat', {}, { model, messages, max_tokens: maxTokens, temperature, stream: true }, signal);
return readSSE(res, onDelta);
}
const token = await sessionToken();
if (!token) throw new Error('sign in to cook with slop AI — or add your own xAI key in Settings.');
const res = await postOrThrow(EDGE_CHAT, { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }, { model, messages, max_tokens: maxTokens, temperature }, signal);
return readSSE(res, onDelta);
}

/**
* Generate one image with grok-imagine-image. Resolves a data: URL.
* Pass {maxSize} to downscale (game sprites don't need 1024px).
*/
export async function imageGen(prompt, { maxSize = 256 } = {}) {
let b64;
let mime;
if (userKey) {
// own xAI key → direct (no credits)
const res = await fetch(DIRECT_IMG_URL, {
method: 'POST',
headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userKey}` },
body: JSON.stringify({ model: 'grok-imagine-image', prompt, n: 1, response_format: 'b64_json' }),
});
const data = await res.json().catch(() => ({}));
if (!res.ok || !data.data?.[0]?.b64_json) throw new Error(data.error?.message || data.error || 'image generation failed');
b64 = data.data[0].b64_json;
mime = data.data[0].mime_type || 'image/jpeg';
} else if (await hasProxy()) {
// local dev proxy
const res = await fetch('/api/ai/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
const data = await res.json().catch(() => ({}));
if (!res.ok) throw new Error(data.error || `image error ${res.status}`);
({ b64, mime } = data);
} else {
// production: metered edge function (costs a few credits per sprite)
const token = await sessionToken();
if (!token) throw new Error('sign in to generate sprites — or add your own xAI key in Settings.');
const res = await fetch(EDGE_IMAGE, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }, body: JSON.stringify({ prompt }) });
const data = await res.json().catch(() => ({}));
if (!res.ok) throw new Error(data.error || `image error ${res.status}`);
({ b64, mime } = data);
}
const raw = `data:${mime};base64,${b64}`;
if (!maxSize) return raw;
return downscale(raw, maxSize);
}

function downscale(dataUrl, maxSize) {
return new Promise((resolve) => {
const img = new Image();
img.onload = () => {
const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
if (scale >= 1) return resolve(dataUrl);
const c = document.createElement('canvas');
c.width = Math.round(img.width * scale);
c.height = Math.round(img.height * scale);
c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
resolve(c.toDataURL('image/png'));
};
img.onerror = () => resolve(dataUrl);
img.src = dataUrl;
});
}

/** Pull the contents of the first ``` fenced code block out of a model response. */
export function extractFence(text) {
const m = text.match(/```[a-zA-Z]*\s*\n([\s\S]*?)```/);
return m ? m[1].trim() : null;
}

/** Pull the first single-line JSON object out of a model response. */
export function extractMetaLine(text) {
for (const line of text.split('\n')) {
const s = line.trim();
if (s.startsWith('{') && s.endsWith('}')) {
try { return JSON.parse(s); } catch { /* keep looking */ }
}
}
return null;
}
