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
# The queue runner enforces an RSS watchdog for both compilers.
#
# Usage:  bash scripts/tsc-capped.sh <tsc6|tsc> [compiler args...]
# Knob:   MATRX_TSC_MAX_RSS_GB (default 20 — measured 2026-09-24: a clean
#         full run peaks at 12.8 GB (tsc6) and 13.4 GB (native tsc))
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPILER="${1:?usage: tsc-capped.sh <tsc6|tsc> [args...]}"
shift
BIN="$REPO_ROOT/node_modules/.bin/$COMPILER"
[[ -x "$BIN" ]] || { echo "[tsc-capped] ERROR: $BIN not found — run pnpm install" >&2; exit 2; }
# Central machine cap: ~/.config/matrx/tsc-queue.json, {"max_concurrent": 1}.
# There is intentionally no caller environment override.
exec python3 "$REPO_ROOT/scripts/tsc-queue.py" --root "$REPO_ROOT" --compiler "$COMPILER" --bin "$BIN" -- "$@"
