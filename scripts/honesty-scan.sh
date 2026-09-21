#!/usr/bin/env bash
#
# Every authenticated page, for a freshly created account, must render (200)
# and must not contain a single string from the seeded workspace.
#
# Both halves matter. An earlier version of this scan checked only for the
# strings, and reported /app/analytics clean while that page was returning
# 500 on every request — a page that does not render contains nothing, which
# is not the same as a page that renders honestly.
#
#   scripts/honesty-scan.sh <cookie-jar> [base-url]
#
set -uo pipefail

JAR="${1:?usage: honesty-scan.sh <cookie-jar> [base-url]}"
BASE="${2:-http://localhost:3000}"

PAGES=(
  /app /app/projects /app/analytics /app/localization /app/team /app/billing
  /app/brand /app/voices /app/guides /app/demos /app/agent /app/settings /app/new
)

# Names, domains and figures that exist only in lib/db/scripts/fixtures.ts.
NEEDLES=(
  "Meridian" "Renata" "Daniel Okafor" "Priya Raman" "Jonas Weber" "Sofia Benali"
  "cardinal.com" "northwind.io" "halcyon.security" "tessera.dev" "arcwell.health"
  "Pricing page embed" "Direct share link" "Launch email"
  "Rate shopping" "Meridian Dark" "Partner co-brand"
)

fail=0

for page in "${PAGES[@]}"; do
  body="$(mktemp)"
  code=$(curl -s -b "$JAR" -o "$body" -w "%{http_code}" "$BASE$page")

  if [ "$code" != "200" ]; then
    printf 'FAIL %-22s HTTP %s\n' "$page" "$code"
    fail=1
    rm -f "$body"
    continue
  fi

  hits=""
  for needle in "${NEEDLES[@]}"; do
    if grep -qiF -- "$needle" "$body"; then hits="$hits [$needle]"; fi
  done

  if [ -n "$hits" ]; then
    printf 'FAIL %-22s 200 but contains:%s\n' "$page" "$hits"
    fail=1
  else
    printf 'ok   %-22s 200, no fixture strings\n' "$page"
  fi
  rm -f "$body"
done

if [ "$fail" -eq 0 ]; then
  echo "PASS — every authenticated page renders, none shows another workspace's data."
else
  echo "FAIL — see above."
fi
exit "$fail"
