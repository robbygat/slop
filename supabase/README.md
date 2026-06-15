# slop.game × Supabase

The live site (https://slop.game) is a **static GitHub Pages** build with no Node
server. Accounts and published games are powered entirely by Supabase, so signup,
login, publishing, profiles, and play counts all work without `node server.js`.

Project: `yqlolbebqfsodqgjlbeh` · URL: `https://yqlolbebqfsodqgjlbeh.supabase.co`

## One-time setup

### 1. Apply the schema
Open **Supabase Dashboard → SQL Editor**, paste all of
[`migrations/001_initial.sql`](migrations/001_initial.sql), and **Run**. It creates
`profiles`, `games`, `reports`, all RLS policies, the new-user trigger, the
`claim_username` / `increment_play_count` RPCs, and seeds `robbygat` as moderator.
Then run, in order:
- [`migrations/002_social.sql`](migrations/002_social.sql) — `follows` table (follower counts) + public `avatars` storage bucket.
- [`migrations/003_scores_comments.sql`](migrations/003_scores_comments.sql) — `scores` (leaderboards) + `comments`.
- [`migrations/004_bio_stats.sql`](migrations/004_bio_stats.sql) — profile `bio`/`link`, the global `play_totals` counter + `bump_play` RPC (so launch-game plays count globally), and the `platform_stats` RPC behind the homepage stats strip.
- [`migrations/005_profile_customization.sql`](migrations/005_profile_customization.sql) — profile `cover_theme`, `accent_color`, and `tagline` for the customizable creator page.
- [`migrations/006_profile_banner_bg.sql`](migrations/006_profile_banner_bg.sql) — profile `banner_url` (custom banner image) and `bg_color` (page background).

Re-running any of them is safe (idempotent).

### 2. Auth → URL Configuration
- **Site URL:** `https://slop.game`
- **Redirect URLs:** `https://slop.game/**` and `http://localhost:3000/**`

### 3. Auth → Providers → Email
- For the smoothest demo, turn **"Confirm email" OFF** so signup → username →
  publish works in one sitting. (With it ON, the user must click the email link
  first; the chosen username is remembered and claimed automatically on return.)

### 4. Auth → Providers → Google
- Enable Google.
- In Google Cloud Console create an OAuth **Web** client and add the redirect
  `https://yqlolbebqfsodqgjlbeh.supabase.co/auth/v1/callback`.
- Paste the Google client ID + secret into Supabase. (The secret stays in
  Supabase — it never touches the frontend.)

## Keys

| Key | Where it lives | Safe in git? |
|-----|----------------|--------------|
| anon / publishable | `js/supabase.js` (frontend) | ✅ yes — RLS protects every table |
| service_role | nowhere in this repo | ❌ never commit it |

To override the URL/anon key for local dev without editing `js/supabase.js`, set
`window.SLOP_CONFIG = { supabaseUrl, supabaseAnonKey }` before the ES modules load.

## URL routes (static SPA)

- `https://slop.game/{username}` → profile (`profile.html`)
- `https://slop.game/play/{slug}` → player (`play.html`)

`404.html` is the GitHub Pages fallback router: it maps those pretty paths onto
the real pages, which then restore the pretty URL via `history.replaceState`.

## Moderation

`profiles.is_moderator = true` lets a user soft-delete any game (sets
`games.status = 'removed'`; removed games 404 on `/play/{slug}`). The remove
control appears on game cards on a creator's profile page. Promote someone with:

```sql
update public.profiles set is_moderator = true where lower(username) = 'their_name';
```
