// Hidden test-bench for AI-generated games. Before any cooked or remixed game
// is saved/swapped in, it runs here for a moment so we can (a) catch runtime
// crashes and reject the build, and (b) grab a real gameplay screenshot from
// its canvas for the grid thumbnail.

const TEST_MS = 2600;
const THUMB_W = 640;
const THUMB_H = 400;

// injected before any game code so even parse-time crashes are captured
const ERROR_HOOK = '<script>window.__slopErrors=[];'
+ 'window.addEventListener("error",function(e){window.__slopErrors.push(e.message||"runtime error")});'
+ 'window.addEventListener("unhandledrejection",function(e){window.__slopErrors.push(String(e.reason||"unhandled rejection"))});'
+ '</' + 'script>';

function injectHook(html) {
if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + ERROR_HOOK);
if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + ERROR_HOOK);
return ERROR_HOOK + html;
}

/**
* Run a game's HTML in a hidden same-origin iframe.
* Resolves { ok, error, thumb } — thumb is a PNG/JPEG data-URL or null.
*/
export function testGameHTML(html) {
return new Promise((resolve) => {
const frame = document.createElement('iframe');
frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;visibility:hidden;pointer-events:none;';
// allow-same-origin lets us read the error log and the canvas;
// the frame is invisible, short-lived, and only runs code we just generated
frame.sandbox = 'allow-scripts allow-same-origin';

let settled = false;

const finish = (fatal) => {
if (settled) return;
settled = true;
let errors = fatal ? [fatal] : [];
try { errors = errors.concat(frame.contentWindow.__slopErrors || []); }
catch { /* frame already gone */ }
const thumb = errors.length ? null : captureThumb(frame);
frame.remove();
resolve({
ok: errors.length === 0,
error: errors[0] || null,
thumb,
});
};

frame.addEventListener('load', () => {
// let the game boot and run a couple seconds; nudge it with a keypress
// in case it waits for input before drawing anything
setTimeout(() => {
try {
const win = frame.contentWindow;
win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }));
win.dispatchEvent(new win.KeyboardEvent('keyup', { key: 'Enter', code: 'Enter' }));
} catch { /* best effort */ }
}, 600);
setTimeout(() => finish(null), TEST_MS);
});

document.body.appendChild(frame);
frame.srcdoc = injectHook(html);

// absolute backstop in case load never fires
setTimeout(() => finish(null), TEST_MS + 4000);
});
}

function captureThumb(frame) {
try {
const doc = frame.contentDocument;
const canvas = [...doc.querySelectorAll('canvas')]
.sort((a, b) => b.width * b.height - a.width * a.height)[0];
if (!canvas || !canvas.width || !canvas.height) return null;

const out = document.createElement('canvas');
out.width = THUMB_W;
out.height = THUMB_H;
const ctx = out.getContext('2d');
ctx.fillStyle = '#0d0d16';
ctx.fillRect(0, 0, THUMB_W, THUMB_H);

// cover-fit the game canvas into the thumbnail
const scale = Math.max(THUMB_W / canvas.width, THUMB_H / canvas.height);
const w = canvas.width * scale;
const h = canvas.height * scale;
ctx.drawImage(canvas, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
return out.toDataURL('image/jpeg', 0.75);
} catch {
return null; // tainted canvas or no canvas — fall back to text thumb
}
}
