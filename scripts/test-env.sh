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

echo "→ migrating"
npm run db:migrate >/dev/null

PIDS=()
cleanup() {
  [ "$KEEP" = "1" ] && return
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT

# Reuse a server that is already up, so running the suite twice in a row
# during development does not fight itself over port 3000.
if curl -sf -o /dev/null --max-time 2 "$E2E_BASE_URL/"; then
  echo "→ using the server already on $E2E_BASE_URL"
else
  echo "→ starting the server"
  npm run dev >/tmp/demoriff-dev.log 2>&1 &
  PIDS+=($!)
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
  npm run worker >/tmp/demoriff-worker.log 2>&1 &
  PIDS+=($!)
  sleep 3
fi

echo "→ running the end-to-end suite"
npx tsx --test "tests/e2e/**/*.test.ts"
