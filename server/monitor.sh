#!/bin/bash
# Giám sát + TỰ PHỤC HỒI price API / tunnel / cache.
# - local chết hoặc mall fetch treo 3 lần liên tiếp → restart price-api
# - tunnel công khai chết 3 lần liên tiếp → restart tunnel
# - báo Telegram (gộp, tối đa 30 phút/lần)
set -u
REPO=/Users/tan/tavy-korea
cd "$REPO" || exit 1
UID_N=$(id -u)

STATE=/tmp/tavy-monitor-state
LOG=/tmp/tavy-monitor.log
MALL_FAILS=/tmp/tavy-mall-fails
TUN_FAILS=/tmp/tavy-tunnel-fails
RESTART_STAMP=/tmp/tavy-last-restart
MALL_URL='https://www.lotteon.com/p/product/LE1205034989?sitmNo=LE1205034989_1227450322&mall_no=1'

TG_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2-)
TG_CHAT=$(grep -E '^TELEGRAM_CHAT_ID=' .env | cut -d= -f2-)

alert() {
  [ -n "${TG_TOKEN:-}" ] && [ -n "${TG_CHAT:-}" ] || return 0
  curl -s -m 10 "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d chat_id="${TG_CHAT}" -d parse_mode=HTML --data-urlencode text="$1" > /dev/null
}

restart_service() {
  local label="$1"
  local now last
  now=$(date +%s)
  last=$(cat "$RESTART_STAMP" 2>/dev/null || echo 0)
  # không restart quá 1 lần / 5 phút
  if [ $((now - last)) -lt 300 ]; then
    return 1
  fi
  echo "$now" > "$RESTART_STAMP"
  launchctl kickstart -k "gui/${UID_N}/${label}" >/dev/null 2>&1
  return 0
}

incr() { local f="$1"; local n; n=$(cat "$f" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$f"; echo "$n"; }
reset() { rm -f "$1"; }

LOCAL=$(curl -s -m 5 http://127.0.0.1:8787/health || true)
TUNNEL_URL=$(cat /tmp/tunnel_url.txt 2>/dev/null || true)
PUBLIC=""
if [ -n "$TUNNEL_URL" ]; then
  PUBLIC=$(curl -s -m 8 "$TUNNEL_URL/health" || true)
fi

TS=$(date '+%Y-%m-%d %H:%M:%S')
PROBLEMS=""
ACTIONS=""

# 1. price-api local chết → restart ngay
if ! echo "$LOCAL" | grep -q '"ok":true'; then
  PROBLEMS="${PROBLEMS}• price-api local chết\n"
  if restart_service com.tavy.priceapi; then ACTIONS="${ACTIONS}• đã restart price-api\n"; fi
else
  # 2. local sống nhưng mall scrape treo (Playwright kẹt) → probe chủ động
  PROBE=$(curl -s -m 40 "http://127.0.0.1:8787/price?force=1&url=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$MALL_URL")" || true)
  if echo "$PROBE" | grep -q '"ok":true'; then
    reset "$MALL_FAILS"
  else
    N=$(incr "$MALL_FAILS")
    PROBLEMS="${PROBLEMS}• mall scrape fail (${N}/3)\n"
    if [ "$N" -ge 3 ]; then
      if restart_service com.tavy.priceapi; then
        ACTIONS="${ACTIONS}• mall treo → đã restart price-api\n"
        reset "$MALL_FAILS"
      fi
    fi
  fi
fi

# 3. tunnel
if [ -z "$TUNNEL_URL" ]; then
  PROBLEMS="${PROBLEMS}• không có tunnel URL\n"
else
  if echo "$PUBLIC" | grep -q '"ok":true'; then
    reset "$TUN_FAILS"
  else
    N=$(incr "$TUN_FAILS")
    PROBLEMS="${PROBLEMS}• tunnel không phản hồi (${N}/3)\n"
    if [ "$N" -ge 3 ]; then
      if restart_service com.tavy.tunnel; then
        ACTIONS="${ACTIONS}• đã restart tunnel\n"
        reset "$TUN_FAILS"
      fi
    fi
  fi
fi

# 4. cache mall quá 25 phút = sweep hỏng
CACHE_AGE=$(echo "$LOCAL" | python3 -c "import sys,json;
try:
 d=json.load(sys.stdin); print(int(d.get('newestCacheAgeSec') or -1))
except Exception: print(-1)" 2>/dev/null || echo -1)
if [ "$CACHE_AGE" != "-1" ] && [ "$CACHE_AGE" -gt 1500 ]; then
  PROBLEMS="${PROBLEMS}• cache giá cũ ${CACHE_AGE}s (>25 phút)\n"
fi

echo "$TS local=${LOCAL:0:40} public=${PUBLIC:0:40} cacheAge=$CACHE_AGE actions=${ACTIONS:0:60}" >> "$LOG"

if [ -n "$PROBLEMS" ] || [ -n "$ACTIONS" ]; then
  LAST=$(cat "$STATE" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  if [ $((NOW - LAST)) -gt 1800 ]; then
    MSG=$(printf '%b' "🔴 <b>Tavy price API</b>\n${PROBLEMS}${ACTIONS}\n<i>${TS}</i>")
    alert "$MSG"
    echo "$NOW" > "$STATE"
  fi
else
  rm -f "$STATE"
fi

# 5. Sweep tồn kho OY luân phiên mỗi 15 phút (dùng chung launchd monitor)
OY_LAST=/tmp/tavy-oystock-last
OY_NOW=$(date +%s)
OY_PREV=$(cat "$OY_LAST" 2>/dev/null || echo 0)
if [ $((OY_NOW - OY_PREV)) -ge 900 ]; then
  echo "$OY_NOW" > "$OY_LAST"
  ( cd "$REPO" && env -u PYTHONPATH /usr/bin/python3 server/oy_stock_sweep.py >> /tmp/tavy-oystock.log 2>&1 & )
fi
