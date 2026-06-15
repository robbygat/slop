-- slop.game — profile bio + link, global play totals, and platform stats.
--
-- Apply after 001–003: paste into the Supabase SQL Editor and Run.
-- Idempotent / safe to re-run.

-- ----------------------------------------------------------------- profiles: bio + one link
alter table public.profiles add column if not exists bio  text;
alter table public.profiles add column if not exists link text;

alter table public.profiles add constraint profiles_bio_len  check (bio  is null or char_length(bio)  <= 300) not valid;
alter table public.profiles add constraint profiles_link_len check (link is null or char_length(link) <= 200) not valid;

-- ----------------------------------------------------------------- global play totals
-- One counter per game, keyed by the same id the UI uses: a launch-game id
-- ('run3', 'slopkart', …) OR a community slug. This makes launch-game plays
-- globally counted (they used to be localStorage-only) and powers the
-- platform-wide "games played" stat.
create table if not exists public.play_totals (
  id         text primary key,
  count      integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.play_totals enable row level security;

drop policy if exists "play_totals public read" on public.play_totals;
create policy "play_totals public read" on public.play_totals
  for select using (true);
-- No direct insert/update policy: writes go through the definer RPC below.

-- Seed from any existing community counters so totals line up.
insert into public.play_totals (id, count)
select slug, play_count from public.games
on conflict (id) do nothing;

-- Atomic increment; also keeps a community game's denormalised counter in sync.
create or replace function public.bump_play(p_id text)
returns integer
language plpgsql security definer set search_path = public as $$
declare new_count integer;
begin
  insert into public.play_totals (id, count, updated_at)
  values (p_id, 1, now())
  on conflict (id) do update set count = play_totals.count + 1, updated_at = now()
  returning count into new_count;
  update public.games set play_count = new_count where slug = p_id;
  return new_count;
end;
$$;

grant execute on function public.bump_play(text) to anon, authenticated;

-- ----------------------------------------------------------------- platform stats
create or replace function public.platform_stats()
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'accounts', (select count(*) from public.profiles where username is not null),
    'plays',    coalesce((select sum(count) from public.play_totals), 0),
    'games',    (select count(*) from public.games where status = 'published')
  );
$$;

grant execute on function public.platform_stats() to anon, authenticated;
