#!/usr/bin/env bash
# scripts/smoke-api.sh — exercises the backend end-to-end against a running server.
set -euo pipefail
BASE="${BASE:-http://localhost:5500}"
EMAIL="smoke-$(date +%s)@example.com"
PASS="longenough12345"
COOKIE="$(mktemp)"
trap 'rm -f "$COOKIE"' EXIT

curl -fsS -c "$COOKIE" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" "$BASE/api/auth/signup" >/dev/null

PK_ID=$(curl -fsS -b "$COOKIE" -c "$COOKIE" -H 'content-type: application/json' \
  -d '{"provider":"openai","apiKey":"sk-1234567890","label":"smoke"}' \
  "$BASE/api/provider-keys" | node -e 'process.stdin.once("data",d=>console.log(JSON.parse(d).key.id))')

VK_RESP=$(curl -fsS -b "$COOKIE" -c "$COOKIE" -H 'content-type: application/json' \
  -d "{\"providerKeyId\":$PK_ID,\"label\":\"smoke\"}" "$BASE/api/virtual-keys")
SECRET=$(node -e "console.log(JSON.parse(\`$VK_RESP\`).secret)")

curl -fsS -H "X-Meridian-Key: $SECRET" -H 'content-type: application/json' \
  -d '{"provider":"openai","model":"gpt-4.1-mini","promptTokens":100,"completionTokens":100,"status":"ok"}' \
  "$BASE/api/v1/requests" >/dev/null

KPI=$(curl -fsS -b "$COOKIE" "$BASE/api/kpi/overview")
echo "$KPI" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); if(d.totalRequests!==1)throw new Error("expected 1 request, got "+d.totalRequests); console.log("smoke ok:",d);'
