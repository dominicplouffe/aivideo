#!/usr/bin/env bash
#
# Brings up everything the end-to-end suite needs, runs it, and tears down
# what it started.
#
#   scripts/test-env.sh              # migrate, start server + worker, run e2e
#   scripts/test-env.sh --keep       # leave the server and worker running
#
# It deliberately does NOT seed. The suite creates its own workspaces through
# the real signup route, because a workspace that has just been created is
# the state this whole suite exists to check.
#
set -euo pipefail

cd "$(dirname "$0")/.."

KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

: "${DATABASE_URL:=postgres://postgres:postgres@localhost:5432/demoriff}"
: "${E2E_BASE_URL:=http://localhost:3000}"
: "${STORAGE_LOCAL_ROOT:=./.storage}"
export DATABASE_URL E2E_BASE_URL STORAGE_LOCAL_ROOT

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: $1 is not on PATH. $2" >&2
    exit 1
  }
}

# ffmpeg is not optional: the render tests assert on a real encoded file, and
# a suite that skipped them would go green while rendering was broken.
need psql   "Install the postgres client."
need ffmpeg "Install ffmpeg (apt-get install -y ffmpeg)."
need ffprobe "ffprobe ships with ffmpeg."

# Chromium is not optional either, for the same reason ffmpeg is not: the
# browser test skips itself when it cannot launch one, and a skip is easy to
# read as a pass — the only tell is the `# skipped` line at the very bottom.
# It sweeps every page for hydration errors and overflow, so a run without it
# has checked markup and nothing else.
#
# CI installs a matching build before it gets here. Locally, Playwright's own
# build is often a different revision from the one in node_modules, so fall
# back to any Chromium that is actually present rather than skipping.
if [ -z "${CHROMIUM_PATH:-}" ]; then
  CHROMIUM_PATH=$(node -e '
    const { existsSync } = require("node:fs");
    const candidates = [];
    try { candidates.push(require("playwright").chromium.executablePath()); } catch {}
    candidates.push(
      process.env.PLAYWRIGHT_BROWSERS_PATH
        ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`
        : "",
    );
    for (const c of candidates) if (c && existsSync(c)) { console.log(c); break; }
  ' 2>/dev/null || true)
fi
if [ -z "${CHROMIUM_PATH:-}" ]; then
  for exe in chromium chromium-browser google-chrome; do
    CHROMIUM_PATH=$(command -v "$exe" 2>/dev/null) && break
  done
fi
[ -x "${CHROMIUM_PATH:-}" ] || {
  echo "error: no Chromium to run the browser test with." >&2
  echo "  Install one with \`npx playwright install chromium\`, or point" >&2
  echo "  CHROMIUM_PATH at an existing browser." >&2
  exit 1
}
export CHROMIUM_PATH
echo "→ browser: $CHROMIUM_PATH"

echo "→ migrating"
npm run db:migrate >/dev/null

PIDS=()

# `npm run dev` is a wrapper: killing it leaves the `next-server` it spawned
# holding port 3000, and killing `npm run worker` leaves a worker holding a
# connection to the database. Both survived every run until now, which is why
# a later `dropdb` reported the database "being accessed by other users" and
# why a second run would quietly reuse a worker built from an older checkout.
# Start each one in its own process group and signal the group.
start_group() {
  setsid "$@" &
  PIDS+=($!)
}

cleanup() {
  [ "$KEEP" = "1" ] && return
  for pid in "${PIDS[@]:-}"; do
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

# Reuse a server that is already up, so running the suite twice in a row
# during development does not fight itself over port 3000.
if curl -sf -o /dev/null --max-time 2 "$E2E_BASE_URL/"; then
  echo "→ using the server already on $E2E_BASE_URL"
else
  echo "→ starting the server"
  start_group npm run dev >/tmp/demoriff-dev.log 2>&1
  for _ in $(seq 1 60); do
    curl -sf -o /dev/null --max-time 2 "$E2E_BASE_URL/" && break
    sleep 1
  done
  curl -sf -o /dev/null --max-time 2 "$E2E_BASE_URL/" || {
    echo "error: the server did not come up. Last lines:" >&2
    tail -20 /tmp/demoriff-dev.log >&2
    exit 1
  }
fi

if pgrep -f "render/scripts/worker" >/dev/null; then
  echo "→ using the worker already running"
else
  echo "→ starting the render worker"
  start_group npm run worker >/tmp/demoriff-worker.log 2>&1
  sleep 3
fi

echo "→ running the end-to-end suite"
#
# One file at a time. These four files share a single `next dev` server, a
# single database, a single render worker and a CPU-bound encoder, and the
# runner's default is to run files in parallel. That combination is not a
# throughput test of anything real — `next dev` compiles routes on demand and
# is not how the product serves traffic — but it did produce a failure: with
# the browser sweep and the page sweep both running, the server's accept
# queue filled, a `POST /api/recordings` from the pipeline file never got a
# connection, and the test failed ten seconds later having never reached the
# server at all. Nothing was wrong with the product; the suite was competing
# with itself. Serial is a few minutes slower and says the same thing twice.
npx tsx --test --test-concurrency=1 "tests/e2e/**/*.test.ts"
