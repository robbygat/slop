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

// ---------------------------------------------------------------------------
// FUNCTIONAL PROBE — injected ONLY into the hidden sandbox test-bench (never in
// shipped games). Crash-free is not the same as alive: a blank canvas or a dead
// loop throws nothing. This watches the running game and reports whether it is
// actually playable, exposed on window.__slopProbe for the parent to read.
//   rendered     — the canvas/DOM is drawing something (not a blank screen)
//   animated     — its picture changes over time (a real frame loop is painting)
//   loop         — requestAnimationFrame is firing repeatedly
//   inputWired   — the game registered key/pointer listeners
//   reactedToInput — synthetic input visibly changed the screen or window.GAME
//   scoreWired   — it listens for / dispatches slop:score
// All sampling is wrapped in try/catch so the probe can never break the game.
const PROBE_BODY = `(function(){
var P=window.__slopProbe={frames:0,rendered:false,animated:false,inputWired:false,reactedToInput:false,scoreWired:false,ready:false};
var oraf=window.requestAnimationFrame;
if(oraf){window.requestAnimationFrame=function(cb){return oraf.call(window,function(t){P.frames++;return cb(t);});};}
var INPUT={keydown:1,keyup:1,keypress:1,pointerdown:1,pointerup:1,pointermove:1,mousedown:1,mouseup:1,mousemove:1,click:1,touchstart:1,touchmove:1,wheel:1};
try{var ET=window.EventTarget&&window.EventTarget.prototype;if(ET&&!ET.__slopWrapped){var oa=ET.addEventListener;ET.addEventListener=function(t){try{if(INPUT[t])P.inputWired=true;}catch(e){}return oa.apply(this,arguments);};ET.__slopWrapped=true;}}catch(e){}
function largest(){try{var cs=document.querySelectorAll('canvas'),b=null;for(var i=0;i<cs.length;i++){if(!b||cs[i].width*cs[i].height>b.width*b.height)b=cs[i];}return b;}catch(e){return null;}}
function grab(){var c=largest();if(c&&c.width&&c.height){try{var o=document.createElement('canvas');o.width=32;o.height=24;var x=o.getContext('2d');x.drawImage(c,0,0,32,24);var d=x.getImageData(0,0,32,24).data,s='',mn=765,mx=0;for(var i=0;i<d.length;i+=4){var l=d[i]+d[i+1]+d[i+2];if(i%48===0)s+=(l>>6)+(d[i+3]>127?'#':'.');if(l<mn)mn=l;if(l>mx)mx=l;}return{k:'c',s:s,r:mx-mn};}catch(e){}}try{var b=document.body;return{k:'d',s:(b?(b.innerText||''):'').slice(0,300)+'#'+(b?b.querySelectorAll('*').length:0),r:0};}catch(e){return{k:'n',s:'',r:0};}}
function alive(g){if(!g)return false;if(g.k==='c')return g.r>40;if(g.k==='d')return g.s.replace(/[^a-z0-9]/gi,'').length>8;return false;}
function gstate(){try{var G=window.GAME;if(!G)return '';return JSON.stringify([G.state,G.score,G.player&&G.player.x,G.player&&G.player.y]).slice(0,240);}catch(e){return '';}}
function fire(){try{var keys=['ArrowRight','ArrowLeft','ArrowUp','ArrowDown',' ','Enter','w','a','d'];for(var i=0;i<keys.length;i++){var k=keys[i],code=k===' '?'Space':k.length===1?'Key'+k.toUpperCase():k;window.dispatchEvent(new KeyboardEvent('keydown',{key:k,code:code,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key:k,code:code,bubbles:true}));}var c=largest();var t=c||document.body;if(t){var rc=t.getBoundingClientRect?t.getBoundingClientRect():{left:0,top:0,width:300,height:200};var cx=rc.left+rc.width/2,cy=rc.top+rc.height/2;['pointermove','pointerdown','mousedown','pointerup','mouseup','click'].forEach(function(ty){try{t.dispatchEvent(new MouseEvent(ty,{clientX:cx,clientY:cy,bubbles:true}));}catch(e){}});}}catch(e){}}
var a=null,pre=null,preState='';
setTimeout(function(){a=grab();P.rendered=alive(a);},700);
setTimeout(function(){var b=grab();if(a&&b.s!==a.s)P.animated=true;if(!P.rendered)P.rendered=alive(b);},1500);
setTimeout(function(){pre=grab();preState=gstate();fire();},1750);
setTimeout(function(){var c=grab();if(!P.rendered)P.rendered=alive(c);if(pre&&c.s!==pre.s)P.reactedToInput=true;var ps=gstate();if(ps&&ps!==preState)P.reactedToInput=true;P.ready=true;},2450);
})();`;

export const PROBE_HOOK = '<script id="slop-probe">' + PROBE_BODY + '</' + 'script>';

/** Inject the functional probe — sandbox test-bench only, after the runtime hook. */
export function injectProbe(html) {
  if (/id="slop-probe"/.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + PROBE_HOOK);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + PROBE_HOOK);
  return PROBE_HOOK + html;
}

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

/** Parent page context for multiplayer share links + ?room= auto-join (iframe-safe). */
export const PLAY_CTX_HOOK = '<script id="slop-play-ctx">'
+ '(function(){'
+ 'try{window.__SLOP_SHARE_BASE=window.__SLOP_SHARE_BASE||parent.location.origin+parent.location.pathname;}catch(e){window.__SLOP_SHARE_BASE=window.__SLOP_SHARE_BASE||location.href.split("?")[0];}'
+ 'try{var r=new URL(parent.location.href).searchParams.get("room");if(r)window.__SLOP_ROOM=r;}catch(e){}'
+ 'if(!window.__SLOP_ROOM){try{window.__SLOP_ROOM=new URL(location.href).searchParams.get("room");}catch(e){}}'
+ 'window.slopShareUrl=function(code){return(window.__SLOP_SHARE_BASE||location.href.split("?")[0])+"?room="+encodeURIComponent(code);};'
+ '})();'
+ '</' + 'script>';

export function injectPlayContext(html, { shareBase, room } = {}) {
  if (!shareBase && !room) return html;
  let tag = PLAY_CTX_HOOK;
  if (shareBase || room) {
    tag = '<script id="slop-play-ctx">'
      + `(function(){window.__SLOP_SHARE_BASE=${JSON.stringify(shareBase || '')};`
      + `window.__SLOP_ROOM=${JSON.stringify(room || '')};`
      + 'window.slopShareUrl=function(code){return(window.__SLOP_SHARE_BASE||location.href.split("?")[0])+"?room="+encodeURIComponent(code);};'
      + '})();</' + 'script>';
  }
  if (/id="slop-play-ctx"/.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + tag);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + tag);
  return tag + html;
}

/** Wrap game HTML for playtest / publish — runtime errors + live remix receiver. */
export function prepareGameHTML(html, opts = {}) {
  let out = String(html || '')
    .replace(/<script id="slop-play-ctx">[\s\S]*?<\/script>\n?/i, '');
  out = injectModReceiver(injectRuntimeHook(out));
  if (opts.shareBase || opts.room) out = injectPlayContext(out, opts);
  else out = injectPlayContext(out, {});
  return out;
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
