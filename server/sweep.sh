#!/bin/bash
# Gọi Cloud Function priceSweep để verify các đơn pending chưa check giá.
set -u
URL_FILE="$HOME/.config/tavy/sweep.url"
KEY_FILE="$HOME/.config/tavy/sweep.key"
[ -f "$URL_FILE" ] && [ -f "$KEY_FILE" ] || exit 0
URL=$(cat "$URL_FILE")
KEY=$(cat "$KEY_FILE")
OUT=$(curl -s -m 300 -X POST "$URL" -H "x-sweep-key: $KEY" -H 'content-type: application/json' -d '{}')
TS=$(date '+%Y-%m-%d %H:%M:%S')
echo "$TS $OUT" | cut -c1-400 >> /tmp/tavy-sweep.log
