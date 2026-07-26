#!/usr/bin/env bash
#
# agent-dev-server.sh — per-Claude-Code-session dev server lifecycle.
#
# Driven by SessionStart / SessionEnd hooks (see .claude/settings.local.json).
# Goal: an agent that needs the app should NEVER burn tokens figuring out how to
# start a dev server or how to log in. On session start we:
#   1. launch a dedicated `next dev` on a free 30xx port with its OWN
#      NEXT_DISTDIR (.next-agent-<sid>) so it never collides with the human's
#      .next or another agent's server (Next 16 locks per-distDir),
#   2. warm it in the background — poll until it responds, then hit the
#      dev-login route so /dashboard is pre-compiled and auth is primed,
#   3. hand the agent one ready-to-use URL via additionalContext.
# On session end we kill THAT server's process tree and delete ONLY its own
# custom .next-agent-<sid> dir — never the human's .next.
#
# Subcommands (session JSON arrives on stdin from the hook):
#   start   launch + warm this session's server, emit context
#   stop    kill this session's server + delete its custom distdir
#
# Opt out entirely for a session/shell with:  MATRX_AGENT_AUTOSERVER=0
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$REPO_ROOT/.matrx/dev-sessions"
PORT_LO=3050            # agent servers live in 3050-3099; humans keep 3000-3049
PORT_HI=3099
MAX_AGENT_SERVERS=3     # cap concurrent auto-servers so they can't pile up
DISTDIR_PREFIX=".next-agent-"

log() { printf '[agent-dev-server] %s\n' "$1" >&2; }

# --- read the session id (and reason) from the hook's stdin JSON ------------
read_stdin_json() {
  STDIN_JSON="$(cat 2>/dev/null || true)"
  SESSION_ID="$(printf '%s' "$STDIN_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log((JSON.parse(s).session_id||"").toString())}catch{console.log("")}})' 2>/dev/null || true)"
  # Fall back to a stable-ish id if the harness gave none, so the script still works when run by hand.
  [[ -z "$SESSION_ID" ]] && SESSION_ID="manual-$$"
  SHORT_SID="$(printf '%s' "$SESSION_ID" | tr -cd 'a-zA-Z0-9' | cut -c1-12)"
  META="$STATE_DIR/$SHORT_SID.meta"
  DISTDIR="$DISTDIR_PREFIX$SHORT_SID"
}

# DEV_LOGIN_TOKEN lives in .env, not the shell env — read it so we can actually
# pre-compile the AUTHENTICATED dashboard and hand the agent a ready-to-use URL.
load_token() {
  [[ -n "${DEV_LOGIN_TOKEN:-}" ]] && return 0
  local f
  for f in "$REPO_ROOT/.env.local" "$REPO_ROOT/.env.development.local" "$REPO_ROOT/.env.development" "$REPO_ROOT/.env"; do
    [[ -f "$f" ]] || continue
    local v; v="$(sed -n 's/^[[:space:]]*DEV_LOGIN_TOKEN[[:space:]]*=[[:space:]]*//p' "$f" | head -1 | tr -d '"'"'"'\r')"
    if [[ -n "$v" ]]; then DEV_LOGIN_TOKEN="$v"; return 0; fi
  done
  return 0
}

