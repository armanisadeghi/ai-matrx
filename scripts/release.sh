#!/usr/bin/env bash
# release.sh — Apply pending FE migrations, bump version, commit, tag, and push.
#
# Source of truth: package.json
#
# Migrations (like aidream's release.sh):
#   Before bumping, applies any pending `migrations/*.sql` via the co-located
#   aidream applier (`python db/apply_migrations.py --source matrx-frontend`).
#   This repo has no DDL path of its own — aidream holds the Postgres creds.
#   Override checkout with AIDREAM_DIR; skip with --no-migrate.
#
# Protocol mirror (docs/protocol):
#   After migrations, verifies the byte-identical pact with aidream's
#   docs/protocol (envelope doc, references doc, generated registry). On drift
#   it auto-syncs aidream → here and commits, loudly, before the version bump.
#   Same co-located checkout / AIDREAM_DIR as migrations; missing = warn+skip.
#
# Remote sync is handled automatically and safely:
#   - Before anything is changed, it fetches origin/main and either fast-forwards
#     (remote ahead), proceeds (local ahead), or stops unchanged (diverged).
#   - Local and fetched remote heads both pass Pattern Patrol authorization before
#     the release lane is claimed or the checked-out branch can move.
#   - The final push is atomic (branch + tag together). A remote race preserves the
#     local release commit and tag for controller reconciliation; it never rewrites
#     certified candidates with an automatic rebase or force-pushes.
#
# Usage:
#   ./scripts/release.sh              # patch bump  (default)
#   ./scripts/release.sh --patch      # patch bump
#   ./scripts/release.sh --minor      # minor bump
#   ./scripts/release.sh --major      # major bump
#   ./scripts/release.sh --message "document shared OAuth"
#       → commit "release: vX.Y.Z - document shared OAuth"
#   ./scripts/release.sh --ship --message "Added chat surface" -- features/chat lib/x.ts
#       → one commit of the NAMED paths + bump (used by ./ship.sh). Paths after
#         `--` are the only content that enters the commit.
#   ./scripts/release.sh --dry-run    # preview without changes
#   ./scripts/release.sh --no-migrate # skip applying FE migrations
#   ./scripts/release.sh --no-gates   # skip advisory quality gates after push
#   ./scripts/release.sh --no-watch   # do not wait for the Vercel rollout
#       → prints UNWATCHED (never green); the outcome stays unknown
#   ./scripts/release.sh --target admin --message "new admin panel"
#       → commit "release-admin: vX.Y.Z - new admin panel" (deploys ONLY
#         manage.aimatrx.com; --target demos / all likewise)
#
# Deploy is: one atomic push of branch + tag to origin/main; Vercel/GitHub take
# it from there. The push is NOT the release — so after pushing, the script
# WATCHES the rollout and reports what actually happened
# (scripts/release-outcome.sh, THE RELEASE-BANNER TRUTH LAW). Green appears only
# when the pushed commit reached READY on every Vercel project it targets AND
# that deployment is the one the live domain serves; a skipped, ERRORed,
# CANCELED, timed-out, or unverifiable rollout prints a loud non-green box with
# the project, the state, the Vercel URL and the remedy, and exits non-zero.
# Until 2026-09-11 this script printed its green "Released" box unconditionally
# the line after `git push` returned 0 and never called Vercel at all, so a dead
# rollout and a live one looked identical to the deploy agent reading it.
# `--no-watch` skips the wait; it prints UNWATCHED, never green.
#
# Production builds ONLY run for commits whose message starts with a release
# prefix (vercel.json ignoreCommand → scripts/vercel-ignore-build.sh). Plain
# pushes to main are skipped. The prefix selects WHICH Vercel project builds
# (deployment split 2026-07 — one repo, three projects):
#   release:        → ai-matrx (aimatrx.com, MATRX_PROFILE=slim)   [default]
#   release-admin:  → ai-matrx-manage (manage.aimatrx.com, admin profile)
#   release-demos:  → ai-matrx-demos (demos.aimatrx.com, demos profile)
#   release-all:    → all three projects
# Each project carries a MATRX_BUILD_TARGET env var (main|admin|demos) the
# ignore script matches against, so untargeted projects never rebuild.
#
# 🚨 THE RELEASE-COMMIT CONTENT LAW (scripts/release-stage.sh): a release never
# ships content no one committed. This checkout is shared by dozens of lanes,
# so the working tree and the index always hold someone else's half-written
# files. The release commit therefore contains EXACTLY the version files plus
# the paths the invoker NAMED after `--` — staged and committed by pathspec,
# never `git add -A`, never "whatever is staged". Every other dirty path is
# left exactly as its owner left it. Release v0.4.1575 (2026-08-31) was built
# from a sweep that carried another lane's mid-edit import to a module that did
# not exist; production broke until 6d07c466b2. aidream's release.sh commits
# the same pathspec-scoped way, so the convention is one across both repos.
#   Plain release: commits ONLY package.json (+ package-lock.json); a dirty tree
#     is normal and never blocks; nothing foreign is staged, unstaged, or moved.
#   --ship (./ship.sh): commits the version files + the named paths. A dirty
#     tree with NO named paths is refused — the script cannot know which dirt is
#     yours, and guessing is the defect. Tree-wide specs (`.`, `:/`, `*`) are
#     refused by name. --dry-run prints the exact file list the commit would
#     carry and the dirty paths it would leave behind.
#   The primitive proves itself failing-then-passing on every --ship run
#   (`pnpm check:ship-stage:self-test`), before anything is committed.
#
# General quality gates (doctrine, UI primitives, …) stay ADVISORY — they scream
# loudly and never block the ship. Pattern Patrol delivery authorization is a
# separate advisory lifecycle checkpoint before any release mutation and
# again after --ship materializes its commit. A busy delivery lane waits and
# resumes automatically. Manual hard-fail: pnpm check:release-gates:strict
set -euo pipefail

