# SLOP.game — launch setup (Pro memberships + metered AI)

This is the **step-by-step checklist to go live**. The code is done; these are the
account/dashboard steps only you can do (they involve real money + secret keys).
Budget ~30 minutes. Everything secret lives in **Supabase Edge Function secrets** —
never in the repo or the browser.

> **Where do my API keys go? →** Supabase secrets (step 3). Not in any `.js`, not in
> HTML, not committed. The only key that ships in the browser is the Stripe
> *publishable* key and the Supabase *anon* key, both of which are designed to be public.

---

## 0. Prereqs

- The [Supabase CLI](https://supabase.com/docs/guides/cli): `brew install supabase/tap/supabase`
- Your Supabase project ref: `yqlolbebqfsodqgjlbeh`
- A [Stripe](https://dashboard.stripe.com) account (use **Test mode** first).

```bash
supabase login
supabase link --project-ref yqlolbebqfsodqgjlbeh
```

## 1. Run the database migrations (SQL Editor)

In the Supabase Dashboard → **SQL Editor**, paste & Run, in order, any not-yet-applied:

- `supabase/migrations/001_initial.sql` … through `006_*` (if you haven't already)
- `**supabase/migrations/007_pro_credits.sql`** ← the billing/credits schema (new)

Verify: `select * from public.billing limit 1;` should succeed (every account has a row).

## 2. Create your Stripe products (Test mode first)

In Stripe → **Product catalog**:

- **SLOP Pro** → recurring price **$5/mo** → copy its Price ID → `price_1TioQOEkJu37SSheb4vKTXb0`
- **600 credits** → one-time **$5** → Price ID → `price_1TioS7EkJu37SShebsXgwZYk`
- **3000 credits** → one-time **$20** → Price ID → `price_1TioT4EkJu37SSher8TP0WpJ`

## 3. Set the edge-function secrets  ← **this is where every API key goes**

Get the keys, then set them once. (Copy `supabase/functions/.env.example` →
`supabase/functions/.env`, fill it in, and run the first command.)

```bash
supabase secrets set --env-file supabase/functions/.env
# or individually:
supabase secrets set XAI_API_KEY=xai-...           # console.x.ai  (NEVER paste real keys in this file — use the gitignored .env)
supabase secrets set OPENAI_API_KEY=sk-proj-...    # platform.openai.com/api-keys
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...  # console.anthropic.com
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_PRICE_PRO=price_1TioQOEkJu37SSheb4vKTXb0
supabase secrets set STRIPE_PRICE_TOPUP_SMALL=price_1TioS7EkJu37SShebsXgwZYk
supabase secrets set STRIPE_PRICE_TOPUP_LARGE=price_1TioT4EkJu37SSher8TP0WpJ
supabase secrets set SITE_URL=https://slop.game
```

(`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically — don't set them.)

## 4. Deploy the edge functions

```bash
supabase functions deploy ai-proxy
supabase functions deploy image-proxy
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook --no-verify-jwt   # Stripe sends no Supabase JWT
```

## 5. Wire the Stripe webhook

Stripe → **Developers → Webhooks → Add endpoint**:

- URL: `https://yqlolbebqfsodqgjlbeh.supabase.co/functions/v1/stripe-webhook`
- Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`
- Copy the **Signing secret** (`whsec_…`) → `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`
- Redeploy the webhook once so it picks up the secret: `supabase functions deploy stripe-webhook --no-verify-jwt`

## 6. Make yourself a moderator (optional)

SQL Editor: `update public.profiles set is_moderator = true where lower(username) = 'rob';`

## 7. Test (Stripe Test mode)

- Sign in on the site → the nav shows a **Go Pro · $5/mo** pill + a ⚡ credit chip.
- Click it → **Go Pro** → Stripe checkout → pay with test card `4242 4242 4242 4242`,
any future expiry / any CVC → you return to `/?pro=success`, the nav flips to **PRO**,
and your credits jump (check `select credits, is_pro from billing`).
- In the studio, pick a 🔒 Pro model (e.g. Claude Opus 4.8) and build — it streams,
and `select * from credit_ledger order by created_at desc limit 5;` shows the spend.
- A **free** account: Pro models return a friendly "go Pro" message; fast models work
and the daily bonus tops up credits.

When everything works in Test mode, swap the Stripe keys/prices for **live** ones
(steps 2–5 with live-mode values) and you're charging real money.

---

### Tuning the economics

All in one place — no redeploy of the frontend needed:

- **Credit prices / margin / model tiers** → `supabase/functions/_shared/models.ts`
(`MARGIN`, `MODELS` price table + `tier`, `PRO_MONTHLY`, `IMAGE_CREDITS`, `TOPUP_CREDITS`).
- **Free/Pro monthly allowance + daily bonus** → `supabase/migrations/007_pro_credits.sql`
(`refresh_allowance()` — `FREE_MONTHLY=100`, `PRO_MONTHLY=600`, `DAILY_BONUS=15`, `DAILY_CAP=150`).
- Keep `MODEL_CHOICES` in `js/ai.js` in sync with the `tier` flags in `models.ts`.

### Local development

`node server.js` (with `XAI_API_KEY` set in the env or `slop.config.json`) still runs
the legacy proxy for offline studio testing — the client uses it automatically when
it's up, and falls back to the metered edge functions in production.

### ToS / safety posture

Keys are server-side only; every request is metered and hard-capped by credits, model
access is tiered, prompts are game-scoped (a product, not a raw model passthrough), and
games are labelled "powered by" their model. This is the standard, compliant way to
build a paid product on the xAI / OpenAI / Anthropic APIs — you remain responsible for
your end users, so keep an eye on the `reports` table and `credit_ledger` for abuse.