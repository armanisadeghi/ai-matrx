#!/usr/bin/env bash
#
# agent-dev-server.sh — provider-neutral lifecycle for the ONE shared preview.
#
# Claude and Codex both call this through:
#   pnpm preview:start
#   pnpm preview:stop
#
# The server is detached and registered in one machine-wide state directory.
# Browser tooling is deliberately separate: after start, any supported browser
# opens localhost:3001. A different worktree may never reuse this server because
# that would certify code other than the diff under test.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${MATRX_PREVIEW_STATE_DIR:-${TMPDIR:-/tmp}/matrx-frontend-preview-${UID:-$(id -u)}}"
GUARD="$REPO_ROOT/scripts/agent-harness/matrx-preview-ports.sh"
PORT=3001
DISTDIR=".next-preview"
BASE="$STATE_DIR/shared-next-dev"
META="$BASE.meta"
LOG="$BASE.log"
READY="$BASE.ready"
JAR="$BASE.jar"
LOCK="$BASE.lock"
FAILED="$BASE.failed"
MAX_RSS_GB="${MATRX_PREVIEW_MAX_RSS_GB:-8}"
NO_PROGRESS_SEC="${MATRX_PREVIEW_NO_PROGRESS_SEC:-300}"

log() { printf '[preview] %s\n' "$1"; }
fail() { printf '[preview] ERROR: %s\n' "$1" >&2; exit 1; }
alive() { [[ "${1:-}" =~ ^[0-9]+$ ]] && kill -0 "$1" 2>/dev/null; }
meta_value() { sed -n "s/^$1=//p" "$META" 2>/dev/null | head -1; }
server_cwd() { lsof -a -p "$1" -d cwd -Fn 2>/dev/null | awk '/^n/{print substr($0,2); exit}'; }
mtime() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0
}

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
  local pid port owner
  pid="$(meta_value PID)"
  port="$(meta_value PORT)"
  alive "$pid" || return 1
  owner="$(meta_value ROOT)"
  [[ -n "$owner" ]] || owner="$(server_cwd "$pid")"
  if [[ "$owner" != "$REPO_ROOT" ]]; then
    fail "preview lease is owned by '$owner' (pid $pid); stop it from that checkout or wait for its explicit release"
  fi
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
    fail "machine-wide preview slot is occupied by $owner at '$(server_cwd "$pid")' (pid $pid, port $port); never certify this checkout against another checkout's server"
  fi

  acquire_start_lock || return 0
  trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

  # Close the small race between the first process scan and lock acquisition.
  running="$(running_server)"
  if [[ -n "$running" ]]; then
    read -r pid port owner <<<"$running"
    fail "machine-wide preview slot became occupied by $owner at '$(server_cwd "$pid")' (pid $pid, port $port); queue this preview instead"
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
    echo "ROOT=$REPO_ROOT"
    echo "MAX_RSS_GB=$MAX_RSS_GB"
  } >"$META"
  rm -f "$READY" "$JAR" "$FAILED"

  nohup "$0" warm "$pid" >/dev/null 2>&1 &
  nohup "$0" monitor "$pid" >/dev/null 2>&1 &

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
    if curl --max-time 5 -fsS -o /dev/null "http://localhost:$PORT/" 2>/dev/null; then
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

group_rss_kb() {
  local pid="$1" pgid
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
  [[ -n "$pgid" ]] || { echo 0; return; }
  ps -Ao pgid=,rss= 2>/dev/null |
    awk -v wanted="$pgid" '$1 == wanted { total += $2 } END { print total + 0 }'
}

stop_for_limit() {
  local pid="$1" reason="$2"
  printf '%s\n' "$reason" >"$FAILED"
  log "$reason"
  killtree "$pid" TERM
  for _ in 1 2 3 4 5 6; do
    alive "$pid" || break
    sleep 0.5
  done
  alive "$pid" && killtree "$pid" KILL
  rm -f "$META" "$READY" "$JAR"
}

