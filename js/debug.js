// Runtime debug bridge for sandboxed game iframes (no same-origin access).
// Injects a hook that captures errors and postMessages them to the parent,
// plus UI helpers for the studio playtest pane and play page.

export const RUNTIME_HOOK = '<script id="slop-debug">window.__slopErrors=[];'
+ 'function __slopReport(msg){window.__slopErrors.push(msg);try{parent.postMessage({__slopErr:msg},\'*\');}catch(e){}}'
+ 'window.addEventListener("error",function(e){'
+ 'var loc=e.lineno?(" (line "+e.lineno+(e.colno?":"+e.colno:"")+")"):"";'
+ 'var msg=(e.message||"runtime error")+loc;'
+ 'if(e.error&&e.error.stack){var s=String(e.error.stack).split("\\n").slice(0,4).join(" | ");if(s)msg+=" — "+s;}'
+ '__slopReport(msg);});'
+ 'window.addEventListener("unhandledrejection",function(e){'
+ 'var r=e.reason;__slopReport("Unhandled promise rejection: "+((r&&r.message)||String(r||"unknown")));'
+ '});'
+ 'window.addEventListener("slop:score",function(e){try{parent.postMessage({__slopScore:e.detail&&e.detail.score,meta:e.detail&&e.detail.meta||null},\'*\');}catch(x){}});'
+ '</' + 'script>';

export const MOD_RX = `<script id="slop-mod-rx">window.addEventListener('message',function(e){if(e&&e.data&&e.data.__slopmod){try{(new Function(e.data.__slopmod))();}catch(err){console.warn('slopmod',err);}}});<\/script>`;

export function injectRuntimeHook(html) {
  if (/id="slop-debug"/.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + RUNTIME_HOOK);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + RUNTIME_HOOK);
  return RUNTIME_HOOK + html;
}

export function injectModReceiver(html) {
  if (/slop-mod-rx/.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + MOD_RX);
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (m) => m + MOD_RX);
  return MOD_RX + html;
}

/** Wrap game HTML for playtest / publish — runtime errors + live remix receiver. */
export function prepareGameHTML(html) {
  return injectModReceiver(injectRuntimeHook(html));
}

/** Attach postMessage listener for runtime errors from a visible iframe. */
export function attachFrameMonitor(iframe, { onErrors } = {}) {
  const errors = [];
  const seen = new Set();

  const push = (msg) => {
    const s = String(msg || '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    errors.push(s);
    onErrors?.([...errors]);
  };

  const onMsg = (e) => {
    if (e.source !== iframe.contentWindow) return;
    if (e.data?.__slopErr) push(e.data.__slopErr);
  };
  window.addEventListener('message', onMsg);

  const onLoad = () => {
    errors.length = 0;
    seen.clear();
    onErrors?.([]);
  };
  iframe.addEventListener('load', onLoad);

  return {
    get errors() { return [...errors]; },
    clear() { errors.length = 0; seen.clear(); onErrors?.([]); },
    destroy() {
      window.removeEventListener('message', onMsg);
      iframe.removeEventListener('load', onLoad);
    },
  };
}

/** Floating error badge over an iframe wrapper. */
export function mountErrorOverlay(wrapEl, { onFix } = {}) {
  if (!wrapEl || wrapEl.querySelector('.slop-err-overlay')) return null;

  const overlay = document.createElement('div');
  overlay.className = 'slop-err-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="slop-err-head">
      <span class="slop-err-icon">!</span>
      <span class="slop-err-title">game crashed</span>
      <button type="button" class="slop-err-dismiss" title="dismiss">×</button>
    </div>
    <pre class="slop-err-msg"></pre>
    ${onFix ? '<button type="button" class="slop-err-fix">ask agent to fix</button>' : ''}
  `;
  wrapEl.appendChild(overlay);

  const msgEl = overlay.querySelector('.slop-err-msg');
  overlay.querySelector('.slop-err-dismiss')?.addEventListener('click', () => { overlay.hidden = true; });
  overlay.querySelector('.slop-err-fix')?.addEventListener('click', () => onFix?.(msgEl.textContent));

  return {
    show(errors) {
      if (!errors?.length) { overlay.hidden = true; return; }
      msgEl.textContent = errors.join('\n\n');
      overlay.hidden = false;
    },
    hide() { overlay.hidden = true; },
  };
}

const DEBUG_TIPS = [
  'Errors here are live — fix the code and hit Restart to retest.',
  'The agent patches only broken files during self-heal, not the whole project.',
  'Games must dispatch slop:score on game over to appear on the leaderboard.',
  'Use window.GAME for live remix patches without reloading.',
  'Sandboxed iframes: no localStorage, cookies, alert(), or top navigation.',
];

/** Studio playtest debug console below the iframe. */
export function createDebugPanel(container) {
  if (!container || container.querySelector('.slop-debug-panel')) return null;

  const panel = document.createElement('div');
  panel.className = 'slop-debug-panel';
  panel.innerHTML = `
    <div class="slop-debug-head">
      <button type="button" class="slop-debug-toggle" aria-expanded="true">
        <span class="slop-debug-dot ok"></span>
        debug console
        <span class="slop-debug-count"></span>
      </button>
      <span class="slop-debug-tip">${DEBUG_TIPS[0]}</span>
    </div>
    <div class="slop-debug-body">
      <div class="slop-debug-empty">no errors — game is running clean</div>
      <ul class="slop-debug-list"></ul>
      <details class="slop-debug-help">
        <summary>debugging help</summary>
        <ul>${DEBUG_TIPS.map((t) => `<li>${t}</li>`).join('')}</ul>
      </details>
    </div>
  `;
  container.appendChild(panel);

  const toggle = panel.querySelector('.slop-debug-toggle');
  const body = panel.querySelector('.slop-debug-body');
  const list = panel.querySelector('.slop-debug-list');
  const empty = panel.querySelector('.slop-debug-empty');
  const dot = panel.querySelector('.slop-debug-dot');
  const countEl = panel.querySelector('.slop-debug-count');
  const tipEl = panel.querySelector('.slop-debug-tip');
  let tipIdx = 0;

  toggle.addEventListener('click', () => {
    const open = body.hidden;
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });

  setInterval(() => {
    tipIdx = (tipIdx + 1) % DEBUG_TIPS.length;
    tipEl.textContent = DEBUG_TIPS[tipIdx];
  }, 12000);

  return {
    setErrors(errs) {
      const has = errs?.length > 0;
      dot.classList.toggle('ok', !has);
      dot.classList.toggle('bad', has);
      countEl.textContent = has ? ` (${errs.length})` : '';
      empty.hidden = has;
      list.hidden = !has;
      if (has) {
        list.innerHTML = errs.map((e) => `<li>${escapeHTML(e)}</li>`).join('');
        body.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
      } else {
        list.innerHTML = '';
      }
    },
  };
}

function escapeHTML(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
