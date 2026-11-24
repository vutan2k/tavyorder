#!/bin/bash
# Giám sát price API + tunnel + độ tươi cache. Bắn Telegram khi có sự cố.
set -u
REPO=/Users/tan/tavy-korea
cd "$REPO" || exit 1

STATE=/tmp/tavy-monitor-state
LOG=/tmp/tavy-monitor.log
KEY=$(cat "$HOME/.config/tavy/price-api.key" 2>/dev/null || true)
TG_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2-)
TG_CHAT=$(grep -E '^TELEGRAM_CHAT_ID=' .env | cut -d= -f2-)

alert() {
  [ -n "${TG_TOKEN:-}" ] && [ -n "${TG_CHAT:-}" ] || return 0
  curl -s -m 10 "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d chat_id="${TG_CHAT}" -d parse_mode=HTML --data-urlencode text="$1" > /dev/null
}

LOCAL=$(curl -s -m 5 http://127.0.0.1:8787/health || true)
TUNNEL_URL=$(cat /tmp/tunnel_url.txt 2>/dev/null || true)
PUBLIC=""
if [ -n "$TUNNEL_URL" ]; then
  PUBLIC=$(curl -s -m 8 "$TUNNEL_URL/health" || true)
fi

TS=$(date '+%Y-%m-%d %H:%M:%S')
PROBLEMS=""

if ! echo "$LOCAL" | grep -q '"ok":true'; then
  PROBLEMS="${PROBLEMS}• price-api local chết\n"
fi
if [ -z "$TUNNEL_URL" ]; then
  PROBLEMS="${PROBLEMS}• không có tunnel URL\n"
elif ! echo "$PUBLIC" | grep -q '"ok":true'; then
  PROBLEMS="${PROBLEMS}• tunnel công khai không phản hồi ($TUNNEL_URL)\n"
fi

# cache mall quá 25 phút = sweep đang hỏng
CACHE_AGE=$(echo "$LOCAL" | python3 -c "import sys,json;
try:
 d=json.load(sys.stdin); print(int(d.get('newestCacheAgeSec') or -1))
except Exception: print(-1)" 2>/dev/null || echo -1)
if [ "$CACHE_AGE" != "-1" ] && [ "$CACHE_AGE" -gt 1500 ]; then
  PROBLEMS="${PROBLEMS}• cache giá cũ ${CACHE_AGE}s (>25 phút)\n"
fi

echo "$TS local=${LOCAL:0:40} public=${PUBLIC:0:40} cacheAge=$CACHE_AGE" >> "$LOG"

if [ -n "$PROBLEMS" ]; then
  # chỉ báo lại sau 30 phút nếu vẫn cùng sự cố
  LAST=$(cat "$STATE" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  if [ $((NOW - LAST)) -gt 1800 ]; then
    printf '%b' "🔴 <b>Tavy price API</b>\n${PROBLEMS}\n<i>${TS}</i>" | {
      MSG=$(cat)
      alert "$MSG"
    }
    echo "$NOW" > "$STATE"
  fi
else
  rm -f "$STATE"
fi
