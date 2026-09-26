#!/bin/bash
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export RUN_ID="${RUN_ID:-ci-$RANDOM}"
export RUN_DIR="${RUN_DIR:-/tmp/opencode/verify-yleulc-$RUN_ID}"
export DISPLAY_NUM="${DISPLAY_NUM:-99}"
export CDP_PORT="${CDP_PORT:-9222}"
export MOCK_PORT="${MOCK_PORT:-8787}"
export MOCK_SCENARIO="${MOCK_SCENARIO:-default}"

failures=0

record() {
  local label="$1"
  local ok="$2"
  if [ "$ok" = "1" ]; then
    echo "PASS $label"
  else
    echo "FAIL $label"
    failures=$((failures + 1))
  fi
}

bash "$SKILL_DIR/scripts/up.sh"
# shellcheck disable=SC1090
source "$RUN_DIR/env.sh"

mkdir -p "$RUN_DIR/artifacts/ask" "$RUN_DIR/artifacts/settings" "$RUN_DIR/artifacts/protection" "$RUN_DIR/artifacts/activity" "$RUN_DIR/artifacts/listen"

body="$(node "$SKILL_DIR/scripts/drive.mjs" text)"
echo "$body" > "$RUN_DIR/artifacts/first-render.txt"
status_line="$(node "$SKILL_DIR/scripts/drive.mjs" status)"
echo "status_line=$status_line"
echo "$body" | grep -qi "ask for the next answer" && empty=1 || empty=0
case "$status_line" in
  ABSENT) dot=0 ;;
  *) dot=1 ;;
esac
record "ask empty state renders" "$empty"
record "status bar renders" "$dot"

answer_json="$(node "$SKILL_DIR/scripts/drive.mjs" ask "hi")"
echo "$answer_json" > "$RUN_DIR/artifacts/ask/answer.json"
node -e "const r=JSON.parse(process.argv[1]); process.exit(r.status==='done' && r.answerRendered && !r.errorShown ? 0 : 1)" "$answer_json"
rc=$?
record "ask streams and renders an answer" "$([ "$rc" = 0 ] && echo 1 || echo 0)"

node "$SKILL_DIR/scripts/drive.mjs" shot "$RUN_DIR/artifacts/ask/answered.png" > /dev/null
record "ask screenshot captured" "$([ -s "$RUN_DIR/artifacts/ask/answered.png" ] && echo 1 || echo 0)"

visibility="$(node "$SKILL_DIR/scripts/drive.mjs" visible "Hi! How can I help?")"
echo "answer_visibility=$visibility" > "$RUN_DIR/artifacts/ask/visibility.txt"
record "answer is visible without scrolling" "$([ "$visibility" = "visible" ] && echo 1 || echo 0)"

clipped="$(node "$SKILL_DIR/scripts/drive.mjs" clipped)"
echo "clipped=$clipped" > "$RUN_DIR/artifacts/ask/clipped.txt"
record "no controls clipped horizontally" "$([ "$clipped" = "none" ] && echo 1 || echo 0)"

node "$SKILL_DIR/scripts/drive.mjs" click "Settings" > /dev/null
settings_body="$(node "$SKILL_DIR/scripts/drive.mjs" text)"
echo "$settings_body" > "$RUN_DIR/artifacts/settings/panel.txt"
echo "$settings_body" | grep -qi "live transcription" && s1=1 || s1=0
echo "$settings_body" | grep -qi "provider keys" && s2=1 || s2=0
record "settings panel sections render" "$([ "$s1" = 1 ] && [ "$s2" = 1 ] && echo 1 || echo 0)"
node "$SKILL_DIR/scripts/drive.mjs" shot "$RUN_DIR/artifacts/settings/panel.png" > /dev/null

node "$SKILL_DIR/scripts/drive.mjs" click "Protection" > /dev/null
protection_body="$(node "$SKILL_DIR/scripts/drive.mjs" text)"
echo "$protection_body" > "$RUN_DIR/artifacts/protection/panel.txt"
echo "$protection_body" | grep -qi "x11 captures" && p1=1 || p1=0
record "protection panel renders" "$p1"
node "$SKILL_DIR/scripts/drive.mjs" shot "$RUN_DIR/artifacts/protection/panel.png" > /dev/null

node "$SKILL_DIR/scripts/drive.mjs" click "Activity" > /dev/null
activity_body="$(node "$SKILL_DIR/scripts/drive.mjs" text)"
echo "$activity_body" > "$RUN_DIR/artifacts/activity/panel.txt"
echo "$activity_body" | grep -qi "end session and save" && a1=1 || a1=0
record "activity panel renders" "$a1"
node "$SKILL_DIR/scripts/drive.mjs" shot "$RUN_DIR/artifacts/activity/panel.png" > /dev/null

node "$SKILL_DIR/scripts/drive.mjs" click "Ask" > /dev/null
node "$SKILL_DIR/scripts/drive.mjs" shot "$RUN_DIR/artifacts/listen/status.png" > /dev/null

mkdir -p "$RUN_DIR/decoy"
cp /usr/bin/sleep "$RUN_DIR/decoy/zoom"
"$RUN_DIR/decoy/zoom" 600 &
DECOY_PID=$!
sleep 1
decoy_before=$(kill -0 "$DECOY_PID" 2>/dev/null && echo yes || echo no)
echo "decoy_before=$decoy_before" > "$RUN_DIR/artifacts/protection/failsafe.txt"

node "$SKILL_DIR/scripts/drive.mjs" click "Protection" > /dev/null
protection_body="$(node "$SKILL_DIR/scripts/drive.mjs" text)"
echo "$protection_body" > "$RUN_DIR/artifacts/protection/panel.txt"
echo "$protection_body" | grep -qi "brave" && b1=1 || b1=0
record "protection lists brave" "$b1"

relaunch_result="$(node "$SKILL_DIR/scripts/drive.mjs" eval 'window.yleulc.relaunchProtectedApp("zoom").then(() => "ok").catch((e) => "error:" + String(e))')"
echo "relaunch_zoom=$relaunch_result" >> "$RUN_DIR/artifacts/protection/failsafe.txt"
case "$relaunch_result" in
  error:*) reason=1 ;;
  *) reason=0 ;;
esac
record "relaunch reports a reason instead of failing silently" "$reason"

sleep 2
decoy_after=$(kill -0 "$DECOY_PID" 2>/dev/null && echo yes || echo no)
echo "decoy_after=$decoy_after" >> "$RUN_DIR/artifacts/protection/failsafe.txt"
record "relaunch signals nothing when it cannot succeed" "$([ "$decoy_after" = "yes" ] && echo 1 || echo 0)"
kill "$DECOY_PID" 2>/dev/null

curl -s "http://127.0.0.1:$MOCK_PORT/requests" > "$RUN_DIR/artifacts/mock-requests.json"
grep -qi "chat/completions" "$RUN_DIR/artifacts/mock-requests.json" && m1=1 || m1=0
record "provider request recorded by mock" "$m1"

if [ "$failures" -gt 0 ]; then
  echo "listen error state:"
  echo "$body" | grep -i "error\|stopped" || echo "none"
  echo "$failures check(s) failed"
else
  echo "all checks passed"
fi

bash "$SKILL_DIR/scripts/down.sh"
echo "artifacts retained at $RUN_DIR/artifacts"
exit "$failures"
