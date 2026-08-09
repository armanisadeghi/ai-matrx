#!/usr/bin/env bash
# run-release-gates.sh — Quality checks around a release (formerly pre-commit).
#
# Runs doctrine, UI primitives, migration ledger, and dead-relations checks.
# Each gate announces itself before it starts — no silent spinner hiding a
# 60s+ wait. On pass: one OK line. On warn/fail: the check's own report.
#
# DEFAULT IS ADVISORY — loud findings, exit 0 always. Ship/release must never
# be blocked by these checks; only git itself may stop a push.
# Use --strict for CI / manual hard-fail.
#
# Usage:
#   ./scripts/run-release-gates.sh            # advisory — scream, never block
#   ./scripts/run-release-gates.sh --strict   # exit 1 on failure (CI)
#   ./scripts/run-release-gates.sh --advisory # explicit alias of the default
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

STRICT=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --strict) STRICT=true; shift ;;
        --advisory) STRICT=false; shift ;;
        -h|--help)
            grep '^#' "$0" | head -16 | sed 's/^# \?//'
            exit 0
            ;;
        *) echo "Unknown flag: $1" >&2; exit 2 ;;
    esac
done

if $STRICT; then
    declare -a GATES=(
        # First, cheapest, and the one local tsc can't see: the COMMITTED tree
        # must resolve every import — a tracked file importing an untracked one
        # builds locally and dies on Vercel (v0.4.194, 2026-07-28).
        "Untracked-import breakage|bash scripts/check-untracked-imports.sh"
        "TypeScript type-check|pnpm type-check"
        "Doctrine check|pnpm exec tsx scripts/check-doctrine.ts --strict"
        "Doc claims vs live config|pnpm exec tsx scripts/check-doc-claims.ts --strict"
        "Turbopack filesystem tracing|pnpm exec tsx scripts/check-turbopack-fs-tracing.ts"
        "UI primitives check|pnpm exec tsx scripts/check-ui-primitives.ts --strict"
        "Scroll-chain (clipped tables/lists)|pnpm exec tsx scripts/check-scroll-chain.ts --strict"
        "Migration ledger check|pnpm exec tsx scripts/check-migrations.ts --strict"
        "Dead relation references|pnpm exec tsx scripts/check-dead-relations.ts --strict"
        "API contract ratchet|pnpm exec tsx scripts/check-api-contracts.ts --strict"
        "Backend boundary approvals|pnpm exec tsx scripts/check-backend-boundaries.ts --strict"
        "Surface manifest drift|pnpm exec tsx scripts/check-surface-drift.ts"
        "Admin dashboard catalog|pnpm exec tsx scripts/check-admin-catalog.ts --strict"
        "Entity registry generation drift|pnpm check:entity-types"
        # --live pulls the deployed agx_sync_linked_agents() and diffs the TS
        # list against it. If the DB is unreachable it screams and falls back to
        # the committed snapshot rather than failing the release — and because
        # "LIVE PULL FAILED" / "COMMITTED SNAPSHOT IS STALE" are in run_gate's
        # advisory-marker list, that degraded run prints as [WARN] with the full
        # banner instead of a silent green [OK].
        "Agent sync fields vs live RPC (snapshot fallback)|pnpm exec tsx scripts/check-agent-sync-fields.ts --live --strict"
        "Access guard check|pnpm exec tsx scripts/check-access-guards.ts --strict"
        "Visibility vocabulary|pnpm exec tsx scripts/check-visibility-vocab.ts --strict"
        "Protocol mirror sync (aidream)|pnpm exec tsx scripts/check-protocol-sync.ts --strict"
    )
else
    # Non-strict variants still print the full loud report; they exit 0.
    declare -a GATES=(
        # First, cheapest, and the one local tsc can't see: the COMMITTED tree
        # must resolve every import — a tracked file importing an untracked one
        # builds locally and dies on Vercel (v0.4.194, 2026-07-28).
        "Untracked-import breakage|bash scripts/check-untracked-imports.sh"
        # Arman ruling 2026-07-28 (D64/D65): type errors SCREAM here on every
        # release but never stop the build (ignoreBuildErrors stays true).
        "TypeScript type-check|pnpm type-check"
        "Doctrine check|pnpm exec tsx scripts/check-doctrine.ts"
        "Doc claims vs live config|pnpm exec tsx scripts/check-doc-claims.ts"
        "Turbopack filesystem tracing|pnpm exec tsx scripts/check-turbopack-fs-tracing.ts"
        "UI primitives check|pnpm exec tsx scripts/check-ui-primitives.ts"
        "Scroll-chain (clipped tables/lists)|pnpm exec tsx scripts/check-scroll-chain.ts"
        "Migration ledger check|pnpm exec tsx scripts/check-migrations.ts"
        "Dead relation references|pnpm exec tsx scripts/check-dead-relations.ts"
        "API contract ratchet|pnpm exec tsx scripts/check-api-contracts.ts"
        "Backend boundary approvals|pnpm exec tsx scripts/check-backend-boundaries.ts"
        "Surface manifest drift|pnpm exec tsx scripts/check-surface-drift.ts"
        "Admin dashboard catalog|pnpm exec tsx scripts/check-admin-catalog.ts"
        "Entity registry generation drift|pnpm check:entity-types"
        "Agent sync fields vs live RPC (snapshot fallback)|pnpm exec tsx scripts/check-agent-sync-fields.ts --live"
        "Access guard check|pnpm exec tsx scripts/check-access-guards.ts"
        "Visibility vocabulary|pnpm exec tsx scripts/check-visibility-vocab.ts"
        "Protocol mirror sync (aidream)|pnpm exec tsx scripts/check-protocol-sync.ts"
        # Advisory-only for now: known Wave-5 backlog (confident-title claims,
        # stale common-docs pointers) would hard-block strict mode. Promote to
        # the strict list once docs/handoffs/doc-consolidation-campaign.md
        # Wave 5 cleanup lands.
        "Docs guards (titles/root-md/pointers)|pnpm exec tsx scripts/check-docs-guards.ts"
    )
