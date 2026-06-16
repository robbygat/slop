-- SLOP.game — Pro memberships + metered AI credits (migration 007).
--
-- HOW TO APPLY (one time): Supabase Dashboard → SQL Editor → paste & Run.
-- Re-running is safe (IF NOT EXISTS / CREATE OR REPLACE / drop-before-create).
--
-- Design notes:
--  * Billing/credit state lives in its OWN table (public.billing), NOT on
--    profiles — because profiles is world-readable (`select using (true)`) and
--    self-updatable, which would (a) leak credits/stripe ids and (b) let a user
--    PATCH themselves Pro. billing has a self-READ policy and NO write policy, so
--    only the service role (Stripe webhook) and the SECURITY DEFINER RPCs below
--    can ever change credits or Pro status.
--  * The edge function computes the credit cost from real token usage (price ×
--    margin) and calls spend_credits(); the price table lives in the function,
--    so pricing stays tunable in one place.

-- ----------------------------------------------------------------- billing
create table if not exists public.billing (
  user_id              uuid primary key references public.profiles(id) on delete cascade,
  is_pro               boolean not null default false,
  pro_until            timestamptz,
  stripe_customer_id   text,
  credits              integer not null default 100,   -- free signup grant
  credits_period_start date,                            -- month the monthly allowance was last applied
  daily_bonus_at       date,                            -- last day the free daily bonus was applied
  referral_code        text unique,
  referred_by          uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now()
);

-- give every existing + future profile a billing row and a referral code
alter table public.billing
  alter column referral_code set default substr(md5(gen_random_uuid()::text), 1, 8);

insert into public.billing (user_id, referral_code)
  select id, substr(md5(id::text || random()::text), 1, 8) from public.profiles
  on conflict (user_id) do nothing;

-- ----------------------------------------------------------------- credit ledger
-- Append-only audit of every grant (+) and spend (-): transparency + abuse tracing.
create table if not exists public.credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  delta      integer not null,
  reason     text not null,
  model      text,
  tokens_in  integer,
  tokens_out integer,
  usd        numeric(12,5),
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);

-- ================================================================= RLS
alter table public.billing       enable row level security;
alter table public.credit_ledger enable row level security;

-- billing: a user may READ only their own row; NObody can write from a client
-- (no insert/update/delete policy) — writes go through the service role + RPCs.
drop policy if exists "billing self read" on public.billing;
create policy "billing self read" on public.billing
  for select using (user_id = auth.uid());

-- ledger: a user may READ only their own entries; no client writes.
drop policy if exists "ledger self read" on public.credit_ledger;
create policy "ledger self read" on public.credit_ledger
  for select using (user_id = auth.uid());

