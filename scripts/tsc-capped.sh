#!/usr/bin/env bash
#
# tsc-capped.sh — every type-check in this repo runs under a memory ceiling.
#
# WHY (2026-09-24): three concurrent type-checks of this repo reached 81 GB
# together (still climbing) while ~330 dev-server workers held another 160 GB.
# The 256 GB host ran out of memory, WindowServer starved, and the kernel's
# userspace watchdog rebooted the Mac twice (21:38 panic, 01:00 WindowServer
# kill) — Arman lost every running session both times. A type-check is never
# worth the machine: past the ceiling it is killed here, loudly, and the
# machine lives.
#
# Two compilers live in node_modules and a Node flag caps only one of them:
#   tsc6 — TypeScript 6 (JavaScript)  → capped by --max-old-space-size
#   tsc  — TypeScript 7 (native Go)   → ignores NODE_OPTIONS; GOMEMLIMIT only
#                                        makes its GC try harder, never stops it
# So the real cap is the RSS watchdog below, which covers both.
#
# Usage:  bash scripts/tsc-capped.sh <tsc6|tsc> [compiler args...]
# Knob:   MATRX_TSC_MAX_RSS_GB (default 20 — measured 2026-09-24: a clean
#         full run peaks at 12.8 GB (tsc6) and 13.4 GB (native tsc))
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPILER="${1:?usage: tsc-capped.sh <tsc6|tsc> [args...]}"
shift
CAP_GB="${MATRX_TSC_MAX_RSS_GB:-20}"
CAP_KB=$(( CAP_GB * 1048576 ))
BIN="$REPO_ROOT/node_modules/.bin/$COMPILER"
[[ -x "$BIN" ]] || { echo "[tsc-capped] ERROR: $BIN not found — run pnpm install" >&2; exit 2; }

export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=$(( CAP_GB * 1024 ))"
export GOMEMLIMIT="${CAP_GB}GiB"

tree_rss_kb() { # RSS of $1 and every descendant, in KB
  local pids=("$1") i=0 kids
  while (( i < ${#pids[@]} )); do
    kids=$(pgrep -P "${pids[$i]}" 2>/dev/null) && pids+=($kids)
    i=$(( i + 1 ))
  done
  ps -o rss= -p "$(IFS=,; echo "${pids[*]}")" 2>/dev/null | awk '{s+=$1} END {print s+0}'
}

kill_tree() {
  local p
  for p in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$p"; done
  kill -9 "$1" 2>/dev/null
}

"$BIN" "$@" &
CHILD=$!
trap 'kill_tree "$CHILD"; exit 130' INT TERM

PEAK_KB=0
while kill -0 "$CHILD" 2>/dev/null; do
  RSS_KB=$(tree_rss_kb "$CHILD")
  (( RSS_KB > PEAK_KB )) && PEAK_KB=$RSS_KB
  if (( RSS_KB > CAP_KB )); then
    kill_tree "$CHILD"
    wait "$CHILD" 2>/dev/null
    printf '\n[tsc-capped] KILLED: %s passed its %s GB memory ceiling (%.1f GB).\n' \
      "$COMPILER" "$CAP_GB" "$(awk -v k="$RSS_KB" 'BEGIN{print k/1048576}')" >&2
    printf '[tsc-capped] A runaway type-check starves the whole Mac and forces a reboot.\n' >&2
    printf '[tsc-capped] If this project honestly needs more, measure a clean run and raise\n' >&2
    printf '[tsc-capped] MATRX_TSC_MAX_RSS_GB — never run tsc outside this wrapper.\n' >&2
    exit 137
  fi
  perl -e 'select(undef,undef,undef,1)'
done

wait "$CHILD"
STATUS=$?
if [[ -n "${MATRX_TSC_REPORT_PEAK:-}" ]]; then
  printf '[tsc-capped] peak RSS %.2f GB (cap %s GB)\n' "$(awk -v k="$PEAK_KB" 'BEGIN{print k/1048576}')" "$CAP_GB" >&2
fi
exit "$STATUS"
