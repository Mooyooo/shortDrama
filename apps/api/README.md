# shortDrama API

Node/Express + Postgres. One stateless service: catalog, playback links, Cloudflare Stream webhooks, admin, and the coin wallet. Design: the System Architecture and Content Pipeline docs linked from `docs/HANDOFF.md`.

## Run locally

Needs Postgres (Homebrew `postgresql@15` works) and two local databases:

```bash
createdb shortdrama_dev && createdb shortdrama_test
cp .env.example .env          # set DATABASE_URL; ADMIN_TOKEN to use /v1/admin
npm run migrate               # apply db/migrations to shortdrama_dev
npm run seed:dev              # optional: the app's 5 sample series (set DEV_SAMPLE_VIDEOS=true)
npm run dev                   # http://localhost:3101
npm test                      # uses shortdrama_test (or TEST_DATABASE_URL), wiped each run
```

Cloudflare settings are optional locally. Routes that need them answer 503 until they are set.

## Endpoints

| Method and path | What it does |
| --- | --- |
| `GET /health` | Checks the database connection |
| `GET /v1/catalog/series` | Live series, cacheable for 60 s |
| `GET /v1/catalog/series/:slug` | One live series with its episodes, free or locked |
| `POST /v1/auth/guest`, `POST /v1/auth/logout` | Guest account and session token |
| `/v1/me` | Viewer, coins, account deletion, unlocks, blocks |
| `GET /v1/playback/episodes/:id` | Signed Cloudflare Stream HLS link; free episodes, or ones this viewer unlocked |
| `/v1/episodes/:id/comments`, `/v1/comments/:id` | Comments: list, post, delete own, report |
| `POST /v1/webhooks/stream` | Cloudflare Stream webhook: signature check, then the inbox table |
| `/v1/admin/*` | Series, publishing checks, episode and trailer upload links, comment moderation, bans. Bearer `ADMIN_TOKEN` for now |

## How money stays correct

`src/modules/wallet/wallet.ts`: append-only `coin_ledger`, balance updated in the same transaction, unique external ids so replays are harmless, and unlocks that lock the wallet row so a double tap charges once. The tests in `test/wallet.test.ts` cover each rule.

## Not built yet

- Sign in with Apple (guest accounts exist)
- Buying coins (RevenueCat)
- RevenueCat and AdMob webhooks
- Staff accounts for the admin (the shared `ADMIN_TOKEN` is a stopgap)
- Deployment: systemd unit, Caddy vhost and GitHub Actions deploy, following socialManager (see `docs/INFRA.md`)
