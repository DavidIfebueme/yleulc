#!/bin/bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$(cd "$SKILL_DIR/../../.." && pwd)"
RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)-$$}"
RUN_DIR="${RUN_DIR:-/tmp/opencode/verify-yleulc-$RUN_ID}"
DISPLAY_NUM="${DISPLAY_NUM:-99}"
CDP_PORT="${CDP_PORT:-9222}"
MOCK_PORT="${MOCK_PORT:-8787}"
MOCK_SCENARIO="${MOCK_SCENARIO:-default}"
TRACE="${TRACE:-deepgram}"

mkdir -p "$RUN_DIR/home/.config/yleulc" "$RUN_DIR/artifacts"

cat > "$RUN_DIR/home/settings.json" <<JSON
{"keybinds":{"assist":"ctrl+shift+a","submit":"ctrl+enter","toggleListen":"ctrl+shift+l","toggleTranscript":"ctrl+shift+t","toggleVisibility":"ctrl+shift+space"},"listen":{"autoAnswer":false},"modesPrompts":{"activePromptModeId":"general","defaultMode":"ask","defaultModel":"deepseek-flash","defaultProviderId":"deepseek","promptModes":[{"id":"general","label":"General","prompt":""}],"systemPrompt":""},"stealth":{"autoHideOnPortalScreencast":true,"showSingleWindowGuidance":true},"transcriptionEngine":"$TRACE"}
JSON

node "$SKILL_DIR/scripts/check-fresh-build.mjs" "$APP_DIR" > "$RUN_DIR/artifacts/fresh-build.txt"

cd "$APP_DIR"
npm run build > "$RUN_DIR/artifacts/build.log" 2>&1

MOCK_SCENARIO="$MOCK_SCENARIO" MOCK_PORT="$MOCK_PORT" node "$SKILL_DIR/scripts/mock-provider.mjs" > "$RUN_DIR/mock.log" 2>&1 &
echo $! > "$RUN_DIR/mock.pid"
sleep 1

Xvfb ":$DISPLAY_NUM" -screen 0 800x600x24 > "$RUN_DIR/xvfb.log" 2>&1 &
echo $! > "$RUN_DIR/xvfb.pid"
sleep 2

HOME="$RUN_DIR/home" \
DEEPSEEK_API_KEY="verify-key" \
DEEPSEEK_BASE_URL="http://127.0.0.1:$MOCK_PORT" \
YLEULC_SETTINGS_PATH="$RUN_DIR/home/settings.json" \
DISPLAY=":$DISPLAY_NUM" \
  "$APP_DIR/node_modules/.bin/electron" --no-sandbox --remote-debugging-port="$CDP_PORT" "$APP_DIR/out/main/index.js" \
  > "$RUN_DIR/app.log" 2>&1 &
echo $! > "$RUN_DIR/app.pid"

for _ in $(seq 1 60); do
  if curl -s "http://127.0.0.1:$CDP_PORT/json/list" > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

for _ in $(seq 1 60); do
  rendered="$(node "$SKILL_DIR/scripts/drive.mjs" text 2>/dev/null || true)"
  if [ -n "$rendered" ] && [ "$rendered" != "undefined" ]; then
    break
  fi
  sleep 0.5
done

cat > "$RUN_DIR/env.sh" <<ENV
export RUN_DIR="$RUN_DIR"
export APP_DIR="$APP_DIR"
export SKILL_DIR="$SKILL_DIR"
export DISPLAY_NUM="$DISPLAY_NUM"
export CDP_PORT="$CDP_PORT"
export MOCK_PORT="$MOCK_PORT"
export MOCK_SCENARIO="$MOCK_SCENARIO"
ENV

echo "RUN_DIR=$RUN_DIR"
echo "CDP_PORT=$CDP_PORT"
