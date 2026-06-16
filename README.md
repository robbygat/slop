# SLOP.game

**Prompt. Publish. Play.**

An AI-native platform where users can collaboratively create, publish, play, and live-remix browser games. It features a lightweight vanilla HTML/CSS/JS frontend, a zero-dependency Node backend, and seamless model api integration to power dynamic code and asset generation.

## Running it

```bash
cd slop
node server.js          # → http://localhost:3000   (Node 22.5+ for node:sqlite)
```

The frontend also works served statically — accounts, community, friends, and
the server-side AI proxy simply switch off and the AI client falls back to
calling xAI directly with the baked-in dev key.

## Deploying (moving off localhost)

The repo is deploy-ready for any Node host or container platform:

- **Docker**: `docker build -t slop . && docker run -p 3000:3000 -v slop_data:/data -e XAI_API_KEY=xai-... slop`
- **fly.io**: `fly launch --copy-config`, `fly secrets set XAI_API_KEY=xai-...`, `fly deploy` (volume + config in `fly.toml`)
- **Render/Railway/VPS**: start command `node server.js`, set `XAI_API_KEY`, persist `DB_PATH`.

Production notes baked in: when the server runs, **all AI calls route through
`/api/ai/*` so provider keys never ship to browsers** (set `XAI_API_KEY`; the
in-repo fallback key is for local dev). To light up the extra model-picker
options, also set `ANTHROPIC_API_KEY` (Claude Sonnet 4.6) and/or `OPENAI_API_KEY`
(GPT-4o) — they have no dev fallback, so they stay off until configured. Static text assets are gzipped, images
get cache headers, AI/auth/publish endpoints are rate-limited per IP, and the
SQLite db (`DB_PATH`) handles accounts/posts/games/friends. A single small
instance comfortably serves ~1000 concurrent players: game multiplayer is
peer-to-peer WebRTC (PeerJS cloud signaling), so gameplay traffic never touches
this server. Scale the AI rate limits in `server.js` to taste.

## The big pieces

- **Slop Studio** (`studio.html`) — a game studio you talk to. Prompt → the
  agent (grok-4.3) writes a complete game → crash-tested in a hidden sandbox →
  boots in the playtest pane. Keep prompting to change ANY aspect. When a
  request needs art, the agent asks for sprites, generates them with
  `grok-imagine-image`, injects them as `window.SPRITES`, and continues the
  build. Versions + undo, publish to the community, and **friend invites**
  (publishes a snapshot, friend opens it in their own studio).
- **Remix dock** (`js/remix-dock.js`) — one shared live-modding panel mounted
  on **every built-in game**. It docks BESIDE the game (bottom sheet on
  mobile), never covering the canvas. Type or speak a mod → Grok reads the
  game's real source → writes a JS patch → applied to the RUNNING game, no
  reload. Mods persist per-device, are removable, and **in multiplayer the
  host's mods broadcast to the whole room** (and sync to late joiners).
- **Run 3** (`games/run3/`) — a Run-3-style gravity **tube** runner. You auto-run
  along the inside of a tunnel; A/D rotate you around the cross-section so
  whatever surface is under you is "down" (the camera spins to keep you at the
  bottom) — that's how you follow the platform onto the walls. SPACE **jumps the
  gaps**; miss a tile and you fall out into space. The safe platform is a winding
  ribbon that **narrows the further you run**, so it keeps getting harder. Runner
  vs Skater (~2× speed), collectible orbs, a 600m double-jump unlock. **Race a
  friend side by side**: host a lobby → share the invite link → both run the same
  seeded tunnel with the rival rendered as a live ghost (PeerJS via `js/netcore.js`).
  Fully live-remixable through `window.R3` + the dock.
- **Sloppy Zombies** (`games/sloppy-zombies/`) — round-based undead survival in
  the World-at-War mold: boarded windows zombies tear open (rebuild with F),
  points economy (10/hit, 60/kill, 130/knife), wall-buy guns, a **mystery box**,
  knifing (V), two perks (Slop-A-Cola, Speedy Slop), power-ups (insta-kill,
  double points, nuke, max ammo), downed/revive co-op rules, and 4-player
  host-authoritative multiplayer. Fully exposed on `window.SZ` for live mods.
- **Dungeon Panic** (`games/dungeon-panic/`) — twin-stick roguelike, 3 rotating
  bosses, 4-player co-op, live-moddable via `window.DP` with multiplayer mod sync.
- **Umbral Red / Slopcraft** — creature-taming RPG and voxel sandbox, both with
  remix surfaces (`window.UR` / `window.SC`) and the dock mounted.
- **Cook a Game** (homepage hero) — quick single-prompt builds, streamed live,
  crash-tested, thumbnailed, saved to your grid. The hero sits on a slow,
  animated **watercolor wash** of the brand palette (ink-in-water, CSS-only).
