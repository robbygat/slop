# Apple Universal Links (slop.game)

Canonical copy: `docs/apple-app-site-association`

Live URLs (both required):

- `https://slop.game/.well-known/apple-app-site-association`
- `https://slop.game/apple-app-site-association`

App ID: `6S8Z64V9JP.game.slop.slop` (Team ID + bundle id `game.slop.slop` — **not** `io.slop.game`, which is only the custom URL scheme for OAuth).

Paths: `/play/*`, `/r/*`, `/g/*` — covers multiplayer invites like `/play/<slug>?room=<code>`.

## Verify

```bash
curl -sI https://slop.game/.well-known/apple-app-site-association
curl -sI https://slop.game/apple-app-site-association
curl -sL https://slop.game/.well-known/apple-app-site-association
```

Expect HTTP 200, no redirects, JSON body with `appID` `6S8Z64V9JP.game.slop.slop`.

## Content-Type

GitHub Pages serves extensionless files as `application/octet-stream`. Modern iOS accepts this; for `application/json` see Option A below.

### A. Cloudflare Transform Rule (keep GitHub Pages)

Rules → Transform Rules → Modify Response Header → URI Path equals `/.well-known/apple-app-site-association` OR `/apple-app-site-association` → set `Content-Type: application/json`.

### B. Cloudflare Pages

Use root `_headers` (already in repo) and point `slop.game` at Cloudflare Pages.

### C. Cloudflare Worker

`npx wrangler deploy` (see `cloudflare/aasa-worker.js`).

## iOS checklist

- Associated Domains: `applinks:slop.game`
- AASA must be live **before** TestFlight install (iOS fetches at install time)
- Provisioning profile must include Associated Domains capability
