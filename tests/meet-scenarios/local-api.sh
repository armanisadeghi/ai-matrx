#!/usr/bin/env bash
# Start / stop / check a LOCAL aidream API (current main code) for MEET_SERVER=local runs.
#   bash tests/meet-scenarios/local-api.sh start    # reuses the matrx-dev API on :8000 if it answers; else starts one on a free port
#   bash tests/meet-scenarios/local-api.sh status
#   bash tests/meet-scenarios/local-api.sh stop     # stops ONLY the process this script started (exact PID)
# State: .cache/meet-scenarios/local-api/{pid,url,sha,log}. Boot takes 4-8 minutes (aidream/docs/LOCAL_DEV.md).
# Never starts the workflow worker or the LiveKit worker (they claim production jobs).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
AIDREAM="${AIDREAM_DIR:-$ROOT/../aidream}"
STATE="$ROOT/.cache/meet-scenarios/local-api"
mkdir -p "$STATE"
up() { curl -s -o /dev/null -m 5 -w "%{http_code}" "$1/health/version" 2>/dev/null; }
case "${1:-status}" in
  start)
    if [[ "$(up http://localhost:8000)" == "200" ]]; then
      echo "http://localhost:8000" > "$STATE/url"; echo "matrx-dev" > "$STATE/owner"
      git -C "$AIDREAM" rev-parse --short=10 HEAD > "$STATE/sha"
      echo "reusing the running local API on :8000 (sha $(cat "$STATE/sha") = checkout HEAD; the running process may be older)"; exit 0
    fi
    PORT="${MEET_LOCAL_API_PORT:-8123}"
    if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then echo "port $PORT busy"; exit 1; fi
    git -C "$AIDREAM" rev-parse --short=10 HEAD > "$STATE/sha"
    cd "$AIDREAM" || exit 1
    PORT="$PORT" HOST=127.0.0.1 AIDREAM_BOOT_HARD_BUDGET_SECONDS=900 nohup uv run python run.py > "$STATE/log" 2>&1 &
    echo $! > "$STATE/pid"; echo "http://localhost:$PORT" > "$STATE/url"; echo "script" > "$STATE/owner"
    echo "started pid $(cat "$STATE/pid") on :$PORT (sha $(cat "$STATE/sha")); waiting for /health/version (up to 15 min)"
    for _ in $(seq 1 180); do
      [[ "$(up "http://localhost:$PORT")" == "200" ]] && { curl -s -m 5 "http://localhost:$PORT/health/version" | sed -n 's/.*"git_sha": *"\([0-9a-f]\{10\}\).*/\1/p' > "$STATE/sha.live"; [[ -s "$STATE/sha.live" ]] && cp "$STATE/sha.live" "$STATE/sha"; echo "ready (sha $(cat "$STATE/sha"))"; exit 0; }
      kill -0 "$(cat "$STATE/pid")" 2>/dev/null || { echo "API process exited; tail of log:"; tail -20 "$STATE/log"; exit 1; }
      sleep 5
    done
    echo "not ready after 15 min"; exit 1;;
  status)
    [[ -f "$STATE/url" ]] && echo "$(cat "$STATE/url") http=$(up "$(cat "$STATE/url")") sha=$(cat "$STATE/sha" 2>/dev/null) owner=$(cat "$STATE/owner" 2>/dev/null)" || echo "not started";;
  stop)
    if [[ "$(cat "$STATE/owner" 2>/dev/null)" == "script" && -f "$STATE/pid" ]]; then
      PID="$(cat "$STATE/pid")"
      # uv run spawns python as a child; stop the child tree by exact PIDs.
      for c in $(pgrep -P "$PID" 2>/dev/null); do kill "$c" 2>/dev/null; done
      kill "$PID" 2>/dev/null; echo "stopped pid $PID"
      : > "$STATE/owner"; : > "$STATE/pid"
    else echo "nothing this script started"; fi;;
  *) echo "usage: local-api.sh start|status|stop"; exit 2;;
esac
