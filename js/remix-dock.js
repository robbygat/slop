// The SLOP.game REMIX DOCK — one live-modding panel shared by every built-in game.
//
// It docks BESIDE the game (the stage shrinks, nothing covers the canvas; on
// small screens it becomes a bottom sheet). Type or speak any change → Grok
// reads the game's real source → writes a JavaScript patch → it's applied to
// the RUNNING game with no reload. Mods persist per-game, can be removed, and
// in multiplayer the host's mods are broadcast so the whole room gets them live.
//
// Usage (from a game page):
// import { mountRemixDock } from '../../js/remix-dock.js';
// mountRemixDock({ gameId, title, apiName, getApi, sources, storageKey,
// shell, chips, describe, smokeTest? });

import { chatStream, extractFence, MODELS } from './ai.js';
import { createSpeech } from './speech.js';

const STYLE = `
#rxd-toggle {
position: fixed; top: 14px; right: 14px; z-index: 80;
display: flex; align-items: center; gap: 8px;
font-family: 'Space Grotesk', sans-serif; font-size: 14px;
color: #1A1A2E; background: #4ECAFF;
border: 3px solid #1A1A2E; border-radius: 100px; padding: 9px 18px;
cursor: pointer; box-shadow: 4px 4px 0 #1A1A2E;
transition: transform .12s ease, box-shadow .12s ease;
}
#rxd-toggle:hover { transform: translate(-2px,-2px); box-shadow: 6px 6px 0 #1A1A2E; }
#rxd-toggle.on { background: #FF4EB8; color: #fff; }
#rxd-toggle .rxd-live {
width: 8px; height: 8px; border-radius: 50%;
background: #FF3B3B; animation: rxdPulse 1.2s ease-in-out infinite alternate;
}
@keyframes rxdPulse { from { opacity: 1; } to { opacity: .25; } }

#rxd {
flex: 0 0 380px;
max-width: 40vw;
display: none;
flex-direction: column;
gap: 11px;
margin-left: 14px;
padding: 16px;
background: #14121C;
border: 3px solid #000;
border-radius: 14px;
box-shadow: 0 0 0 2px #2A2438, 0 18px 50px rgba(0,0,0,.5);
overflow-y: auto;
font-family: 'Nunito', sans-serif;
color: #E8E4F2;
min-height: 0;
}
#rxd.open { display: flex; }

#rxd .rxd-head { display: flex; align-items: center; gap: 10px; }
#rxd h2 {
flex: 1;
font-family: 'Space Grotesk', sans-serif; font-weight: 400;
font-size: 16px; color: #FF4EB8; line-height: 1.25;
}
#rxd .rxd-close {
background: none; border: none; color: #8B85A0; font-size: 18px;
cursor: pointer; padding: 2px 6px;
}
#rxd .rxd-close:hover { color: #fff; }

#rxd .rxd-hint {
font-family: 'Space Mono', monospace; font-size: 11px;
color: #8B85A0; line-height: 1.65;
}

#rxd .rxd-chips { display: flex; flex-wrap: wrap; gap: 6px; }
#rxd .rxd-chip {
font-family: 'Space Mono', monospace; font-size: 10.5px; font-weight: 700;
color: #B9B2CC; background: #1E1A2C; border: 2px solid #353048;
border-radius: 100px; padding: 5px 11px; cursor: pointer;
transition: border-color .12s ease, color .12s ease;
}
#rxd .rxd-chip:hover { border-color: #FF4EB8; color: #fff; }

#rxd .rxd-row { display: flex; gap: 8px; }
#rxd textarea {
flex: 1; min-height: 70px; resize: vertical;
font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 13.5px;
color: #fff; background: #0D0B14;
border: 2.5px solid #353048; border-radius: 12px;
padding: 10px 12px; outline: none;
}
#rxd textarea:focus { border-color: #4ECAFF; }
#rxd .rxd-mic {
flex: 0 0 48px; display: flex; align-items: center; justify-content: center;
color: #8B85A0; background: #0D0B14;
border: 2.5px solid #353048; border-radius: 12px; cursor: pointer;
}
#rxd .rxd-mic:hover { border-color: #FF4EB8; color: #fff; }
#rxd .rxd-mic.listening { border-color: #FF3B3B; color: #FF6B6B; animation: rxdMic 1s ease-in-out infinite; }
@keyframes rxdMic {
0%,100% { box-shadow: 0 0 0 0 rgba(255,59,59,.4); }
50% { box-shadow: 0 0 0 9px rgba(255,59,59,0); }
}

#rxd .rxd-apply {
font-family: 'Space Grotesk', sans-serif; font-size: 15px; color: #fff;
background: #FF4EB8; border: 3px solid #000; border-radius: 100px;
padding: 12px; cursor: pointer; box-shadow: 0 4px 0 #000;
transition: transform .12s ease;
}
#rxd .rxd-apply:hover:not(:disabled) { transform: translateY(-2px); }
#rxd .rxd-apply:disabled { opacity: .55; cursor: not-allowed; }

#rxd .rxd-status {
font-family: 'Space Mono', monospace; font-size: 11.5px; font-weight: 700;
color: #8B85A0; min-height: 16px; line-height: 1.5;
}
#rxd .rxd-status.good { color: #3DFFB0; }
#rxd .rxd-status.bad { color: #FF6B6B; }

#rxd .rxd-mods { display: flex; flex-direction: column; gap: 6px; }
#rxd .rxd-mods-title {
font-family: 'Space Mono', monospace; font-size: 10px; font-weight: 700;
color: #5E5876; letter-spacing: 1.5px;
}
#rxd .rxd-mod {
display: flex; align-items: center; gap: 8px;
font-family: 'Space Mono', monospace; font-size: 11px; color: #3DFFB0;
background: rgba(61,255,176,.07); border: 2px solid rgba(61,255,176,.25);
border-radius: 10px; padding: 7px 10px;
}
#rxd .rxd-mod span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#rxd .rxd-mod button {
font-family: inherit; font-size: 10.5px; color: #8B85A0;
background: none; border: none; cursor: pointer; font-weight: 700; white-space: nowrap;
}
#rxd .rxd-mod button:hover { color: #FF6B6B; }

#rxd details { border: 2px solid #2A2438; border-radius: 12px; overflow: hidden; }
#rxd details summary {
font-family: 'Space Mono', monospace; font-size: 10.5px; font-weight: 700;
color: #8B85A0; padding: 8px 12px; cursor: pointer; user-select: none;
background: #1A1726;
}
#rxd .rxd-code {
max-height: 200px; min-height: 60px;
background: #0D0B14; color: #3DFFB0;
padding: 10px; margin: 0;
font-family: 'Space Mono', monospace; font-size: 10px; line-height: 1.5;
overflow: auto; white-space: pre-wrap; word-break: break-word;
}

#rxd .rxd-note {
font-family: 'Space Mono', monospace; font-size: 10px;
color: #5E5876; line-height: 1.6;
}

@media (max-width: 860px) {
#rxd {
position: fixed; left: 0; right: 0; bottom: 0; top: auto;
max-width: none; margin: 0; max-height: 52vh;
border-radius: 18px 18px 0 0; z-index: 70;
flex: none;
}
}
`;

