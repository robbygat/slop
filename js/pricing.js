// Pricing + Pro membership UI for SLOP.game.
//
// Injects a nav "Go Pro" pill (with the launch discount) + a live credit chip, and
// a focused pricing modal: Stripe checkout for Pro, credit top-ups, the referral
// link, and your balance. This is a working product surface, not a landing page.
//
// Pro perks: no ads · the frontier models (Claude Opus 4.8, GPT, Grok 4.3) · a big
// monthly credit allowance · bigger multi-file builds. Free stays generous (fast
// models + a daily credit bonus) so the studio is addictive before you ever pay.

import { api } from './api.js';
import { getUser, onUser, openAuthModal } from './account.js';
import { showToast } from './toast.js';

const REF_KEY = 'slop:ref';
let billing = null; // { is_pro, credits, pro_until, referral_code } | null
let modal = null;
let refreshTimer = null;

export function initPricing() {
  captureReferral();
  handleCheckoutReturn();
  injectNav();
  // re-pull billing whenever auth state changes (sign in/out, token refresh)
  onUser(() => { refreshBilling(); });
}

// -------------------------------------------------------------- referral capture
function captureReferral() {
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref) { try { localStorage.setItem(REF_KEY, ref.slice(0, 32)); } catch { /* private mode */ } }
}

// -------------------------------------------------------------- billing state
async function refreshBilling() {
  billing = await api.myBilling().catch(() => null);
  renderNav();
  if (modal && !modal.classList.contains('hidden')) renderModal();
  await maybeApplyReferral();
}

function refreshBillingSoon() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshBilling, 1400); }

async function maybeApplyReferral() {
  const u = getUser();
  let pending = null;
  try { pending = localStorage.getItem(REF_KEY); } catch { /* */ }
  if (!pending || !u?.username) return;
  // don't credit a code that is the user's own
  if (billing?.referral_code && pending === billing.referral_code) { try { localStorage.removeItem(REF_KEY); } catch {} return; }
  const res = await api.applyReferral(pending).catch(() => 'error');
  if (res === 'ok') { showToast('referral applied — +50 credits for you both!'); refreshBillingSoon(); }
  if (['ok', 'already', 'self', 'invalid'].includes(res)) { try { localStorage.removeItem(REF_KEY); } catch {} }
}

// -------------------------------------------------------------- nav pill + chip
function injectNav() {
  const right = document.querySelector('.site-nav .nav-right');
  if (!right || document.getElementById('nav-pro-slot')) return;
  const slot = document.createElement('div');
  slot.id = 'nav-pro-slot';
  slot.className = 'nav-pro-slot';
  right.insertBefore(slot, document.getElementById('nav-auth') || null);
  renderNav();
}

function renderNav() {
  const slot = document.getElementById('nav-pro-slot');
  if (!slot) return;
  const u = getUser();
  const creditLabel = billing?.unlimited ? '∞' : billing?.credits;
  const chip = (u && billing) ? `<button class="nav-credits" id="nav-credits" title="${billing.unlimited ? 'moderator — unlimited credits' : 'your slop credits — click for more'}">⚡ ${creditLabel}</button>` : '';
  if (billing?.is_pro) {
    slot.innerHTML = `${chip}<span class="nav-pro-badge" id="nav-pro-badge" title="${billing.unlimited ? 'moderator' : 'Pro member — thank you!'}">✦ ${billing.unlimited ? 'ADMIN' : 'PRO'}</span>`;
  } else {
    slot.innerHTML = `${chip}<button class="nav-pro" id="nav-pro" title="SLOP Pro — frontier models, no ads, more credits"><span class="np-spark" aria-hidden="true">✦</span> Go Pro</button>`;
  }
  slot.querySelector('#nav-pro')?.addEventListener('click', openPricing);
  slot.querySelector('#nav-credits')?.addEventListener('click', openPricing);
  slot.querySelector('#nav-pro-badge')?.addEventListener('click', openPricing);
}

