#!/bin/sh
# Starts the Worker for Playwright on a fresh local D1 database. Expects dist/ to be built already.
set -e
: "${E2E_PORT:?set by playwright.config.ts}"
STATE=.wrangler/e2e
[ -f dist/index.html ] || { echo "dist/ is missing: run pnpm build first" >&2; exit 1; }
rm -rf "$STATE"
mkdir -p "$STATE"
./node_modules/.bin/wrangler d1 migrations apply sudoku --local --persist-to "$STATE" >/dev/null
# Keep the real localhost origin (not the production route) so the Origin check matches APP_ORIGIN.
# An env file, not --var: --var cuts values at the colon in "http://".
# The AWS keys are placeholders. The mailer needs some to start, SES rejects them, the failure is only
# logged, and the tests put their own Sign-in Code into D1 instead (e2e/db.ts).
cat > "$STATE/e2e.env" <<VARS
APP_ORIGIN=http://localhost:$E2E_PORT
AWS_ACCESS_KEY_ID=e2e-placeholder
AWS_SECRET_ACCESS_KEY=e2e-placeholder
VARS
exec ./node_modules/.bin/wrangler dev --port "$E2E_PORT" --ip 127.0.0.1 --persist-to "$STATE" \
  --env-file "$STATE/e2e.env" --infer-origin-from-routes=false --show-interactive-dev-session=false
