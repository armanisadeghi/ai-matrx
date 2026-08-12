#!/usr/bin/env bash
#
# agent-dev-server.sh — provider-neutral lifecycle for the ONE shared preview.
#
# Claude and Codex both call this through:
#   pnpm preview:start
#   pnpm preview:stop
#
# The server is detached, registered in .matrx/dev-sessions so dev-cleanup.sh
# recognizes it as managed, and reused across agent sessions. Browser tooling is
# deliberately separate: after start, any supported browser opens localhost:3001.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$REPO_ROOT/.matrx/dev-sessions"
GUARD="$REPO_ROOT/scripts/agent-harness/matrx-preview-ports.sh"
PORT=3001
DISTDIR=".next-preview"
BASE="$STATE_DIR/shared-next-dev"
META="$BASE.meta"
LOG="$BASE.log"
READY="$BASE.ready"
JAR="$BASE.jar"
LOCK="$BASE.lock"

log() { printf '[preview] %s\n' "$1"; }
fail() { printf '[preview] ERROR: %s\n' "$1" >&2; exit 1; }
alive() { [[ "${1:-}" =~ ^[0-9]+$ ]] && kill -0 "$1" 2>/dev/null; }
meta_value() { sed -n "s/^$1=//p" "$META" 2>/dev/null | head -1; }

load_token() {
  [[ -n "${DEV_LOGIN_TOKEN:-}" ]] && return 0
  local f value
  for f in "$REPO_ROOT/.env.local" "$REPO_ROOT/.env.development.local" "$REPO_ROOT/.env.development" "$REPO_ROOT/.env"; do
    [[ -f "$f" ]] || continue
    value="$(sed -n 's/^[[:space:]]*DEV_LOGIN_TOKEN[[:space:]]*=[[:space:]]*//p' "$f" | head -1 | tr -d '\r')"
    value="${value#\"}"; value="${value%\"}"
    value="${value#\'}"; value="${value%\'}"
    if [[ -n "$value" ]]; then
      DEV_LOGIN_TOKEN="$value"
      return 0
    fi
  done
}

killtree() {
  local pid="$1" signal="${2:-TERM}" child
  [[ -n "$pid" ]] || return 0
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    killtree "$child" "$signal"
  done
  kill -"$signal" "$pid" 2>/dev/null || true
}

running_server() {
  "$GUARD" list-any 2>/dev/null | head -1
}

clear_stale_state() {
  [[ -f "$META" ]] || return 0
  local pid
  pid="$(meta_value PID)"
  if ! alive "$pid"; then
    rm -f "$META" "$READY" "$JAR"
  fi
}

reuse_managed_meta() {
  [[ -f "$META" ]] || return 1
  local pid port
  pid="$(meta_value PID)"
  port="$(meta_value PORT)"
  alive "$pid" || return 1
  log "reusing the managed preview: http://localhost:$port (pid $pid)"
  log "open that URL in the in-app browser; it may still be compiling"
  return 0
}

acquire_start_lock() {
  mkdir "$LOCK" 2>/dev/null && return 0

  # Another caller may be between fork and metadata write. Wait for its state
  # instead of racing a second Next tree into existence.
  local attempt
  for attempt in $(seq 1 50); do
    reuse_managed_meta && return 1
    sleep 0.2
  done

  # An empty lock with no live metadata after ten seconds is stale.
  rmdir "$LOCK" 2>/dev/null || fail "another preview start is still in progress"
  mkdir "$LOCK" 2>/dev/null || fail "could not acquire the preview start lock"
  return 0
}

