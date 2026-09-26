#!/bin/bash
set -u

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "${RUN_DIR:-}" ]; then
  echo "RUN_DIR is required; source the run env first" >&2
  exit 2
fi

echo "run_dir=$RUN_DIR"
echo "--- app pid ---"
if [ -f "$RUN_DIR/app.pid" ]; then
  pid="$(cat "$RUN_DIR/app.pid")"
  if kill -0 "$pid" 2>/dev/null; then
    echo "app_alive=yes pid=$pid"
  else
    echo "app_alive=no pid=$pid"
  fi
else
  echo "app_alive=no pid_file_missing"
fi

echo "--- cdp ---"
if curl -s "http://127.0.0.1:${CDP_PORT:-9222}/json/version" > /dev/null 2>&1; then
  echo "cdp=up"
else
  echo "cdp=down"
fi

echo "--- mock ---"
if curl -s "http://127.0.0.1:${MOCK_PORT:-8787}/requests" > /dev/null 2>&1; then
  echo "mock=up"
else
  echo "mock=down"
fi

echo "--- build freshness ---"
node "$SKILL_DIR/scripts/check-fresh-build.mjs" "${APP_DIR:-$(cd "$SKILL_DIR/../../.." && pwd)}" 2>&1

echo "--- build revision ---"
if [ -f "$RUN_DIR/artifacts/fresh-build.txt" ]; then
  cat "$RUN_DIR/artifacts/fresh-build.txt"
fi

echo "--- listen engine state from app log ---"
grep -a -m3 -i "bootstrap\|listen\|transcription" "$RUN_DIR/app.log" 2>/dev/null || echo "no listen lines yet"

echo "--- ui text ---"
node "$SKILL_DIR/scripts/drive.mjs" text 2>&1 | head -n 20
