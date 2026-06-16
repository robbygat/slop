-- SLOP.game — profile banner image + page background color.
--
-- Apply after 001–005: paste into the Supabase SQL Editor and Run.
-- Idempotent / safe to re-run.

alter table public.profiles add column if not exists banner_url text;
alter table public.profiles add column if not exists bg_color text;

alter table public.profiles drop constraint if exists profiles_bg_color_valid;
alter table public.profiles add constraint profiles_bg_color_valid
  check (bg_color is null or bg_color ~ '^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$') not valid;
