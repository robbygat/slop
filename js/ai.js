// Shared xAI (Grok) client.
//
// When the slop.game backend is running, every call routes through /api/ai/*
// so the API key stays on the server (this is the production path). When the
// site is opened as static files with no backend, direct calls require a
// user-supplied key (Slop Studio settings) — no baked-in key ships in the repo.

const DIRECT_URL = 'https://api.x.ai/v1/chat/completions';
const DIRECT_IMG_URL = 'https://api.x.ai/v1/images/generations';

export const MODELS = {
cook: 'grok-4.3', // full game generation — quality first
remix: 'grok-4.20-0309-non-reasoning', // live code edits — latency first
studio: 'grok-4.3', // studio builds — quality first
};

// every model the picker offers (label → id). Non-Grok models route through the
// server to their provider (Anthropic / OpenAI) and need that provider's API key
// set on the server — otherwise selecting one returns an honest "not configured".
export const MODEL_CHOICES = [
{ id: 'grok-4.3', label: 'Grok 4.3 — best quality', provider: 'xai' },
{ id: 'grok-4.20-0309-non-reasoning', label: 'Grok 4.20 — fast', provider: 'xai' },
{ id: 'grok-4.20-0309-reasoning', label: 'Grok 4.20 — reasoning', provider: 'xai' },
{ id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — Anthropic', provider: 'anthropic' },
{ id: 'gpt-4o', label: 'GPT-4o — OpenAI', provider: 'openai' },
];

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

/**
* Streaming chat completion. Calls onDelta(chunk, fullSoFar) as tokens arrive.
* Resolves with the complete response text.
*/
export async function chatStream({ model, messages, maxTokens = 16384, temperature = 0.6, signal, onDelta }) {
const useProxy = !userKey && await hasProxy(); // user key → always direct
// The direct (no-server) path only carries the xAI dev key, so non-Grok models
// need the backend running with that provider's key. Fail clearly, not cryptically.
if (!useProxy && providerFor(model) !== 'xai') {
throw new Error(`${model} needs the slop.game server running (with that provider's API key). Pick a Grok model, or start \`node server.js\`.`);
}
if (!useProxy && !userKey) {
throw new Error('Start `node server.js` with XAI_API_KEY set, or add your xAI key in Slop Studio settings.');
}
const res = await fetch(useProxy ? '/api/ai/chat' : DIRECT_URL, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
...(useProxy ? {} : { Authorization: `Bearer ${userKey}` }),
},
body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, stream: true }),
signal,
});

if (!res.ok) {
let msg = `AI error ${res.status}`;
try { msg = (await res.json()).error || msg; }
catch { /* non-JSON error body */ }
throw new Error(msg);
}

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
if (delta) {
full += delta;
onDelta?.(delta, full);
}
} catch { /* ignore malformed keep-alive frames */ }
}
}
return full;
}

/**
* Generate one image with grok-imagine-image. Resolves a data: URL.
* Pass {maxSize} to downscale (game sprites don't need 1024px).
*/
export async function imageGen(prompt, { maxSize = 256 } = {}) {
const useProxy = !userKey && await hasProxy();
let b64;
let mime;
if (useProxy) {
const res = await fetch('/api/ai/image', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ prompt }),
});
const data = await res.json().catch(() => ({}));
if (!res.ok) throw new Error(data.error || `image error ${res.status}`);
({ b64, mime } = data);
} else {
if (!userKey) throw new Error('Start `node server.js` with XAI_API_KEY set, or add your xAI key in Slop Studio settings.');
const res = await fetch(DIRECT_IMG_URL, {
method: 'POST',
headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userKey}` },
body: JSON.stringify({ model: 'grok-imagine-image', prompt, n: 1, response_format: 'b64_json' }),
});
const data = await res.json().catch(() => ({}));
if (!res.ok || !data.data?.[0]?.b64_json) throw new Error(data.error?.message || data.error || 'image generation failed');
b64 = data.data[0].b64_json;
mime = data.data[0].mime_type || 'image/jpeg';
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
