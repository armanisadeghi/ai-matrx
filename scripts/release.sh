#!/usr/bin/env bash
# release.sh — Ship matrx-frontend: apply pending migrations, bump, commit, tag,
# push. The push IS the build: Vercel's git integration builds every commit
# whose subject carries a release prefix (vercel.json → scripts/vercel-ignore-build.sh).
#
# Source of truth: package.json
#
# Usage:
#   ./scripts/release.sh                     # patch bump  (default)
#   ./scripts/release.sh --minor | --major
#   ./scripts/release.sh --message "note"    # commit "release: vX.Y.Z - note"
#   ./scripts/release.sh --target admin|demos|all
#       → "release-admin:" / "release-demos:" / "release-all:" (which Vercel
#         projects build; main = aimatrx.com, admin = manage., demos = demos.)
#   ./scripts/release.sh --ship --message "msg" -- <paths you own>
#       → ./ship.sh: commits EXACTLY the named paths first (THE RELEASE-COMMIT
#         CONTENT LAW, scripts/release-stage.sh), then releases.
#   ./scripts/release.sh --dry-run           # what would ship; nothing changes
#   ./scripts/release.sh --no-migrate        # ship code without applying pending SQL
#   ./scripts/release.sh --no-gates          # no after phase at all (checks, watch, fixers)
#   ./scripts/release.sh --no-watch          # after phase runs, but does not watch Vercel
#   ./scripts/release.sh --with-checks       # run the checks in THIS terminal, after the push
#   ./scripts/release.sh --async-gates       # accepted, ignored: the after phase is always detached
#
# ══ THE SHIP PATH ════════════════════════════════════════════════════════════
# Releasing is never harder than a plain `git push` (Arman, 2026-09-19/20).
# This script does ONLY what makes the build, in this order:
#
#   1. --ship: commit the named paths in this checkout (pathspec-scoped)
#   2. start applying pending migrations (background, aidream's applier)
#   3. fetch origin/main            ← the ONE thing that can stop a release
#   4. move the private worktree `.wt/release` to origin/main
#   5. merge this checkout's unpushed commits into it (a conflict = ship main
#      anyway + an ERROR finding; nothing is ever stashed or rebased)
#   6. wait for the migrations (a failure = ERROR finding, never a stop)
#   7. bump package.json in the worktree, commit, push
#      (a lost push race = fetch, reset to the new main, re-merge, re-bump, retry,
#       up to five times ← the OTHER thing that can stop a release)
#   8. push the tag, fast-forward this checkout if it can, print ONE line:
#          vX.Y.Z  pushed, build started  (Ns)
#      plus a findings table only when something is wrong.
#
# Nothing else runs before the push: not a check, not a gate, not a lease, not
# a self-test wall. A failed check, a failed migration, a dirty checkout, a
# diverged branch, an unmerged local commit — none of them stop the release.
# They become findings.
#
# Everything else runs AFTER the push, detached, into the dated log file
# (RELEASE_PHASE=after): the Vercel rollout watch (scripts/release-outcome.sh),
# every quality check in ONE parallel runner (scripts/checks/run.mjs, rows from
# scripts/run-release-gates.sh --list), and the fixer dispatcher (aidream's
# scripts/checks/dispatch_fixer.py, called with MATRX_REPO_ROOT=this repo). The
# terminal never sees any of it. INFO is never printed: a clean run is one line;
# a finding is an ERROR or WARNING row with a remedy, and every finding is also
# one JSON line so a fixer agent can be dispatched per category.
#
# Every run writes the full terminal to tmp/release-logs/release-<stamp>.log
# (+ latest.log, + release-vX.Y.Z.log once the version is known). Gitignored.
#
# Guard: scripts/test-release-ship-path.sh — a dirty checkout, a diverged
# branch and a foreign push landing mid-release must still end with the tag on
# origin and the uncommitted file untouched. `pnpm test:release-ship-path`.
#
# 🚨 THE RELEASE-COMMIT CONTENT LAW (scripts/release-stage.sh) still holds: the
# release commit carries package.json only, and --ship commits EXACTLY the
# paths the invoker named — never `git add -A`, never "whatever is staged".
# Release v0.4.1575 (2026-08-31) shipped another lane's mid-edit import that
# way. The private worktree makes the law structural: the release commit is
# built on origin/main, where nobody's half-written file exists.
set -euo pipefail

RELEASE_LOCK_HELD=false

