#!/usr/bin/env bash
# Gate: API must work from this machine (run from a phone hotspot / cellular if possible).
set -euo pipefail
BASE="${1:-}"
if [[ -z "$BASE" ]]; then
  echo "Usage: $0 https://api.builditmuj.club" >&2
  exit 1
fi
BASE="${BASE%/}"

echo "GET ${BASE}/health"
code="$(curl -sS -o /tmp/attend-health.json -w '%{http_code}' --max-time 15 "${BASE}/health")"
echo "status ${code}"
cat /tmp/attend-health.json
echo
if [[ "$code" != "200" ]]; then
  echo "FAIL: /health" >&2
  exit 1
fi

echo "GET ${BASE}/docs"
docs="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "${BASE}/docs")"
echo "docs ${docs}"
if [[ "$docs" != "200" ]]; then
  echo "FAIL: /docs" >&2
  exit 1
fi

echo
echo "PASS: health + docs. Next: login + one photo from the phone on cellular (Wi-Fi off)."
