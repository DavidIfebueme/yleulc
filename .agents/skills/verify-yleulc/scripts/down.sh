#!/bin/bash
set -u

if [ -z "${RUN_DIR:-}" ]; then
  echo "RUN_DIR is required; source the run env first" >&2
  exit 2
fi

for name in app xvfb mock; do
  pid_file="$RUN_DIR/$name.pid"
  if [ -f "$pid_file" ]; then
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      wait "$pid" 2>/dev/null
    fi
    rm -f "$pid_file"
  fi
done

echo "stopped run $RUN_DIR"
echo "evidence retained in $RUN_DIR/artifacts"
