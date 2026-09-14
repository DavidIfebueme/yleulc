#!/usr/bin/env bash
set -euo pipefail
SHIM="${YLEULC_REWRITER_PATH:-}"
if [ -z "${SHIM}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
  for candidate in "$HOME/.local/share/yleulc/capture_rewriter.so" "$SCRIPT_DIR/capture_rewriter.so" "$SCRIPT_DIR/../native/capture-rewriter/capture_rewriter.so"; do
    if [ -f "$candidate" ]; then
      SHIM="$candidate"
      break
    fi
  done
fi
if [ -z "${SHIM}" ] || [ ! -f "${SHIM}" ]; then
  echo "yleulc: capture_rewriter.so not found. Set YLEULC_REWRITER_PATH." >&2
  exit 1
fi
OVERLAY_CLASS="${YLEULC_OVERLAY_CLASS:-yleulc-overlay}"
REWRITER_LOG="${YLEULC_REWRITER_LOG:-$HOME/.local/share/yleulc/rewriter.log}"
LOG_DIR="$(dirname "$REWRITER_LOG")"
mkdir -p "$LOG_DIR"
TARGET_BIN=""
if [ "$#" -eq 0 ]; then
  TARGET_BIN="${YLEULC_WRAPPED_BIN:-}"
  if [ -z "$TARGET_BIN" ]; then
    echo "yleulc: no target binary. Usage: wrap-binary.sh <binary> [args...]" >&2
    exit 1
  fi
else
  TARGET_BIN="$1"
  shift
fi
if [ ! -x "$TARGET_BIN" ] && ! command -v "$TARGET_BIN" >/dev/null 2>&1; then
  echo "yleulc: target not executable: $TARGET_BIN" >&2
  exit 1
fi
exec env LD_PRELOAD="$SHIM" YLEULC_OVERLAY_CLASS="$OVERLAY_CLASS" YLEULC_REWRITER_LOG="$REWRITER_LOG" "$TARGET_BIN" "$@"
