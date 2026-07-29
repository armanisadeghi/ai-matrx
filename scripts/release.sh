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
#     (remote ahead), proceeds (local ahead), or cleanly rebases (diverged).
#   - If a clean rebase is not possible, it aborts having changed NOTHING and
#     prints exactly how the branches diverged + how to resolve.
#   - The final push is atomic (branch + tag together) with one automatic
#     clean-rebase retry if the remote raced us mid-release. It never force-pushes
#     and never leaves a half-pushed state.
#
# Usage:
#   ./scripts/release.sh              # patch bump  (default)
#   ./scripts/release.sh --patch      # patch bump
#   ./scripts/release.sh --minor      # minor bump
#   ./scripts/release.sh --major      # major bump
#   ./scripts/release.sh --message "document shared OAuth"
#       → commit "release: vX.Y.Z - document shared OAuth"
#   ./scripts/release.sh --ship --message "Added chat surface"
#       → one commit of working tree + bump (used by ./ship.sh)
#   ./scripts/release.sh --dry-run    # preview without changes
#   ./scripts/release.sh --no-migrate # skip applying FE migrations
#   ./scripts/release.sh --no-gates   # skip advisory quality gates after push
#   ./scripts/release.sh --target admin --message "new admin panel"
#       → commit "release-admin: vX.Y.Z - new admin panel" (deploys ONLY
#         manage.aimatrx.com; --target demos / all likewise)
#
# This script talks to git only (and optionally the co-located aidream migration
# applier). It never calls Vercel. Deploy is: one atomic push of branch + tag to
# origin/main; Vercel/GitHub handle the rest.
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
# Dirty working tree: plain release IGNORES uncommitted changes (bumps + pushes
# what is already committed). Only a remote sync that must FF/rebase will refuse
# a dirty tree. ./ship.sh (--ship) folds the working tree into the release commit.
#
# Quality gates (doctrine, UI primitives, migration ledger, …) stay ADVISORY —
# they scream loudly and never block the ship. Only git (and a failed migration
# apply) can stop a release. Manual hard-fail: pnpm check:release-gates:strict
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
SHIP_MODE=false
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
        --target)
            [[ -n "${2:-}" ]] || fail "--target requires an argument (main|admin|demos|all)."
            case "$2" in
                main|admin|demos|all) TARGET="$2" ;;
                *) fail "Invalid --target '$2'. Use main, admin, demos, or all." ;;
            esac
            shift 2 ;;
        -h|--help)
            grep '^#' "$0" | head -45 | sed 's/^# \?//'
            exit 0 ;;
        *) fail "Unknown flag: $1. Use --patch, --minor, --major, --message, --ship, --target, --dry-run, --no-migrate, or --no-gates." ;;
    esac
done

if $SHIP_MODE && [[ -z "$CUSTOM_MESSAGE" ]]; then
    fail "--ship requires --message (./ship.sh passes it)."
fi

# ── Pre-flight checks ────────────────────────────────────────────────────────
[[ -f "$VERSION_FILE" ]] || fail "$VERSION_FILE not found."

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
[[ "$CURRENT_BRANCH" == "$BRANCH" ]] \
    || fail "Not on '$BRANCH' branch (currently on '$CURRENT_BRANCH'). Switch first."

# Dirty tree is fine for a plain release (bump + push committed work only).
# FF/rebase still needs a clean tree — enforced only when sync must mutate.
working_tree_dirty() {
    ! git diff --quiet \
        || [[ -n "$(git diff --cached --name-only)" ]] \
        || [[ -n "$(git ls-files --others --exclude-standard)" ]]
}

require_clean_for_sync() {
    if working_tree_dirty; then
        fail "Uncommitted changes block syncing with $REMOTE/$BRANCH (FF/rebase needs a clean tree).
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
    # Diverged. Try a clean rebase of local commits onto remote. If it would
    # conflict, abort and tell the user — never force, never half-finish.
    require_clean_for_sync
    if $DRY_RUN; then
        # Probe whether a clean rebase is possible without mutating anything.
        if git merge-tree --write-tree "$REMOTE/$BRANCH" "$BRANCH" >/dev/null 2>&1; then
            preview "Diverged from $REMOTE/$BRANCH — a clean rebase looks possible; would rebase."
        else
            warn "Diverged from $REMOTE/$BRANCH — a rebase would likely conflict; would abort and ask you to resolve."
        fi
    else
        warn "Local and $REMOTE/$BRANCH have diverged. Attempting a clean rebase..."
        if git rebase "$REMOTE/$BRANCH" >/dev/null 2>&1; then
            ok "Clean rebase succeeded — linear history restored on top of $REMOTE/$BRANCH."
        else
            git rebase --abort >/dev/null 2>&1 || true
            echo "" >&2
            diverge_summary
            echo "" >&2
            fail "$(cat <<EOF
Diverged from $REMOTE/$BRANCH and an automatic rebase would hit conflicts.
Nothing has been changed — your tree is exactly as you left it.

Resolve by hand, then re-run this script:
    git rebase $REMOTE/$BRANCH      # fix the conflicts
    ./scripts/release.sh            # re-run the release
EOF
)"
        fi
    fi
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
        ok "Migration ledger matches migrations/*.sql."
    else
        fail "Migration ledger still has unapplied/drifted files after apply.
Fix the failures above (or re-run from aidream:
  MATRX_FRONTEND_DIR=$REPO_ROOT uv run python db/apply_migrations.py --source matrx-frontend --no-generate
), then re-run this release."
    fi
}

apply_frontend_migrations

