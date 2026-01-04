#!/usr/bin/env bash
# Usage: ./smoke/get_token.sh
# Adjust BASE_URL, AUTH_PATH, and JSON_PAYLOAD as needed.
BASE_URL="${BASE_URL:-http://localhost:8000}"
AUTH_PATH="${AUTH_PATH:-/auth/login}"
JSON_PAYLOAD="${JSON_PAYLOAD:-{\"username\":\"test\",\"password\":\"test\"}}"
OUT_FILE="smoke/token.txt"

resp=$(curl -s -X POST -H "Content-Type: application/json" -d "$JSON_PAYLOAD" "${BASE_URL}${AUTH_PATH}")
token=$(echo "$resp" | jq -r '.token // .access_token // .accessToken // empty')

if [ -z "$token" ]; then
  echo "No token found in response:"
  echo "$resp"
  exit 1
fi

echo "$token" > "$OUT_FILE"
echo "Saved token to $OUT_FILE"