-- ================================================================= guard
-- Close a latent privilege-escalation hole: profiles' "self update" policy let a
-- user set is_moderator = true on themselves. Reset it to OLD on any update made
-- by a normal signed-in client (service role + SQL editor, where there is no JWT
-- user, may still set it — that's how moderators get seeded).
create or replace function public.guard_profile_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    new.is_moderator := old.is_moderator;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_admin on public.profiles;
create trigger profiles_guard_admin
  before update on public.profiles
  for each row execute function public.guard_profile_admin();

-- ================================================================= RPCs
-- Lazily ensure a billing row exists (covers any profile created before 007).
create or replace function public.ensure_billing(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.billing (user_id, referral_code)
  values (p_user, substr(md5(p_user::text || random()::text), 1, 8))
  on conflict (user_id) do nothing;
end;
$$;

-- refresh_allowance: applies the monthly allowance (top up to at least the tier
-- amount at the start of each month — keeps purchased top-ups) and a small daily
-- login bonus for free users (a gentle return-visit loop). Returns the balance.
-- Tunables: FREE_MONTHLY=100, PRO_MONTHLY=600, DAILY_BONUS=15, DAILY_CAP=150.
create or replace function public.refresh_allowance()
returns integer language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  b public.billing%rowtype;
  monthly integer;
  today date := (now() at time zone 'utc')::date;
  month_start date := date_trunc('month', now() at time zone 'utc')::date;
  grant_amt integer;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.ensure_billing(uid);
  select * into b from public.billing where user_id = uid for update;

  -- expire lapsed Pro
  if b.is_pro and b.pro_until is not null and b.pro_until < now() then
    update public.billing set is_pro = false where user_id = uid;
    b.is_pro := false;
  end if;

  monthly := case when b.is_pro then 600 else 100 end;

  if b.credits_period_start is null or b.credits_period_start < month_start then
    grant_amt := greatest(monthly - b.credits, 0);
    update public.billing
      set credits = greatest(b.credits, monthly), credits_period_start = month_start
      where user_id = uid;
    b.credits := greatest(b.credits, monthly);
    if grant_amt > 0 then
      insert into public.credit_ledger (user_id, delta, reason) values (uid, grant_amt, 'monthly_allowance');
    end if;
  end if;

  if (not b.is_pro) and (b.daily_bonus_at is null or b.daily_bonus_at < today) then
    grant_amt := greatest(least(b.credits + 15, 150) - b.credits, 0);
    update public.billing
      set credits = least(b.credits + 15, 150), daily_bonus_at = today
      where user_id = uid;
    b.credits := least(b.credits + 15, 150);
    if grant_amt > 0 then
      insert into public.credit_ledger (user_id, delta, reason) values (uid, grant_amt, 'daily_bonus');
    end if;
  end if;

  return b.credits;
end;
$$;

-- spend_credits: atomically refresh, check, decrement, and log. Raises
-- 'insufficient_credits' if the caller can't afford it. Operates on auth.uid()
-- only, so it's safe to expose to authenticated.
create or replace function public.spend_credits(
  p_amount integer, p_reason text,
  p_model text default null, p_tokens_in integer default null,
  p_tokens_out integer default null, p_usd numeric default null)
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); bal integer;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;
  perform public.refresh_allowance();
  select credits into bal from public.billing where user_id = uid for update;
  if bal is null then raise exception 'no billing row'; end if;
  if bal < p_amount then raise exception 'insufficient_credits'; end if;
  update public.billing set credits = credits - p_amount where user_id = uid;
  insert into public.credit_ledger (user_id, delta, reason, model, tokens_in, tokens_out, usd)
    values (uid, -p_amount, coalesce(p_reason, 'spend'), p_model, p_tokens_in, p_tokens_out, p_usd);
  return bal - p_amount;
end;
$$;

-- grant_credits: privileged (arbitrary user) — Stripe webhook top-ups, referrals.
create or replace function public.grant_credits(p_user uuid, p_amount integer, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_amount is null or p_amount <= 0 then return; end if;
  perform public.ensure_billing(p_user);
  update public.billing set credits = credits + p_amount where user_id = p_user;
  insert into public.credit_ledger (user_id, delta, reason) values (p_user, p_amount, coalesce(p_reason, 'grant'));
end;
$$;

-- set_pro_status: privileged — flip Pro + stash the Stripe customer id (webhook).
create or replace function public.set_pro_status(
  p_user uuid, p_is_pro boolean,
  p_until timestamptz default null, p_customer text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_billing(p_user);
  update public.billing
    set is_pro = p_is_pro,
        pro_until = coalesce(p_until, pro_until),
        stripe_customer_id = coalesce(p_customer, stripe_customer_id)
    where user_id = p_user;
end;
$$;

-- apply_referral: the signed-in caller redeems a code once; both sides get credits.
create or replace function public.apply_referral(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); ref uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.ensure_billing(uid);
  select user_id into ref from public.billing where referral_code = p_code;
  if ref is null then return 'invalid'; end if;
  if ref = uid then return 'self'; end if;
  update public.billing set referred_by = ref where user_id = uid and referred_by is null;
  if not found then return 'already'; end if;
  perform public.grant_credits(uid, 50, 'referral_welcome');
  perform public.grant_credits(ref, 50, 'referral_bonus');
  return 'ok';
end;
$$;

-- my_billing: a single convenience read the client can call to get Pro + balance
-- + referral code in one round trip (also refreshes the allowance as a side effect).
create or replace function public.my_billing()
returns table (is_pro boolean, credits integer, pro_until timestamptz, referral_code text)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.refresh_allowance();
  return query
    select b.is_pro, b.credits, b.pro_until, b.referral_code
    from public.billing b where b.user_id = uid;
end;
$$;

-- ================================================================= grants
-- Caller-scoped (safe for any signed-in user — operate on auth.uid() only):
grant execute on function public.refresh_allowance()                                   to authenticated;
grant execute on function public.spend_credits(integer, text, text, integer, integer, numeric) to authenticated;
grant execute on function public.apply_referral(text)                                  to authenticated;
grant execute on function public.my_billing()                                          to authenticated;

-- Privileged (arbitrary user) — lock to the service role only (Stripe webhook):
revoke all on function public.grant_credits(uuid, integer, text)                       from public;
revoke all on function public.set_pro_status(uuid, boolean, timestamptz, text)         from public;
revoke all on function public.ensure_billing(uuid)                                     from public;
grant execute on function public.grant_credits(uuid, integer, text)                    to service_role;
grant execute on function public.set_pro_status(uuid, boolean, timestamptz, text)      to service_role;
grant execute on function public.ensure_billing(uuid)                                  to service_role, authenticated;