# ── Failure trap ─────────────────────────────────────────────────────────────
# Only two things can trip it (GitHub unreachable, five lost races); anything
# that happens after the push is a finding, never a failure.
_on_error() {
    local exit_code=$?
    local line_no=${1:-}
    echo "" >&2
    echo -e "\033[0;31mRELEASE FAILED (exit ${exit_code}, line ${line_no}) — see tmp/release-logs/latest.log\033[0m" >&2
}
trap '_on_error $LINENO' ERR

# ── Resolve repo root ────────────────────────────────────────────────────────
# Named --ship paths resolve from where the invoker stood, not the repo root.
RELEASE_STAGE_CALLER_PWD="${RELEASE_STAGE_CALLER_PWD:-$PWD}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ── Log capture: every run is a dated file; the terminal still shows it live ─
release_log_name_version() {
    local ver="${1:-}"
    [[ -n "$ver" && -n "${RELEASE_LOG_DIR:-}" && -n "${RELEASE_LOG_FILE:-}" ]] || return 0
    ln -sfn "$(basename "$RELEASE_LOG_FILE")" "$RELEASE_LOG_DIR/release-v${ver}.log"
}

if [[ -z "${RELEASE_LOG_CAPTURED:-}" ]]; then
    RELEASE_LOG_DIR="$REPO_ROOT/tmp/release-logs"
    mkdir -p "$RELEASE_LOG_DIR"
    RELEASE_LOG_STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
    RELEASE_LOG_FILE="$RELEASE_LOG_DIR/release-${RELEASE_LOG_STAMP}.log"
    {
        echo "=== matrx-frontend release.sh ==="
        echo "started_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "cwd:         $REPO_ROOT"
        echo "args:        ${*:-<none>}"
        echo "pid:         $$"
        echo "================================="
        echo ""
    } > "$RELEASE_LOG_FILE"
    ln -sfn "$(basename "$RELEASE_LOG_FILE")" "$RELEASE_LOG_DIR/latest.log"
    export RELEASE_LOG_CAPTURED=1
    export RELEASE_LOG_DIR RELEASE_LOG_FILE RELEASE_LOG_STAMP
    set +e
    set +o pipefail
    "$0" "$@" 2>&1 | tee -a "$RELEASE_LOG_FILE"
    status=${PIPESTATUS[0]}
    {
        echo ""
        echo "=== matrx-frontend release.sh end (exit $status, $(date -u +%Y-%m-%dT%H:%M:%SZ)) ==="
    } >> "$RELEASE_LOG_FILE"
    exit "$status"
fi

PROJECT_NAME="ai-matrx-admin"
GITHUB_REPO="armanisadeghi/ai-matrx"
VERSION_FILE="package.json"
REMOTE="origin"
BRANCH="main"
AIDREAM_DIR="${AIDREAM_DIR:-$REPO_ROOT/../aidream}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()    { echo -e "${RED}[FAIL]${NC}  $*" >&2; exit 1; }
preview() { echo -e "${CYAN}[DRY]${NC}   $*"; }

# ── One release at a time per phase (atomic mkdir; a dead owner is reclaimed) ─
RELEASE_PHASE="${RELEASE_PHASE:-ship}"
RELEASE_LOCK_DIR="$(git rev-parse --git-path "matrx-release-${RELEASE_PHASE}.lock")"
RELEASE_LOCK_PID_FILE="$RELEASE_LOCK_DIR/pid"
release_lock_cleanup() {
    if [[ "$RELEASE_LOCK_HELD" == true ]] \
        && [[ "$(cat "$RELEASE_LOCK_PID_FILE" 2>/dev/null || true)" == "$$" ]]; then
        rm -f -- "$RELEASE_LOCK_PID_FILE"
        rmdir -- "$RELEASE_LOCK_DIR" 2>/dev/null || true
    fi
}
acquire_release_lock() {
    local owner_pid="" waited=0
    while true; do
        if mkdir "$RELEASE_LOCK_DIR" 2>/dev/null; then
            printf '%s\n' "$$" > "$RELEASE_LOCK_PID_FILE"
            RELEASE_LOCK_HELD=true
            return 0
        fi
        owner_pid=$(cat "$RELEASE_LOCK_PID_FILE" 2>/dev/null || true)
        if [[ "$owner_pid" =~ ^[0-9]+$ ]] && kill -0 "$owner_pid" 2>/dev/null; then
            if (( waited >= 600 )); then
                rm -f -- "$RELEASE_LOCK_PID_FILE"; rmdir -- "$RELEASE_LOCK_DIR" 2>/dev/null || true
                sleep 1; continue
            fi
            sleep 5; waited=$((waited + 5)); continue
        fi
        rm -f -- "$RELEASE_LOCK_PID_FILE"; rmdir -- "$RELEASE_LOCK_DIR" 2>/dev/null || true
    done
}
trap release_lock_cleanup EXIT

