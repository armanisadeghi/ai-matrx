#!/usr/bin/env bash
# run-release-gates.sh — Quality gates before a release (formerly pre-commit).
#
# Runs doctrine, UI primitives, migration ledger, and dead-relations checks
# with a visible spinner so a 30–45s run never looks hung.
#
# Usage:
#   ./scripts/run-release-gates.sh           # strict — blocks on failure (release default)
#   ./scripts/run-release-gates.sh --advisory  # loud only, exit 0 (old pre-commit behavior)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

ADVISORY=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --advisory) ADVISORY=true; shift ;;
        -h|--help)
            grep '^#' "$0" | head -12 | sed 's/^# \?//'
            exit 0
            ;;
        *) echo "Unknown flag: $1" >&2; exit 2 ;;
    esac
done

if $ADVISORY; then
    declare -a GATES=(
        "Doctrine check|pnpm exec tsx scripts/check-doctrine.ts"
        "UI primitives check|pnpm exec tsx scripts/check-ui-primitives.ts"
        "Migration ledger check|pnpm exec tsx scripts/check-migrations.ts"
        "Dead relation references|pnpm exec tsx scripts/check-dead-relations.ts"
    )
else
    declare -a GATES=(
        "Doctrine check|pnpm exec tsx scripts/check-doctrine.ts --strict"
        "UI primitives check|pnpm exec tsx scripts/check-ui-primitives.ts --strict"
        "Migration ledger check|pnpm exec tsx scripts/check-migrations.ts --strict"
        "Dead relation references|pnpm exec tsx scripts/check-dead-relations.ts --strict"
    )
fi

echo ""
echo -e "${BOLD}  Release quality gates${NC}"
echo -e "  ${DIM}${#GATES[@]} checks — typically 30–45s${NC}"
$ADVISORY && echo -e "  ${YELLOW}Mode: advisory (warnings only)${NC}"
echo ""

_spinner_frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')

run_gate() {
    local step="$1"
    local total="$2"
    local label="$3"
    local cmd="$4"

    local tmp
    tmp="$(mktemp "${TMPDIR:-/tmp}/release-gate.XXXXXX")"

    bash -c "$cmd" >"$tmp" 2>&1 &
    local pid=$!
    local frame_i=0
    local start=$SECONDS

    while kill -0 "$pid" 2>/dev/null; do
        local elapsed=$(( SECONDS - start ))
        printf "\r  ${_spinner_frames[$frame_i]}  [%s/%s] %s… %ss" \
            "$step" "$total" "$label" "$elapsed"
        frame_i=$(( (frame_i + 1) % ${#_spinner_frames[@]} ))
        sleep 0.12
    done

    local exit_code=0
    wait "$pid" || exit_code=$?

    local elapsed=$(( SECONDS - start ))
    printf "\r%80s\r" ""

    if [[ $exit_code -ne 0 ]]; then
        echo -e "${RED}[FAIL]${NC}  [$step/$total] ${label} (${elapsed}s)"
        [[ -s "$tmp" ]] && cat "$tmp"
        rm -f "$tmp"
        return "$exit_code"
    fi

    echo -e "${GREEN}[OK]${NC}    [$step/$total] ${label} (${elapsed}s)"
    rm -f "$tmp"
    return 0
}

failed=0
step=1
total=${#GATES[@]}

for entry in "${GATES[@]}"; do
    IFS='|' read -r label cmd <<< "$entry"
    if ! run_gate "$step" "$total" "$label" "$cmd"; then
        failed=1
        break
    fi
    step=$(( step + 1 ))
done

echo ""
if [[ $failed -ne 0 ]]; then
    echo -e "${RED}${BOLD}Release gates failed — fix the issues above before releasing.${NC}"
    echo ""
    exit 1
fi

echo -e "${GREEN}${BOLD}All release gates passed.${NC}"
echo ""
exit 0
