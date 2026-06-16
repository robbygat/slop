-- SLOP.game — profile cover theme, accent color, and tagline.
--
-- Apply after 001–004: paste into the Supabase SQL Editor and Run.
-- Idempotent / safe to re-run.

alter table public.profiles add column if not exists cover_theme text;
alter table public.profiles add column if not exists accent_color text;
alter table public.profiles add column if not exists tagline text;

alter table public.profiles drop constraint if exists profiles_cover_theme_valid;
alter table public.profiles drop constraint if exists profiles_accent_color_valid;
alter table public.profiles drop constraint if exists profiles_tagline_len;

alter table public.profiles add constraint profiles_cover_theme_valid
  check (cover_theme is null or cover_theme in (
    'sunset', 'ocean', 'neon', 'mint', 'purple', 'fire', 'candy', 'mono'
  )) not valid;

alter table public.profiles add constraint profiles_accent_color_valid
  check (accent_color is null or accent_color in (
    'pink', 'blue', 'mint', 'orange', 'purple', 'yellow', 'ink'
  )) not valid;

alter table public.profiles add constraint profiles_tagline_len
  check (tagline is null or char_length(tagline) <= 80) not valid;
