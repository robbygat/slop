-- slop.game — leaderboards (scores) + game comments.
--
-- Apply after 001 + 002: paste into the Supabase SQL Editor and Run.
-- Idempotent / safe to re-run.

-- ----------------------------------------------------------------- scores
-- One row per score submission, keyed by a free-form `game` string (e.g. the
-- launch-game id 'run3' or a community slug). A player's leaderboard rank uses
-- their BEST score. RLS guarantees a score is attributed to a real signed-in
-- account (auth.uid() = user_id) — that's the "verified" part.
create table if not exists public.scores (
  id         uuid primary key default gen_random_uuid(),
  game       text not null,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  score      integer not null check (score >= 0 and score < 100000000),
  meta       jsonb,
  created_at timestamptz not null default now()
);

create index if not exists scores_game_best_idx on public.scores (game, score desc);
create index if not exists scores_user_idx       on public.scores (user_id);

alter table public.scores enable row level security;

drop policy if exists "scores public read" on public.scores;
drop policy if exists "scores self insert" on public.scores;

create policy "scores public read" on public.scores
  for select using (true);

create policy "scores self insert" on public.scores
  for insert with check (auth.uid() = user_id);

-- Leaderboard: each user's best score for a game, joined to their profile.
create or replace function public.top_scores(p_game text, p_limit int default 25)
returns table (username text, avatar_url text, score integer, achieved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.username, p.avatar_url, b.best, b.at
  from (
    select user_id, max(score) as best, max(created_at) as at
    from public.scores
    where game = p_game
    group by user_id
  ) b
  join public.profiles p on p.id = b.user_id
  where p.username is not null
  order by b.best desc, b.at asc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.top_scores(text, int) to anon, authenticated;

-- ----------------------------------------------------------------- comments
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists comments_game_idx on public.comments (game_id, created_at desc);

alter table public.comments enable row level security;

drop policy if exists "comments public read"  on public.comments;
drop policy if exists "comments self insert"   on public.comments;
drop policy if exists "comments owner delete"  on public.comments;
drop policy if exists "comments mod delete"    on public.comments;

create policy "comments public read" on public.comments
  for select using (true);

create policy "comments self insert" on public.comments
  for insert with check (auth.uid() = user_id);

-- A commenter can delete their own comment; moderators can delete any.
create policy "comments owner delete" on public.comments
  for delete using (auth.uid() = user_id or public.is_moderator());
