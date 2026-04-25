#!/usr/bin/env bash
# Export the live OpenAPI spec from a running API to docs/openapi.json.
# Useful for committing a snapshot or sharing with someone who can't run
# the server. For Postman, you can also paste http://localhost:3001/openapi.json
# directly into the Import dialog — no export step needed.

set -euo pipefail

URL="${OPENAPI_URL:-http://localhost:3001/openapi.json}"
OUT="${1:-docs/openapi.json}"

mkdir -p "$(dirname "$OUT")"

if ! curl -fsS "$URL" -o "$OUT"; then
  echo "error: failed to fetch $URL — is the API running? (npm run dev)" >&2
  exit 1
fi

echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
