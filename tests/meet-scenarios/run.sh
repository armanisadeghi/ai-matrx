#!/usr/bin/env bash
# One command for the meet state scenarios. No argument = every P0 scenario;
# an argument = one state id (or any -g pattern). Extra args pass to Playwright.
#   bash tests/meet-scenarios/run.sh
#   bash tests/meet-scenarios/run.sh wr-denied
#   MEET_BROWSERS=chromium,webkit MEET_WORKERS=2 bash tests/meet-scenarios/run.sh
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT"
ARGS=()
if [[ $# -gt 0 && "$1" != -* ]]; then ARGS+=(-g "[ ]$1\$"); shift; fi
exec pnpm exec playwright test -c "$HERE/playwright.config.ts" ${ARGS[@]+"${ARGS[@]}"} "$@"
