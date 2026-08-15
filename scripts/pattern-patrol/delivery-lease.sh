#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="/tmp/matrx-pattern-patrol-delivery-${UID:-$(id -u)}"
LOCK_DIR="$STATE_DIR.lock"
OWNER_FILE="$LOCK_DIR/owner"

fail() { echo "[PATROL DELIVERY LEASE] $*" >&2; exit 1; }

owner_value() {
  local key="$1"
  [[ -f "$OWNER_FILE" ]] || return 0
  sed -n "s/^${key}=//p" "$OWNER_FILE" | head -1
}

alive() {
  local pid="${1:-}"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}

process_start() {
  ps -o lstart= -p "${1:-}" 2>/dev/null | sed 's/^[[:space:]]*//'
}

owner_is_current() {
  local pid
  pid="$(owner_value PID)"
  alive "$pid" && [[ "$(owner_value PROCESS_START)" == "$(process_start "$pid")" ]]
}

acquire() {
  local pid="${1:-}" root="${2:-}" run="${3:-general-release}" attempt owner_pid token
  [[ "$pid" =~ ^[0-9]+$ ]] || fail "acquire requires the owning PID"
  [[ -n "$root" ]] || fail "acquire requires the owning checkout"
  mkdir -p "$STATE_DIR"
  for attempt in $(seq 1 100); do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      token="${pid}-$(date +%s)-${RANDOM}"
      {
        echo "TOKEN=$token"
        echo "PID=$pid"
        echo "PROCESS_START=$(process_start "$pid")"
        echo "ROOT=$root"
        echo "RUN=$run"
        echo "ACQUIRED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      } > "$OWNER_FILE"
      echo "$token"
      return 0
    fi
    owner_pid="$(owner_value PID)"
    if [[ -f "$OWNER_FILE" ]] && ! owner_is_current; then
      rm -f "$OWNER_FILE"
      rmdir "$LOCK_DIR" 2>/dev/null || true
      continue
    fi
    if [[ ! -f "$OWNER_FILE" ]] && [[ $attempt -gt 20 ]]; then
      rmdir "$LOCK_DIR" 2>/dev/null || true
      continue
    fi
    sleep 0.1
  done
  fail "delivery lane is owned by run $(owner_value RUN) in $(owner_value ROOT) (pid $(owner_value PID))"
}

release() {
  local token="${1:-}"
  [[ -n "$token" ]] || fail "release requires a token"
  [[ "$(owner_value TOKEN)" == "$token" ]] || fail "token does not own the delivery lane"
  rm -f "$OWNER_FILE"
  rmdir "$LOCK_DIR" 2>/dev/null || fail "could not release delivery lane"
}

status() {
  if [[ ! -d "$LOCK_DIR" ]]; then
    echo "PATROL DELIVERY LANE FREE"
    return 0
  fi
  echo "PATROL DELIVERY LANE OWNED run=$(owner_value RUN) root=$(owner_value ROOT) pid=$(owner_value PID) acquired=$(owner_value ACQUIRED_AT)"
}

case "${1:-}" in
  acquire) acquire "${2:-}" "${3:-}" "${4:-}" ;;
  release) release "${2:-}" ;;
  status) status ;;
  *) fail "usage: $0 acquire <pid> <root> [run] | release <token> | status" ;;
esac