# ── Parse flags ──────────────────────────────────────────────────────────────
RELEASE_ORIGINAL_ARGS=("$@")
BUMP_TYPE="patch"
CUSTOM_MESSAGE=""
DRY_RUN=false
NO_MIGRATE=false
NO_GATES=false
NO_WATCH=false
RUN_CHECKS=false
SHIP_MODE=false
SHIP_PATHS=()
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
        --with-checks) RUN_CHECKS=true; shift ;;
        --async-gates) shift ;;
        --target)
            [[ -n "${2:-}" ]] || fail "--target requires an argument (main|admin|demos|all)."
            case "$2" in
                main|admin|demos|all) TARGET="$2" ;;
                *) fail "Invalid --target '$2'. Use main, admin, demos, or all." ;;
            esac
            shift 2 ;;
        -h|--help)
            grep '^#' "$0" | head -24 | sed 's/^# \?//'
            exit 0 ;;
        --)
            shift
            SHIP_PATHS=("$@")
            break ;;
        *) fail "Unknown flag: $1. Use --patch, --minor, --major, --message, --ship, --target, --dry-run, --no-migrate, --no-gates, --no-watch, --with-checks, or -- <paths you own>." ;;
    esac
done

if [[ ${#SHIP_PATHS[@]} -gt 0 ]] && ! $SHIP_MODE; then
    fail "Paths after '--' only mean something with --ship (./ship.sh). A plain release commits package.json only."
fi
if $SHIP_MODE && [[ -z "$CUSTOM_MESSAGE" ]]; then
    fail "--ship requires --message (./ship.sh passes it)."
fi
[[ -f "$VERSION_FILE" ]] || fail "$VERSION_FILE not found."

case "$TARGET" in
    main)  PREFIX="release:" ;;
    admin) PREFIX="release-admin:" ;;
    demos) PREFIX="release-demos:" ;;
    all)   PREFIX="release-all:" ;;
esac

# THE RELEASE-COMMIT CONTENT LAW lives in one file; --ship commits through it.
# shellcheck source=scripts/release-stage.sh
source "$SCRIPT_DIR/release-stage.sh"

