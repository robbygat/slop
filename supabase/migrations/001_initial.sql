-- slop.game — initial schema for Supabase-backed auth, profiles, and publishing.
--
-- HOW TO APPLY (one time):
--   1. Open the Supabase Dashboard → SQL Editor for project yqlolbebqfsodqgjlbeh
--   2. Paste this whole file and Run.
--   3. (Auth) Set Site URL to https://slop.game and add redirect URLs
--      https://slop.game/** and http://localhost:3000/** under Auth → URL Configuration.
--   4. (Auth) Enable Google under Auth → Providers and add your Google OAuth
--      client id + secret (callback: https://yqlolbebqfsodqgjlbeh.supabase.co/auth/v1/callback).
--
-- Re-running is safe: everything is guarded with IF NOT EXISTS / CREATE OR REPLACE
-- and policies are dropped before being recreated.

-- ----------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique,
  display_name text,
  avatar_url   text,
  is_moderator boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Case-insensitive uniqueness for usernames (so "Robby" and "robby" can't both exist).
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- ----------------------------------------------------------------- games
create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  description text,
  prompt      text,
  html        text not null,
  thumb       text,
  play_count  integer not null default 0,
  status      text not null default 'published' check (status in ('published','removed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists games_owner_idx  on public.games (owner_id);
create index if not exists games_status_idx on public.games (status);

-- ----------------------------------------------------------------- reports
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid references public.games(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now()
);

-- ================================================================= RLS
alter table public.profiles enable row level security;
alter table public.games    enable row level security;
alter table public.reports  enable row level security;

-- helper: is the current user a moderator?
create or replace function public.is_moderator()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_moderator from public.profiles where id = auth.uid()), false);
$$;

-- profiles -----------------------------------------------------------------
drop policy if exists "profiles public read"   on public.profiles;
drop policy if exists "profiles self insert"    on public.profiles;
drop policy if exists "profiles self update"    on public.profiles;

create policy "profiles public read" on public.profiles
  for select using (true);

create policy "profiles self insert" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles self update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- games --------------------------------------------------------------------
drop policy if exists "games public read"     on public.games;
drop policy if exists "games owner insert"    on public.games;
drop policy if exists "games owner update"    on public.games;
drop policy if exists "games moderator update" on public.games;

-- Anyone can see published games; owners see their own (any status); mods see all.
create policy "games public read" on public.games
  for select using (
    status = 'published'
    or owner_id = auth.uid()
    or public.is_moderator()
  );

-- A signed-in user may only insert games they own, and only as 'published'.
create policy "games owner insert" on public.games
  for insert with check (auth.uid() = owner_id and status = 'published');

-- Owners may edit their own games (play_count bumps go through an RPC below).
create policy "games owner update" on public.games
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Moderators may edit any game (used to set status = 'removed' — a soft delete).
create policy "games moderator update" on public.games
  for update using (public.is_moderator()) with check (public.is_moderator());

-- reports ------------------------------------------------------------------
drop policy if exists "reports insert any" on public.reports;
drop policy if exists "reports mod read"   on public.reports;

-- Anyone (even anonymous) can file a report.
create policy "reports insert any" on public.reports
  for insert with check (true);

create policy "reports mod read" on public.reports
  for select using (public.is_moderator());

-- ================================================================= triggers
-- On signup, create an empty profile row (username claimed separately so the
-- user picks an intentional handle instead of getting a random one).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep updated_at fresh on games
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists games_touch_updated_at on public.games;
create trigger games_touch_updated_at
  before update on public.games
  for each row execute function public.touch_updated_at();

-- ================================================================= RPCs
-- claim_username: validates format + case-insensitive uniqueness, then sets the
-- username on the caller's own profile. Returns the claimed username.
create or replace function public.claim_username(p_username text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if p_username !~ '^[a-zA-Z0-9_]{3,20}$' then
    raise exception 'username must be 3-20 chars: letters, numbers, _';
  end if;
  if exists (
    select 1 from public.profiles
    where lower(username) = lower(p_username) and id <> uid
  ) then
    raise exception 'that username is taken';
  end if;
  -- upsert so the handle sticks even if the new-user trigger hasn't run yet
  insert into public.profiles (id, username)
  values (uid, p_username)
  on conflict (id) do update set username = excluded.username;
  return p_username;
end;
$$;

-- increment_play_count: bumps a published game's counter by slug. Runs as
-- definer so anonymous players can register a play without write access to games.
create or replace function public.increment_play_count(p_slug text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  new_count integer;
begin
  update public.games
    set play_count = play_count + 1
    where slug = p_slug and status = 'published'
    returning play_count into new_count;
  return coalesce(new_count, 0);
end;
$$;

grant execute on function public.claim_username(text)       to authenticated;
grant execute on function public.increment_play_count(text) to anon, authenticated;
grant execute on function public.is_moderator()             to anon, authenticated;

-- ================================================================= seed
-- Promote robbygat to moderator as soon as that username exists. Safe to re-run.
update public.profiles set is_moderator = true where lower(username) = 'robbygat';
