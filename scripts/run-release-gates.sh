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
        "Route metadata and favicons|pnpm check:route-metadata:strict"
        "Pattern Patrol manifest contracts|pnpm exec tsx scripts/pattern-patrol/check-manifest.ts --repo-only"
        "Turbopack filesystem tracing|pnpm exec tsx scripts/check-turbopack-fs-tracing.ts"
        "UI primitives check|pnpm exec tsx scripts/check-ui-primitives.ts --strict"
        "Scroll-chain (clipped tables/lists)|pnpm exec tsx scripts/check-scroll-chain.ts --strict"
        "Migration ledger check|pnpm exec tsx scripts/check-migrations.ts --strict"
        # PARTITION RUNWAY stays ADVISORY even in strict mode. It is the only
        # gate whose subject is the CALENDAR, not the code: a release that has
        # nothing to do with history.row_versions must not be blocked because a
        # partition expires in seven weeks. It screams; a human provisions.
        # (D122 — four days of lost writes; scripts/partition-runway/FEATURE.md.)
        "Partition runway (time-bounded DDL)|pnpm check:partition-runway"
        "Dead relation references|pnpm exec tsx scripts/check-dead-relations.ts --strict"
        "URL identity twins (TS vs Python)|pnpm exec tsx scripts/check-url-identity.ts"
        "API contract ratchet|pnpm exec tsx scripts/check-api-contracts.ts --strict"
        "Backend boundary approvals|pnpm exec tsx scripts/check-backend-boundaries.ts --strict"
        "Authentication destinations and gates|pnpm check:auth-destinations"
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
        # THE COMPONENT OWNERSHIP LAW is BLOCKING in strict mode, unlike most
        # drift gates here. Its live count is 0 today (191 component tables, 945
        # policies) and must STAY 0 — a single regenerated component policy that
        # mentions created_by re-opens D182(3), where a parent-editor stamps
        # another user as creator and hands them owner-read. There is no backlog
        # to grandfather and no legitimate exception, so it never earns an
        # advisory carve-out. (db-rules FEATURE.md §6d-1.)
        "Component ownership law (no created_by)|pnpm check:component-created-by:strict"
        "Protocol mirror sync (aidream)|pnpm exec tsx scripts/check-protocol-sync.ts --strict"
        # CONTENT IR / KINDS — the two halves of the kinds program's frontend
        # gate (KINDS_EVERYWHERE_PLAN.md §6.4). The surface export regenerates
        # the compiled detector table from live content_ir.kind_surface and
        # diffs it against BOTH committed twins (this repo's .generated.ts and
        # aidream's kind_surfaces_generated.py), so it catches registry drift
        # and cross-runtime drift in one run; it needs the live DB and fails
        # loudly rather than falling back, by design. The aidream half is
        # enforced by that repo's `kinds-parity` / `kinds-registry-drift` CI
        # jobs; this is where the frontend half is enforced, because this repo
        # deliberately has no commit-time hook and no CI (CLAUDE.md).
        "Kind-surface detector table vs live registry|pnpm check:shapes:surfaces"
        "Content IR / kinds test suite|pnpm test:content-ir"
        # Docs guards went STRICT 2026-08-15 (guards-advisory-to-strict): both
        # repos reached zero violations, so a finding here is new drift, not
        # backlog. Allowlist additions go through scripts/docs-guards/ via PR.
        "Docs guards (titles/root-md/pointers)|pnpm exec tsx scripts/check-docs-guards.ts"
        # NO DEAD ENDS stays ADVISORY even in strict mode. The tree carries a
        # known Door Law backlog (scoreboard: /administration/reporting/dead-ends,
        # worklist: docs/handoffs/no-dead-ends-sweep.md); hard-failing on it would
        # block every release until the campaign lands. Promote to --strict when
        # the scoreboard reaches zero.
        "No dead ends (Door Law)|pnpm exec tsx scripts/dead-ends/check-dead-ends.ts --limit=15"
        # UNWIRED WORK stays ADVISORY even in strict mode. A finding means a
        # previous builder was interrupted and the runtime seam must be FINISHED;
        # the standing backlog may never block an unrelated release.
        "Unwired work (finish purpose-built artifacts)|pnpm exec tsx scripts/unwired/check-unwired.ts --limit=15"
        # SHARED SKILLS stays ADVISORY in both modes: cross-repo skills are
        # mirrored into every repo on purpose (a one-repo sandbox cannot follow
        # a symlink into common-docs), and the sibling bundle may not be checked
        # out here. It screams; it never blocks a release.
        "Cross-repo skills in sync with common-docs|pnpm exec tsx scripts/check-shared-skills.ts"
        # ACCESS ERRORS stays ADVISORY in both modes, same reasoning as the Door
        # Law above: the primitive (features/access-gate) shipped 2026-08-11 with
        # a known ~540-surface conversion backlog behind it. Hard-failing would
        # block every release until that sweep lands. Promote to --strict when
        # the count reaches zero.
        "Access errors (surfaces that guess why a read failed)|pnpm exec tsx scripts/access-errors/check-access-errors.ts"
        # MEDIA DURABILITY stays ADVISORY in both modes. It reports a stored
        # expiring URL only where the consumer contract demands durability
        # (anon-visible share projections + guard-registered columns); the one
        # open item needs a publish decision from Arman, not a code fix, so
        # hard-failing would block every release on a question no agent may answer.
        "Media durability (mismatch class)|pnpm check:media-durability"
        # HARDCODED AGENT DEFINITIONS — an agent's prompt/persona living in this
        # repo instead of the DB (Arman, 2026-08-16: the codebase is the
        # CONNECTION, never the definition). Advisory in both modes; the
        # allowlist is a reason-required ratchet whose count only goes down.
        "Retired-database project id handed to agents|pnpm check:retired-db-ref"
        "Hardcoded agent definitions (prompts in code)|pnpm check:hardcoded-prompts"
        # TYPE-ESCAPE RATCHET stays ADVISORY even in strict mode (no --strict on
        # the command), per Arman's standing rule: scream, never block the build.
        # It is listed here because NOTHING else runs it — no CI, no pre-commit
        # hook — which is exactly how ~1,200 hatches landed unfrozen between
        # 2026-07-02 and 2026-08-14 and the ratchet stopped ratcheting (D136).
        "Type-escape hatch ratchet|pnpm check:hatches"
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
        "Route metadata and favicons|pnpm check:route-metadata"
        "Pattern Patrol manifest contracts|pnpm exec tsx scripts/pattern-patrol/check-manifest.ts --repo-only"
        "Turbopack filesystem tracing|pnpm exec tsx scripts/check-turbopack-fs-tracing.ts"
        "UI primitives check|pnpm exec tsx scripts/check-ui-primitives.ts"
        "Scroll-chain (clipped tables/lists)|pnpm exec tsx scripts/check-scroll-chain.ts"
        "Migration ledger check|pnpm exec tsx scripts/check-migrations.ts"
        # Time-bounded DDL that can expire on the calendar — partition runway,
        # catch-all partitions that started receiving rows, stalled pg_cron
        # jobs. Loud, never blocking (D122).
        "Partition runway (time-bounded DDL)|pnpm check:partition-runway"
        "Dead relation references|pnpm exec tsx scripts/check-dead-relations.ts"
        "API contract ratchet|pnpm exec tsx scripts/check-api-contracts.ts"
        "Backend boundary approvals|pnpm exec tsx scripts/check-backend-boundaries.ts"
        "Authentication destinations and gates|pnpm check:auth-destinations"
        "Surface manifest drift|pnpm exec tsx scripts/check-surface-drift.ts"
        "Admin dashboard catalog|pnpm exec tsx scripts/check-admin-catalog.ts"
        "Entity registry generation drift|pnpm check:entity-types"
        "Agent sync fields vs live RPC (snapshot fallback)|pnpm exec tsx scripts/check-agent-sync-fields.ts --live"
        "Access guard check|pnpm exec tsx scripts/check-access-guards.ts"
        "Visibility vocabulary|pnpm exec tsx scripts/check-visibility-vocab.ts"
        "Component ownership law (no created_by)|pnpm check:component-created-by"
        "Protocol mirror sync (aidream)|pnpm exec tsx scripts/check-protocol-sync.ts"
        # CONTENT IR / KINDS — the two halves of the kinds program's frontend
        # gate (KINDS_EVERYWHERE_PLAN.md §6.4). The surface export regenerates
        # the compiled detector table from live content_ir.kind_surface and
        # diffs it against BOTH committed twins (this repo's .generated.ts and
        # aidream's kind_surfaces_generated.py), so it catches registry drift
        # and cross-runtime drift in one run; it needs the live DB and fails
        # loudly rather than falling back, by design. The aidream half is
        # enforced by that repo's `kinds-parity` / `kinds-registry-drift` CI
        # jobs; this is where the frontend half is enforced, because this repo
        # deliberately has no commit-time hook and no CI (CLAUDE.md).
        "Kind-surface detector table vs live registry|pnpm check:shapes:surfaces"
        "Content IR / kinds test suite|pnpm test:content-ir"
        "URL identity twins (TS vs Python)|pnpm exec tsx scripts/check-url-identity.ts"
        # STRICT since 2026-08-15 (also in the strict list above): the Wave-5
        # backlog is cleared, so a failure in a --strict run hard-fails it.
        "Docs guards (titles/root-md/pointers)|pnpm exec tsx scripts/check-docs-guards.ts"
        # THE DOOR LAW — surfaces that name a record without letting the user
        # open it. Advisory by design (Arman: no check blocks a build); the
        # ranked scoreboard lives at /administration/reporting/dead-ends.
        "No dead ends (Door Law)|pnpm exec tsx scripts/dead-ends/check-dead-ends.ts --limit=15"
        # Cross-repo unfinished-work alarm; loud and advisory in every mode.
        # Scoreboard: /administration/reporting/unwired.
        "Unwired work (finish purpose-built artifacts)|pnpm exec tsx scripts/unwired/check-unwired.ts --limit=15"
        # SHARED SKILLS stays ADVISORY in both modes: cross-repo skills are
        # mirrored into every repo on purpose (a one-repo sandbox cannot follow
        # a symlink into common-docs), and the sibling bundle may not be checked
        # out here. It screams; it never blocks a release.
        "Cross-repo skills in sync with common-docs|pnpm exec tsx scripts/check-shared-skills.ts"
        # Every surface still guessing why a read failed — see the strict list
        # above for why this is advisory. Fix = <AccessGate/>.
        "Access errors (surfaces that guess why a read failed)|pnpm exec tsx scripts/access-errors/check-access-errors.ts"
        "Media durability (mismatch class)|pnpm check:media-durability"
        # HARDCODED AGENT DEFINITIONS — an agent's prompt/persona living in this
        # repo instead of the DB (Arman, 2026-08-16: the codebase is the
        # CONNECTION, never the definition). Advisory in both modes; the
        # allowlist is a reason-required ratchet whose count only goes down.
        "Retired-database project id handed to agents|pnpm check:retired-db-ref"
        "Hardcoded agent definitions (prompts in code)|pnpm check:hardcoded-prompts"
        # New escape hatches vs the frozen baseline — advisory, loud. See the
        # strict list above for why this gate exists here at all (D136).
        "Type-escape hatch ratchet|pnpm check:hatches"
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
    if $has_output && grep -qE 'ADMIN ROUTE REGISTRY GAP|ROUTE METADATA GAPS|SCHEMA TRUTH-CHECK|PROTOCOL MIRROR DRIFT|DEAD ENDS FOUND|TYPE-ESCAPE HATCHES ABOVE BASELINE|LIVE PULL FAILED|COMMITTED SNAPSHOT IS STALE|Release gates failed|\[FAIL\]|error\(s\)' "$tmp" 2>/dev/null; then
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
