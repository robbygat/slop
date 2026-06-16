-- SLOP.game — moderators (admins) get unlimited credits + Pro model access.
-- Re-run safe (CREATE OR REPLACE). Apply in Supabase SQL Editor after 007.

-- ----------------------------------------------------------------- refresh_allowance
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

  -- moderators: skip monthly/daily caps entirely
  if public.is_moderator() then
    return coalesce((select credits from public.billing where user_id = uid), 999999);
  end if;

  select * into b from public.billing where user_id = uid for update;

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

-- ----------------------------------------------------------------- spend_credits
create or replace function public.spend_credits(
  p_amount integer, p_reason text,
  p_model text default null, p_tokens_in integer default null,
  p_tokens_out integer default null, p_usd numeric default null)
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); bal integer;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'bad amount'; end if;

  -- moderators: log usage for audit but never deduct
  if public.is_moderator() then
    perform public.ensure_billing(uid);
    insert into public.credit_ledger (user_id, delta, reason, model, tokens_in, tokens_out, usd)
      values (uid, 0, coalesce(p_reason, 'spend') || ' (moderator)', p_model, p_tokens_in, p_tokens_out, p_usd);
    return 999999;
  end if;

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

-- ----------------------------------------------------------------- my_billing
drop function if exists public.my_billing();

create or replace function public.my_billing()
returns table (is_pro boolean, credits integer, pro_until timestamptz, referral_code text, is_moderator boolean)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.refresh_allowance();
  return query
    select
      (b.is_pro or p.is_moderator) as is_pro,
      case when p.is_moderator then 999999 else b.credits end as credits,
      b.pro_until,
      b.referral_code,
      p.is_moderator
    from public.billing b
    join public.profiles p on p.id = b.user_id
    where b.user_id = uid;
end;
$$;

grant execute on function public.my_billing() to authenticated;