# ── Findings: printed as a table AND written as one JSON line each ───────────
SHIP_PUSH_ATTEMPTS=5
SHIP_FINDINGS=()
SHIP_WT=""
SHIP_START=$SECONDS
SHIP_FINDINGS_JSON="${SHIP_FINDINGS_JSON:-${RELEASE_LOG_DIR:-$REPO_ROOT/tmp/release-logs}/findings-ship-${RELEASE_LOG_STAMP:-$$}.jsonl}"
# ship_finding LEVEL CATEGORY "title" ["remedy"]
ship_finding() {
    SHIP_FINDINGS+=("$1|$2|$3|${4:-}")
    mkdir -p "$(dirname "$SHIP_FINDINGS_JSON")"
    node -e '
const [path, level, category, title, remedy] = process.argv.slice(1);
const crypto = require("crypto"), fs = require("fs");
const lane = category.toLowerCase();
const norm = title.toLowerCase().replace(/\d+/g, "N").replace(/\s+/g, " ").trim();
const row = { check: `ship-${lane}`, category: lane, level: level.toLowerCase(), title: title.slice(0, 100), count: 1,
  fingerprint: crypto.createHash("sha1").update(`ship-${lane}\n${norm}`).digest("hex"),
  remedy: remedy || "", detail: process.env.RELEASE_LOG_FILE || "" };
fs.appendFileSync(path, JSON.stringify(row) + "\n");
' "$SHIP_FINDINGS_JSON" "$1" "$2" "$3" "${4:-}" 2>/dev/null || true
}
ship_quiet() {
    if [[ -n "${RELEASE_LOG_FILE:-}" ]]; then "$@" >>"$RELEASE_LOG_FILE" 2>&1; else "$@" >/dev/null 2>&1; fi
}
ship_mark() {
    [[ -n "${RELEASE_LOG_FILE:-}" ]] || return 0
    printf '[ship %3ss] %s\n' "$((SECONDS - SHIP_START))" "$*" >>"$RELEASE_LOG_FILE"
}
ship_print_findings() {
    [[ ${#SHIP_FINDINGS[@]} -gt 0 ]] || return 0
    echo ""
    printf '%-8s %-12s %s\n' "LEVEL" "CATEGORY" "FINDING"
    local row
    for row in "${SHIP_FINDINGS[@]}"; do
        IFS='|' read -r f_level f_cat f_text f_remedy <<< "$row"
        printf '%-8s %-12s %s%s\n' "$f_level" "$f_cat" "$f_text" "${f_remedy:+  → $f_remedy}"
    done
}
# ONE persistent private worktree, moved to origin/main each release. Creating a
# fresh one checks out every file (minutes on this repo); moving this one
# rewrites only what changed. Gitignored (.wt/); nobody else writes there.
ship_prepare_worktree() {
    SHIP_WT="$REPO_ROOT/.wt/release"
    if [[ -e "$SHIP_WT/.git" ]] \
        && ship_quiet git -C "$SHIP_WT" checkout --detach --force --quiet "$REMOTE/$BRANCH" \
        && ship_quiet git -C "$SHIP_WT" reset --hard --quiet "$REMOTE/$BRANCH"; then
        return 0
    fi
    ship_quiet git worktree remove --force "$SHIP_WT" || rm -rf -- "$SHIP_WT"
    ship_quiet git worktree prune || true
    ship_quiet git worktree add --detach "$SHIP_WT" "$REMOTE/$BRANCH"
}
# Pending migrations sweep: this repo has no DDL path of its own; the co-located
# aidream checkout owns the Postgres write path and the shared ledger.
# `--target production` is an assertion the applier must agree with (2026-09-16:
# a `-- target: branch` file reached production through an applier that had no
# such flag); an applier too old to know it exits non-zero, which is a finding.
ship_apply_migrations() {
    # Bounded: a hung applier (uv stall, .venv lock, Postgres lock) becomes the
    # ERROR finding below (exit 124), never an endless wait before the push.
    (
        cd "$AIDREAM_DIR"
        export MATRX_FRONTEND_DIR="$REPO_ROOT"
        timeout 900 uv run python db/apply_migrations.py --source matrx-frontend --target production --no-generate
    )
}
ship_read_version() { sed -n 's/^  "version": "\([^"]*\)".*/\1/p' "$1" | head -1; }
ship_write_version() {  # file old new
    local tmp; tmp="$(mktemp)"
    sed "s/^  \"version\": \"$2\"/  \"version\": \"$3\"/" "$1" > "$tmp" && cat "$tmp" > "$1"; rm -f "$tmp"
    [[ "$(ship_read_version "$1")" == "$3" ]]
}
ship_commit_message() {  # tag → "prefix vX.Y.Z[ - note]"
    local note="$CUSTOM_MESSAGE" p
    for p in "release-admin:" "release-demos:" "release-all:" "release:"; do
        if [[ "$note" == "$p"* ]]; then note="${note#"$p"}"; note="${note# }"; break; fi
    done
    if [[ -n "$note" && "$note" != "$1"* ]]; then echo "${PREFIX} $1 - ${note}"
    elif [[ -n "$note" ]]; then echo "${PREFIX} ${note}"
    else echo "${PREFIX} $1"; fi
}

# ── --ship: commit EXACTLY the named paths in this checkout, before anything ─
# The commit rides into the release through the worktree merge below. With no
# named paths there is nothing of yours to commit: it is a bump-only release
# and every dirty path stays exactly as its owner left it.
if [[ "${RELEASE_PHASE:-ship}" == "ship" ]] && $SHIP_MODE && [[ ${#SHIP_PATHS[@]} -gt 0 ]]; then
    release_stage_validate_paths ${SHIP_PATHS[@]+"${SHIP_PATHS[@]}"} \
        || fail "--ship was given a pathspec it cannot commit (see above). Nothing has been changed."
    SHIP_PATHS=("${RELEASE_STAGE_PATHS[@]}")
    RELEASE_STAGE_CALLER_PWD="$REPO_ROOT"
    if $DRY_RUN; then
        preview "Would commit ONLY the named paths, then release:"
        release_stage_preview -- "${SHIP_PATHS[@]}"
    elif [[ -z "$(_rs_status -- "${SHIP_PATHS[@]}")" ]]; then
        ship_finding "WARNING" "Git" "Named paths carry no change against HEAD — bump-only release" ""
    else
        # The primitive proves it excludes foreign edits before it is trusted (~1s).
        if ! ship_quiet bash "$SCRIPT_DIR/release-stage.sh" --self-test; then
            ship_finding "WARNING" "Git" "release-stage self-test failed — the pathspec commit was made anyway" "pnpm check:ship-stage:self-test"
        fi
        COMMIT_MSG="$CUSTOM_MESSAGE"
        release_stage_commit "$COMMIT_MSG" -- "${SHIP_PATHS[@]}" \
            || fail "Could not commit the named paths (see above). Nothing has been pushed."
        ship_mark "committed named paths: ${SHIP_PATHS[*]}"
    fi
fi

# ── Dry run: what would ship, from origin/main's point of view ───────────────
if $DRY_RUN; then
    git fetch --quiet "$REMOTE" "$BRANCH" 2>/dev/null || fail "Cannot reach GitHub ($REMOTE/$BRANCH)."
    DRY_CURRENT="$(git show "$REMOTE/$BRANCH:$VERSION_FILE" | sed -n 's/^  "version": "\([^"]*\)".*/\1/p' | head -1)"
    IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "$DRY_CURRENT"
    case "$BUMP_TYPE" in
        patch) V_PATCH=$((V_PATCH + 1)) ;;
        minor) V_MINOR=$((V_MINOR + 1)); V_PATCH=0 ;;
        major) V_MAJOR=$((V_MAJOR + 1)); V_MINOR=0; V_PATCH=0 ;;
    esac
    DRY_TAG="v${V_MAJOR}.${V_MINOR}.${V_PATCH}"
    preview "origin/main is at ${DRY_CURRENT}; would release ${DRY_TAG} as '$(ship_commit_message "$DRY_TAG")' (target: $TARGET)"
    LOCAL_AHEAD=$(git rev-list --count "$REMOTE/$BRANCH..HEAD" 2>/dev/null || echo 0)
    if [[ "$LOCAL_AHEAD" -gt 0 ]]; then
        preview "Would merge ${LOCAL_AHEAD} local commit(s) not on $REMOTE/$BRANCH into the release:"
        git log --oneline "$REMOTE/$BRANCH..HEAD" | sed 's/^/          /'
    fi
    if $NO_MIGRATE; then preview "Would NOT apply pending migrations (--no-migrate)."
    elif [[ -f "$AIDREAM_DIR/db/apply_migrations.py" ]] && command -v uv >/dev/null 2>&1; then
        preview "Pending migrations (read-only check):"
        ( cd "$AIDREAM_DIR" && MATRX_FRONTEND_DIR="$REPO_ROOT" uv run python db/apply_migrations.py --source matrx-frontend --target production --dry-run ) 2>&1 | sed 's/^/          /' || true
    else
        preview "Would record an ERROR finding: no aidream applier/uv — pending migrations could not be applied."
    fi
    preview "Dirty paths in this checkout are never touched: $(git status --porcelain --untracked-files=all | wc -l | tr -d ' ')"
    preview "Dry run complete. No changes made."
    exit 0
fi

# ══ THE SHIP PATH ════════════════════════════════════════════════════════════
if [[ "$RELEASE_PHASE" == "ship" ]]; then
    acquire_release_lock

    SHIP_MIG_PID=""
    if $NO_MIGRATE; then
        :
    elif [[ ! -f "$AIDREAM_DIR/db/apply_migrations.py" ]]; then
        ship_finding "ERROR" "Migrations" "aidream applier not found at $AIDREAM_DIR — pending migrations were NOT applied" "AIDREAM_DIR=<aidream checkout> pnpm check:migrations:strict"
    elif ! command -v uv >/dev/null 2>&1; then
        ship_finding "ERROR" "Migrations" "uv is not installed — pending migrations were NOT applied" "pnpm check:migrations:strict"
    else
        ship_quiet ship_apply_migrations &
        SHIP_MIG_PID=$!
    fi

    SHIP_FETCHED=false
    for _ in 1 2 3; do
        if ship_quiet git fetch --quiet "$REMOTE" "$BRANCH"; then SHIP_FETCHED=true; break; fi
        sleep 2
    done
    $SHIP_FETCHED || fail "Cannot reach GitHub ($REMOTE/$BRANCH) — nothing was changed."
    ship_mark "fetched $REMOTE/$BRANCH"

    SHIP_LOCAL_HEAD=$(git rev-parse HEAD)
    ship_prepare_worktree \
        || fail "Could not prepare the private release worktree (.wt/release) — nothing was changed."
    ship_mark "private worktree ready"

    # This checkout's commits that are not on origin yet (the --ship commit,
    # other sessions' unpushed work) ride along. If they conflict, main ships.
    # Only main's commits ride: a checkout parked on some other branch would
    # otherwise ship that branch.
    SHIP_LOCAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    if [[ "$SHIP_LOCAL_BRANCH" != "$BRANCH" ]]; then
        ship_finding "WARNING" "Git" "This checkout is on '$SHIP_LOCAL_BRANCH', not $BRANCH — its commits were not merged into the release" "git checkout main"
        SHIP_LOCAL_HEAD="$(git rev-parse "$REMOTE/$BRANCH")"
    fi
    ship_merge_local() {
        git merge-base --is-ancestor "$SHIP_LOCAL_HEAD" "$(git -C "$SHIP_WT" rev-parse HEAD)" && return 0
        if ! ship_quiet git -C "$SHIP_WT" -c core.hooksPath=/dev/null merge --no-edit "$SHIP_LOCAL_HEAD"; then
            ship_quiet git -C "$SHIP_WT" merge --abort || true
            ship_quiet git -C "$SHIP_WT" reset --hard "$REMOTE/$BRANCH"
            ship_finding "ERROR" "Git" "Local commits conflict with $REMOTE/$BRANCH — shipped $BRANCH without ${SHIP_LOCAL_HEAD:0:9}" "git pull --no-rebase origin main"
        fi
    }
    ship_merge_local

    SHIP_REMOTE_TAGS=$(git ls-remote --tags "$REMOTE" 'refs/tags/v*' 2>/dev/null || true)
    ship_tag_taken() {
        git rev-parse -q --verify "refs/tags/$1" >/dev/null && return 0
        grep -q "refs/tags/$1\$" <<< "$SHIP_REMOTE_TAGS"
    }

    if [[ -n "$SHIP_MIG_PID" ]] && ! wait "$SHIP_MIG_PID"; then
        ship_finding "ERROR" "Migrations" "A pending migration failed to apply or was refused — see the release log" "pnpm check:migrations:strict"
    fi
    ship_mark "migrations done"

    # A rejected push is a lost race only when origin really moved. A network
    # blip is retried with a pause and does not count against SHIP_PUSH_ATTEMPTS.
    SHIP_PUSHED=false
    SHIP_RACES=0
    SHIP_BLIPS=0
    while (( SHIP_RACES < SHIP_PUSH_ATTEMPTS && SHIP_BLIPS < 10 )); do
        CURRENT_VERSION="$(ship_read_version "$SHIP_WT/$VERSION_FILE")"
        [[ -n "$CURRENT_VERSION" ]] || fail "Could not read the version from $VERSION_FILE on $REMOTE/$BRANCH."
        IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "$CURRENT_VERSION"
        case "$BUMP_TYPE" in
            patch) V_PATCH=$((V_PATCH + 1)) ;;
            minor) V_MINOR=$((V_MINOR + 1)); V_PATCH=0 ;;
            major) V_MAJOR=$((V_MAJOR + 1)); V_MINOR=0; V_PATCH=0 ;;
        esac
        while ship_tag_taken "v${V_MAJOR}.${V_MINOR}.${V_PATCH}"; do V_PATCH=$((V_PATCH + 1)); done
        NEW_VERSION="${V_MAJOR}.${V_MINOR}.${V_PATCH}"
        NEW_TAG="v${NEW_VERSION}"
        RELEASE_COMMIT_MSG="$(ship_commit_message "$NEW_TAG")"

        ship_write_version "$SHIP_WT/$VERSION_FILE" "$CURRENT_VERSION" "$NEW_VERSION" \
            || fail "Could not write version ${NEW_VERSION} into $VERSION_FILE — nothing was pushed."
        ship_quiet git -C "$SHIP_WT" -c core.hooksPath=/dev/null commit -q -m "$RELEASE_COMMIT_MSG" -- "$VERSION_FILE" \
            || fail "Could not create the release commit in the private worktree — nothing was pushed."
        RELEASE_SHA=$(git -C "$SHIP_WT" rev-parse HEAD)

        if ship_quiet git -C "$SHIP_WT" push "$REMOTE" "HEAD:refs/heads/$BRANCH"; then
            SHIP_PUSHED=true
            break
        fi
        SHIP_SEEN_REMOTE=$(git rev-parse "$REMOTE/$BRANCH")
        if ship_quiet git fetch --quiet "$REMOTE" "$BRANCH" \
            && [[ "$(git rev-parse "$REMOTE/$BRANCH")" != "$SHIP_SEEN_REMOTE" ]]; then
            SHIP_RACES=$((SHIP_RACES + 1))
            ship_mark "lost push race ${SHIP_RACES} — retrying on the new $BRANCH"
        else
            SHIP_BLIPS=$((SHIP_BLIPS + 1))
            ship_mark "push failed without $BRANCH moving (network?) — pause, retry ${SHIP_BLIPS}"
            sleep $((SHIP_BLIPS * 3))
        fi
        SHIP_REMOTE_TAGS=$(git ls-remote --tags "$REMOTE" 'refs/tags/v*' 2>/dev/null || echo "$SHIP_REMOTE_TAGS")
        ship_quiet git -C "$SHIP_WT" reset --hard "$REMOTE/$BRANCH"
        ship_merge_local
    done
    if ! $SHIP_PUSHED; then
        (( SHIP_RACES >= SHIP_PUSH_ATTEMPTS )) \
            && fail "Lost the push race ${SHIP_PUSH_ATTEMPTS} times in a row — nothing was released. Run it again."
        fail "Cannot push to GitHub ($REMOTE/$BRANCH) — nothing was released."
    fi
    ship_mark "pushed ${RELEASE_SHA:0:9} as ${RELEASE_COMMIT_MSG}"

    # main carries a release-prefixed commit: Vercel is building. From here on
    # nothing may stop it; everything below is a finding at worst.
    trap - ERR
    set +e
    if ! ship_quiet git tag -f "$NEW_TAG" "$RELEASE_SHA" || ! ship_quiet git push "$REMOTE" "$NEW_TAG"; then
        ship_finding "ERROR" "Git" "Tag $NEW_TAG did not reach $REMOTE — push it by hand" "git push origin $NEW_TAG"
    fi
    release_log_name_version "$NEW_VERSION"

    # Catch this checkout up. Fast-forward only: it never rewrites anyone's
    # uncommitted files, and refusing is a warning — the build is already running.
    if [[ "$(git rev-parse --abbrev-ref HEAD)" == "$BRANCH" ]]; then
        ship_quiet git merge --ff-only "$REMOTE/$BRANCH" \
            || ship_finding "WARNING" "Git" "This checkout could not fast-forward to $NEW_TAG — pull when convenient" "git pull --no-rebase origin main"
    fi

    echo "${NEW_TAG}  pushed, build started  ($((SECONDS - SHIP_START))s)"
    ship_print_findings

    # Everything that is not needed to make the build runs now, detached.
    # RELEASE_AFTER_PHASE=off is the ship-path guard's switch (test-release-ship-path.sh).
    if $NO_GATES || [[ "${RELEASE_AFTER_PHASE:-on}" == "off" ]]; then
        exit 0
    fi
    export RELEASE_PHASE=after CURRENT_VERSION NEW_VERSION NEW_TAG RELEASE_SHA RELEASE_COMMIT_MSG SHIP_FINDINGS_JSON TARGET
    if $RUN_CHECKS; then
        release_lock_cleanup; RELEASE_LOCK_HELD=false
        exec "$0" ${RELEASE_ORIGINAL_ARGS[@]+"${RELEASE_ORIGINAL_ARGS[@]}"}
    fi
    nohup "$0" ${RELEASE_ORIGINAL_ARGS[@]+"${RELEASE_ORIGINAL_ARGS[@]}"} </dev/null >>"${RELEASE_LOG_FILE:-/dev/null}" 2>&1 &
    disown || true
    exit 0
fi

# ══ THE AFTER PHASE ══════════════════════════════════════════════════════════
# The build is already going. Nothing here can stop it, and nothing here
# reaches the terminal unless --with-checks asked for it: the rollout watch,
# the checks, and the fixer dispatch all write to the release log and to
# tmp/release-logs/findings-vX.Y.Z.jsonl.
acquire_release_lock
trap - ERR
set +e
: "${NEW_TAG:=$(git describe --tags --match 'v*' --abbrev=0 HEAD 2>/dev/null || git rev-parse --short HEAD)}"
: "${NEW_VERSION:=${NEW_TAG#v}}"
: "${RELEASE_SHA:=$(git rev-parse HEAD)}"
: "${RELEASE_COMMIT_MSG:=$(git log -1 --format=%s "$RELEASE_SHA" 2>/dev/null || echo "release: $NEW_TAG")}"
CHECKS_JSON="${RELEASE_LOG_DIR:-$REPO_ROOT/tmp/release-logs}/findings-${NEW_TAG}.jsonl"
mkdir -p "$(dirname "$CHECKS_JSON")"
ROLLOUT_JSON="${CHECKS_JSON}.rollout"
: > "$ROLLOUT_JSON"

# ── Rollout watch (THE RELEASE-BANNER TRUTH LAW, scripts/release-outcome.sh) ──
# The push is not the release. Green means READY on every targeted Vercel
# project AND serving on the live domain; anything else is an ERROR finding
# (or a WARNING when there is no Vercel credential to look with).
after_watch_rollout() {
    # shellcheck source=scripts/release-outcome.sh
    source "$SCRIPT_DIR/release-outcome.sh"
    local rc=0
    release_outcome_report "$TARGET" "$RELEASE_COMMIT_MSG" "$RELEASE_SHA" "$NEW_VERSION" || rc=$?
    case "$rc" in
        0) ;;
        2) SHIP_FINDINGS_JSON="$ROLLOUT_JSON" ship_finding "WARNING" "Rollout" "UNVERIFIED — ${NEW_TAG} was pushed but no Vercel credential could confirm the build" "bash scripts/release-outcome.sh --report $TARGET \"$RELEASE_COMMIT_MSG\" $RELEASE_SHA" ;;
        *) SHIP_FINDINGS_JSON="$ROLLOUT_JSON" ship_finding "ERROR" "Rollout" "ROLLOUT FAILED: ${NEW_TAG} (${RELEASE_SHA:0:10}) is pushed but NOT live — see the release log" "bash scripts/release-outcome.sh --report $TARGET \"$RELEASE_COMMIT_MSG\" $RELEASE_SHA" ;;
    esac
}
WATCH_PID=""
if $NO_WATCH; then
    SHIP_FINDINGS_JSON="$ROLLOUT_JSON" ship_finding "WARNING" "Rollout" "UNWATCHED — ${NEW_TAG} was pushed with --no-watch; nothing here claims it is live" "bash scripts/release-outcome.sh --report $TARGET \"$RELEASE_COMMIT_MSG\" $RELEASE_SHA"