# ── Failure trap ─────────────────────────────────────────────────────────────
_on_error() {
    local exit_code=$?
    local line_no=${1:-}
    echo "" >&2
    echo -e "\033[0;31m╔══════════════════════════════════════════════════════════════╗\033[0m" >&2
    echo -e "\033[0;31m║                    RELEASE SCRIPT FAILED                    ║\033[0m" >&2
    echo -e "\033[0;31m╠══════════════════════════════════════════════════════════════╣\033[0m" >&2
    echo -e "\033[0;31m║  Exit code : ${exit_code}$(printf '%*s' $((61 - ${#exit_code})) '')║\033[0m" >&2
    [[ -n "$line_no" ]] && \
    echo -e "\033[0;31m║  Line      : ${line_no}$(printf '%*s' $((61 - ${#line_no})) '')║\033[0m" >&2
    echo -e "\033[0;31m║  No version was committed, tagged, or pushed.               ║\033[0m" >&2
    echo -e "\033[0;31m╚══════════════════════════════════════════════════════════════╝\033[0m" >&2
    echo "" >&2
}
trap '_on_error $LINENO' ERR

# ── Resolve repo root ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PROJECT_NAME="ai-matrx-admin"
GITHUB_REPO="armanisadeghi/ai-matrx"
VERSION_FILE="package.json"
REMOTE="origin"
BRANCH="main"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()    { echo -e "${RED}[FAIL]${NC}  $*" >&2; exit 1; }
preview() { echo -e "${CYAN}[DRY]${NC}   $*"; }

verify_patrol_delivery() {
    local head="${1:-HEAD}"
    info "Checking Pattern Patrol certification records at $head..."
    if pnpm --silent patrol:delivery:check -- --head "$head"; then
        ok "Pattern Patrol delivery records authorize every patrol commit at $head."
    else
        warn "Pattern Patrol delivery records need reconciliation at $head; release remains fail-forward."
    fi
}

acquire_delivery_lease() {
    local attempt=0 output=""
    while true; do
        attempt=$((attempt + 1))
        if output="$(
            bash "$REPO_ROOT/scripts/pattern-patrol/delivery-lease.sh" acquire \
                "$$" "$REPO_ROOT" "${MATRX_PATROL_RUN_ID:-general-release}" 2>&1
        )"; then
            DELIVERY_LEASE_TOKEN="$output"
            return 0
        fi

        # Contention is coordination, not a release failure. The lease helper
        # reclaims dead owners; a live owner simply gets time to finish.
        if (( attempt == 1 || attempt % 6 == 0 )); then
            warn "Delivery lane is busy; waiting and retrying automatically. ${output}"
        fi
        sleep 5
    done
}

# Every real release shares one machine-wide delivery lane. The token makes
# release safe to nest in failure paths: only its owner may release the lane.
DELIVERY_LEASE_TOKEN=""
release_delivery_lease() {
    if [[ -n "$DELIVERY_LEASE_TOKEN" ]]; then
        bash "$REPO_ROOT/scripts/pattern-patrol/delivery-lease.sh" release "$DELIVERY_LEASE_TOKEN" >/dev/null 2>&1 || true
        DELIVERY_LEASE_TOKEN=""
    fi
}
trap release_delivery_lease EXIT

# Like fail(), but for failures AFTER the release commit + tag were created.
# Clears the ERR trap so the generic "nothing was committed" box does not print
# (it would be a lie — the release exists locally, it just was not pushed).
die_after_commit() {
    trap - ERR
    echo "" >&2
    echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}" >&2
    echo -e "${RED}║   PUSH INCOMPLETE — release built locally but not pushed   ║${NC}" >&2
    echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}" >&2
    echo "" >&2
    echo -e "$*" >&2
    echo "" >&2
    exit 1
}

# Print a side-by-side summary of how local and remote have diverged.
diverge_summary() {
    echo "  Your commits not on $REMOTE/$BRANCH:" >&2
    git log --oneline "$REMOTE/$BRANCH..$BRANCH" | sed 's/^/    /' >&2
    echo "  $REMOTE/$BRANCH commits not in your branch:" >&2
    git log --oneline "$BRANCH..$REMOTE/$BRANCH" | sed 's/^/    /' >&2
}

