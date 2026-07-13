#!/usr/bin/env bash
#
# dev-cleanup.sh — manage this repo's local dev servers and build caches.
#
# Long-lived `next dev` servers (one per parallel agent, each on its own
# NEXT_DISTDIR) and the .next* build dirs they write pile up over a day of work:
# multi-GB RAM per server and, mainly, tens-to-hundreds of GB of build caches.
# This is the one place to see and reclaim all of it — scoped to matrx-frontend
# ONLY, so a dev server for another repo (e.g. aidream on a 30xx port) is spared.
#
# Usage:
#   scripts/dev-cleanup.sh status   # show OUR 30xx servers + build-dir disk use
#   scripts/dev-cleanup.sh ports    # stop every OUR 30xx dev server (leaves disk)
#   scripts/dev-cleanup.sh next     # delete ALL .next* build dirs incl .next (leaves servers)
#   scripts/dev-cleanup.sh all      # the big red button: ports + next
#
# "OURS" = a listener on TCP 3000-3099 whose process cwd is inside this repo.
# Aliased in package.json as: dev:status / dev:stop / clean:next:all / dev:nuke
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT_LO=3000
PORT_HI=3099

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
dim()  { printf '\033[2m%s\033[0m\n' "$1"; }

# Echo "PID PORT" for every process listening on a 30xx TCP port.
listeners() {
  lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk -v lo="$PORT_LO" -v hi="$PORT_HI" '
    NR==1 { next }
    {
      n = split($9, a, ":"); port = a[n] + 0
      if (port >= lo && port <= hi) print $2, port
    }' | sort -u
}

# True if PID's current working directory is inside this repo.
is_ours() {
  local pid="$1" cwd
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/{print substr($0,2); exit}')"
  [[ -n "$cwd" && "$cwd" == "$REPO_ROOT"* ]]
}

# Echo "PID PORT" only for listeners belonging to THIS repo.
our_listeners() {
  while read -r pid port; do
    [[ -z "${pid:-}" ]] && continue
    if is_ours "$pid"; then echo "$pid $port"; fi
  done < <(listeners)
}

cmd_status() {
  bold "matrx-frontend dev servers (ports ${PORT_LO}-${PORT_HI}, this repo only)"
  local any=0
  while read -r pid port; do
    [[ -z "${pid:-}" ]] && continue
    any=1
    ps -o pid=,etime=,rss=,command= -p "$pid" 2>/dev/null | awk -v port="$port" '
      { rssmb = $3/1024
        printf "  :%s  pid %-7s  up %-11s  %6.0f MB  %s\n", port, $1, $2, rssmb, "next-server" }'
  done < <(our_listeners)
  [[ "$any" -eq 0 ]] && dim "  (none running)" || true

  echo
  bold "Build directories on disk"
  local found=0
  for d in "$REPO_ROOT"/.next "$REPO_ROOT"/.next-preview* "$REPO_ROOT"/.next-qa* "$REPO_ROOT"/.next-agent-* "$REPO_ROOT"/.turbo; do
    if [[ -e "$d" ]]; then found=1; du -sh "$d" 2>/dev/null | awk '{printf "  %-8s %s\n", $1, $2}'; fi
  done
  [[ "$found" -eq 0 ]] && dim "  (none)" || true
}

cmd_ports() {
  local killed=0
  while read -r pid port; do
    [[ -z "${pid:-}" ]] && continue
    # Kill the whole process group (pnpm dev -> sh -> next dev -> next-server),
    # so no orphaned parent lingers.
    local pgid
    pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
    echo "  stopping :$port (pid $pid, pgid ${pgid:-?})"
    if [[ -n "$pgid" ]]; then kill -TERM "-$pgid" 2>/dev/null || true; else kill -TERM "$pid" 2>/dev/null || true; fi
    killed=1
  done < <(our_listeners)

  if [[ "$killed" -eq 0 ]]; then dim "  no matrx-frontend dev servers running"; return; fi

  # Grace period, then SIGKILL any survivor.
  for _ in 1 2 3 4 5 6; do
    [[ -z "$(our_listeners)" ]] && break
    sleep 0.5
  done
  while read -r pid port; do
    [[ -z "${pid:-}" ]] && continue
    local pgid; pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
    echo "  force-killing :$port (pid $pid)"
    if [[ -n "$pgid" ]]; then kill -KILL "-$pgid" 2>/dev/null || true; else kill -KILL "$pid" 2>/dev/null || true; fi
  done < <(our_listeners)
  bold "dev servers stopped"
}

cmd_next() {
  bold "deleting build directories..."
  # .next* covers .next, .next-preview, .next-preview-qaN, .next-preview-cutoverqa, .next-qa*
  # plus .turbo and the module cache. Everything here is regenerated on next `pnpm dev`/build.
  rm -rf "$REPO_ROOT"/.next* "$REPO_ROOT"/.turbo "$REPO_ROOT"/node_modules/.cache "$REPO_ROOT"/tsconfig.tsbuildinfo
  bold "all build caches removed (.next and every alternate build dir)"
}

cmd_all() {
  cmd_ports
  echo
  cmd_next
}

case "${1:-status}" in
  status) cmd_status ;;
  ports)  cmd_ports ;;
  next)   cmd_next ;;
  all)    cmd_all ;;
  *) echo "usage: $0 {status|ports|next|all}" >&2; exit 2 ;;
esac
