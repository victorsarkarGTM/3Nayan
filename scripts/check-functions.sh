#!/usr/bin/env bash
# Type-check every Edge Function entrypoint under real Deno (npm: imports resolved via deno.json).
set -euo pipefail
cd "$(dirname "$0")/../supabase/functions"
entries=$(ls -d */index.ts 2>/dev/null | grep -v '^_' || true)
[ -z "$entries" ] && { echo "no functions"; exit 0; }
DENO="${DENO:-npx --yes deno@2}"
$DENO check --config deno.json $entries
