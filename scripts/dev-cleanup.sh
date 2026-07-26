#!/usr/bin/env bash
#
# dev-cleanup.sh — manage this repo's local dev servers and build caches.
#
# Long-lived `next dev` servers (one per parallel agent, each on its own
# NEXT_DISTDIR) and the .next* build dirs they write pile up over a day of work.
# On this machine a SINGLE dev server has been measured at 22.8 GB RSS with 17
# worker processes after compiling /dashboard once. Several of those at a time is
# what takes the whole machine down. This is the one place to see and reclaim it.
#
# Usage:
#   scripts/dev-cleanup.sh status         # show OUR dev servers + build-dir disk use
#   scripts/dev-cleanup.sh reap [--dry-run]  # kill only runaway / abandoned / orphan servers
#   scripts/dev-cleanup.sh ports          # stop EVERY one of our dev servers (leaves disk)
#   scripts/dev-cleanup.sh next           # delete ALL .next* build dirs incl .next
#   scripts/dev-cleanup.sh all            # the big red button: ports + next
#
# "OURS" = a `next-server` process whose cwd is inside this repo.
#
# DISCOVERY IS PROCESS-BASED, NOT PORT-BASED — deliberately.
# The previous version scanned TCP 3000-3099 for listeners. A dev server that
# binds an ephemeral port (observed: pid 39313 listening on :50862, 7.6 GB,
# running 1h22m) was invisible to `status` and immune to `stop` — an immortal
# orphan. Never reintroduce a port-range filter as the discovery mechanism.
#
# Aliased in package.json as: dev:status / dev:reap / dev:stop / clean:next:all / dev:nuke
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$REPO_ROOT/.matrx/dev-sessions"

# --- reap thresholds (override via env) -------------------------------------
# A server over the RSS ceiling is the machine-killer; a server past the age
# ceiling is abandoned; an untracked server was started by a raw `pnpm dev` that
# no SessionEnd hook will ever clean up.
#
# Calibrating MAX_RSS_GB: on this repo a dev server idles around 0.3 GB, retains
# 7-9 GB after compiling a few heavy routes, and was measured at 22.8 GB after a
# single /dashboard compile. Turbopack never gives that back, so RSS is a
# high-water mark, not a transient peak — the ceiling has to sit ABOVE the
# normal-heavy band or it kills agents doing legitimate work. 16 GB catches the
# pathological case only. Age + untracked rules do the routine cleanup.
MAX_RSS_GB="${MATRX_DEV_MAX_RSS_GB:-16}"
MAX_AGE_H="${MATRX_DEV_MAX_AGE_H:-4}"
MAX_UNTRACKED_AGE_MIN="${MATRX_DEV_MAX_UNTRACKED_AGE_MIN:-90}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
dim()  { printf '\033[2m%s\033[0m\n' "$1"; }
warn() { printf '\033[33m%s\033[0m\n' "$1"; }

# ps etime ("MM:SS", "HH:MM:SS", "DD-HH:MM:SS") -> seconds. macOS ps has no etimes.
age_seconds() {
  awk -v s="$1" 'BEGIN{
    d=0
    if (index(s,"-")) { split(s,p,"-"); d=p[1]+0; s=p[2] }
    n=split(s,t,":")
    if (n==2) sec=t[1]*60+t[2]; else if (n==3) sec=t[1]*3600+t[2]*60+t[3]; else sec=0
    print d*86400+sec
  }'
}

# True if PID's cwd is inside this repo.
is_ours() {
  local cwd
  cwd="$(lsof -a -p "$1" -d cwd -Fn 2>/dev/null | awk '/^n/{print substr($0,2); exit}')"
  [[ -n "$cwd" && "$cwd" == "$REPO_ROOT"* ]]
}

# The listening port for a pid, or "-" (a server may legitimately have none yet).
port_of() {
  lsof -a -nP -p "$1" -iTCP -sTCP:LISTEN 2>/dev/null |
    awk 'NR>1{n=split($9,a,":"); print a[n]; exit}'
}

# Best-effort NEXT_DISTDIR: read it out of a worker child's argv. macOS ps does
# not expose the environment, so argv is the only handle we have.
distdir_of() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do
    ps -o command= -p "$child" 2>/dev/null | grep -o '\.next[A-Za-z0-9._-]*' | head -1 && return 0
  done
  echo "-"
}

# The top of the tree to kill: walk up from next-server past `next dev` / `sh -c`
# / `pnpm dev` while the ancestor is still one of ours. Never returns pid 1.
tree_root_of() {
  local pid="$1" parent cmd
  while :; do
    parent="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
    [[ -z "$parent" || "$parent" -le 1 ]] && break
    cmd="$(ps -o command= -p "$parent" 2>/dev/null)"
    case "$cmd" in
      *"next dev"*|*"/bin/next"*|*"pnpm dev"*|*"next-server"*) pid="$parent" ;;
      *) break ;;
    esac
  done
  echo "$pid"
}