port_free() { ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

alive() { [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null; }

# Recursively kill a pid and all its descendants (no setsid on macOS).
killtree() {
  local pid="$1" sig="${2:-TERM}" child
  [[ -z "$pid" ]] && return 0
  for child in $(pgrep -P "$pid" 2>/dev/null); do killtree "$child" "$sig"; done
  kill -"$sig" "$pid" 2>/dev/null || true
}

# Remove leftover state from sessions whose server already died.
reap_dead() {
  [[ -d "$STATE_DIR" ]] || return 0
  local f pid dd
  for f in "$STATE_DIR"/*.meta; do
    [[ -e "$f" ]] || continue
    pid="$(sed -n 's/^PID=//p' "$f")"
    dd="$(sed -n 's/^DISTDIR=//p' "$f")"
    if ! alive "$pid"; then
      log "reaping dead session server (was pid $pid)"
      [[ "$dd" == "$DISTDIR_PREFIX"* && -d "$REPO_ROOT/$dd" ]] && rm -rf "${REPO_ROOT:?}/$dd"
      rm -f "${f%.meta}".meta "${f%.meta}".log "${f%.meta}".ready "${f%.meta}".jar
    fi
  done
}

count_live_servers() {
  local n=0 f pid
  [[ -d "$STATE_DIR" ]] || { echo 0; return; }
  for f in "$STATE_DIR"/*.meta; do
    [[ -e "$f" ]] || continue
    pid="$(sed -n 's/^PID=//p' "$f")"
    alive "$pid" && n=$((n+1))
  done
  echo "$n"
}

emit_context() {
  # SessionStart hooks inject `additionalContext` into the agent's context.
  node -e '
    const msg = process.argv[1];
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: msg }
    }));
  ' "$1"
}

cmd_start() {
  [[ "${MATRX_AGENT_AUTOSERVER:-1}" == "0" ]] && exit 0
  read_stdin_json
  load_token
  mkdir -p "$STATE_DIR"
  reap_dead

  # Kill runaway / abandoned / untracked servers BEFORE we consider starting a
  # new one. reap_dead only forgets state for servers that already died; it has
  # no answer for a server that OUTLIVES its session — which is the whole
  # problem (a SessionEnd hook that never fires leaves an immortal multi-GB
  # process, and enough of those take the machine down). Ordering matters: this
  # runs before the launch below, so it can never reap the server we just made.
  bash "$REPO_ROOT/scripts/dev-cleanup.sh" reap >/dev/null 2>&1 || true

  # Resume / re-fire: reuse an existing healthy server for this session.
  if [[ -f "$META" ]]; then
    local ppid pport
    ppid="$(sed -n 's/^PID=//p' "$META")"; pport="$(sed -n 's/^PORT=//p' "$META")"
    if alive "$ppid"; then
      emit_context "Your dev server is already running at http://localhost:$pport . To use the app logged-in, navigate a browser to: http://localhost:$pport/api/dev-login?token=\$DEV_LOGIN_TOKEN&next=/dashboard"
      exit 0
    fi
    rm -f "$META"
  fi

  # Bound the number of concurrent auto-servers.
  if [[ "$(count_live_servers)" -ge "$MAX_AGENT_SERVERS" ]]; then
    emit_context "Skipped auto-starting a dev server ($MAX_AGENT_SERVERS agent servers already running). Reuse an existing one (see 'pnpm dev:status') or run 'pnpm dev' yourself."
    exit 0
  fi

  # Find a free port in the agent band.
  local port=""
  for p in $(seq "$PORT_LO" "$PORT_HI"); do
    if port_free "$p"; then port="$p"; break; fi
  done
  if [[ -z "$port" ]]; then
    emit_context "Could not auto-start a dev server: no free port in $PORT_LO-$PORT_HI. Run 'pnpm dev:status'."
    exit 0
  fi

  local logf="$STATE_DIR/$SHORT_SID.log"
  local nextbin="$REPO_ROOT/node_modules/.bin/next"
  [[ -x "$nextbin" ]] || nextbin="$REPO_ROOT/node_modules/next/dist/bin/next"

  # Launch detached. Own NEXT_DISTDIR => own lock, no collision with .next.
  (
    cd "$REPO_ROOT" || exit 1
    # NOTE: do NOT add --max-old-space-size here. Node's default heap cap on this
    # machine is already ~4.2 GB, yet a single next-server was measured at 22.8 GB
    # RSS — i.e. ~18 GB of it is Turbopack's native (Rust) allocation plus ~17
    # worker processes, none of which V8 flags bound. Raising the JS heap ceiling
    # makes it worse, not better. The RSS reaper in dev-cleanup.sh is the guard
    # that actually works, because it measures RSS rather than heap.
    NODE_OPTIONS=--dns-result-order=ipv4first NEXT_DISTDIR="$DISTDIR" \
      nohup "$nextbin" dev -p "$port" >"$logf" 2>&1 &
    echo "$!" > "$STATE_DIR/$SHORT_SID.pid.tmp"
  )
  local pid; pid="$(cat "$STATE_DIR/$SHORT_SID.pid.tmp" 2>/dev/null)"; rm -f "$STATE_DIR/$SHORT_SID.pid.tmp"

  {
    echo "SESSION_ID=$SESSION_ID"
    echo "PORT=$port"
    echo "PID=$pid"
    echo "DISTDIR=$DISTDIR"
    echo "LOG=$logf"
  } > "$META"

  # Detached warmup: wait for the server, then pre-compile the AUTHENTICATED
  # dashboard. A cookie jar makes the dev-login 302 carry the session forward so
  # curl -L actually renders /dashboard (compiling it) instead of bouncing to /login.
  local devlogin="http://localhost:$port/api/dev-login?token=${DEV_LOGIN_TOKEN:-}&next=/dashboard"
  local jar="$STATE_DIR/$SHORT_SID.jar"
  nohup bash -c '
    for i in $(seq 1 90); do
      if curl -fsS -o /dev/null "http://localhost:'"$port"'/" 2>/dev/null; then
        curl -fsS -L -c "'"$jar"'" -b "'"$jar"'" -o /dev/null "'"$devlogin"'" 2>/dev/null || true
        rm -f "'"$jar"'"
        touch "'"$STATE_DIR/$SHORT_SID"'.ready"
        exit 0
      fi
      sleep 2
    done
  ' >/dev/null 2>&1 &

  if [[ -n "${DEV_LOGIN_TOKEN:-}" ]]; then
    emit_context "A dedicated dev server is starting for this session at http://localhost:$port (NEXT_DISTDIR=$DISTDIR), warming in the background (first compile of this large app can take ~30-90s). When you need the app, navigate a browser to this ONE ready-to-use url to land logged-in on the dashboard — no manual login: $devlogin . The 'next' param can be any route (e.g. next=/chat). This server and its cache are auto-removed when the session ends; never kill .next."
  else
    emit_context "A dedicated dev server is starting at http://localhost:$port (NEXT_DISTDIR=$DISTDIR). DEV_LOGIN_TOKEN was not found in .env so auto-login could not be primed — navigate to http://localhost:$port and log in via /login (admin@admin.com / Password1234#). Server + cache auto-removed at session end; never kill .next."
  fi
  exit 0
}

cmd_stop() {
  read_stdin_json
  [[ -f "$META" ]] || exit 0
  local pid dd; pid="$(sed -n 's/^PID=//p' "$META")"; dd="$(sed -n 's/^DISTDIR=//p' "$META")"

  alive "$pid" && { log "stopping session server pid $pid"; killtree "$pid" TERM; }
  # brief grace, then force
  for _ in 1 2 3 4; do alive "$pid" || break; sleep 0.5; done
  alive "$pid" && killtree "$pid" KILL

  # Delete the build cache ONLY if it is a confirmed custom agent distdir.
  if [[ "$dd" == "$DISTDIR_PREFIX"* && -d "$REPO_ROOT/$dd" ]]; then
    log "removing custom build dir $dd"
    rm -rf "${REPO_ROOT:?}/$dd"
  elif [[ -n "$dd" ]]; then
    log "refusing to delete non-custom build dir '$dd' (only ${DISTDIR_PREFIX}* is auto-removed)"
  fi

  rm -f "$META" "$STATE_DIR/$SHORT_SID.log" "$STATE_DIR/$SHORT_SID.ready" "$STATE_DIR/$SHORT_SID.jar"
  exit 0
}

case "${1:-}" in
  start) cmd_start ;;
  stop)  cmd_stop ;;
  *) echo "usage: $0 {start|stop}  (session JSON on stdin)" >&2; exit 2 ;;
esac
