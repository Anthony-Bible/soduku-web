# Sudoku (web)

A full-parity web PWA version of the iPhone Sudoku app: four difficulties with unique-solution puzzles, notes, hints, a Daily Puzzle with Streaks and a Calendar, per-difficulty statistics and 23 Achievements. It installs to the home screen and works offline.

Vocabulary follows [CONTEXT.md](CONTEXT.md). The decision to keep a separate TypeScript core is in [docs/adr/0001](docs/adr/0001-typescript-core-independent-of-the-apps.md). Daily Puzzles are deterministic per date but do **not** match the iPhone app's puzzles.

## Run

```sh
pnpm install
pnpm dev        # dev server
pnpm build      # typecheck + production build into dist/ (includes service worker and manifest)
pnpm preview    # serve the production build
```

Requires pnpm and Node 22+ (Wrangler 4 needs it).

## Test

```sh
pnpm typecheck
pnpm lint
pnpm test       # Vitest + fast-check (core properties) + a few React Testing Library flows
```

A frozen test pins the v1 seed and puzzle for one date; changing the Daily generator breaks it on purpose.

## Accounts and sync

Signing in is optional and invite-only; the app plays the same Signed Out. An Account syncs Statistics, the Daily log, Achievements and the Game in progress across devices. The merge rules are in [docs/adr/0002](docs/adr/0002-sync-merges-records-and-never-resets.md); the vocabulary (Account, Invite List, Sign-in Email, Magic Link, Sign-in Code) is in [CONTEXT.md](CONTEXT.md).

One Cloudflare Worker (`worker/`) serves the built app from `dist/` as static assets and handles `/api/*` and `/auth/*`:

- **D1** (`migrations/`) holds `invites`, `accounts`, `sign_in_emails`, `sessions` and `sync_docs`. Magic Link tokens, Sign-in Codes and session tokens are stored only as SHA-256 hashes.
- **AWS SES v2** sends Sign-in Emails over HTTPS (`us-west-2`), signed with SigV4 by `aws4fetch`. The sender sits behind a `Mailer` interface, so tests use a fake.
- `POST /api/sync` merges the device's whole document into the Account's using the same pure functions as the client (`src/core/syncDoc.ts`), guarded by a version column, and returns the merged document.
- Each address gets at most 5 Sign-in Emails an hour and 10 a day, and each Sign-in Email allows 5 wrong codes, so a Sign-in Code can't be brute-forced.
- The Magic Link page (`GET /auth/link`) never spends the link, because mail scanners prefetch links. Its button POSTs to `/api/auth/link`.
- State-changing endpoints are JSON `POST`s and check `Origin`. The session cookie is `HttpOnly; Secure; SameSite=Lax`, lasts a year and slides on each sync.
- The service worker never precaches or serves the app shell for `/api/*` and `/auth/*`.

### Local development

```sh
pnpm db:migrate:local       # creates the local D1 database in .wrangler/
pnpm build                  # the Worker serves dist/ as assets
pnpm dev:worker             # wrangler dev on http://localhost:8787
pnpm dev                    # Vite on :5173, proxying /api and /auth to the Worker
```

Put local overrides in `.dev.vars` (git-ignored). Sending a real Sign-in Email locally needs working SES credentials; without them the send fails (it is logged by the Worker) and the sign-in endpoints still behave the same. Tests cover the sign-in flow with a fake sender.

```
APP_ORIGIN=http://localhost:8787
EXTRA_ORIGINS=http://localhost:5173
AWS_ACCESS_KEY_ID=...        # only if you want to really send mail
AWS_SECRET_ACCESS_KEY=...
```

Add yourself to the local Invite List with `pnpm exec wrangler d1 execute sudoku --local --command "INSERT INTO invites (email) VALUES ('you@example.com')"`.

Worker tests run the real SQL on SQLite (sql.js) behind a small D1 stand-in, so `pnpm test` needs no Cloudflare or AWS access.

### One-time setup (you do this once)

1. The D1 database `sudoku` was created with `pnpm exec wrangler d1 create sudoku` (Wrangler needs Node 22+); its id is in `wrangler.jsonc`.
2. In AWS SES, region `us-west-2`: create a domain identity for `sudoku.anthony.bible` and add its three DKIM CNAME records in Cloudflare DNS. Ask AWS to move the account out of the SES sandbox, or only verified addresses can receive mail.
3. Create an IAM user whose only permission is `ses:SendEmail` on that identity's ARN, and make an access key for it.
4. Store the keys as Worker secrets (never in a file): `pnpm exec wrangler secret put AWS_ACCESS_KEY_ID` and `pnpm exec wrangler secret put AWS_SECRET_ACCESS_KEY`.
5. Create a Cloudflare API token for CI and save it as the `CLOUDFLARE_API_TOKEN` GitHub Actions secret, with these permissions: Workers Scripts: Edit; D1: Edit; Workers Routes (Custom Domains) on the `anthony.bible` zone; DNS: Edit on that zone.