# ── Parse flags ──────────────────────────────────────────────────────────────
BUMP_TYPE="patch"
CUSTOM_MESSAGE=""
DRY_RUN=false
NO_MIGRATE=false
NO_GATES=false
NO_WATCH=false
SHIP_MODE=false
# --ship: the ONLY content the release commit may carry besides the version
# files. Filled from the arguments after `--`. See THE RELEASE-COMMIT CONTENT LAW.
SHIP_PATHS=()
# Which Vercel project(s) this release should build (deployment split 2026-07):
#   main  → ai-matrx (aimatrx.com)                — commit prefix `release:`
#   admin → ai-matrx-manage (manage.aimatrx.com)  — commit prefix `release-admin:`
#   demos → ai-matrx-demos (demos.aimatrx.com)    — commit prefix `release-demos:`
#   all   → all three                             — commit prefix `release-all:`
# scripts/vercel-ignore-build.sh matches the prefix against each project's
# MATRX_BUILD_TARGET env var, so only the targeted project(s) build.
TARGET="main"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --patch)   BUMP_TYPE="patch"; shift ;;
        --minor)   BUMP_TYPE="minor"; shift ;;
        --major)   BUMP_TYPE="major"; shift ;;
        --message|-m)
            [[ -n "${2:-}" ]] || fail "--message requires an argument."
            CUSTOM_MESSAGE="$2"; shift 2 ;;
        --ship) SHIP_MODE=true; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        --no-migrate) NO_MIGRATE=true; shift ;;
        --no-gates) NO_GATES=true; shift ;;
        --no-watch) NO_WATCH=true; shift ;;
        --target)
            [[ -n "${2:-}" ]] || fail "--target requires an argument (main|admin|demos|all)."
            case "$2" in
                main|admin|demos|all) TARGET="$2" ;;
                *) fail "Invalid --target '$2'. Use main, admin, demos, or all." ;;
            esac
            shift 2 ;;
        -h|--help)
            grep '^#' "$0" | head -70 | sed 's/^# \?//'
            exit 0 ;;
        --)
            # Everything after `--` is a pathspec the invoker owns (--ship only).
            shift
            SHIP_PATHS=("$@")
            break ;;
        *) fail "Unknown flag: $1. Use --patch, --minor, --major, --message, --ship, --target, --dry-run, --no-migrate, --no-gates, --no-watch, or -- <paths you own>." ;;
    esac
done

