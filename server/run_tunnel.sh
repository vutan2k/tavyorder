#!/bin/bash
# Quick tunnel wrapper: giữ cloudflared sống, cập nhật Firestore khi URL đổi.
set -u
cd /Users/tan/tavy-korea || exit 1
LOG=/tmp/cloudflared.log
: > "$LOG"

/Users/tan/bin/cloudflared tunnel --url http://127.0.0.1:8787 --no-autoupdate >> "$LOG" 2>&1 &
CF=$!

U=""
for _ in $(seq 1 30); do
  U=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1)
  [ -n "$U" ] && break
  sleep 2
done

if [ -n "$U" ]; then
  OLD=$(cat /tmp/tunnel_url.txt 2>/dev/null || true)
  if [ "$U" != "$OLD" ]; then
    echo "$U" > /tmp/tunnel_url.txt
    /usr/local/bin/node scripts/set_price_api_config.mjs >> /tmp/price-config.log 2>&1
  fi
fi

wait $CF
