// Ads for the FREE tier only — Pro members never see ads (that's the carrot).
//
// Ads ship OFF (ADS_ENABLED=false) so they stay paused until you're ready. When you
// flip it on, this injects AdSense for everyone EXCEPT Pro members, and adds a
// `slop-pro` body class so any static ad slots can be hidden via CSS for Pro.

import { api } from './api.js';

const ADS_ENABLED = false;            // ← set true to enable ads for non-Pro users
const ADSENSE_CLIENT = 'ca-pub-6363419721600866';

let done = false;

export async function initAds() {
  if (!ADS_ENABLED || done) return;
  done = true;
  let pro = false;
  try { const b = await api.myBilling(); pro = !!b?.is_pro; } catch { /* signed out → show ads */ }
  if (pro) { document.body.classList.add('slop-pro'); return; }
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  document.head.appendChild(s);
}
