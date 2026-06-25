#!/usr/bin/env bash
# release.sh — Bump version, commit, tag, and push.
#
# Source of truth: package.json
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
#   ./scripts/release.sh --message "feat: something"   # custom commit message
#   ./scripts/release.sh --dry-run    # preview without changes
#   ./scripts/release.sh --monitor    # poll Vercel deployment status after push
#
# --monitor requires either:
#   - VERCEL_TOKEN env var (personal access token from vercel.com/account/tokens)
#   - VERCEL_TEAM_ID env var (optional, for team projects — e.g. team_xxxx)
#   - VERCEL_PROJECT_ID env var (optional, speeds up lookup by skipping name match)
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

PROJECT_NAME="matrx-admin"
GITHUB_REPO="armanisadeghi/ai-matrx-admin"
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
preview() { echo -e "${YELLOW}[DRY]${NC}   $*"; }

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
MONITOR=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --patch)   BUMP_TYPE="patch"; shift ;;
        --minor)   BUMP_TYPE="minor"; shift ;;
        --major)   BUMP_TYPE="major"; shift ;;
        --message|-m)
            [[ -n "${2:-}" ]] || fail "--message requires an argument."
            CUSTOM_MESSAGE="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --monitor) MONITOR=true; shift ;;
        -h|--help)
            grep '^#' "$0" | head -25 | sed 's/^# \?//'
            exit 0 ;;
        *) fail "Unknown flag: $1. Use --patch, --minor, --major, --message, --dry-run, or --monitor." ;;
    esac
done

# ── Pre-flight checks ────────────────────────────────────────────────────────
[[ -f "$VERSION_FILE" ]] || fail "$VERSION_FILE not found."

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
[[ "$CURRENT_BRANCH" == "$BRANCH" ]] \
    || fail "Not on '$BRANCH' branch (currently on '$CURRENT_BRANCH'). Switch first."

if [[ -n "$(git diff --cached --name-only)" ]]; then
    fail "Staged but uncommitted changes detected. Commit or unstage them first."
fi

if ! git diff --quiet; then
    fail "Uncommitted changes detected. Commit them first."
fi

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
elif [[ "$LOCAL_SHA" == "$BASE_SHA" ]]; then
    # Local is strictly behind remote — fast-forward is safe and lossless.
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
    ok "Local is ahead of $REMOTE/$BRANCH by $(git rev-list --count "$REMOTE/$BRANCH..$BRANCH") commit(s) — ready to release."
else
    # Diverged. Try a clean rebase of local commits onto remote. If it would
    # conflict, abort and tell the user — never force, never half-finish.
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
if [[ -n "$CUSTOM_MESSAGE" ]]; then
    COMMIT_MSG="$CUSTOM_MESSAGE"
else
    COMMIT_MSG="release: ${NEW_TAG}"
fi

# ── Preview ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  ${PROJECT_NAME} release${NC}"
echo -e "  ─────────────────────────────────────────────"
echo -e "  Bump type  : ${CYAN}${BUMP_TYPE}${NC}"
echo -e "  Old version: ${YELLOW}${CURRENT_VERSION}${NC}"
echo -e "  New version: ${GREEN}${NEW_VERSION}${NC}"
echo -e "  Tag        : ${GREEN}${NEW_TAG}${NC}"
echo -e "  Commit msg : ${CYAN}${COMMIT_MSG}${NC}"
$DRY_RUN && echo -e "  Mode       : ${YELLOW}DRY RUN — nothing will be changed${NC}"
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
# The release commit only bumps package.json — there is nothing for the doctrine
# or migration gates to check. Skip the pre-commit hook so they don't run a second
# time (your content commit already passed them).
info "Committing..."
git add package.json
[[ -f package-lock.json ]] && git add package-lock.json
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$COMMIT_MSG"
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
echo -e "  GitHub:  ${CYAN}https://github.com/${GITHUB_REPO}/actions${NC}"
echo -e "  Vercel:  ${CYAN}https://vercel.com/dashboard${NC}"
echo ""

