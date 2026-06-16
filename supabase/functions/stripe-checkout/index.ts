// stripe-checkout — creates a Stripe Checkout Session for slop.game.
//   body: { kind: 'pro' | 'topup_small' | 'topup_large' }
//   → { url } to redirect the browser to.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_PRO, STRIPE_PRICE_TOPUP_SMALL,
//          STRIPE_PRICE_TOPUP_LARGE, SITE_URL (e.g. https://slop.game).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { corsHeaders, jsonRes } from '../_shared/cors.ts';
import { PRO_MONTHLY, TOPUP_CREDITS } from '../_shared/models.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonRes(405, { error: 'POST only' });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonRes(401, { error: 'sign in first' });

    const { kind } = await req.json().catch(() => ({}));
    const site = Deno.env.get('SITE_URL') || 'https://slop.game';
    const isPro = kind === 'pro';

    const priceId = isPro
      ? Deno.env.get('STRIPE_PRICE_PRO')
      : kind === 'topup_large' ? Deno.env.get('STRIPE_PRICE_TOPUP_LARGE')
      : kind === 'topup_small' ? Deno.env.get('STRIPE_PRICE_TOPUP_SMALL')
      : null;
    if (!priceId) return jsonRes(400, { error: 'unknown plan' });

    const credits = isPro ? PRO_MONTHLY : (TOPUP_CREDITS[kind] || 0);

    const session = await stripe.checkout.sessions.create({
      mode: isPro ? 'subscription' : 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      allow_promotion_codes: true,
      success_url: `${site}/?pro=success`,
      cancel_url: `${site}/?pro=cancelled`,
      metadata: { user_id: user.id, kind, credits: String(credits) },
      ...(isPro ? { subscription_data: { metadata: { user_id: user.id } } } : {}),
    });

    return jsonRes(200, { url: session.url });
  } catch (e) {
    return jsonRes(500, { error: String((e as Error)?.message || e) });
  }
});