cmd_monitor() {
  local expected_pid="${1:-}" threshold_kb last_log_mtime now log_mtime rss_kb
  alive "$expected_pid" || exit 0
  threshold_kb="$(awk -v gb="$MAX_RSS_GB" 'BEGIN { printf "%d", gb * 1048576 }')"
  last_log_mtime="$(mtime "$LOG")"
  now="$(date +%s)"
  local last_progress="$now"

  while alive "$expected_pid"; do
    rss_kb="$(group_rss_kb "$expected_pid")"
    if (( rss_kb >= threshold_kb )); then
      stop_for_limit "$expected_pid" "preview stopped at $(awk -v kb="$rss_kb" 'BEGIN { printf "%.1f", kb / 1048576 }') GB RSS (cap ${MAX_RSS_GB} GB); no automatic restart"
      exit 0
    fi

    if [[ ! -f "$READY" ]]; then
      log_mtime="$(mtime "$LOG")"
      now="$(date +%s)"
      if [[ "$log_mtime" != "$last_log_mtime" ]]; then
        last_log_mtime="$log_mtime"
        last_progress="$now"
      elif (( now - last_progress >= NO_PROGRESS_SEC )); then
        stop_for_limit "$expected_pid" "preview stopped after ${NO_PROGRESS_SEC}s without startup progress; no automatic restart"
        exit 0
      fi
    fi
    sleep 2
  done
}

cmd_status() {
  clear_stale_state
  if [[ -f "$META" ]]; then
    local pid port owner rss_kb
    pid="$(meta_value PID)"; port="$(meta_value PORT)"; owner="$(meta_value ROOT)"
    rss_kb="$(group_rss_kb "$pid")"
    log "RUNNING pid=$pid port=$port rss=$(awk -v kb="$rss_kb" 'BEGIN { printf "%.1f", kb / 1048576 }')GB owner=$owner"
    [[ "$owner" == "$REPO_ROOT" ]] || log "LEASE OCCUPIED — this checkout does not own that preview"
    return 0
  fi
  local running pid port owner
  running="$(running_server)"
  if [[ -n "$running" ]]; then
    read -r pid port owner <<<"$running"
    log "UNMANAGED/BLOCKING pid=$pid port=$port owner=$owner cwd=$(server_cwd "$pid")"
  elif [[ -f "$FAILED" ]]; then
    log "STOPPED — $(head -1 "$FAILED")"
  else
    log "no machine-wide managed preview is running"
  fi
}

cmd_stop() {
  clear_stale_state
  if [[ ! -f "$META" ]]; then
    local running
    running="$(running_server)"
    if [[ -n "$running" ]]; then
      log "no tracked lease belongs to this checkout; another dev server still occupies the machine-wide slot"
      return 1
    fi
    log "no managed preview is running"
    return 0
  fi

  local pid distdir owner
  pid="$(meta_value PID)"
  distdir="$(meta_value DISTDIR)"
  owner="$(meta_value ROOT)"
  [[ "$distdir" == "$DISTDIR" ]] || fail "refusing to stop unexpected distdir '$distdir'"
  [[ "$owner" == "$REPO_ROOT" ]] || fail "preview lease belongs to '$owner'; stop it from its owning checkout"

  if alive "$pid"; then
    log "stopping managed preview pid $pid"
    killtree "$pid" TERM
    for _ in 1 2 3 4 5 6; do
      alive "$pid" || break
      sleep 0.5
    done
    alive "$pid" && killtree "$pid" KILL
  fi

  rm -f "$META" "$LOG" "$READY" "$JAR" "$FAILED"
  rmdir "$LOCK" 2>/dev/null || true
  log "managed preview stopped; build cache $DISTDIR was preserved"
}

case "${1:-}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  warm) cmd_warm "${2:-}" ;;
  monitor) cmd_monitor "${2:-}" ;;
  *) echo "usage: $0 {start|stop|status}" >&2; exit 2 ;;
esac