# ── Vercel deployment monitor ─────────────────────────────────────────────────
_monitor_vercel() {
    local token="${VERCEL_TOKEN:-}"
    local team_id="${VERCEL_TEAM_ID:-}"
    local project_id="${VERCEL_PROJECT_ID:-}"

    if [[ -z "$token" ]]; then
        warn "--monitor requires VERCEL_TOKEN env var. Skipping."
        warn "Get one at: https://vercel.com/account/tokens"
        return
    fi

    local api_base="https://api.vercel.com"
    local team_param=""
    [[ -n "$team_id" ]] && team_param="?teamId=${team_id}"

    # Resolve project ID from name if not provided
    if [[ -z "$project_id" ]]; then
        info "Resolving Vercel project ID for '${PROJECT_NAME}'..."
        local projects_resp
        projects_resp=$(curl -sf \
            -H "Authorization: Bearer ${token}" \
            "${api_base}/v9/projects${team_param}" 2>/dev/null) || {
            warn "Could not reach Vercel API. Check VERCEL_TOKEN."; return
        }
        project_id=$(echo "$projects_resp" \
            | node -e "
                const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
                const p=(d.projects||[]).find(p=>p.name==='${PROJECT_NAME}');
                process.stdout.write(p?p.id:'');
              " 2>/dev/null)
        if [[ -z "$project_id" ]]; then
            warn "Project '${PROJECT_NAME}' not found on Vercel. Set VERCEL_PROJECT_ID to override."
            return
        fi
        ok "Found project ID: ${project_id}"
    fi

    # Wait briefly for Vercel to register the push-triggered build
    info "Waiting for Vercel to pick up the push..."
    sleep 8

    # Fetch the most recent deployment
    local deploy_url="${api_base}/v6/deployments?projectId=${project_id}&limit=1"
    [[ -n "$team_id" ]] && deploy_url="${deploy_url}&teamId=${team_id}"

    local deploy_id deploy_inspect_url
    deploy_id=$(curl -sf \
        -H "Authorization: Bearer ${token}" \
        "${deploy_url}" 2>/dev/null \
        | node -e "
            const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
            process.stdout.write((d.deployments&&d.deployments[0])?d.deployments[0].uid:'');
          " 2>/dev/null)

    if [[ -z "$deploy_id" ]]; then
        warn "No recent deployment found. It may still be queuing — check the Vercel dashboard."
        return
    fi

    deploy_inspect_url="https://vercel.com/${PROJECT_NAME}/_logs?deploymentId=${deploy_id}"
    [[ -n "$team_id" ]] && deploy_inspect_url="https://vercel.com/dashboard"
    ok "Deployment ID: ${deploy_id}"
    echo -e "  Logs:    ${CYAN}${deploy_inspect_url}${NC}"
    echo ""

    # Poll until terminal state
    local poll_url="${api_base}/v13/deployments/${deploy_id}"
    [[ -n "$team_id" ]] && poll_url="${poll_url}?teamId=${team_id}"

    local status prev_status="" elapsed=0 interval=10 max_wait=900
    local spinner=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local spin_i=0

    echo -e "${CYAN}[INFO]${NC}  Polling Vercel build status (max ${max_wait}s)..."
    echo ""

    while [[ $elapsed -lt $max_wait ]]; do
        status=$(curl -sf \
            -H "Authorization: Bearer ${token}" \
            "${poll_url}" 2>/dev/null \
            | node -e "
                const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
                process.stdout.write(d.readyState||d.status||'UNKNOWN');
              " 2>/dev/null) || status="UNKNOWN"

        if [[ "$status" != "$prev_status" ]]; then
            echo ""
            case "$status" in
                QUEUED)      echo -e "  ${YELLOW}⏳  QUEUED${NC}     — waiting in build queue" ;;
                INITIALIZING) echo -e "  ${YELLOW}🔧  INITIALIZING${NC} — preparing build environment" ;;
                BUILDING)    echo -e "  ${CYAN}🔨  BUILDING${NC}   — compiling your app" ;;
                DEPLOYING)   echo -e "  ${CYAN}🚀  DEPLOYING${NC}  — uploading to edge network" ;;
                READY)       break ;;
                ERROR)       break ;;
                CANCELED)    break ;;
                *)           echo -e "  ${YELLOW}❓  ${status}${NC}" ;;
            esac
            prev_status="$status"
        fi

        # Animate spinner on same line between status changes
        printf "\r  ${spinner[$spin_i]}  %ds elapsed..." "$elapsed"
        spin_i=$(( (spin_i + 1) % ${#spinner[@]} ))

        sleep "$interval"
        elapsed=$(( elapsed + interval ))
    done

    printf "\r%60s\r" ""  # clear spinner line

    case "$status" in
        READY)
            echo ""
            echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${GREEN}  ✓  Vercel deployment READY — ${NEW_VERSION} is live!${NC}"
            echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            ;;
        ERROR)
            echo ""
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${RED}  ✗  Vercel deployment FAILED — check logs above${NC}"
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            ;;
        CANCELED)
            warn "Deployment was canceled."
            ;;
        *)
            warn "Timed out after ${max_wait}s. Last status: ${status}. Check the dashboard."
            ;;
    esac
    echo ""
}

if $MONITOR; then
    _monitor_vercel
fi