CI (`.github/workflows/deploy.yml`) runs typecheck, lint, test and build on every pull request and push. Pull requests also run `wrangler deploy --dry-run`. A push to `main` runs `wrangler d1 migrations apply sudoku --remote` and then `wrangler deploy`. The account ID is set in the workflow.

### Admin

There is no admin UI. Emails are lowercase. Run these against production (`--remote`):

Addresses on the Invite List must be lowercase with no spaces; the database rejects anything else.

```sh
# Add someone to the Invite List
pnpm exec wrangler d1 execute sudoku --remote --command "INSERT OR IGNORE INTO invites (email) VALUES ('friend@example.com')"

# Remove someone. Their next sync is refused and their sessions are deleted.
pnpm exec wrangler d1 execute sudoku --remote --command "DELETE FROM invites WHERE email = 'friend@example.com'"

# Sign someone out everywhere (they can sign in again if still invited)
pnpm exec wrangler d1 execute sudoku --remote --command "DELETE FROM sessions WHERE account_id IN (SELECT id FROM accounts WHERE email = 'friend@example.com')"

# Delete an Account and all its data (sessions and synced document go with it)
pnpm exec wrangler d1 execute sudoku --remote --command "DELETE FROM accounts WHERE email = 'friend@example.com'"
pnpm exec wrangler d1 execute sudoku --remote --command "DELETE FROM sign_in_emails WHERE email = 'friend@example.com'"

# List the Invite List and Accounts
pnpm exec wrangler d1 execute sudoku --remote --command "SELECT i.email, a.created_at FROM invites i LEFT JOIN accounts a ON a.email = i.email"
```

To remove someone for good, delete the Account and also remove the invite.

## Architecture

- `src/core` is pure TypeScript with no React or DOM (enforced by ESLint): board, solver, generator, SplitMix64 seeding, calendar days, Daily log and Streaks, Achievements, `GameState`, `GameSession` and `PlayerProfile`, the sync document and its merge, and the save store.
- `src/platform` holds browser adapters: guarded `localStorage` (falls back to memory, so the app works without storage), feature-detected `navigator.vibrate`, and the HTTP API client.
- `src/app` holds the non-React `AppController` and `SyncManager`, exposed to React through `useSyncExternalStore`.
- `worker/` is the Cloudflare Worker (own `tsconfig.json`, Workers types).
- `src/ui` holds the React components and `src/styles.css` (light/dark via `prefers-color-scheme`, safe-area insets, reduced-motion support).

Keyboard: digits 1-9 enter, Backspace/Delete erase, N toggles notes, Z or Ctrl+Z undo, arrows or hjkl move, P or Esc pause.

## Lettergrid Word List

Lettergrid's Word List is a frozen, versioned artifact at `public/lettergrid/wordlist-v1.txt` (about 238 KB, 81 KB gzipped), built from SCOWL/ESDB; see [NOTICES.md](NOTICES.md) for the source, parameters and licence. The app loads it only when Lettergrid opens (`src/app/wordListLoader.ts`), and the service worker caches it for offline play. It is not precached, so Sudoku's first load is unchanged.

To build a version from two SCOWL exports (size 60 and size 35, see NOTICES.md for the parameters) and ESDB's `data/scowl-pre.txt` (which tags abbreviations):

```sh
pnpm wordlist path/to/scowl-60.txt path/to/scowl-35.txt path/to/esdb/data/scowl-pre.txt 1e5b7d3
```

The last argument is the ESDB git revision the inputs came from; it is written into the artifact. To also check the committed artifact against its source in `pnpm test`, set `LETTERGRID_SCOWL_60`, `LETTERGRID_SCOWL_35` and `LETTERGRID_SCOWL_PRE` to the three input paths; the test is skipped when they are unset.

This writes the artifact and `src/core/lettergrid/letterValuesV<N>.ts`, and refuses to overwrite either: published Dailies are judged forever against the version they were published with (ADR 0003), so a changed list is a new version (bump `CURRENT_WORD_LIST_VERSION`, write `wordlist-v2.txt`, register its values in `letterValuesTable.ts`), never an edit of v1. A test pins the SHA-256 of v1.