- **Branding** — the nav wordmark is just **slop** (the heavy brand word), while
  "SLOP.game" still appears throughout the copy. The 🍲 pot mascot is used large
  in the **slop games** and **how-it-works** section headers.
- **slop games** (homepage games section, placed immediately after the hero) — a
  Newgrounds-style dense grid mixing launch games, community publishes, and your
  AI-cooked games. A **🔥 Most Popular** row ranks the top games by play count,
  **Popular / Newest** sort,
  genre filters, working search, and **per-card play counts**. Every card has a
  **⚐ report** button (`POST /api/report`). A **July prize ribbon** promotes the
  promo: $100 every Friday in July to the highest-played creator.
- **Real play counts** — counts are the genuine number of opens, not seeded
  vanity numbers. A shared `plays` table (`GET`/`POST /api/plays`, keyed by game
  id) is the source of truth across everyone; `js/plays.js` falls back to a
  local tally when the backend is offline. A game shows `0` until it's actually
  played — by design.
- **Multi-provider model picker** — the hero "describe your game" window and Slop
  Studio both expose a model dropdown (`MODEL_CHOICES` in `js/ai.js`): **Grok
  4.3 / 4.20**, **Claude Sonnet 4.6**, **GPT-4o**. The server routes by model id
  (`grok-*`→xAI, `gpt-*`→OpenAI, `claude-*`→Anthropic Messages API, translated to
  OpenAI-style SSE so the browser client is provider-agnostic). Grok works out of
  the box; Claude/GPT activate when `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` are set
  (otherwise selecting one returns an honest "not configured" — never a fake
  success). The choice is shared via `localStorage['slop-model']`.
- **Coming soon to the App Store** (homepage `#app`) — a promo section with an
  iPhone running a **SLOP-branded GBA emulator skin** (CSS-only: sunshine-yellow
  body, white D-pad, pink **A** / blue **B**, L/R, MENU/SELECT/START, 🍲 pot logo
  + SLOP wordmark). The black "screen" cross-fades through real games on the site
  on a loop (`js/appstore.js`); it's **interactive** — the buttons jump to the
  next game and tapping the screen opens whatever's playing. CTA → waitlist.
- **Select-to-remix** (`play.html`) — drag a box over the running game to target
  a change at a specific area. The iframe is sandboxed/opaque, so we can't read
  its pixels — instead the box becomes a normalized region + plain-language hint
  ("the top-right", "the center") prepended to the remix request so Grok focuses
  the edit there. Works for both live JS patches and full rewrites.
- **Upload from Repo** (homepage publish section) — drop a self-contained .html
  (or index.html + local js/css, bundled in-browser), crash-tested, added to
  your grid, publishable.
- **Accounts & community** — username/scrypt or Google sign-in, community board,
  published-games catalog with play counts, **friends** (search, requests),
  and **studio invites** between friends.
- **Monetization** — Google AdSense (`ca-pub-6363419721600866`) loaded on
  index/play/studio with labeled responsive units on the homepage (units render
  once Google approves the domain).

## Structure

```
├── server.js               # zero-dep backend: static+gzip, accounts, posts, games,
│                           #   friends/invites, waitlist, reports, AI proxy (/api/ai/chat|image)
├── index.html              # homepage: hero, studio promo, grid, publish/upload,
│                           #   multiplayer, remix, community + friends, ads
├── studio.html / js/studio.js     # the prompt-based game creator agent
├── play.html / js/play.js         # sandboxed player + remix drawer + publish
├── js/remix-dock.js        # shared live-mod dock (all built-in games)
├── js/ai.js                # Grok client: proxy-first chat streaming + image gen
├── js/{friends,upload,cook,games-grid,account,community,api,sandbox,speech}.js
├── js/appstore.js          # App Store promo: Delta emulator skin looping real games
├── css/                    # tokens, per-section styles, brand.css, appstore.css, v2.css
├── games/run3/             # gravity tunnel runner, side-by-side race (window.R3)
├── games/sloppy-zombies/   # CoD-zombies-style co-op survival (window.SZ)
├── games/dungeon-panic/    # roguelike co-op (window.DP)
├── games/umbral-red/       # creature-taming RPG (window.UR)
├── games/slopcraft/        # voxel sandbox (window.SC)
└── Dockerfile, fly.toml    # deploy configs
```

## Design system

Neo-brutalist meets internet-cute: 3px ink borders, hard offset shadows, pill
buttons, Fredoka One / Nunito / Space Mono, sunshine yellow + hot pink + sky
blue (`css/tokens.css`). Dark panels for tools (studio, remix dock), gritty
red-and-shadow theme for Sloppy Zombies. Responsive down to phones: hamburger
nav, stacked grids, bottom-sheet remix dock.