else
    after_watch_rollout &
    WATCH_PID=$!
fi

# ── Worktree janitor: every release sweeps the abandoned agent worktrees and
# branches (no worktrees, no branches — Arman, 2026-09-20). It only cleans and
# screams; it always exits 0 and can never affect the release.
bash "$SCRIPT_DIR/worktree-janitor.sh" >>"${RELEASE_LOG_FILE:-/dev/null}" 2>&1 || true

# ── Checks: ONE parallel runner, ONE table, findings as JSON (scripts/checks/run.mjs)
# Rows come from scripts/run-release-gates.sh --list plus the checks the old
# script used to run before the push (matrx-packages, organization-context,
# client-initiation, migration judgment, surface registration, …). A check
# NEVER blocks: the runner exits 0; a nonzero exit means the RUNNER crashed.
RUNNER_OK=true
if $RUN_CHECKS; then
    node "$SCRIPT_DIR/checks/run.mjs" --json "$CHECKS_JSON" \
        || { RUNNER_OK=false; warn "The check runner itself crashed — nothing was measured. The release is not affected."; }
else
    node "$SCRIPT_DIR/checks/run.mjs" --json "$CHECKS_JSON" >>"${RELEASE_LOG_FILE:-/dev/null}" 2>&1 \
        || { RUNNER_OK=false; warn "The check runner itself crashed — nothing was measured. The release is not affected."; }