if [[ ${#SHIP_PATHS[@]} -gt 0 ]] && ! $SHIP_MODE; then
    fail "Paths after '--' only mean something with --ship (./ship.sh). A plain release commits package.json only."
fi

if $SHIP_MODE && [[ -z "$CUSTOM_MESSAGE" ]]; then
    fail "--ship requires --message (./ship.sh passes it)."
fi

# ── Pre-flight checks ────────────────────────────────────────────────────────
[[ -f "$VERSION_FILE" ]] || fail "$VERSION_FILE not found."

# THE RELEASE-COMMIT CONTENT LAW lives in one file and proves itself before a
# --ship run may commit anything. Sourced here so the commit step and the
# dry-run preview use the same primitive the self-test exercised.
# shellcheck source=scripts/release-stage.sh
source "$SCRIPT_DIR/release-stage.sh"

# THE RELEASE-BANNER TRUTH LAW lives in one file too: the banner after the push
# reports the ROLLOUT, not the push. Sourced here so the post-push report and
# its self-test use the same primitive.
# shellcheck source=scripts/release-outcome.sh
source "$SCRIPT_DIR/release-outcome.sh"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
[[ "$CURRENT_BRANCH" == "$BRANCH" ]] \
    || fail "Not on '$BRANCH' branch (currently on '$CURRENT_BRANCH'). Switch first."

# Dirty tree is fine for a plain release (bump + push committed work only).
# Fast-forward still needs a clean tree — enforced only when sync must mutate.
working_tree_dirty() {
    ! git diff --quiet \
        || [[ -n "$(git diff --cached --name-only)" ]] \
        || [[ -n "$(git ls-files --others --exclude-standard)" ]]
}

require_clean_for_sync() {
    if working_tree_dirty; then
        fail "Uncommitted changes block syncing with $REMOTE/$BRANCH (fast-forward needs a clean tree).
Commit them (./ship.sh \"msg\"), stash them, or discard — then re-run.
A plain release with a dirty tree is fine when you are already in sync or ahead."
    fi
}

# ── Sync with remote (do-no-harm: runs BEFORE any commit/tag is created) ──────
# Nothing has been bumped, committed, or tagged yet, so any abort here leaves
# the working tree exactly as the user left it. We only proceed past this block
# if the local branch is in a state that will push cleanly.
echo ""
info "Fetching $REMOTE/$BRANCH to check sync state..."
git fetch "$REMOTE" "$BRANCH" 2>/dev/null \
    || fail "Could not reach $REMOTE. Check your connection, then re-run. Nothing has been changed."

LOCAL_SHA=$(git rev-parse "$BRANCH")
REMOTE_SHA=$(git rev-parse "$REMOTE/$BRANCH")
BASE_SHA=$(git merge-base "$BRANCH" "$REMOTE/$BRANCH")

# Validate every history that can become the release head before claiming the
# lane or moving the checked-out branch. A diverged branch is never rebased by
# release.sh because that would rewrite exact certified candidate identities.
verify_patrol_delivery "$BRANCH"
if [[ "$LOCAL_SHA" != "$REMOTE_SHA" ]]; then
    verify_patrol_delivery "$REMOTE/$BRANCH"
fi

if [[ "$LOCAL_SHA" != "$BASE_SHA" && "$REMOTE_SHA" != "$BASE_SHA" ]]; then
    echo "" >&2
    diverge_summary
    echo "" >&2
    fail "Local and $REMOTE/$BRANCH have diverged. Integrate them through the normal controller workflow, then re-run; release.sh will not rewrite certified history. Nothing has been changed."
fi

if ! $DRY_RUN; then
    info "Claiming the serialized delivery lane..."
    acquire_delivery_lease
    ok "Delivery lane claimed."
fi

# --ship must know whose dirt it is shipping. With a dirty tree and no named
# paths there is no honest answer, and guessing (a sweep) is the v0.4.1575
# defect — so refuse, and say exactly what is dirty so the invoker can name
# theirs. A clean tree with no paths is a bump-only release, which is fine.
if $SHIP_MODE; then
    if [[ ${#SHIP_PATHS[@]} -gt 0 ]]; then
        release_stage_validate_paths ${SHIP_PATHS[@]+"${SHIP_PATHS[@]}"} \
            || fail "--ship was given a pathspec it cannot commit (see above). Nothing has been changed."
    elif working_tree_dirty; then
        echo "" >&2
        git status --short --untracked-files=all | sed 's/^/    /' >&2
        echo "" >&2
        fail "--ship with a dirty tree needs the paths YOU own, after '--':
    ./ship.sh \"$CUSTOM_MESSAGE\" -- <file-or-dir> [more...]
The tree above holds other lanes' work too; release.sh will not guess which of
it is yours, and it never sweeps (THE RELEASE-COMMIT CONTENT LAW,
scripts/release-stage.sh). Nothing has been changed."
    fi
    info "Proving the release-commit staging primitive (self-test)..."
    if bash "$SCRIPT_DIR/release-stage.sh" --self-test >/dev/null 2>&1; then
        ok "release-stage self-test passed (sweep reproduced, then excluded)."
    else
        bash "$SCRIPT_DIR/release-stage.sh" --self-test || true
        fail "release-stage self-test FAILED — the staging primitive cannot be trusted to exclude foreign edits. Nothing has been changed."
    fi
fi

if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
    ok "Already in sync with $REMOTE/$BRANCH."
    if working_tree_dirty && ! $SHIP_MODE; then
        warn "Uncommitted local changes present — leaving them alone; release only bumps + pushes committed work."
    fi
elif [[ "$LOCAL_SHA" == "$BASE_SHA" ]]; then
    # Local is strictly behind remote — fast-forward is safe and lossless.
    require_clean_for_sync
    if $DRY_RUN; then
        preview "$REMOTE/$BRANCH is ahead — would fast-forward local $BRANCH."
    else
        info "$REMOTE/$BRANCH is ahead. Fast-forwarding local $BRANCH..."
        git merge --ff-only "$REMOTE/$BRANCH" >/dev/null 2>&1 \
            || fail "Fast-forward unexpectedly failed. Resolve manually. Nothing has been changed."
        ok "Fast-forwarded to $(git rev-parse --short HEAD)."
    fi
elif [[ "$REMOTE_SHA" == "$BASE_SHA" ]]; then
    # Remote is strictly behind — local is purely ahead, a normal push will work.
    if working_tree_dirty && ! $SHIP_MODE; then
        warn "Uncommitted local changes present — leaving them alone; release only bumps + pushes committed work."
    fi
    ok "Local is ahead of $REMOTE/$BRANCH by $(git rev-list --count "$REMOTE/$BRANCH..$BRANCH") commit(s) — ready to release."
else
    fail "Unexpected release topology after fail-closed divergence check. Nothing has been changed."
fi

# Hard checkpoint before migrations, generated files, version bumps, tags, or
# pushes. A patrol product change can enter release only when its immutable run
# record certifies the exact candidate and places it in the delivery queue.
verify_patrol_delivery

# This gate is deliberately outside --no-gates. A release may skip broad
# advisory suites, but it may never ship a frontend that can send the migrated
# Vault/Authenticator traffic without one explicit organization context.
info "Verifying every @ai-matrx package is declared and installed at npm latest..."
if pnpm check:matrx-packages; then
    ok "Matrx-owned packages are current."
else
    fail "MATRX PACKAGE VERSION DRIFT — run pnpm sync:matrx-packages, commit package.json + pnpm-lock.yaml, and retry."
fi

# Also deliberately outside --no-gates, and first because everything after it
# assumes a tree that compiles. A file that does not PARSE is not a quality
# opinion: it cannot build, it cannot render, and it takes the shared dev
# server down for every agent in the checkout. That is exactly what happened
# on 2026-09-07, when the census-H1 codemod injected its new
# `@ai-matrx/kit/format` import INSIDE seven multi-line `import {` statements
# (repaired in fc9a28a26f) — `pnpm type-check` would have caught it as
# TS1003/1005/1128, but type-check is advisory by standing ruling (D64/D65)
# and nothing ran it between the codemod and the push. This is ~4s over 14,716
# files, has zero backlog, and blocks. `pnpm check:parse --fix` repairs the
# injected-import class.
info "Verifying every tracked TypeScript file parses..."
if pnpm check:parse; then
    ok "Every tracked TypeScript file parses."
else
    fail "UNPARSEABLE TYPESCRIPT — release stopped before migrations, version changes, tags, or pushes. Repair the file(s) above (try: pnpm check:parse --fix)."
fi

info "Enforcing the organization-context transport contract..."
if pnpm check:organization-context; then
    ok "Organization-context transport contract passed."
else
    fail "ORGANIZATION CONTEXT VIOLATION — release stopped before migrations, version changes, tags, or pushes."
fi

# ── Apply pending matrx-frontend migrations (via aidream applier) ─────────────
# Same shared DB + ledger as aidream. This repo cannot run DDL itself (PostgREST
# only); the co-located aidream checkout owns the Postgres write path.
# Mirrors aidream's release.sh reconcile: apply pending/drifted, then verify.
apply_frontend_migrations() {
    local aidream_dir="${AIDREAM_DIR:-$REPO_ROOT/../aidream}"
    local applier="$aidream_dir/db/apply_migrations.py"

    if $NO_MIGRATE; then
        warn "Skipping migration apply (--no-migrate)."
        return 0
    fi

    if [[ ! -f "$applier" ]]; then
        fail "aidream migration applier not found at $applier.
Set AIDREAM_DIR to your aidream checkout, or pass --no-migrate to skip
(not recommended — pending FE migrations will not reach Supabase)."
    fi

    if [[ ! -x "$(command -v uv)" ]] && [[ ! -x "$(command -v python3)" ]]; then
        fail "Migration apply needs 'uv' or 'python3'."
    fi

    # Run from the aidream checkout so its .env + uv workspace resolve.
    # MATRX_FRONTEND_DIR pins THIS repo's migrations/ (worktrees / renames).
    _run_applier() {
        local mode="$1"  # apply | dry-run
        (
            cd "$aidream_dir"
            export MATRX_FRONTEND_DIR="$REPO_ROOT"
            if [[ -x "$(command -v uv)" ]]; then
                if [[ "$mode" == "dry-run" ]]; then
                    uv run python db/apply_migrations.py --source matrx-frontend --dry-run
                else
                    uv run python db/apply_migrations.py --source matrx-frontend --no-generate
                fi
            else
                if [[ "$mode" == "dry-run" ]]; then
                    python3 db/apply_migrations.py --source matrx-frontend --dry-run
                else
                    python3 db/apply_migrations.py --source matrx-frontend --no-generate
                fi
            fi
        )
    }

    if $DRY_RUN; then
        info "Checking pending matrx-frontend migrations (dry-run — read-only)..."
        _run_applier dry-run
        ok "Migration dry-run complete."
        return 0
    fi

    info "Applying pending matrx-frontend migrations (idempotent; no-op if current)..."
    _run_applier apply
    ok "Migration apply finished."

    info "Verifying FE migration ledger (pnpm check:migrations:strict)..."
    if pnpm check:migrations:strict; then
    ok "Migration ledger verification completed; review advisory findings above."
    else
        fail "Migration ledger still has unapplied/drifted files after apply.
Fix the failures above (or re-run from aidream:
  MATRX_FRONTEND_DIR=$REPO_ROOT uv run python db/apply_migrations.py --source matrx-frontend --no-generate
), then re-run this release."
    fi
}

apply_frontend_migrations

# ── Entity registry drift gate (live DB ↔ installed @ai-matrx/associations) ───
# The entity-type vocabulary ships in @ai-matrx/associations; this repo keeps
# no local copy. Admin edits must never leave a release carrying a stale
# vocabulary, so after migrations the installed package is diffed against
# platform.entity_types. Drift is fixed by regenerating + patch-releasing the
# PACKAGE, never here.
if $DRY_RUN; then
    info "Checking generated entity metadata (dry-run — read-only)..."
    if pnpm check:entity-types; then
        ok "Generated entity metadata matches platform.entity_types."
    else
        warn "Entity registry drift found. A real release would regenerate and commit it."
    fi
else
    info "Synchronizing generated entity metadata from platform.entity_types..."
    if ! pnpm check:entity-types; then
        fail "Generated entity metadata still differs from platform.entity_types."
    fi
    ok "Generated entity metadata matches platform.entity_types."
fi

# ── Protocol mirror sync (docs/protocol ↔ aidream, byte-identical pact) ──────
# MATRX_ENVELOPE.md + MATRX_REFERENCES.md + matrx_envelope_registry.generated.json
# are contractually byte-identical across both repos; aidream is canonical
# (registry emitted by its generate_envelope_registry.py). Drift here once sat
# unnoticed at 11/87 shapes. Same co-located-checkout assumption as the
# migration applier above (AIDREAM_DIR override; missing checkout = warn+skip).
sync_protocol_mirror() {
    info "Checking docs/protocol mirror against aidream..."
    local verdict=0
    pnpm check:protocol-sync:strict || verdict=$?
    if [ $verdict -eq 0 ]; then
        return 0
    fi
    # Exit 2 = UNMEASURED (no aidream checkout). There is nothing to sync FROM,
    # so "auto-syncing from aidream" below would be a lie that commits nothing.
    # Say what actually happened instead (THE STRICTNESS LAW, clause 7).
    if [ $verdict -eq 2 ]; then
        warn "Protocol mirror was NOT verified this run — no aidream checkout (set AIDREAM_DIR)."
        warn "The byte-identical pact with aidream is UNMEASURED for this release."
        return 0
    fi
    if $DRY_RUN; then
        warn "Protocol mirror has drifted (see above). A real release would auto-sync from aidream."
        return 0
    fi
    echo "" >&2
    echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}" >&2
    echo -e "${RED}║  PROTOCOL MIRROR DRIFT — auto-syncing from aidream           ║${NC}" >&2
    echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}" >&2
    echo -e "${YELLOW}  This firing means drift got past a session. If the FE copy held${NC}" >&2
    echo -e "${YELLOW}  an intentional edit, it is being overwritten (recover from git${NC}" >&2
    echo -e "${YELLOW}  history) — protocol edits land in aidream FIRST, then sync here.${NC}" >&2
    pnpm check:protocol-sync:fix
    git add docs/protocol/
    git commit -m "chore(protocol): sync docs/protocol mirror from aidream (release.sh auto-sync)"
    ok "Protocol mirror re-synced and committed."
}

sync_protocol_mirror

# A source_app/source_feature typo is persisted permanently and corrupts every
# attribution view downstream. This source-attribution check is ADVISORY ONLY;
# the separate Pattern Patrol lifecycle authorization above remains fail-closed.
info "Validating CX source attribution (advisory, never blocking)..."
if ! pnpm check:source-attribution; then
    echo "" >&2
    echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}" >&2
    echo -e "${RED}║  SOURCE-ATTRIBUTION VIOLATIONS — release continues anyway   ║${NC}" >&2
    echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}" >&2
    echo -e "${RED}  Unregistered source_app/source_feature values are being written${NC}" >&2
    echo -e "${RED}  to the DB permanently. Fix NOW (it will nag on every release):${NC}" >&2
    echo -e "${YELLOW}    1. See the file:line list above for each violation.${NC}" >&2
    echo -e "${YELLOW}    2. Register the value in the attribution registry, or correct${NC}" >&2
    echo -e "${YELLOW}       the call to use an already-registered source_feature.${NC}" >&2
    echo -e "${YELLOW}    3. Re-run: pnpm check:source-attribution${NC}" >&2
    echo "" >&2
    SOURCE_ATTRIBUTION_FAILED=true
else
    ok "CX source attribution is registered."
    SOURCE_ATTRIBUTION_FAILED=false
fi

# ── Read current version ─────────────────────────────────────────────────────
CURRENT_VERSION=$(node -p "require('./package.json').version" 2>/dev/null) \
    || fail "Could not read version from $VERSION_FILE."

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# ── Calculate new version ────────────────────────────────────────────────────
case "$BUMP_TYPE" in
    patch) NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
    minor) NEW_VERSION="${MAJOR}.$((MINOR + 1)).0" ;;
    major) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
