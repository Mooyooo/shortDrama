# Handoff — 2026-09-30 (afternoon)

Read this first in a new session. Plan: [docs/PLAN.md](PLAN.md). Design docs: [Content Pipeline](https://claude.ai/code/artifact/8f2a7069-7db2-4fef-893e-59eb6f42512b), [System Architecture](https://claude.ai/code/artifact/f130be47-bed7-427c-b9fa-a1f281f991b3). Servers and Cloudflare: [docs/INFRA.md](INFRA.md), which is on disk but deliberately not committed (see below).

## 2026-09-30 daytime work (committed locally, not pushed)

| Commit | What |
| --- | --- |
| `92cff84` | Like / save / comments / share column on episodes and the feed; vertical series poster |
| `5b563a4` | API: guest accounts, sessions (hashed tokens), `/v1/me`, coin unlocks, account deletion |
| `2550183` | API: comments with Apple guideline 1.2 moderation (filter, reports, auto-hide, blocks, bans) |
| `6071756` | Admin: Moderation page |
| `d00d34a` | API: trailer links and uploads; `DEV_SAMPLE_VIDEOS` + `npm run seed:dev` for local testing |
| `0208de6` | App ↔ API: data layer with sample fallback, signed episode links, unlocks, real comments |
| `d036690` | App: Profile tab (coins, viewer ID, delete account); admin "Give coins" |

API tests: 41 passing. The app bundles in both modes (sample data and API).

## Overnight work (all committed locally, none pushed)

| Commit | What |
| --- | --- |
| `1ee0be6` | Series detail screen, CI workflow |
| `69c01d9` | Full-screen episode player: swipe for next, auto-play next, episode drawer, placeholder unlock sheet |
| `9bfa5e3` | My List: continue watching with progress, saved series (on the phone, `expo-sqlite` key-value store) |
| `9276fdc` | Monorepo: the Expo app moved to `apps/mobile` (npm workspaces) |
| `dafacb3` | `apps/api`: Node/Express + Postgres API with 22 passing tests |
| `84b7eab` | `apps/admin`: React web admin (series, publishing, bulk episode upload) |
| `2263a42` | Discover tab: banners, genre chips, Trending/New/Top rows |

Every commit passed lint and typecheck; the app bundles for iOS; the API tests run against a real local Postgres.

## Waiting on the user

1. **Push.** Pushing was blocked for the rest of that session, so all 7 commits are local. Run `git push`.
2. **`docs/INFRA.md`.** The safety check refused to commit it because it copies socialManager's server IPs, paths and bucket names into this repo. Decide: commit it yourself, keep it local only, or have Claude replace the IPs with a pointer to socialManager's `CLAUDE.md`.
3. **Architecture doc diagram.** New labels (Cloudflare Stream, Postgres on KVM4) are staged but unpublished, because publishing was blocked. Publish the draft in the doc, or let Claude retry.
4. **Launch market and domain.** Needed for the API and admin subdomains.
5. **Apple Developer Program** ($99 a year) for TestFlight and Sign in with Apple.

## Try the app against the local API (from your Mac)

```bash
# terminal 1: the API with the five sample series (apps/api/.env has DEV_SAMPLE_VIDEOS=true)
cd ~/projects/shortDrama/apps/api && npm run seed:dev && npm run dev
# terminal 2: the app, pointed at the Mac's LAN address (was 192.168.1.84 on 2026-09-30)
cd ~/projects/shortDrama/apps/mobile
echo "EXPO_PUBLIC_API_URL=http://$(ipconfig getifaddr en0):3101" > .env
npx expo start --clear
```

- `--clear` matters: the API address is built into the bundle, so a changed `.env` needs it.
- Coins for testing: copy your viewer ID from the Profile tab, then in the admin (Moderation → Give coins), or
  `curl -X POST -H 'Authorization: Bearer local-dev-token' -H 'Content-Type: application/json' -d '{"amount":100,"reference":"test-1"}' localhost:3101/v1/admin/users/<viewer id>/coins`.
- Back to sample data: empty `apps/mobile/.env` and restart with `--clear`.
- macOS may ask to allow incoming connections for `node`; allow it, or the phone can't reach the API.

## Try it on the phone (sample data)

```bash
cd ~/projects/shortDrama/apps/mobile && npx expo start
```

- **For You:** "Watch full series" opens the series page.
- **Series page:** Play or tap any episode to open the player; bookmark (top right) saves it.
- **Player:** swipe up for the next episode; when one ends, the next starts. Episodes 1–8 or so are free (varies by series); later ones show the unlock sheet (placeholder). Close with the arrow at top left.
- **My List:** shows what you started and saved; tapping resumes where you stopped.
- **Discover:** banners, genre chips filter the rows.

All videos are still the public test streams; every episode of a series plays the same clip.

## Layout

```
apps/mobile      Expo app (run expo commands here)
apps/api         Node/Express API (README inside)
apps/admin       React web admin (README inside)
packages/shared  API types shared by all three
```

Install from the repo root (`npm install`). Root scripts: `npm run lint`, `npm run typecheck`, `npm test --workspaces --if-present`.

## API and admin, run locally

Local Postgres 15 (Homebrew) has `shortdrama_dev` (migrated) and `shortdrama_test` (wiped by each test run). `apps/api/.env` points at the dev database (gitignored).

```bash
cd apps/api && ADMIN_TOKEN=local-dev-token npm run dev    # :3101
cd apps/admin && npm run dev                              # :5174, sign in with local-dev-token
```

A smoke test through the admin's proxy worked: create a series, publish refused with the right problems, uploads answer "not configured" (no Cloudflare Stream settings yet).

## Decisions made overnight (change them if you disagree)

- **Monorepo tooling:** npm workspaces (the project already used npm).
- **API:** TypeScript, Express 5, plain SQL migrations in `apps/api/db/migrations` (numbered, like socialManager), a tiny migration runner (`npm run migrate`), Vitest 3 (Vitest 5 needs Node 22.12+; this Mac has 22.2).
- **Every episode, free or locked, plays through a signed link** the API makes itself (RS256, no Cloudflare call per view). Locked episodes answer 402 until viewer sign-in exists.
- **Replacing a video** waits in `episodes.pending_video_id` until Cloudflare says it's ready, so viewers never see a broken episode.
- **Admin sign-in** is a shared `ADMIN_TOKEN` for now; staff accounts come later.
- **Admin hosting:** Caddy serves the admin's static files and proxies `/v1` to the API on the same host, so there's no CORS.
- **React 19.2.3 pinned exactly** in the admin to match the Expo app (duplicate React breaks monorepos).

## Next steps

0. The app name (shortlist in memory: Tizzy, Plotbite, Dramlet, Cliffline, Scandl, Sagaly), before the first TestFlight build.
1. With the user: create shortDrama's resources on socialManager's infrastructure (list in `docs/INFRA.md`): databases on KVM4, enable Cloudflare Stream, signing key, webhook, R2 bucket, subdomains, then a deploy workflow and systemd unit for the API modelled on socialManager's.
2. Sign in with Apple, attached to the existing guest account (needs the Apple membership and an EAS development build).
3. Sync watch progress, likes and My List to the API (they're still on the phone only).
4. Phase 3: RevenueCat coin packs and VIP wired to `creditCoins` / `unlockWithCoins`, then AdMob.
5. Later: EAS (`eas init`, build profiles, TestFlight).

## Context worth knowing

- The user runs Scale Agent AI (socialManager repo). Its rules don't apply here unless restated in `CLAUDE.md`.
- Product model: DramaBox (free first episodes, then coins, VIP, rewarded ads). We produce our own series, English only at launch; only our team uploads.
- GitHub: https://github.com/Mooyooo/shortDrama (private), branch `master`, pushes over HTTPS with the macOS Keychain login. `gh` is installed but not logged in.
- Expo account uses Google sign-in: `npx expo login --browser`.
- Node on this Mac is 22.2.0; Expo 57 and newer tools want 22.13+. Upgrading Node is worth doing.
