#!/usr/bin/env bash
# One-shot deploy for SLOP.game's metered backend (edge functions + secrets).
#
# Prereqs:
#   1. Supabase CLI:  brew install supabase/tap/supabase   (done if you ran my setup)
#   2. Auth — ONE of:
#        a) run `supabase login` once (opens your browser), OR
#        b) export SUPABASE_ACCESS_TOKEN=sbp_...  (dashboard → Account → Access Tokens)
#   3. Your keys filled into supabase/functions/.env  (already done)
#
# Then just run:  ./deploy.sh
set -euo pipefail

REF=yqlolbebqfsodqgjlbeh
ENV_FILE=supabase/functions/.env

command -v supabase >/dev/null || { echo "✗ Supabase CLI not found → brew install supabase/tap/supabase"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "✗ Missing $ENV_FILE — put your keys there first."; exit 1; }

echo "→ uploading secrets from $ENV_FILE to project $REF"
supabase secrets set --project-ref "$REF" --env-file "$ENV_FILE"

for fn in ai-proxy image-proxy stripe-checkout; do
  echo "→ deploying function: $fn"
  supabase functions deploy "$fn" --project-ref "$REF"
done

echo "→ deploying function: stripe-webhook (no JWT verify — Stripe sends no Supabase token)"
supabase functions deploy stripe-webhook --project-ref "$REF" --no-verify-jwt

cat <<'DONE'

✅ Functions + secrets are live.

Still to do by hand (each needs your account, not the CLI alone):
  • DB schema:  paste supabase/migrations/007_pro_credits.sql into the Supabase
    SQL Editor and Run  (or, if you've `supabase link`ed with your DB password: supabase db push)
  • Stripe webhook:  create the endpoint in Stripe (SETUP.md step 5), copy its
    whsec_… into supabase/functions/.env, then re-run ./deploy.sh
DONE
