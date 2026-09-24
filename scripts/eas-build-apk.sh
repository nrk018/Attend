#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EAS="$ROOT/apps/mobile/eas.json"
if ! grep -q 'https://api.builditmuj.club' "$EAS"; then
  echo "eas.json must set EXPO_PUBLIC_API_URL to https://api.builditmuj.club" >&2
  exit 1
fi
cd "$ROOT/apps/mobile"
exec eas build --platform android --profile preview "$@"
