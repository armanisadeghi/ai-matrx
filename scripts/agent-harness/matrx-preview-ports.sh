#!/usr/bin/env bash
# matrx-preview-ports.sh — enforce one managed preview server on this machine.
#
# Why this exists: Claude's named preview_start and raw shell launches each create
# an untracked Next.js tree. Codex does not expose preview_start at all. Both agents
# instead use the provider-neutral `pnpm preview:start`, which registers one shared
# server for process cleanup and browser reuse.
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
          if ps -Ao pgid=,command= 2>/dev/null | awk -v g="$pgid" '$1==g' | grep -q '\.next-preview'; then
            echo "$pgid $pid $port agent-preview"
          else
            echo "$pgid $pid $port human-or-other"
          fi
        fi
      done |
    sort -k1,1n -k3,3n |
    awk '!seen[$1]++ { print $2, $3, $4 }'
}

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
      port=$(printf '%s' "$running" | head -1 | awk '{print $2}')
      owner=$(printf '%s' "$running" | head -1 | awk '{print $3}')
      reason="A Next.js dev server is already running on this machine (port ${port}, ${owner}). Do NOT start a second: open http://localhost:${port} in your browser. If it is genuinely stale or belongs to the wrong repo, stop it deliberately, then run pnpm preview:start."
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
    reason="Named preview_start is a Claude-only, untracked server launcher and is not the shared Matrx path. Run pnpm preview:start instead, then open http://localhost:3001 in the in-app browser."
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
      port=$(printf '%s' "$running" | head -1 | awk '{print $2}')
      owner=$(printf '%s' "$running" | head -1 | awk '{print $3}')
      reason="A Next.js dev server is ALREADY running on this machine (port ${port}, ${owner}). This box has 16GB and a second dev server is a reliable hard crash — the cap is ONE, machine-wide, shared by you, Arman, and Codex. Do NOT launch another: point the Browser pane at http://localhost:${port} instead. Only if that server is genuinely stale, stop it first (preview_stop, or kill its PID) and then start yours."
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
        "permissionDecisionReason": "Raw pnpm/npm/yarn/bun/next dev launches are untracked. Run pnpm preview:start instead; it starts or reuses the one managed server on port 3001.",
    }
}))
PY
    exit 0
    ;;

  list-any)
    list_any_dev_servers
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
    echo "usage: matrx-preview-ports.sh {list|list-any|guard|guard-bash|reap}" >&2
    exit 2
    ;;
esac