fi

echo ""
echo -e "${BOLD}  Release quality gates${NC}"
echo -e "  ${DIM}${#GATES[@]} checks — each prints its name before it starts${NC}"
if $STRICT; then
    echo -e "  ${CYAN}Mode: strict (blocks on failure)${NC}"
else
    echo -e "  ${CYAN}Mode: advisory (reports findings; never blocks ship/push)${NC}"
fi
echo ""

# Heartbeat so a long gate never looks hung — one line every HEARTBEAT_SECS.
HEARTBEAT_SECS=15

print_gate_details() {
    local output_file="$1"

    echo -e "      ${DIM}Details:${NC}"
    awk '
        NF { last_nonblank = NR }
        { lines[NR] = $0 }
        END {
            first_nonblank = 1
            while (first_nonblank <= last_nonblank && lines[first_nonblank] ~ /^[[:space:]]*$/) {
                first_nonblank++
            }
            for (line = first_nonblank; line <= last_nonblank; line++) {
                print "        " lines[line]
            }
        }
    ' "$output_file"
    echo ""
}

run_gate() {
    local step="$1"
    local total="$2"
    local label="$3"
    local cmd="$4"

    local tmp
    tmp="$(mktemp "${TMPDIR:-/tmp}/release-gate.XXXXXX")"

    echo -e "${CYAN}[INFO]${NC}  [$step/$total] ${label}..."

    bash -c "$cmd" >"$tmp" 2>&1 &
    local pid=$!
    local start=$SECONDS
    local last_beat=0

    while kill -0 "$pid" 2>/dev/null; do
        local elapsed=$(( SECONDS - start ))
        if [[ $elapsed -ge $(( last_beat + HEARTBEAT_SECS )) ]]; then
            echo -e "  ${DIM}… still ${label} (${elapsed}s)${NC}"
            last_beat=$elapsed
        fi
        sleep 1
    done

    local exit_code=0
    wait "$pid" || exit_code=$?

    local elapsed=$(( SECONDS - start ))

    # Always surface the check's own report when it wrote anything — advisory
    # mode exits 0 with a loud red box; hiding that would defeat the point.
    local has_output=false
    [[ -s "$tmp" ]] && has_output=true

    if [[ $exit_code -ne 0 ]]; then
        echo -e "${RED}[FAIL]${NC}  [$step/$total] ${label} (${elapsed}s)"
        $has_output && print_gate_details "$tmp"
        rm -f "$tmp"
        return 1
    fi

    # Heuristic: non-strict checkers still print SCHEMA TRUTH-CHECK / FAIL boxes
    # while exiting 0. Treat that as a loud advisory failure for the summary.
    if $has_output && grep -qE 'ADMIN ROUTE REGISTRY GAP|SCHEMA TRUTH-CHECK|PROTOCOL MIRROR DRIFT|LIVE PULL FAILED|COMMITTED SNAPSHOT IS STALE|Release gates failed|\[FAIL\]|error\(s\)' "$tmp" 2>/dev/null; then
        echo -e "${YELLOW}[WARN]${NC}  [$step/$total] ${label} (${elapsed}s) — findings below (advisory)"
        print_gate_details "$tmp"
        rm -f "$tmp"
        return 2
    fi

    echo -e "${GREEN}[OK]${NC}    [$step/$total] ${label} (${elapsed}s)"
    # Pass: keep quiet — don't dump the check's healthy chatter.
    rm -f "$tmp"
    return 0
}

failed=0
warned=0
step=1
total=${#GATES[@]}

for entry in "${GATES[@]}"; do
    IFS='|' read -r label cmd <<< "$entry"
    set +e
    run_gate "$step" "$total" "$label" "$cmd"
    rc=$?
    set -e
    if [[ $rc -eq 1 ]]; then
        failed=1
        # Strict: stop early. Advisory: keep going so every gate screams.
        $STRICT && break
    elif [[ $rc -eq 2 ]]; then
        warned=1
    fi
    step=$(( step + 1 ))
done

echo ""
if [[ $failed -ne 0 ]]; then
    echo -e "${RED}${BOLD}Release gates reported failures.${NC}"
    if $STRICT; then
        echo -e "${RED}${BOLD}Strict mode — fix the issues above before releasing.${NC}"
        echo ""
        exit 1
    fi
    echo -e "${YELLOW}${BOLD}Advisory mode — ship/push continues. Fix these ASAP.${NC}"
    echo ""
    exit 0
fi

if [[ $warned -ne 0 ]]; then
    echo -e "${YELLOW}${BOLD}Release gates reported warnings (advisory — ship/push continues).${NC}"
    echo ""
    exit 0
fi

echo -e "${GREEN}${BOLD}All release gates passed.${NC}"
echo ""
exit 0
