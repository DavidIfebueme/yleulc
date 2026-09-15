#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" != "--within-xvfb" ]; then
  if ! command -v xvfb-run >/dev/null 2>&1; then
    printf '%s\n' "SKIP xvfb-run unavailable"
    exit 0
  fi
  exec xvfb-run -a --server-args="-screen 0 1280x720x24 -nolisten tcp" "$0" --within-xvfb
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work_dir="$(mktemp -d)"
stage_pid=""

cleanup() {
  if [ -n "$stage_pid" ]; then
    kill "$stage_pid" 2>/dev/null || true
    wait "$stage_pid" 2>/dev/null || true
  fi
  rm -rf "$work_dir"
}

trap cleanup EXIT

cc -O2 -Wall -Wextra -o "$work_dir/stage" "$repo_root/scripts/verify-overlay/stage.c" -lX11
cc -O2 -Wall -Wextra -o "$work_dir/capture" "$repo_root/scripts/verify-overlay/capture.c" -lX11
make -C "$repo_root/native/capture-rewriter"

YLEULC_VERIFY_CLASS="yleulc-verify-overlay" "$work_dir/stage" >"$work_dir/stage.log" 2>&1 &
stage_pid="$!"

for _ in $(seq 1 50); do
  if grep -q '^READY ' "$work_dir/stage.log"; then
    break
  fi
  sleep 0.1
done

grep -q '^READY ' "$work_dir/stage.log"
"$work_dir/capture" "$work_dir/raw.ppm"

YLEULC_REWRITER_PATH="$repo_root/native/capture-rewriter/capture_rewriter.so" \
YLEULC_REWRITER_LOG="$work_dir/rewriter.log" \
YLEULC_OVERLAY_CLASS="yleulc-verify-overlay" \
"$repo_root/native/capture-rewriter/wrap-binary.sh" "$work_dir/capture" "$work_dir/rewritten.ppm"

pixel_hex() {
  header_size="$(
    {
      IFS= read -r magic
      IFS= read -r dimensions
      IFS= read -r maximum
      printf '%s\n%s\n%s\n' "$magic" "$dimensions" "$maximum"
    } < "$1" | wc -c
  )"
  dd if="$1" bs=1 skip="$((header_size + (250 * 1280 + 360) * 3))" count=3 status=none | od -An -tx1 | tr -d ' \n'
}

raw_pixel="$(pixel_hex "$work_dir/raw.ppm")"
rewritten_pixel="$(pixel_hex "$work_dir/rewritten.ppm")"
printf '%s\n' "PIXELS raw=$raw_pixel rewritten=$rewritten_pixel"
grep -E 'capture hook fired|rewrote overlay' "$work_dir/rewriter.log"
test "$raw_pixel" = "ff00ff"
test "$rewritten_pixel" = "203040"
printf '%s\n' "PASS overlay is erased from wrapped root capture"
