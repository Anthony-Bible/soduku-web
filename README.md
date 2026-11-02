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

Requires Node 20+ and pnpm.

## Test

```sh
pnpm typecheck
pnpm lint
pnpm test       # Vitest + fast-check (core properties) + a few React Testing Library flows
```

A frozen test pins the v1 seed and puzzle for one date; changing the Daily generator breaks it on purpose.

## Deploy (Cloudflare Pages)

`wrangler.toml` sets `pages_build_output_dir = "dist"`.

- Git integration: build command `pnpm build`, output directory `dist`, Node 20.
- Or from the CLI: `pnpm build && pnpm dlx wrangler pages deploy dist --project-name sudoku-web`.

## Architecture

- `src/core` is pure TypeScript with no React or DOM (enforced by ESLint): board, solver, generator, SplitMix64 seeding, calendar days, Daily log and Streaks, statistics, Achievements, `GameState`, `GameSession` and `PlayerProfile`, and the save store.
- `src/platform` holds browser adapters: guarded `localStorage` (falls back to memory, so the app works without storage) and feature-detected `navigator.vibrate`.
- `src/app` holds the non-React `AppController`, exposed to React through `useSyncExternalStore`.
- `src/ui` holds the React components and `src/styles.css` (light/dark via `prefers-color-scheme`, safe-area insets, reduced-motion support).

Keyboard: digits 1-9 enter, Backspace/Delete erase, N toggles notes, Z or Ctrl+Z undo, arrows or hjkl move, P or Esc pause.
