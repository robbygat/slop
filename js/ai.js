// Shared multi-provider AI client.
//
// When the SLOP.game backend is running, every call routes through /api/ai/*
// so API keys stay on the server (this is the production path). When the
// site is opened as static files with no backend, direct calls require a
// user-supplied key (Slop Studio settings) — no baked-in key ships in the repo.

import { getSupabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';
import { MODELS, MODEL_CHOICES, isProModel, providerFor } from './models.js';

export { MODELS, MODEL_CHOICES, isProModel, providerFor };

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const XAI_IMG_URL = 'https://api.x.ai/v1/images/generations';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const EDGE_CHAT = `${SUPABASE_URL}/functions/v1/ai-proxy`;
const EDGE_IMAGE = `${SUPABASE_URL}/functions/v1/image-proxy`;

// Bring-your-own key: when a user supplies their own API key in the studio,
// calls go direct to that provider (bypassing the shared server proxy/credits).
let userKey = null;
export function setUserKey(k) { userKey = (k && k.trim()) || null; }
export function hasUserKey() { return !!userKey; }

function keyProviderFor(key) {
const k = (key || '').trim();
if (k.startsWith('xai-')) return 'xai';
if (k.startsWith('sk-ant-')) return 'anthropic';
if (k.startsWith('sk-')) return 'openai';
return null;
}

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
let finishReason = null;
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
const choice = JSON.parse(payload).choices?.[0];
if (choice?.finish_reason) finishReason = choice.finish_reason;
const delta = choice?.delta?.content;
if (delta) { full += delta; onDelta?.(delta, full); }
} catch { /* ignore malformed keep-alive frames */ }
}
}
return { text: full, finishReason, truncated: finishReason === 'length' };
}

async function readAnthropicSSE(res, onDelta) {
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let full = '';
let finishReason = null;
for (;;) {
const { done, value } = await reader.read();
if (done) break;
buffer += decoder.decode(value, { stream: true });
const lines = buffer.split('\n');
buffer = lines.pop();
for (const line of lines) {
const s = line.trim();
if (!s.startsWith('data:')) continue;
const payload = s.slice(5).trim();
if (!payload) continue;
try {
const ev = JSON.parse(payload);
if (ev.type === 'message_delta' && ev.delta?.stop_reason) finishReason = ev.delta.stop_reason;
if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
full += ev.delta.text;
onDelta?.(ev.delta.text, full);
}
} catch { /* keep-alive / non-JSON */ }
}
}
return { text: full, finishReason, truncated: finishReason === 'max_tokens' };
}

async function chatStreamDirect({ model, messages, maxTokens, temperature, signal, onDelta }) {
const keyProv = keyProviderFor(userKey);
const modelProv = providerFor(model);
if (!keyProv) throw new Error('Unrecognized API key — use sk-… (OpenAI), sk-ant-… (Anthropic), or xai-… (xAI).');
if (keyProv !== modelProv) throw new Error(`Your key is for ${keyProv} — pick a ${keyProv} model, or paste a key for ${modelProv}.`);

if (keyProv === 'xai') {
const res = await postOrThrow(XAI_URL, { Authorization: `Bearer ${userKey}` }, { model, messages, max_tokens: maxTokens, temperature, stream: true }, signal);
return readSSE(res, onDelta);
}
if (keyProv === 'openai') {
const res = await postOrThrow(OPENAI_URL, { Authorization: `Bearer ${userKey}` }, { model, messages, max_tokens: maxTokens, temperature, stream: true }, signal);
return readSSE(res, onDelta);
}
const system = messages.filter((m) => m.role === 'system').map((m) => String(m.content ?? '')).join('\n\n');
const msgs = messages.filter((m) => m.role !== 'system')
.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content ?? '') }));
const res = await postOrThrow(ANTHROPIC_URL, {
'x-api-key': userKey,
'anthropic-version': '2023-06-01',
'anthropic-dangerous-direct-browser-access': 'true',
}, {
model,
...(system ? { system } : {}),
messages: msgs,
max_tokens: maxTokens,
temperature,
stream: true,
}, signal);
return readAnthropicSSE(res, onDelta);
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
* Transport order:
*   1. your own API key (Settings) → direct to OpenAI, Anthropic, or xAI
*   2. local dev server.js proxy (carries the dev keys, no auth)
*   3. production: the metered Supabase edge function (needs a signed-in session)
*
* After each call, check chatStream.lastMeta.truncated — true when the model hit its output limit.
*/
chatStream.lastMeta = { finishReason: null, truncated: false };
export async function chatStream({ model, messages, maxTokens = 16384, temperature = 0.6, signal, onDelta }) {
let result;
if (userKey) {
result = await chatStreamDirect({ model, messages, maxTokens, temperature, signal, onDelta });
} else if (await hasProxy()) {
const res = await postOrThrow('/api/ai/chat', {}, { model, messages, max_tokens: maxTokens, temperature, stream: true }, signal);
result = await readSSE(res, onDelta);
} else {
const token = await sessionToken();
if (!token) throw new Error('sign in to cook with slop AI — or add your own API key in Settings.');
const res = await postOrThrow(EDGE_CHAT, { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }, { model, messages, max_tokens: maxTokens, temperature }, signal);
result = await readSSE(res, onDelta);
}
chatStream.lastMeta = { finishReason: result.finishReason, truncated: result.truncated };
return result.text;
}

/**
* Generate one image with grok-imagine-image. Resolves a data: URL.
* Pass {maxSize} to downscale (game sprites don't need 1024px).
*/
export async function imageGen(prompt, { maxSize = 256 } = {}) {
let b64;
let mime;
if (userKey) {
if (keyProviderFor(userKey) !== 'xai') throw new Error('Sprite generation needs an xAI key (xai-…) or slop credits — remove your key or sign in.');
const res = await fetch(XAI_IMG_URL, {
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
if (!token) throw new Error('sign in to generate sprites — or add an xAI API key in Settings.');
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