const RULES = (apiName) => `
RULES:
1. Take effect IMMEDIATELY on the live objects AND persist for future runs (patch prototypes / config tables / factory functions). Do both when relevant.
2. Your code re-runs on every page load, so it must be safe on a fresh game from the title screen (live arrays may be empty — guard for that) and must not stack incorrectly if re-applied.
3. When overriding a method or function, capture the original in a local const BEFORE assigning the replacement, and call the captured const — NEVER look the property up again inside the replacement (infinite recursion, the #1 way to brick the game):
const orig = ${apiName}.Thing.prototype.method;
${apiName}.Thing.prototype.method = function (...a) { orig.apply(this, a); /* your change */ };
4. Never break the game loop: wrap risky logic in try/catch inside callbacks, never throw at top level, prefer patching update/draw functions over new setInterval timers.
5. Keep the patch focused on the request. End it with ${apiName}.gameMsg('mod: <short name>') (if gameMsg exists) so the player sees it land.

OUTPUT FORMAT (STRICT):
Line 1: SUMMARY: <max 60 chars describing the change>
Then exactly one \`\`\`js fenced code block containing the patch. Nothing else.`;

export function mountRemixDock(cfg) {
const {
gameId, title, apiName, getApi, sources = [], storageKey,
shell, chips = [], describe = '', smokeTest, model = MODELS.remix,
} = cfg;

// ---------------- persistence ----------------
const getMods = () => {
try { return JSON.parse(localStorage.getItem(storageKey)) || []; }
catch { return []; }
};
const saveMods = (mods) => localStorage.setItem(storageKey, JSON.stringify(mods));

const applyCode = (code) => {
const api = getApi();
if (!api) throw new Error('game API not ready');
new Function(apiName, code)(api);
};

// ---------------- source context ----------------
let srcPromise = null;
const getSources = () => {
srcPromise ??= Promise.all(
sources.map((f) => fetch(f).then((r) => r.text()).catch(() => ''))
);
return srcPromise;
};

async function systemPrompt() {
const srcs = await getSources();
const srcBlock = sources.map((f, i) =>
`REAL SOURCE — ${f}:\n\`\`\`js\n${srcs[i].slice(0, 90000)}\n\`\`\``).join('\n\n');
return `You are the live modding engine for a browser game on SLOP.game. You receive the game's real source code and a player's requested change, and you respond with JavaScript that patches the RUNNING game in place.

YOUR CODE IS EXECUTED EXACTLY LIKE THIS, immediately, while the game loop runs:
new Function('${apiName}', yourCode)(window.${apiName})

GAME: ${describe}

${srcBlock}

${RULES(apiName)}`;
}

// ---------------- UI ----------------
const style = document.createElement('style');
style.textContent = STYLE;
document.head.appendChild(style);

const toggle = document.createElement('button');
toggle.id = 'rxd-toggle';
toggle.innerHTML = `<span class="rxd-live"></span> Remix Live`;
document.body.appendChild(toggle);

const dock = document.createElement('aside');
dock.id = 'rxd';
dock.innerHTML = `
<div class="rxd-head">
<h2>${title}</h2>
<button class="rxd-close" title="close">X</button>
</div>
<p class="rxd-hint">type or speak a change to the game's code. grok reads the real source and patches the running game — no reload, watch it happen. in multiplayer, the host's mods hit everyone's screen live.</p>
<div class="rxd-chips">${chips.map((c) => `<button class="rxd-chip">${c}</button>`).join('')}</div>
<div class="rxd-row">
<textarea class="rxd-input" placeholder="describe your mod…"></textarea>
<button class="rxd-mic" title="speak your mod" aria-label="speak your mod">
<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="21"/>
</svg>
</button>
</div>
<button class="rxd-apply">Mod the Running Game</button>
<div class="rxd-status"></div>
<div class="rxd-mods">
<div class="rxd-mods-title">ACTIVE MODS</div>
<div class="rxd-mod-list"></div>
</div>
<details>
<summary>grok's patch (streams live)</summary>
<pre class="rxd-code">// the patch streams here while grok writes it…</pre>
</details>
<p class="rxd-note">mods persist on this device until you remove them · removing reloads the game · in co-op the host's gameplay mods are authoritative</p>
`;

const host = shell ? document.querySelector(shell) : null;
if (host) host.appendChild(dock);
else { dock.style.cssText = 'position:fixed;top:14px;right:14px;bottom:14px;z-index:70;'; document.body.appendChild(dock); }

const q = (sel) => dock.querySelector(sel);
const input = q('.rxd-input');
const applyBtn = q('.rxd-apply');
const status = q('.rxd-status');
const codeView = q('.rxd-code');
const modList = q('.rxd-mod-list');

function setStatus(text, cls = '') {
status.textContent = text;
status.className = `rxd-status ${cls}`;
}

function setOpen(open) {
dock.classList.toggle('open', open);
toggle.classList.toggle('on', open);
}
toggle.addEventListener('click', () => setOpen(!dock.classList.contains('open')));
q('.rxd-close').addEventListener('click', () => setOpen(false));

dock.querySelectorAll('.rxd-chip').forEach((chip) => {
chip.addEventListener('click', () => { input.value = chip.textContent; input.focus(); });
});

// keep game hotkeys from firing while typing
input.addEventListener('keydown', (e) => {
e.stopPropagation();
if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) request();
});

