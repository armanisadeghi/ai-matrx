#!/usr/bin/env bash
# matrx-preview-ports.sh — enforce the managed preview servers on this machine: the two
# NAMED shared servers (live on 3001, clone on 3002 — Arman, 2026-09-24 and 2026-09-27) and
# never a third or a per-agent one. Self-contained on purpose: install.sh copies this file
# alone into ~/.claude/hooks, so it may not source a sibling.
#
# Why this exists: Claude's named preview_start and raw shell launches each create
# an untracked Next.js tree. Codex does not expose preview_start at all. Both agents
# instead use the provider-neutral `pnpm preview:start`, which registers one
# machine-wide lease. A checkout may reuse only its own server; other worktrees
# must wait, because a browser pointed at their server would certify the wrong diff.
#
# Fingerprint: the shared launcher sets NEXT_DISTDIR=.next-preview, which appears
# in the Next worker argv. The user's own `pnpm dev` uses .next, so this signature
# targets only managed agent preview servers and never a human-run dev server.
#
# Subcommands:
#   list  -> prints "PID PORT DISTDIR" for every running preview server (one per line)
#   guard -> redirect named preview_start to the provider-neutral managed command
#   reap  -> legacy cleanup command; no longer installed as a SessionEnd hook
#
# All output is deliberately quiet on the happy path.

set -uo pipefail

# Emit "PID PORT next-preview" for each listening managed preview dev-server.
#
# IMPORTANT: env is NOT readable here. macOS restricts `ps -E`/`ps -e` to the
# caller's own processes (SIP hardening), so the old NEXT_DISTDIR env fingerprint
# always came back empty and the guard never fired. Instead we key off process ARGV,
# which IS readable: Next.js dev workers carry the distdir path in argv
# (…/ai-matrx/.next-preview…). The human's own `pnpm dev` uses .next (no -preview
# suffix) so it is never matched. A listening root shares its process GROUP with its
# workers, so: root is a preview server  <=>  some proc in its pgid has .next-preview
# in argv.
list_preview_servers() {
  # Process groups that own a .next-preview* worker (argv-based; env-free).
  local preview_pgids
  preview_pgids=$(ps -Ao pid=,command= 2>/dev/null \
                   | grep -E '\.next-preview' | grep -v ' grep ' \
                   | awk '{print $1}' \
                   | while read -r w; do ps -o pgid= -p "$w" 2>/dev/null; done \
                   | tr -d ' ' | sort -u)
  [ -z "$preview_pgids" ] && return 0
  # LISTEN sockets held by node/next processes whose pgid is in that set.
  lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null \
    | awk '$1 ~ /node|next/ { print $2, $9 }' \
    | while read -r pid addr; do
        port="${addr##*:}"
        pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
        if printf '%s\n' "$preview_pgids" | grep -qx "$pgid"; then
          echo "$pgid $pid $port next-preview"
        fi
      done |
    sort -k1,1n -k3,3n |
    awk '!seen[$1]++ { print $2, $3, $4 }'
}

# Emit "PID PORT DISTDIR" for EVERY Next.js dev server on this machine, no matter who
# started it — an agent preview (.next-preview*), the human's own `pnpm dev` (.next), or
# a Codex-launched one. Used by the RAM guard.
#
# Why this is stricter than list_preview_servers: this machine has 16GB and a single
# Next dev tree for this app costs several GB. TWO concurrent dev servers is a reliable
# hard crash (Arman, 2026-08-09). So the cap is ONE dev server on the box, period —
# not one per agent. list_preview_servers stays narrow because `reap` must only ever
# kill agent-owned servers, never the human's.
list_any_dev_servers() {
  local dev_pgids
  dev_pgids=$(ps -Ao pid=,command= 2>/dev/null \
               | grep -E 'next(-router)?-worker|next/dist|\.next(-preview)?[/ ]|next dev' \
               | grep -v ' grep ' \
               | awk '{print $1}' \
               | while read -r w; do ps -o pgid= -p "$w" 2>/dev/null; done \
               | tr -d ' ' | sort -u)
  [ -z "$dev_pgids" ] && return 0
  lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null \
    | awk '$1 ~ /node|next/ { print $2, $9 }' \
    | while read -r pid addr; do
        port="${addr##*:}"
        pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
        if printf '%s\n' "$dev_pgids" | grep -qx "$pgid"; then
          # Label it so the deny message can tell the agent whose server it is.
          echo "$pgid $pid $port $(ps -Ao pgid=,command= 2>/dev/null | awk -v g="$pgid" '$1==g' | label_for_argv)"
        fi
      done |
    sort -k1,1n -k3,3n |
    awk '!seen[$1]++ { print $2, $3, $4 }'
}

# Label one dev-server process group from the argv text of its processes (stdin): the two
# named shared servers by their dist dir, everything else human-or-other. Twin of the table in
# scripts/agent-harness/shared-servers.sh; scripts/__tests__/shared-dev-servers.test.ts pins it.
label_for_argv() {
  local text
  text="$(cat)"
  if printf '%s' "$text" | grep -q '\.next-preview-clone'; then
    echo agent-preview-clone
  elif printf '%s' "$text" | grep -qE '\.next-preview([^-]|$)'; then
    echo agent-preview
  else
    echo human-or-other
  fi
}

# One sentence naming every running dev server, for the deny messages.
describe_running() {
  printf '%s\n' "$1" | awk 'NF>=3 { printf "%s%s on port %s (pid %s)", (n++ ? ", " : ""), $3, $2, $1 } END { if (!n) printf "none" }'
}

TWO_SERVERS="The only dev servers allowed on this machine are the two shared ones: pnpm preview:start (live database, port 3001) and pnpm preview:start --clone (the clone only, port 3002). A third or per-agent server is refused: extra dev servers exhausted memory and rebooted the Mac twice."

