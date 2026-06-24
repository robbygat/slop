# Apple Universal Links (slop.game)

Source file: `docs/apple-app-site-association`  
Live path: `https://slop.game/.well-known/apple-app-site-association`

## GitHub Pages limitation

GitHub Pages serves extensionless files as `Content-Type: application/octet-stream`.
It cannot set `application/json` per path. Modern iOS and Apple’s CDN accept the file
anyway, so this is cosmetic — not a blocker.

## Fix: `application/json` (pick one)

### A. Cloudflare Transform Rule (easiest — keep GitHub Pages)

If `slop.game` DNS is on Cloudflare (orange-cloud proxy):

1. **Rules** → **Transform Rules** → **Modify Response Header**
2. **When:** URI Path equals `/.well-known/apple-app-site-association`
3. **Then:** Set static header `Content-Type` = `application/json`

No repo or hosting change. GitHub Pages still serves the file; Cloudflare rewrites the header.

### B. Cloudflare Pages (use `_headers` in repo root)

1. Create a Cloudflare Pages project from this repo (build command: none, output: `/`)
2. Add custom domain `slop.game`
3. Disable GitHub Pages for this repo (avoid two hosts on one domain)
4. The root `_headers` file sets `Content-Type: application/json` automatically

### C. Cloudflare Worker (single-route)

See `cloudflare/aasa-worker.js` + `wrangler.toml`. Deploy with `npx wrangler deploy`
after `slop.game` is a zone on Cloudflare. The worker only handles the AASA path;
all other traffic still goes to GitHub Pages.

## Verify

```bash
curl -sI https://slop.game/.well-known/apple-app-site-association | grep -i content-type
curl -sL https://slop.game/.well-known/apple-app-site-association
```

Expect `Content-Type: application/json`, HTTP 200, no redirects.