const mic = createSpeech({
onText(text) { input.value = text; },
onState(listening) {
q('.rxd-mic').classList.toggle('listening', listening);
if (listening) setStatus('listening… speak your mod');
else if (status.textContent.startsWith('listening')) setStatus('');
},
});
q('.rxd-mic').addEventListener('click', () => {
if (!mic) { setStatus('no speech recognition in this browser — type instead', 'bad'); return; }
mic.toggle();
});

function renderMods() {
const mods = getMods();
modList.innerHTML = mods.length
? mods.map((m, i) => `
<div class="rxd-mod">
<span>OK ${m.summary}</span>
<button data-i="${i}">remove</button>
</div>`).join('')
: '<div class="rxd-note">none yet — your first mod is one sentence away</div>';
modList.querySelectorAll('button').forEach((b) => {
b.addEventListener('click', () => {
const mods2 = getMods();
mods2.splice(Number(b.dataset.i), 1);
saveMods(mods2);
location.reload(); // unapplying live is impossible — reload and re-apply survivors
});
});
}

// ---------------- request flow ----------------
let busy = false;

async function request() {
const ask = input.value.trim();
if (!ask || busy) return;
busy = true;
applyBtn.disabled = true;
applyBtn.textContent = 'Grok is patching…';
codeView.textContent = '';
setStatus('reading the game source…');

let raf = null;
try {
const system = await systemPrompt();
setStatus('writing the patch…');
const full = await chatStream({
model,
messages: [
{ role: 'system', content: system },
{ role: 'user', content: `Player's requested change: ${ask}` },
],
maxTokens: 4096,
temperature: 0.3,
onDelta(_, soFar) {
if (!raf) {
raf = requestAnimationFrame(() => {
raf = null;
codeView.textContent = soFar;
codeView.scrollTop = codeView.scrollHeight;
});
}
},
});

const code = extractFence(full);
if (!code) throw new Error('no patch in the response — try rephrasing');
const summary = (full.match(/SUMMARY:\s*(.+)/)?.[1] || ask).trim().slice(0, 60);

applyCode(code);

if (smokeTest) {
try { smokeTest(getApi()); }
catch (err) {
setStatus('that patch broke the game — rolled back, try rephrasing', 'bad');
console.error('mod failed smoke test:', err);
setTimeout(() => location.reload(), 1700);
return;
}
}

const mods = getMods();
mods.push({ id: Date.now(), prompt: ask, summary, code });
saveMods(mods);
renderMods();

// multiplayer: hand the mod to the game so the host can broadcast it
try { getApi()?.shareMod?.(code, summary); } catch { /* solo */ }

setStatus(`OK ${summary} — applied live`, 'good');
input.value = '';
} catch (err) {
setStatus(`! ${err.message}`, 'bad');
console.error(err);
} finally {
busy = false;
applyBtn.disabled = false;
applyBtn.textContent = 'Mod the Running Game';
}
}
applyBtn.addEventListener('click', request);

// ---------------- boot ----------------
function applySaved() {
for (const mod of getMods()) {
try {
applyCode(mod.code);
getApi()?.shareMod?.(mod.code, mod.summary);
} catch (err) { console.warn(`mod "${mod.summary}" failed to apply:`, err); }
}
const n = getMods().length;
if (n) { try { getApi()?.gameMsg?.(`${n} live mod${n > 1 ? 's' : ''} active`); } catch { /* no msg fn */ } }
}

// wait for the game module to expose its API
(function waitForApi(tries = 0) {
if (getApi()) { applySaved(); renderMods(); }
else if (tries < 100) setTimeout(() => waitForApi(tries + 1), 60);
else renderMods();
})();

if (new URLSearchParams(location.search).get('remix') === '1') setOpen(true);

getSources(); // pre-warm so the first request is snappy
return { open: () => setOpen(true) };
}