esac

NEW_TAG="v${NEW_VERSION}"

# ── Find the first free version ──────────────────────────────────────────────
# package.json can lag behind the tags (e.g. someone bumped tags by hand, or a
# prior release pushed a tag but its package.json commit never landed locally).
# Rather than fail, keep bumping the patch number until we hit a version whose
# tag does not exist yet. We always advance the PATCH component for the search
# (even on minor/major) so the base bump is preserved and we never collide.
git fetch --tags "$REMOTE" 2>/dev/null || true
SEARCH_BUMPS=0
while git rev-parse "$NEW_TAG" &>/dev/null; do
    IFS='.' read -r N_MAJOR N_MINOR N_PATCH <<< "$NEW_VERSION"
    NEW_VERSION="${N_MAJOR}.${N_MINOR}.$((N_PATCH + 1))"
    NEW_TAG="v${NEW_VERSION}"
    SEARCH_BUMPS=$((SEARCH_BUMPS + 1))
    if [[ $SEARCH_BUMPS -gt 10000 ]]; then
        fail "Could not find a free version tag after 10000 attempts. Something is wrong."
    fi
done

if [[ $SEARCH_BUMPS -gt 0 ]]; then
    warn "Existing tag(s) ahead of package.json — advanced to first free version ${NEW_VERSION} (skipped ${SEARCH_BUMPS} taken tag(s))."
