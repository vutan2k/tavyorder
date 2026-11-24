#!/usr/bin/env bash
# rollback.sh — Đường lui cho đợt nâng cấp Catalog 150 SKU + Live Price
# Checkpoint: 24/11/2026
#
# Dùng:
#   ./scripts/rollback.sh --check          # chỉ kiểm tra, không đụng gì
#   ./scripts/rollback.sh code             # back code (git tag), giữ an toàn WIP hiện tại
#   ./scripts/rollback.sh data             # back Firestore từ bản export GCS
#   ./scripts/rollback.sh all              # back cả code + data
#
# Biến môi trường có thể override: TAG, EXPORT_URI, PROJECT
set -euo pipefail

REPO="${REPO:-/Users/tan/tavy-korea}"
PROJECT="${PROJECT:-tavyorder}"
TAG="${TAG:-checkpoint/pre-upgrade-20261124}"
EXPORT_URI="${EXPORT_URI:-gs://tavyorder-firestore-backups-us/checkpoint-20261124}"

GCLOUD="${GCLOUD:-$HOME/google-cloud-sdk/bin/gcloud}"
export CLOUDSDK_PYTHON="${CLOUDSDK_PYTHON:-$(ls -d "$HOME"/.hermes/tools/python-*/bin/python3 2>/dev/null | head -1)}"

log() { printf '[rollback] %s\n' "$*"; }
die() { printf '[rollback][LỖI] %s\n' "$*" >&2; exit 1; }

adc_token() {
  env -u PYTHONPATH python3 - <<'PY'
import json, os, urllib.parse, urllib.request
p = os.path.expanduser('~/.config/gcloud/application_default_credentials.json')
d = json.load(open(p))
data = urllib.parse.urlencode({
    'client_id': d['client_id'],
    'client_secret': d['client_secret'],
    'refresh_token': d['refresh_token'],
    'grant_type': 'refresh_token',
}).encode()
r = json.load(urllib.request.urlopen(
    urllib.request.Request('https://oauth2.googleapis.com/token', data=data), timeout=25))
print(r['access_token'])
PY
}

need_gcloud() {
  [ -x "$GCLOUD" ] || die "Không thấy gcloud tại $GCLOUD"
  export CLOUDSDK_AUTH_ACCESS_TOKEN="${CLOUDSDK_AUTH_ACCESS_TOKEN:-$(adc_token)}"
}

check() {
  log "Repo:        $REPO"
  log "Tag code:    $TAG"
  log "Export data: $EXPORT_URI"
  git -C "$REPO" rev-parse -q --verify "refs/tags/$TAG" >/dev/null \
    || die "Tag $TAG không tồn tại trong repo"
  log "Tag OK:      $(git -C "$REPO" rev-list -n1 "refs/tags/$TAG" | cut -c1-8)"
  need_gcloud
  "$GCLOUD" storage ls "$EXPORT_URI/checkpoint-20261124.overall_export_metadata" >/dev/null 2>&1 \
    || die "Không thấy file export metadata trong $EXPORT_URI"
  log "Export OK:   metadata tồn tại"
}

back_code() {
  log "Back code về $TAG"
  git -C "$REPO" fetch --tags origin >/dev/null 2>&1 || log "Cảnh báo: fetch origin thất bại, dùng tag local"
  git -C "$REPO" rev-parse -q --verify "refs/tags/$TAG" >/dev/null || die "Tag $TAG không tồn tại"
  local stash_name="pre-rollback-$(date +%Y%m%d-%H%M%S)"
  if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
    log "Có thay đổi chưa commit → cất vào stash '$stash_name' trước khi back"
    git -C "$REPO" stash push -m "$stash_name" >/dev/null
    log "Đã cất. Lấy lại sau này: git stash list | grep $stash_name"
  fi
  git -C "$REPO" checkout -f "$(git -C "$REPO" rev-parse "refs/tags/$TAG^{commit}")" >/dev/null
  log "Xong. HEAD = $(git -C "$REPO" rev-parse --short HEAD) (detached). Quay lại nhánh cũ: git checkout main"
}

back_data() {
  log "Back Firestore project=$PROJECT từ $EXPORT_URI"
  log "LƯU Ý: import ghi đè document trùng ID, không xóa document mới phát sinh."
  need_gcloud
  "$GCLOUD" firestore import "$EXPORT_URI" --project="$PROJECT"
  log "Import xong."
}

case "${1:---check}" in
  --check|check) check ;;
  code) check >/dev/null; back_code ;;
  data) check >/dev/null; back_data ;;
  all)  check >/dev/null; back_code; back_data ;;
  *) die "Tham số không hợp lệ: $1 (dùng --check | code | data | all)" ;;
esac