// -------------------------------------------------------------- modal
function buildModal() {
  if (modal) return;
  modal = document.createElement('div');
  modal.className = 'pr-modal hidden';
  modal.innerHTML = `
    <div class="pr-sheet" role="dialog" aria-label="SLOP Pro">
      <button class="pr-close" id="pr-close" aria-label="close">×</button>
      <div class="pr-head">
        <span class="pr-kicker">slop<b>.game</b> membership</span>
        <h2 class="pr-title">Go <span class="pr-grad">Pro</span></h2>
        <div class="pr-price"><s>$8</s><b>$5</b><span>/mo</span><em class="pr-tag">launch discount</em></div>
      </div>
      <ul class="pr-perks">
        <li>🚫 <b>No ads</b> — ever</li>
        <li>🧠 The <b>frontier models</b> — Claude Opus 4.8, GPT, Grok 4.3</li>
        <li>⚡ <b>600 credits / month</b> for the studio agent</li>
        <li>🗂️ <b>Bigger multi-file builds</b> + priority cooking</li>
        <li>✨ A <b>Pro badge</b> on your profile</li>
      </ul>
      <div class="pr-body" id="pr-body"></div>
      <p class="pr-disclosure">Your games are made with Claude, GPT &amp; Grok. Credits meter real model usage; the free tier stays generous. Cancel anytime.</p>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  modal.querySelector('#pr-close').addEventListener('click', close);
}

function renderModal() {
  const body = modal.querySelector('#pr-body');
  const u = getUser();
  const bal = billing ? `<div class="pr-balance">⚡ <b>${billing.unlimited ? '∞ unlimited' : billing.credits}</b> credits</div>` : '';

  if (!u) {
    body.innerHTML = `${bal}<button class="pr-cta" id="pr-signin">Sign in to go Pro</button>
      <p class="pr-note">free to join — you get starter credits + a daily bonus.</p>`;
    body.querySelector('#pr-signin').addEventListener('click', () => { close(); openAuthModal({ plan: 'pro' }); });
    return;
  }

  const topups = `
    <div class="pr-topups">
      <div class="pr-topups-h">Need more credits?</div>
      <div class="pr-topups-row">
        <button class="pr-topup" data-kind="topup_small">+600 · $5</button>
        <button class="pr-topup" data-kind="topup_large">+3000 · $20 <span class="pr-best">best value</span></button>
      </div>
    </div>`;

  const referral = billing?.referral_code ? `
    <div class="pr-ref">
      <div class="pr-ref-h">Invite friends — you both get <b>50 credits</b></div>
      <div class="pr-ref-row">
        <input class="pr-ref-link" id="pr-ref-link" readonly value="${location.origin}/?ref=${billing.referral_code}">
        <button class="pr-ref-copy" id="pr-ref-copy">Copy</button>
      </div>
    </div>` : '';

  if (billing?.is_pro) {
    body.innerHTML = `${bal}<div class="pr-youre-pro">🎉 You're <b>Pro</b>. Thanks for backing slop.</div>${topups}${referral}`;
  } else {
    body.innerHTML = `${bal}<button class="pr-cta" id="pr-go">Go Pro — $5/mo</button>${topups}${referral}`;
    body.querySelector('#pr-go')?.addEventListener('click', (e) => checkout('pro', e.currentTarget));
  }
  body.querySelectorAll('.pr-topup').forEach((b) => b.addEventListener('click', (e) => checkout(e.currentTarget.dataset.kind, e.currentTarget)));
  const copy = body.querySelector('#pr-ref-copy');
  copy?.addEventListener('click', async () => {
    const link = body.querySelector('#pr-ref-link').value;
    try { await navigator.clipboard.writeText(link); copy.textContent = 'Copied!'; setTimeout(() => (copy.textContent = 'Copy'), 1500); }
    catch { body.querySelector('#pr-ref-link').select(); }
  });
}

function openPricing() { buildModal(); renderModal(); modal.classList.remove('hidden'); }
function close() { modal?.classList.add('hidden'); }

async function checkout(kind, btn) {
  const u = getUser();
  if (!u) { close(); openAuthModal(); return; }
  if (!u.username) { showToast('pick a username first, then come back'); return; }
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'opening checkout…';
  try {
    const url = await api.createCheckout(kind);
    location.href = url;
  } catch (e) {
    showToast(e.message || 'checkout failed — is billing set up?');
    btn.disabled = false; btn.textContent = label;
  }
}

// -------------------------------------------------------------- checkout return
function handleCheckoutReturn() {
  const params = new URLSearchParams(location.search);
  const pro = params.get('pro');
  if (!pro) return;
  if (pro === 'success') { showToast('welcome to Pro! 🎉 your credits are loading…'); refreshBillingSoon(); }
  else if (pro === 'cancelled') showToast('no worries — the free tier is always here.');
  params.delete('pro');
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
}

export { openPricing };