fi
[[ -n "$WATCH_PID" ]] && wait "$WATCH_PID"
# Ship-path and rollout findings ride the same dispatch as the checks' findings.
[[ -s "${SHIP_FINDINGS_JSON:-}" ]] && cat "$SHIP_FINDINGS_JSON" >> "$CHECKS_JSON"
[[ -s "$ROLLOUT_JSON" ]] && cat "$ROLLOUT_JSON" >> "$CHECKS_JSON"
rm -f "$ROLLOUT_JSON"

# ── One fixer agent per category with a NEW finding (aidream's dispatcher) ───
# One dispatcher serves both repos: MATRX_REPO_ROOT points it at this checkout,
# so its ledger, settings and agent logs live here (.matrx/fixer-*.json,
# tmp/fixer-logs/) and its agents read THIS repo's CLAUDE.md.
DISPATCHER="$AIDREAM_DIR/scripts/checks/dispatch_fixer.py"
# A crashed runner measured nothing: dispatching on its partial file would let the
# dispatcher resolve findings it never re-checked.
if $RUNNER_OK && [[ -s "$CHECKS_JSON" && "$(grep -c '"fingerprint"' "$CHECKS_JSON")" -gt 0 ]]; then
    if [[ -f "$DISPATCHER" ]]; then
        if command -v uv >/dev/null 2>&1; then
            ( cd "$AIDREAM_DIR" && MATRX_REPO_ROOT="$REPO_ROOT" uv run --frozen python "$DISPATCHER" --findings "$CHECKS_JSON" )
        else
            MATRX_REPO_ROOT="$REPO_ROOT" python3 "$DISPATCHER" --findings "$CHECKS_JSON"
        fi || warn "The fixer dispatcher crashed — findings are in $CHECKS_JSON; nothing was dispatched."
    else
        warn "No fixer dispatcher at $DISPATCHER — findings are in $CHECKS_JSON; nothing was dispatched."
    fi
fi
exit 0
