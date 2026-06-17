// Hidden test-bench for AI-generated games. Before any cooked or remixed game
// is saved/swapped in, it runs here for a moment so we can:
//   (a) catch runtime crashes and reject the build,
//   (b) run FUNCTIONAL probes — is the game actually alive? (renders, has a
//       frame loop, is wired for input, reacts to it, wires up scoring) — so we
//       catch broken-but-not-throwing games (blank canvas, dead loop), and
//   (c) grab a real gameplay screenshot from its canvas for the grid thumbnail.

import { injectRuntimeHook, injectProbe } from './debug.js';

const TEST_MS = 3000;       // boot + sample window (probe finishes ~2.45s in)
const BACKSTOP_MS = 4500;
const THUMB_W = 640;
const THUMB_H = 400;

// Functional checks, in order. `hard` checks can reject/heal a build on their
// own; soft checks only advise the self-heal prompt (so legitimately mouse-only
// or turn-based games are never wrongly rejected). `read` maps a probe → pass.
const CHECK_DEFS = [
  { id: 'boots', label: 'boots clean', hard: true, read: (_p, errs) => errs.length === 0 },
  { id: 'renders', label: 'draws to screen', hard: true, read: (p) => !!p.rendered },
  { id: 'loop', label: 'game loop runs', hard: false, read: (p) => p.frames >= 8 || !!p.animated },
  { id: 'input', label: 'controls wired', hard: false, read: (p) => !!p.inputWired },
  { id: 'reacts', label: 'reacts to input', hard: false, read: (p) => !!p.reactedToInput },
  { id: 'score', label: 'scoring wired', hard: false, advisory: true, read: (p) => !!p.scoreWired },
];

/**
 * Run a game's HTML in a hidden same-origin iframe and probe it.
 * Resolves { ok, error, errors, checks, thumb }.
 *   ok      — no uncaught errors AND no failed HARD functional check.
 *   checks  — [{ id, label, ok, hard, advisory, detail }] for the verify panel.
 *   thumb   — PNG/JPEG data-URL or null.
 */
export function testGameHTML(html) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;visibility:hidden;pointer-events:none;';
    // allow-same-origin lets us read the error log, the probe, and the canvas;
    // the frame is invisible, short-lived, and only runs code we just generated.
    frame.sandbox = 'allow-scripts allow-same-origin';

    let settled = false;

    const finish = (fatal) => {
      if (settled) return;
      settled = true;

      let raw = fatal ? [fatal] : [];
      let probe = {};
      try { raw = raw.concat(frame.contentWindow.__slopErrors || []); } catch { /* frame gone */ }
      try { probe = frame.contentWindow.__slopProbe || {}; } catch { /* frame gone */ }
      // score wiring can't be read at runtime (game-over rarely fires in 3s), and
      // our own runtime hook also listens for slop:score — so detect it statically
      // from the GAME's code, with the injected slop-* hooks stripped out first.
      probe.scoreWired = /slop:score/.test(String(html).replace(/<script id="slop-(?:debug|probe|play-ctx|mod-rx)">[\s\S]*?<\/script>/gi, ''));

      // dedupe + cap so the heal prompt stays focused on distinct failures
      const errors = [...new Set(raw.filter(Boolean).map(String))].slice(0, 5);

      const checks = CHECK_DEFS.map((c) => {
        const ok = !!c.read(probe, errors);
        return { id: c.id, label: c.label, ok, hard: !!c.hard, advisory: !!c.advisory, detail: checkDetail(c, ok, errors) };
      });
      const hardFail = checks.some((c) => c.hard && !c.ok);
      const thumb = (errors.length || hardFail) ? null : captureThumb(frame);

      frame.remove();
      resolve({
        ok: errors.length === 0 && !hardFail,
        error: errors[0] || firstFailDetail(checks) || null, // back-compat
        errors,
        checks,
        thumb,
      });
    };

    frame.addEventListener('load', () => {
      // nudge in case the game waits for input before drawing anything; the
      // probe also drives a full synthetic input battery on its own timeline.
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
    frame.srcdoc = injectProbe(injectRuntimeHook(html));

    // absolute backstop in case load never fires
    setTimeout(() => finish(null), BACKSTOP_MS);
  });
}

function checkDetail(c, ok, errors) {
  if (ok) return '';
  switch (c.id) {
    case 'boots': return errors[0] || 'uncaught error on boot';
    case 'renders': return 'the canvas stays blank — nothing is being drawn (check the render/draw loop actually runs and clears+paints each frame)';
    case 'loop': return 'no animation frames detected — is requestAnimationFrame being called in a loop?';
    case 'input': return 'no key/pointer listeners registered — the game can\'t be controlled';
    case 'reacts': return 'synthetic input produced no visible change — controls may be wired to the wrong target or keys';
    case 'score': return 'no slop:score wiring — scores won\'t reach the leaderboard';
    default: return 'check failed';
  }
}
function firstFailDetail(checks) {
  const f = checks.find((c) => c.hard && !c.ok) || checks.find((c) => !c.ok);
  return f ? `${f.label}: ${f.detail}` : null;
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