# Kill a preview server and its whole process tree (workers + pnpm/next wrappers).
# Kills the server's process group for a clean sweep, but NEVER the group this hook
# itself belongs to (defensive: a shared pgid must not take down the caller).
kill_preview_tree() {
  local pid="$1"
  local pgid own_pgid
  pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
  own_pgid=$(ps -o pgid= -p "$$" 2>/dev/null | tr -d ' ')
  if [ -n "$pgid" ] && [ "$pgid" != "$own_pgid" ]; then
    kill -TERM "-$pgid" 2>/dev/null
  fi
  kill -TERM "$pid" 2>/dev/null
  # Sweep any orphaned Next.js preview workers by their unique argv marker.
  pkill -TERM -f '\.next-preview' 2>/dev/null
}

case "${1:-}" in
  list)
    list_preview_servers
    ;;

  guard)
    input=$(cat)
    tool_name=$(printf '%s' "$input" | /usr/bin/python3 -c 'import sys,json;print(json.load(sys.stdin).get("tool_name",""))' 2>/dev/null)
    server_name=$(printf '%s' "$input" | /usr/bin/python3 -c 'import sys,json;print((json.load(sys.stdin).get("tool_input") or {}).get("name",""))' 2>/dev/null)

    # Only gate actual dev-server launches (preview_start with a `name`).
    # A url-only preview_start opens a browser tab and starts no server -> allow.
    if [ -z "$server_name" ]; then
      exit 0
    fi

    # Named preview_start is Claude-only and produces an untracked process. Keep
    # browser launch separate from server launch for both providers.
    running=$(list_any_dev_servers)
    if [ -n "$running" ]; then
      reason="Running now: $(describe_running "$running"). ${TWO_SERVERS} Use the running one at your own hostname (pnpm preview:start [--clone] prints it); never certify a different worktree against it."
      /usr/bin/python3 - "$reason" <<'PY'
import json, sys
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": sys.argv[1],
    }
}))
PY
      exit 0
    fi
    reason="Named preview_start is a Claude-only, untracked server launcher and is not the shared Matrx path. ${TWO_SERVERS} Run one of those and open the <session> URL it prints in the in-app browser."
    /usr/bin/python3 - "$reason" <<'PY'
import json, sys
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": sys.argv[1],
    }
}))
PY
    exit 0
    ;;

  guard-bash)
    # PreToolUse gate for Bash. The `guard` subcommand only sees preview_start, so an
    # agent could sail straight past it with `pnpm dev` in a shell — the exact thing that
    # hard-crashes this 16GB box. This closes that hole.
    input=$(cat)
    cmd=$(printf '%s' "$input" | /usr/bin/python3 -c 'import sys,json;print((json.load(sys.stdin).get("tool_input") or {}).get("command",""))' 2>/dev/null)

    # Only care about commands that BOOT a Next dev server.
    if ! printf '%s' "$cmd" | grep -qE '(^|[[:space:];&|])(pnpm|npm|yarn|bun)( run)? dev([[:space:]]|$)|(^|[[:space:];&|])next dev([[:space:]]|$)'; then
      exit 0
    fi
    # `--help`, greps and echoes about dev servers are not launches.
    if printf '%s' "$cmd" | grep -qE '(^|[|;&]) *(grep|rg|echo|cat|printf) '; then
      exit 0
    fi

    running=$(list_any_dev_servers)
    if [ -n "$running" ]; then
      reason="Running now: $(describe_running "$running"). ${TWO_SERVERS} Do NOT launch another or certify a different worktree against a running one. Only if one is genuinely stale, stop it from its owning checkout (pnpm preview:stop [--clone]) and start it again."
      /usr/bin/python3 - "$reason" <<'PY'
import json, sys
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": sys.argv[1],
    }
}))
PY
      exit 0
    fi
    # Nothing is running, but a raw launch is still unmanaged. Codex PreToolUse
    # does not support permissionDecision=ask, so block and name the safe command.
    /usr/bin/python3 - <<'PY'
import json
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "Raw pnpm/npm/yarn/bun/next dev launches are untracked and would be a third server. Run pnpm preview:start (live database, port 3001) or pnpm preview:start --clone (the clone, port 3002); each starts or reuses its one managed server.",
    }
}))
PY
    exit 0
    ;;

  list-any)
    list_any_dev_servers
    ;;

  label)
    # stdin: argv text of one process group. Exposed for the Jest guard.
    label_for_argv
    ;;

  reap)
    # Count live Claude Code sessions. Each real session runs as
    #   /…/claude-code/<ver>/claude.app/Contents/MacOS/claude <args>
    # (a separate `disclaimer` launcher carries the same path as an ARGUMENT, so we
    # drop those lines). The shared preview server may be in use by any live session,
    # so only reap when THIS is the last one standing. At SessionEnd our own process
    # is still alive and counted, hence the <=1 threshold.
    sessions=$(ps -Ao command= 2>/dev/null \
                 | grep -E '/claude-code/[^ ]*/claude\.app/Contents/MacOS/claude ' \
                 | grep -vc 'Helpers/disclaimer')
    if [ "${sessions:-0}" -gt 1 ]; then
      # Another Claude session is live — leave the shared preview server alone.
      exit 0
    fi
    list_preview_servers | while read -r pid port distdir; do
      kill_preview_tree "$pid"
    done
    # Give TERM a moment, then force-free any port still held.
    sleep 1
    list_preview_servers | while read -r pid port distdir; do
      kill -9 "$pid" 2>/dev/null
    done
    exit 0
    ;;

  *)
    echo "usage: matrx-preview-ports.sh {list|list-any|label|guard|guard-bash|reap}" >&2
    exit 2
    ;;
esac
