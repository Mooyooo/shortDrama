# shortDrama Admin

Staff-only web admin: create series, edit details and prices, bulk-upload episodes straight to Cloudflare Stream, and publish. React + Vite, built to static files.

## Run locally

```bash
# terminal 1: the API, with an admin token (see apps/api/README.md)
cd apps/api && ADMIN_TOKEN=local-dev-token npm run dev
# terminal 2: the admin at http://localhost:5174 (proxies /v1 to the API)
cd apps/admin && npm run dev
```

Sign in by pasting the same token. Uploads answer "not configured" until the API has Cloudflare Stream settings.

## Episode uploads

Drop files named `EP01.mp4`, `EP02.mp4` and so on. Names like `ep 12 final.mov` or `Show_EP007_v2.mp4` work too; a file whose name has no clear episode number is refused rather than guessed. Three files upload at a time, each straight from the browser to Cloudflare (up to 200 MB each). A new upload for an existing episode replaces its video only once Cloudflare has finished converting it.

## Production

`npm run build` writes `dist/`. Caddy serves it on the admin subdomain and proxies `/v1` to the API on the same host, so no CORS setup is needed.

## Not built yet

- Staff accounts (the shared admin token is a stopgap)
- Cover and banner image upload to R2 (paste an image URL for now)
- Subtitle upload, Discover collections, scheduled releases
