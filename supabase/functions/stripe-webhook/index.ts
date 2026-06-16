// stripe-webhook — turns real Stripe payment events into Pro status + credits.
// Verifies the signature, then writes via the SERVICE ROLE (privileged RPCs).
// Register this function's URL as a webhook endpoint in the Stripe Dashboard and
// subscribe to: checkout.session.completed, invoice.paid, customer.subscription.deleted.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { PRO_MONTHLY } from '../_shared/models.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const toISO = (unixSeconds?: number | null) =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!sig || !secret) return new Response('missing signature', { status: 400 });

  const raw = await req.text(); // RAW body required for signature verification
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, cryptoProvider);
  } catch (e) {
    return new Response(`bad signature: ${(e as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const uid = s.metadata?.user_id || s.client_reference_id;
        if (!uid) break;
        if (s.mode === 'subscription') {
          let until: string | null = null;
          if (typeof s.subscription === 'string') {
            const sub = await stripe.subscriptions.retrieve(s.subscription);
            until = toISO(sub.current_period_end);
          }
          await admin.rpc('set_pro_status', { p_user: uid, p_is_pro: true, p_until: until, p_customer: String(s.customer ?? '') || null });
          await admin.rpc('grant_credits', { p_user: uid, p_amount: PRO_MONTHLY, p_reason: 'pro_signup' });
        } else {
          const credits = parseInt(s.metadata?.credits || '0', 10);
          if (credits > 0) await admin.rpc('grant_credits', { p_user: uid, p_amount: credits, p_reason: 'topup' });
        }
        break;
      }
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice;
        // Only renewals here — the first invoice ('subscription_create') is already
        // covered by checkout.session.completed, so we skip it to avoid double-granting.
        if (inv.billing_reason !== 'subscription_cycle') break;
        if (typeof inv.subscription !== 'string') break;
        const sub = await stripe.subscriptions.retrieve(inv.subscription);
        const uid = sub.metadata?.user_id;
        if (!uid) break;
        await admin.rpc('set_pro_status', { p_user: uid, p_is_pro: true, p_until: toISO(sub.current_period_end), p_customer: String(inv.customer ?? '') || null });
        await admin.rpc('grant_credits', { p_user: uid, p_amount: PRO_MONTHLY, p_reason: 'pro_renewal' });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const uid = sub.metadata?.user_id;
        if (uid) await admin.rpc('set_pro_status', { p_user: uid, p_is_pro: false, p_until: null, p_customer: null });
        break;
      }
    }
  } catch (e) {
    // Log + 500 so Stripe retries; signature already verified so this is safe.
    console.error('webhook handler error', event.type, (e as Error).message);
    return new Response('handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