cmd_start() {
  mkdir -p "$STATE_DIR"
  clear_stale_state
  reuse_managed_meta && return 0

  local running pid port owner
  running="$(running_server)"
  if [[ -n "$running" ]]; then
    read -r pid port owner <<<"$running"
    log "reusing the one running dev server: http://localhost:$port ($owner, pid $pid)"
    log "open that URL in the in-app browser; do not start another server"
    return 0
  fi

  acquire_start_lock || return 0
  trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

  # Close the small race between the first process scan and lock acquisition.
  running="$(running_server)"
  if [[ -n "$running" ]]; then
    read -r pid port owner <<<"$running"
    log "reusing the one running dev server: http://localhost:$port ($owner, pid $pid)"
    return 0
  fi

  [[ -x "$REPO_ROOT/node_modules/.bin/next" ]] || fail "dependencies are missing; run pnpm install first"

  # Reclaim only servers dev-cleanup already classifies as runaway/abandoned.
  # With no live server above, this mainly clears stale tracking files.
  bash "$REPO_ROOT/scripts/dev-cleanup.sh" reap >/dev/null 2>&1 || true

  # exec_command owns and reaps its shell process group. Python's
  # start_new_session creates a real detached OS session that survives the tool
  # call while still giving us the exact root pid to track and stop.
  pid="$(/usr/bin/python3 - "$REPO_ROOT" "$LOG" "$DISTDIR" "$PORT" <<'PY'
import os
import subprocess
import sys

root, log_path, distdir, port = sys.argv[1:]
env = os.environ.copy()
env["NODE_OPTIONS"] = "--dns-result-order=ipv4first"
env["NEXT_DISTDIR"] = distdir
with open(log_path, "ab", buffering=0) as log:
    process = subprocess.Popen(
        [os.path.join(root, "node_modules/.bin/next"), "dev", "-p", port],
        cwd=root,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
print(process.pid)
PY
  )"
  alive "$pid" || fail "Next.js exited during startup; inspect $LOG"

  {
    echo "SESSION_ID=shared-next-dev"
    echo "PORT=$PORT"
    echo "PID=$pid"
    echo "DISTDIR=$DISTDIR"
    echo "LOG=$LOG"
  } >"$META"
  rm -f "$READY" "$JAR"

  nohup "$0" warm "$pid" >/dev/null 2>&1 &

  log "started the shared managed preview: http://localhost:$PORT (pid $pid)"
  log "it is tracked, reused by Claude and Codex, and may take 30–90s to compile"
  log "logs: $LOG"
}

cmd_warm() {
  local expected_pid="${1:-}"
  alive "$expected_pid" || exit 0
  load_token

  local attempt
  for attempt in $(seq 1 90); do
    if curl -fsS -o /dev/null "http://localhost:$PORT/" 2>/dev/null; then
      if [[ -n "${DEV_LOGIN_TOKEN:-}" ]]; then
        curl -fsS -L -c "$JAR" -b "$JAR" -o /dev/null \
          "http://localhost:$PORT/api/dev-login?token=$DEV_LOGIN_TOKEN&next=/dashboard" \
          2>/dev/null || true
      fi
      rm -f "$JAR"
      touch "$READY"
      exit 0
    fi
    alive "$expected_pid" || exit 0
    sleep 2
  done
}

cmd_stop() {
  clear_stale_state
  if [[ ! -f "$META" ]]; then
    log "no managed preview is running"
    return 0
  fi

  local pid distdir
  pid="$(meta_value PID)"
  distdir="$(meta_value DISTDIR)"
  [[ "$distdir" == "$DISTDIR" ]] || fail "refusing to stop unexpected distdir '$distdir'"

  if alive "$pid"; then
    log "stopping managed preview pid $pid"
    killtree "$pid" TERM
    for _ in 1 2 3 4 5 6; do
      alive "$pid" || break
      sleep 0.5
    done
    alive "$pid" && killtree "$pid" KILL
  fi

  rm -f "$META" "$LOG" "$READY" "$JAR"
  rmdir "$LOCK" 2>/dev/null || true
  log "managed preview stopped; build cache $DISTDIR was preserved"
}

case "${1:-}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  warm) cmd_warm "${2:-}" ;;
  *) echo "usage: $0 {start|stop}" >&2; exit 2 ;;
esac