fi

# ── Build commit message ─────────────────────────────────────────────────────
# MUST start with the target's release prefix — vercel.json ignoreCommand
# skips every other commit message, so a custom message without the prefix
# would ship a tag that never deploys. Format: "<prefix> vX.Y.Z - note".
case "$TARGET" in
    main)  PREFIX="release:" ;;
    admin) PREFIX="release-admin:" ;;
    demos) PREFIX="release-demos:" ;;
    all)   PREFIX="release-all:" ;;
esac
NOTE="$CUSTOM_MESSAGE"
for P in "release-admin:" "release-demos:" "release-all:" "release:"; do
    if [[ "$NOTE" == "$P"* ]]; then
        NOTE="${NOTE#"$P"}"
        NOTE="${NOTE# }"
        break
    fi
done
# If the note already starts with the tag, don't double it.
if [[ -n "$NOTE" && "$NOTE" != "$NEW_TAG" && "$NOTE" != "$NEW_TAG"* ]]; then
    COMMIT_MSG="${PREFIX} ${NEW_TAG} - ${NOTE}"
elif [[ -n "$NOTE" && ( "$NOTE" == "$NEW_TAG" || "$NOTE" == "$NEW_TAG"* ) ]]; then
    COMMIT_MSG="${PREFIX} ${NOTE}"
else
    COMMIT_MSG="${PREFIX} ${NEW_TAG}"
fi

# The version files are the only content a release commit carries on its own.
RELEASE_VERSION_FILES=("$VERSION_FILE")
[[ -f package-lock.json ]] && RELEASE_VERSION_FILES+=(package-lock.json)

# ── Preview ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  ${PROJECT_NAME} release${NC}"
echo -e "  ─────────────────────────────────────────────"
echo -e "  Target     : ${CYAN}${TARGET}${NC}"
echo -e "  Bump type  : ${CYAN}${BUMP_TYPE}${NC}"
echo -e "  Old version: ${CURRENT_VERSION}"
echo -e "  New version: ${GREEN}${NEW_VERSION}${NC}"
echo -e "  Tag        : ${GREEN}${NEW_TAG}${NC}"
echo -e "  Commit msg : ${CYAN}${COMMIT_MSG}${NC}"
$DRY_RUN && echo -e "  Mode       : ${CYAN}DRY RUN — nothing will be changed${NC}"
echo -e "  ─────────────────────────────────────────────"
echo ""

if $DRY_RUN; then
    preview "Would update version in $VERSION_FILE: $CURRENT_VERSION → $NEW_VERSION"
    preview "Would commit: '$COMMIT_MSG'"
    release_stage_preview "${RELEASE_VERSION_FILES[@]}" -- ${SHIP_PATHS[@]+"${SHIP_PATHS[@]}"}
    preview "Would create tag: $NEW_TAG"
    preview "Would push to $REMOTE/$BRANCH"
    echo ""
    preview "Dry run complete. No changes made."
    exit 0
fi

# ── Update package.json (+ package-lock.json if present) ─────────────────────
npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version >/dev/null 2>&1
ok "$VERSION_FILE → $NEW_VERSION"

# ── Commit (THE RELEASE-COMMIT CONTENT LAW — scripts/release-stage.sh) ───────
# One pathspec-scoped commit: the version files, plus (--ship) the paths the
# invoker named. `git commit -- <paths>` takes the working-tree content of
# those paths only and disregards every other path, staged or not — so
# another lane's `git add` cannot ride along, and nothing foreign is touched
# (the old `git reset HEAD -- .` that unstaged their work is gone too).
info "Committing..."
release_stage_commit "$COMMIT_MSG" "${RELEASE_VERSION_FILES[@]}" -- ${SHIP_PATHS[@]+"${SHIP_PATHS[@]}"} \
    || fail "Release commit failed (see above)."
echo ""
ok "Committed: '$COMMIT_MSG' — $(git show --stat --format= HEAD | grep -c '|') file(s):"
git show --stat --format= HEAD | grep '|' | sed 's/^/    /'
if working_tree_dirty; then
    info "Left uncommitted (not named, not yours to ship): $(git status --porcelain --untracked-files=all | wc -l | tr -d ' ') path(s)."
fi

# --ship materializes the dirty tree only at the commit above. Check again now
# so report/run files and any patrol trailers in that new commit cannot bypass
# the earlier history-only checkpoint. Failure preserves the local commit and
# stops before tag/push.
verify_patrol_delivery

# ── Tag ──────────────────────────────────────────────────────────────────────
info "Creating tag $NEW_TAG..."
git tag "$NEW_TAG"
ok "Tag $NEW_TAG created"

# ── Push (branch + tag atomically; preserve on a remote race) ─────────────────
# --atomic guarantees the branch and tag push together or not at all, so a
# rejection never leaves a half-pushed state. The pre-flight block above makes
# rejection rare; this only triggers if the remote moved during the few seconds
# we spent bumping/committing/tagging.
info "Pushing to $REMOTE/$BRANCH..."
if git push --atomic "$REMOTE" "$BRANCH" "$NEW_TAG" 2>/dev/null; then
    ok "Pushed to $REMOTE/$BRANCH with tag $NEW_TAG"
else
    warn "Push rejected — $REMOTE/$BRANCH moved while we were releasing. Preserving the local release for controller reconciliation."
    git fetch "$REMOTE" "$BRANCH" 2>/dev/null || die_after_commit "$(cat <<EOF
Push was rejected and we could not re-fetch $REMOTE.
Your release commit and tag $NEW_TAG exist locally; nothing was force-pushed.
Once you are back online:
    Ask the delivery controller to resume this release. It must reacquire the
    lane and revalidate the exact HEAD. Do not push the branch or tag manually.
EOF
)"
    die_after_commit "$(cat <<EOF
$REMOTE/$BRANCH moved after the release commit and tag were created.
Your local release commit and tag $NEW_TAG are preserved; nothing was rebased,
force-pushed, or partially pushed. Ask the delivery controller to reconcile the
remote race from the current remote head and revalidate both histories. Do not
push the branch or tag manually.
EOF
)"
fi

# ── Outcome (THE RELEASE-BANNER TRUTH LAW — scripts/release-outcome.sh) ──────
# The push is not the release. Until 2026-09-11 the green "Released" box was
# printed right here, unconditionally, and this script never called Vercel — so
# an ERRORed, CANCELED or ignore-script-skipped rollout printed exactly what a
# live one printed. Now the rollout is watched and the banner reports it.
PUSHED_SHA="$(git rev-parse HEAD)"
echo ""
echo -e "  GitHub:  ${CYAN}https://github.com/${GITHUB_REPO}/commit/${PUSHED_SHA}${NC}"

RELEASE_OUTCOME_RC=0
if $NO_WATCH; then
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}  UNWATCHED — pushed v${NEW_VERSION}; the rollout was NOT checked.${NC}"
    echo -e "${YELLOW}  --no-watch was passed, so this run makes NO claim that the${NC}"
    echo -e "${YELLOW}  build succeeded or that anything is live.${NC}"
    echo -e "${YELLOW}  Commit: ${PUSHED_SHA}${NC}"
    echo -e "${YELLOW}  Check it: bash scripts/release-outcome.sh --report ${TARGET} \"${COMMIT_MSG}\" ${PUSHED_SHA}${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    RELEASE_OUTCOME_RC=3
else
    # The guard proves itself failing-then-passing before it is believed — same
    # contract as the release-stage self-test above. No network, ~1s.
    info "Proving the release-outcome banner (self-test)..."
    if bash "$SCRIPT_DIR/release-outcome.sh" --self-test >/dev/null 2>&1; then
        ok "release-outcome self-test passed (old unconditional banner reproduced, then gated)."
    else
        bash "$SCRIPT_DIR/release-outcome.sh" --self-test || true
        warn "release-outcome self-test FAILED — the banner below cannot be trusted; verify the deployment by hand."
    fi
    release_outcome_report "$TARGET" "$COMMIT_MSG" "$PUSHED_SHA" "$NEW_VERSION" || RELEASE_OUTCOME_RC=$?
fi

# ── Advisory quality gates (post-push — never block the ship) ────────────────
# These post-push gates cannot stop a release; the fail-closed Pattern Patrol
# authorization already ran before release mutation. Each gate announces itself
# before it starts so a slow check never looks hung. Failures scream; the ship
# already sailed.
if $NO_GATES; then
    warn "Skipping advisory quality gates (--no-gates)."
else
    echo ""
    info "Running advisory release quality gates (post-push, non-blocking)..."
    # Explicit --advisory + || true so a future strict default cannot abort release.
    bash "$SCRIPT_DIR/run-release-gates.sh" --advisory || true
fi

# Re-nag at the very end so an attribution failure is the last thing on screen.
if [[ "${SOURCE_ATTRIBUTION_FAILED:-false}" == "true" ]]; then
    echo "" >&2
    echo -e "${RED}REMINDER: source-attribution violations shipped in ${NEW_VERSION}.${NC}" >&2
    echo -e "${RED}Fix them and they stop nagging: pnpm check:source-attribution${NC}" >&2
    echo "" >&2
fi

# ── The last word is the rollout, not the push ───────────────────────────────
# The advisory gates above can scroll the outcome box off screen, and the reader
# of this script is an agent that reads the tail. So the verdict is repeated
# here and carried in the exit code: a release whose build did not reach
# production must not exit 0. The ERR trap is cleared first — its "No version
# was committed, tagged, or pushed" box would be a lie (all three happened).
trap - ERR
case "$RELEASE_OUTCOME_RC" in
    0) ;;  # READY + serving on every targeted project; the green box stands.
    2)
        echo -e "${YELLOW}REMINDER: v${NEW_VERSION} (${PUSHED_SHA:0:10}) was pushed but its rollout is UNVERIFIED — no Vercel credential.${NC}" >&2
        echo -e "${YELLOW}  \`vercel login\`, or export VERCEL_TOKEN, then: bash scripts/release-outcome.sh --report ${TARGET} \"${COMMIT_MSG}\" ${PUSHED_SHA}${NC}" >&2
        echo "" >&2 ;;
    3)
        echo -e "${YELLOW}REMINDER: v${NEW_VERSION} (${PUSHED_SHA:0:10}) was pushed UNWATCHED (--no-watch). Nothing here claims it is live.${NC}" >&2
        echo "" >&2 ;;
    *)
        echo -e "${RED}ROLLOUT FAILED: v${NEW_VERSION} (${PUSHED_SHA:0:10}) was pushed and tagged, but it is NOT live — see the red box above.${NC}" >&2
        echo -e "${RED}Users are still on the previous build. Fix the build and release again.${NC}" >&2
        echo "" >&2
        exit 1 ;;
esac