# ── Entity registry sync (live DB → generated TypeScript metadata) ────────────
# The token union is compiled for type safety, but every metadata value comes
# from platform.entity_types. Admin edits must never leave a release carrying a
# stale runtime snapshot. Regenerate after migrations, commit only the generated
# file if it changed, then verify byte-for-byte drift before continuing.
if $DRY_RUN; then
    info "Checking generated entity metadata (dry-run — read-only)..."
    if pnpm check:entity-types; then
        ok "Generated entity metadata matches platform.entity_types."
    else
        warn "Entity registry drift found. A real release would regenerate and commit it."
    fi
else
    info "Synchronizing generated entity metadata from platform.entity_types..."
    if ! pnpm gen:entity-types; then
        fail "Entity metadata generation failed. The release was not committed or pushed."
    fi
    if ! git diff --quiet -- types/generated/entity-types.generated.ts; then
        echo "" >&2
        echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}" >&2
        echo -e "${RED}║  ENTITY REGISTRY DRIFT — committing regenerated metadata    ║${NC}" >&2
        echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}" >&2
        git commit --only -m \
            "chore(entity-types): sync generated registry from database" \
            -- types/generated/entity-types.generated.ts
        ok "Generated entity metadata re-synced and committed."
    fi
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
    if pnpm check:protocol-sync:strict; then
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
# attribution view downstream. ADVISORY ONLY — no check ever blocks a release;
# only git (and a failed migration apply above) can stop the ship.
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
    preview "Would create tag: $NEW_TAG"
    preview "Would push to $REMOTE/$BRANCH"
    echo ""
    preview "Dry run complete. No changes made."
    exit 0
fi

# ── Update package.json (+ package-lock.json if present) ─────────────────────
npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version >/dev/null 2>&1
ok "$VERSION_FILE → $NEW_VERSION"

# ── Commit ───────────────────────────────────────────────────────────────────
# --ship (./ship.sh): one commit = working tree + version bump.
# Plain release: only the version files — leave any dirty tree alone.
info "Committing..."
if $SHIP_MODE; then
    git add -A
else
    # Don't suck unrelated staged files into the version bump commit.
    git reset -q HEAD -- . 2>/dev/null || true
    git add package.json
    [[ -f package-lock.json ]] && git add package-lock.json
fi
if git diff --cached --quiet; then
    fail "Nothing to commit after version bump (unexpected)."
fi
git commit -m "$COMMIT_MSG"
echo ""
ok "Committed: '$COMMIT_MSG'"

# ── Tag ──────────────────────────────────────────────────────────────────────
info "Creating tag $NEW_TAG..."
git tag "$NEW_TAG"
ok "Tag $NEW_TAG created"

# ── Push (branch + tag atomically; reconcile once if the remote raced us) ─────
# --atomic guarantees the branch and tag push together or not at all, so a
# rejection never leaves a half-pushed state. The pre-flight block above makes
# rejection rare; this only triggers if the remote moved during the few seconds
# we spent bumping/committing/tagging.
info "Pushing to $REMOTE/$BRANCH..."
if git push --atomic "$REMOTE" "$BRANCH" "$NEW_TAG" 2>/dev/null; then
    ok "Pushed to $REMOTE/$BRANCH with tag $NEW_TAG"
else
    warn "Push rejected — $REMOTE/$BRANCH moved while we were releasing. Reconciling once..."
    git fetch "$REMOTE" "$BRANCH" 2>/dev/null || die_after_commit "$(cat <<EOF
Push was rejected and we could not re-fetch $REMOTE.
Your release commit and tag $NEW_TAG exist locally; nothing was force-pushed.
Once you are back online:
    git pull --rebase $REMOTE $BRANCH
    git tag -f $NEW_TAG HEAD
    git push --atomic $REMOTE $BRANCH $NEW_TAG
EOF
)"

    if git rebase "$REMOTE/$BRANCH" >/dev/null 2>&1; then
        # The rebase rewrote our release commit, so the tag now points at the
        # old (orphaned) SHA — move it onto the new HEAD before retrying.
        git tag -f "$NEW_TAG" HEAD >/dev/null
        info "Rebased onto updated $REMOTE/$BRANCH and re-pointed $NEW_TAG. Retrying push..."
        if git push --atomic "$REMOTE" "$BRANCH" "$NEW_TAG" 2>/dev/null; then
            ok "Pushed to $REMOTE/$BRANCH with tag $NEW_TAG"
        else
            die_after_commit "$(cat <<EOF
Rejected again right after a clean rebase — $REMOTE/$BRANCH is moving rapidly
(someone else is pushing at the same moment). Your history is clean and linear
locally; just push by hand when the dust settles:
    git push --atomic $REMOTE $BRANCH $NEW_TAG
EOF
)"
        fi
    else
        git rebase --abort >/dev/null 2>&1 || true
        echo "" >&2
        diverge_summary
        die_after_commit "$(cat <<EOF
Push was rejected and an automatic rebase onto the new $REMOTE/$BRANCH conflicts.
Your release commit and tag $NEW_TAG exist locally; nothing was force-pushed.
Resolve by hand:
    git rebase $REMOTE/$BRANCH        # fix the conflicts
    git tag -f $NEW_TAG HEAD          # re-point the tag onto the rebased commit
    git push --atomic $REMOTE $BRANCH $NEW_TAG
EOF
)"
    fi
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Released ${PROJECT_NAME} ${NEW_VERSION}${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  GitHub:  ${CYAN}https://github.com/${GITHUB_REPO}${NC}"
echo ""

# ── Advisory quality gates (post-push — never block the ship) ────────────────
# Only git may stop a release. Each gate announces itself before it starts so
# a slow check never looks hung. Failures scream; the ship already sailed.
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