# Recursively kill a pid and every descendant. Deliberately NOT `kill -pgid`:
# a hook-launched server can share a process group with the agent that spawned
# it, and killing that group would take the agent down with the server.
killtree() {
  local pid="$1" sig="${2:-TERM}" child
  [[ -z "$pid" ]] && return 0
  for child in $(pgrep -P "$pid" 2>/dev/null); do killtree "$child" "$sig"; done
  kill -"$sig" "$pid" 2>/dev/null || true
}

# Every PID recorded in the session state dir (hook-managed servers).
tracked_pids() {
  grep -h '^PID=' "$STATE_DIR"/*.meta 2>/dev/null | sed 's/^PID=//' | tr -d ' '
}

is_tracked() {
  local pid="$1" t root
  root="$(tree_root_of "$pid")"
  for t in $(tracked_pids); do
    [[ "$t" == "$pid" || "$t" == "$root" ]] && return 0
  done
  return 1
}

# Emit one line per dev server of ours: PID RSS_KB AGE_SEC PORT DISTDIR TRACKED
our_servers() {
  local pid rss etime
  for pid in $(pgrep -f 'next-server' 2>/dev/null); do
    is_ours "$pid" || continue
    read -r rss etime <<<"$(ps -o rss=,etime= -p "$pid" 2>/dev/null | awk '{print $1, $2}')"
    [[ -z "${rss:-}" ]] && continue
    local tracked="no"; is_tracked "$pid" && tracked="yes"
    echo "$pid $rss $(age_seconds "$etime") $(port_of "$pid" || echo -) $(distdir_of "$pid") $tracked"
  done
}

# Why this server should be reaped, or "" to keep it.
reap_reason() {
  local rss_kb="$1" age_s="$2" tracked="$3"
  local rss_gb_x10=$(( rss_kb * 10 / 1048576 ))
  local limit_x10; limit_x10="$(awk -v g="$MAX_RSS_GB" 'BEGIN{printf "%d", g*10}')"
  if (( rss_gb_x10 >= limit_x10 )); then
    echo "runaway memory ($(awk -v k="$rss_kb" 'BEGIN{printf "%.1f", k/1048576}') GB >= ${MAX_RSS_GB} GB)"; return
  fi
  if (( age_s >= MAX_AGE_H * 3600 )); then
    echo "abandoned (up $(( age_s / 3600 ))h >= ${MAX_AGE_H}h)"; return
  fi
  if [[ "$tracked" == "no" ]] && (( age_s >= MAX_UNTRACKED_AGE_MIN * 60 )); then
    echo "untracked orphan (raw \`pnpm dev\`, up $(( age_s / 60 ))m >= ${MAX_UNTRACKED_AGE_MIN}m, no session owns it)"; return
  fi
  echo ""
}

cmd_status() {
  bold "matrx-frontend dev servers (process-based discovery, this repo only)"
  printf '  %-8s %-10s %-9s %-7s %-28s %-8s %s\n' PID RSS UP PORT DISTDIR TRACKED VERDICT
  local any=0 total=0
  while read -r pid rss age port dd tracked; do
    [[ -z "${pid:-}" ]] && continue
    any=1; total=$((total + rss))
    local reason; reason="$(reap_reason "$rss" "$age" "$tracked")"
    local verdict="ok"; [[ -n "$reason" ]] && verdict="REAP: $reason"
    printf '  %-8s %-10s %-9s %-7s %-28s %-8s %s\n' \
      "$pid" \
      "$(awk -v k="$rss" 'BEGIN{printf "%.1f GB", k/1048576}')" \
      "$(printf '%dh%02dm' $((age/3600)) $(((age%3600)/60)))" \
      "$port" "$dd" "$tracked" "$verdict"
  done < <(our_servers)
  if [[ "$any" -eq 0 ]]; then
    dim "  (none running)"
  else
    echo
    bold "  TOTAL: $(awk -v k="$total" 'BEGIN{printf "%.1f GB", k/1048576}') across these servers"
  fi

  echo
  bold "Build directories on disk"
  local found=0 d
  for d in "$REPO_ROOT"/.next "$REPO_ROOT"/.next-preview* "$REPO_ROOT"/.next-qa* "$REPO_ROOT"/.next-agent-* "$REPO_ROOT"/.turbo; do
    if [[ -e "$d" ]]; then found=1; du -sh "$d" 2>/dev/null | awk '{printf "  %-8s %s\n", $1, $2}'; fi
  done
  [[ "$found" -eq 0 ]] && dim "  (none)" || true
}

# Kill only what is actually harmful. Safe to run automatically.
cmd_reap() {
  local dry=0 prefix=""
  # NOTE: the prefix is a separate string, NOT ${dry:+...} — dry=0 is a non-empty
  # value, so :+ expands for it and the reaper printed "[dry-run]" while really killing.
  if [[ "${1:-}" == "--dry-run" ]]; then dry=1; prefix="[dry-run] "; fi
  local killed=0
  while read -r pid rss age port dd tracked; do
    [[ -z "${pid:-}" ]] && continue
    local reason; reason="$(reap_reason "$rss" "$age" "$tracked")"
    [[ -z "$reason" ]] && continue
    local root; root="$(tree_root_of "$pid")"
    warn "  ${prefix}reaping pid $pid (tree root $root, :$port, $dd) — $reason"
    if [[ "$dry" -eq 0 ]]; then
      killtree "$root" TERM
      for _ in 1 2 3 4; do kill -0 "$root" 2>/dev/null || break; sleep 0.5; done
      kill -0 "$root" 2>/dev/null && killtree "$root" KILL
      # Drop the state file of a hook-managed server we just reaped, so the
      # concurrency cap does not keep counting a corpse, and delete its build
      # dir — ONLY when it is a confirmed .next-agent-* dir. Same safety rule as
      # agent-dev-server.sh: the human's .next and the .next-preview* dirs are
      # never auto-deleted, since only the agent dirs are provably session-owned.
      local f
      for f in "$STATE_DIR"/*.meta; do
        [[ -e "$f" ]] || continue
        local mpid mdd; mpid="$(sed -n 's/^PID=//p' "$f" | tr -d ' ')"
        [[ "$mpid" == "$root" || "$mpid" == "$pid" ]] || continue
        mdd="$(sed -n 's/^DISTDIR=//p' "$f" | tr -d ' ')"
        if [[ "$mdd" == .next-agent-* && -d "$REPO_ROOT/$mdd" ]]; then
          dim "    removing its build dir $mdd"
          rm -rf "${REPO_ROOT:?}/$mdd"
        fi
        rm -f "${f%.meta}".meta "${f%.meta}".log "${f%.meta}".ready "${f%.meta}".jar
      done
    fi
    killed=$((killed + 1))
  done < <(our_servers)

  if [[ "$killed" -eq 0 ]]; then
    dim "  nothing to reap (no runaway / abandoned / orphan dev servers)"
  else
    if [[ "$dry" -eq 1 ]]; then bold "  would reap $killed dev server tree(s)"; else bold "  reaped $killed dev server tree(s)"; fi
  fi

  # Stale per-session files whose .meta is long gone (the warm-up subshell can
  # re-touch .ready after SessionEnd already cleaned up). Purely cosmetic, but
  # ~130 of them had accumulated.
  local r base
  for r in "$STATE_DIR"/*.ready "$STATE_DIR"/*.log "$STATE_DIR"/*.jar; do
    [[ -e "$r" ]] || continue
    base="${r%.*}"
    [[ -f "$base.meta" ]] || rm -f "$r"
  done
}

cmd_ports() {
  local killed=0
  while read -r pid rss age port dd tracked; do
    [[ -z "${pid:-}" ]] && continue
    local root; root="$(tree_root_of "$pid")"
    echo "  stopping pid $pid (tree root $root, :$port, $dd)"
    killtree "$root" TERM
    killed=1
  done < <(our_servers)

  if [[ "$killed" -eq 0 ]]; then dim "  no matrx-frontend dev servers running"; return; fi

  for _ in 1 2 3 4 5 6; do
    [[ -z "$(our_servers)" ]] && break
    sleep 0.5
  done
  while read -r pid rss age port dd tracked; do
    [[ -z "${pid:-}" ]] && continue
    echo "  force-killing pid $pid"
    killtree "$(tree_root_of "$pid")" KILL
  done < <(our_servers)
  rm -f "$STATE_DIR"/*.meta "$STATE_DIR"/*.log "$STATE_DIR"/*.ready "$STATE_DIR"/*.jar 2>/dev/null || true
  bold "dev servers stopped"
}

cmd_next() {
  bold "deleting build directories..."
  rm -rf "$REPO_ROOT"/.next* "$REPO_ROOT"/.turbo "$REPO_ROOT"/node_modules/.cache "$REPO_ROOT"/tsconfig.tsbuildinfo
  bold "all build caches removed (.next and every alternate build dir)"
}

cmd_all() { cmd_ports; echo; cmd_next; }

case "${1:-status}" in
  status) cmd_status ;;
  reap)   cmd_reap "${2:-}" ;;
  ports)  cmd_ports ;;
  next)   cmd_next ;;
  all)    cmd_all ;;
  *) echo "usage: $0 {status|reap [--dry-run]|ports|next|all}" >&2; exit 2 ;;
esac
