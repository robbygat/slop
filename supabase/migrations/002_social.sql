-- SLOP.game — social layer: follows + avatar uploads.
--
-- Apply after 001_initial.sql: paste into the Supabase SQL Editor and Run.
-- Idempotent / safe to re-run.

-- ----------------------------------------------------------------- follows
create table if not exists public.follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists follows_following_idx on public.follows (following_id);
create index if not exists follows_follower_idx  on public.follows (follower_id);

alter table public.follows enable row level security;

drop policy if exists "follows public read"  on public.follows;
drop policy if exists "follows self insert"   on public.follows;
drop policy if exists "follows self delete"   on public.follows;

-- Public read so anyone can see follower counts. (The app intentionally never
-- displays "following" counts, but the rows are readable.)
create policy "follows public read" on public.follows
  for select using (true);

create policy "follows self insert" on public.follows
  for insert with check (auth.uid() = follower_id);

create policy "follows self delete" on public.follows
  for delete using (auth.uid() = follower_id);

-- ----------------------------------------------------------------- avatars (Storage)
-- A public bucket for profile pictures. Files live under {user_id}/... so each
-- user can only write their own folder.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatars public read"  on storage.objects;
drop policy if exists "avatars owner insert"  on storage.objects;
drop policy if exists "avatars owner update"  on storage.objects;
drop policy if exists "avatars owner delete"  on storage.objects;

create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars owner insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars owner update" on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars owner delete" on storage.objects
  for delete using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );
