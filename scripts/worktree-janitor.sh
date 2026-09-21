#!/usr/bin/env bash
# worktree-janitor.sh — remove the agent worktrees and local branches nobody
# needs any more, and name the ones that still hold work.
#
# Arman, 2026-09-20: "there is no reason for ever having a worktree. Updates
# should always be made to the single source of truth that is pushed live
# every 30 minutes." Agents keep creating throwaway worktrees anyway (the
# shared-checkout push recipe uses `mktemp -d` + `git worktree add`) and never
# remove them; dozens accumulate per hour. This is the guard that removes them.
#
# What it removes, silently:
#   • a registered worktree whose tip is already an ancestor of origin/main and
#     that holds no real dirty files (missing-file ` D` lines and generated
#     noise — tsconfig.json's .next/types include, public/blob-sw.js — are not
#     real dirty files)
#   • a prunable worktree (its gitdir is gone)
#   • an unregistered directory under .wt/ — the leftover of a worktree that
#     was already removed from git's registry
#   • a local branch other than main whose tip is an ancestor of origin/main
#
# What it keeps, loudly: anything with commits or edits that are not on main.
# It prints one line naming the worktree/branch and tells you what to do.
#
# It NEVER blocks a release: it exits 0 no matter what it finds. The only
# nonzero exit is --self-test failing.
#
# Usage:
#   bash scripts/worktree-janitor.sh              # sweep
#   bash scripts/worktree-janitor.sh --dry-run    # say what it would do
#   bash scripts/worktree-janitor.sh --self-test  # prove both modes
#
#   pnpm worktree:janitor
#   pnpm worktree:janitor:self-test

set -uo pipefail

DRY_RUN=false
SELF_TEST=false
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --self-test) SELF_TEST=true ;;
        -h|--help) sed -n '2,33p' "$0"; exit 0 ;;
        *) echo "worktree-janitor: unknown option $arg (try --help)" >&2 ;;
    esac
done

# The janitor always acts from the main checkout, whatever it was invoked from.
GIT_COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
if [[ -z "$GIT_COMMON_DIR" ]]; then
    echo "worktree-janitor: not a git repository — nothing to do."
    exit 0
fi
MAIN_WORKTREE="$(cd "$(dirname "$GIT_COMMON_DIR")" && pwd -P)"
cd "$MAIN_WORKTREE" || exit 0

# The release script's private worktree, when it has one. (As of 2026-09-20
# scripts/release.sh assembles the release tree with git plumbing and uses no
# worktree at all — this path is protected anyway so the janitor can never be
# the reason a release breaks.)
PROTECTED_PATHS=("$MAIN_WORKTREE" "$MAIN_WORKTREE/.wt/release")

# The self-test confines the sweep to its own temp dir so it never depends on,
# or disturbs, whatever real worktrees this machine happens to have.
ONLY_PREFIX="${JANITOR_ONLY_PREFIX:-}"

REMOVED=0
KEPT=0

say() { echo "$@"; }
would() { if $DRY_RUN; then echo "would remove: $*"; else echo "removed: $*"; fi; }

is_protected() {
    local path="$1" p
    for p in "${PROTECTED_PATHS[@]}"; do
        [[ "$path" == "$p" ]] && return 0
    done
    return 1
}

in_scope() {
    [[ -z "$ONLY_PREFIX" ]] && return 0
    [[ "$1" == "$ONLY_PREFIX"* ]]
}

# `timeout` is not on a stock macOS. Use it when it is there, otherwise run the
# command in the background and poll, so a hung git can never wedge a release.
run_with_timeout() {
    local secs="$1"; shift
    if command -v timeout >/dev/null 2>&1; then
        timeout "$secs" "$@"; return $?
    fi
    if command -v gtimeout >/dev/null 2>&1; then
        gtimeout "$secs" "$@"; return $?
    fi
    "$@" &
    local pid=$! waited=0
    while kill -0 "$pid" 2>/dev/null; do
        [[ $waited -ge $secs ]] && { kill -9 "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; return 124; }
        sleep 1
        waited=$((waited + 1))
    done
    wait "$pid"
}

# Deleting a directory tree is the one thing here that can hurt, so it is
# fenced: the path must be absolute, must not be the main checkout, and must
# live under the main checkout's .wt/ or under a temp root.
safe_rmrf() {
    local path="$1"
    [[ "$path" == /* ]] || return 1
    [[ -d "$path" ]] || return 1
    is_protected "$path" && return 1
    case "$path" in
        "$MAIN_WORKTREE"/.wt/*|/private/tmp/*|/tmp/*|/private/var/folders/*|/var/folders/*) ;;
        *) return 1 ;;
    esac
    # Detached so a slow delete of a node_modules tree never holds a release up.
    ( rm -rf -- "$path" >/dev/null 2>&1 & )
    return 0
}

remove_worktree() {
    local path="$1"
    if $DRY_RUN; then return 0; fi
    if run_with_timeout 60 git worktree remove --force "$path" >/dev/null 2>&1; then
        :
    else
        safe_rmrf "$path"
    fi
    git worktree prune >/dev/null 2>&1
    return 0
}

# Real dirty files in a worktree: everything `git status --porcelain` reports
# except missing-file lines and known generated noise.
dirty_count() {
    local wt="$1" status line code file count=0
    status="$(git -C "$wt" status --porcelain 2>/dev/null)" || return 0
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        code="${line:0:2}"
        file="${line:3}"
        # A file git can no longer find in the worktree is not work to preserve.
        [[ "$code" == " D" ]] && continue
        case "$file" in
            public/blob-sw.js) continue ;;
            tsconfig.json)
                # Next writes a .next/types include into tsconfig on every dev
                # run. If that is the whole diff, it is noise, not work.
                local diff
                diff="$(git -C "$wt" diff -U0 -- tsconfig.json 2>/dev/null | grep -E '^[+-][^+-]' || true)"
                if [[ -n "$diff" ]] && ! grep -qv '\.next/types' <<<"$diff"; then
                    continue
                fi
                ;;
        esac
        count=$((count + 1))
    done <<<"$status"
    echo "$count"
}

sweep_worktrees() {
    local path="" head="" branch="" prunable=false line
    local -a entries=()

    # Parse --porcelain into "path<TAB>head<TAB>branch<TAB>prunable" records.
    while IFS= read -r line; do
        case "$line" in
            worktree\ *) path="${line#worktree }"; head=""; branch=""; prunable=false ;;
            HEAD\ *) head="${line#HEAD }" ;;
            branch\ *) branch="${line#branch refs/heads/}" ;;
            detached) branch="(detached)" ;;
            prunable*) prunable=true ;;
            "") [[ -n "$path" ]] && entries+=("$path	$head	$branch	$prunable"); path="" ;;
        esac
    done < <(git worktree list --porcelain 2>/dev/null; echo)
    [[ -n "$path" ]] && entries+=("$path	$head	$branch	$prunable")

    local entry wt_path wt_head wt_branch wt_prunable unique dirty
    for entry in "${entries[@]}"; do
        IFS=$'\t' read -r wt_path wt_head wt_branch wt_prunable <<<"$entry"
        is_protected "$wt_path" && continue
        in_scope "$wt_path" || continue

        if [[ "$wt_prunable" == true || ! -d "$wt_path" ]]; then
            would "$wt_path (its gitdir is gone)"
            remove_worktree "$wt_path"
            REMOVED=$((REMOVED + 1))
            continue
        fi

        if [[ -n "$wt_head" ]] && git merge-base --is-ancestor "$wt_head" origin/main 2>/dev/null; then
            dirty="$(dirty_count "$wt_path")"
            if [[ "${dirty:-0}" -eq 0 ]]; then
                would "$wt_path"
                remove_worktree "$wt_path"
                REMOVED=$((REMOVED + 1))
                continue
            fi
        else
            dirty="$(dirty_count "$wt_path")"
        fi

        unique="$(git rev-list --count origin/main.."$wt_head" 2>/dev/null || echo "?")"
        say "KEPT $wt_path [${wt_branch:-(detached)}] ${unique} commit(s) not on origin/main, ${dirty:-0} dirty file(s) — not on main; land it on main and remove it"
        KEPT=$((KEPT + 1))
    done
}

# Directories under .wt/ that git does not know about are the corpses of
# worktrees that were already deregistered. Nothing reads them again.
sweep_unregistered_wt_dirs() {
    local wt_root="$MAIN_WORKTREE/.wt"
    [[ -d "$wt_root" ]] || return 0
    local registered dir
    registered="$(git worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p')"
    for dir in "$wt_root"/*; do
        [[ -d "$dir" ]] || continue
        dir="$(cd "$dir" && pwd -P)"
        is_protected "$dir" && continue
        in_scope "$dir" || continue
        grep -qxF "$dir" <<<"$registered" && continue
        would "$dir (unregistered leftover under .wt/)"
        $DRY_RUN || safe_rmrf "$dir"
        REMOVED=$((REMOVED + 1))
    done
}

sweep_branches() {
    [[ -z "$ONLY_PREFIX" ]] || return 0   # the self-test does not touch branches
    local branch tip unique
    while IFS= read -r branch; do
        [[ -z "$branch" || "$branch" == "main" ]] && continue
        tip="$(git rev-parse "$branch" 2>/dev/null)" || continue
        if git merge-base --is-ancestor "$tip" origin/main 2>/dev/null; then
            if $DRY_RUN; then
                echo "would remove: branch $branch"
                REMOVED=$((REMOVED + 1))
            elif git branch -D "$branch" >/dev/null 2>&1; then
                echo "removed: branch $branch"
                REMOVED=$((REMOVED + 1))
            else
                # Checked out in a worktree, or gone since we listed it. Say so
                # rather than let the tally claim a removal that never happened.
                say "KEPT branch $branch — git would not delete it (checked out somewhere?) — not on main; land it on main and remove it"
                KEPT=$((KEPT + 1))
            fi
        else
            unique="$(git rev-list --count origin/main.."$branch" 2>/dev/null || echo "?")"
            say "KEPT branch $branch — ${unique} commit(s) not on origin/main — not on main; land it on main and remove it"
            KEPT=$((KEPT + 1))
        fi
    done < <(git for-each-ref --format='%(refname:short)' refs/heads/ 2>/dev/null)
}

run_janitor() {
    run_with_timeout 60 git fetch origin --quiet >/dev/null 2>&1 || \
        say "note: could not fetch origin — judging against the origin/main this checkout already has"
    if ! git rev-parse --verify --quiet origin/main >/dev/null; then
        say "worktree-janitor: no origin/main to judge against — nothing removed."
        return 0
    fi
    sweep_worktrees
    sweep_unregistered_wt_dirs
    sweep_branches
    if $DRY_RUN; then
        say "worktree-janitor (dry run): would remove ${REMOVED}, would keep ${KEPT}."
    else
        say "worktree-janitor: removed ${REMOVED}, kept ${KEPT}."
    fi
}

# ── Self-test ───────────────────────────────────────────────────────────────
# Both modes must be proven: a clean throwaway at origin/main is removed, and a
# throwaway carrying a dirty unique file is KEPT and named.
self_test() {
    local failures=0 tmp janitor
    janitor="$MAIN_WORKTREE/scripts/worktree-janitor.sh"
    run_with_timeout 60 git fetch origin --quiet >/dev/null 2>&1 || true
    if ! git rev-parse --verify --quiet origin/main >/dev/null; then
        echo "SELF-TEST CANNOT RUN: this checkout has no origin/main."
        return 1
    fi
    tmp="$(mktemp -d "${TMPDIR:-/tmp}/worktree-janitor-selftest.XXXXXX")"
    tmp="$(cd "$tmp" && pwd -P)"
    echo "self-test scope: $tmp"

    git worktree add --detach --quiet "$tmp/clean" origin/main >/dev/null 2>&1 \
        || { echo "SELF-TEST FAIL: could not create the clean throwaway worktree"; return 1; }
    git worktree add --detach --quiet "$tmp/dirty" origin/main >/dev/null 2>&1 \
        || { echo "SELF-TEST FAIL: could not create the dirty throwaway worktree"; return 1; }
    echo "a file no one else has" > "$tmp/dirty/janitor-self-test-unique.txt"
    git -C "$tmp/dirty" add janitor-self-test-unique.txt >/dev/null 2>&1
    # Missing-file and generated noise in the CLEAN tree must not save it.
    rm -f "$tmp/clean/README.md" 2>/dev/null || true

    echo
    echo "── dry run ──────────────────────────────────────────────────────────"
    local dry
    dry="$(JANITOR_ONLY_PREFIX="$tmp" bash "$janitor" --dry-run)"
    echo "$dry"
    grep -q "would remove: $tmp/clean" <<<"$dry" \
        || { echo "SELF-TEST FAIL: dry run did not offer to remove the clean worktree"; failures=$((failures + 1)); }
    grep -q "KEPT $tmp/dirty" <<<"$dry" \
        || { echo "SELF-TEST FAIL: dry run did not name the dirty worktree as kept"; failures=$((failures + 1)); }
    [[ -d "$tmp/clean" ]] \
        || { echo "SELF-TEST FAIL: dry run actually deleted the clean worktree"; failures=$((failures + 1)); }

    echo
    echo "── real run ─────────────────────────────────────────────────────────"
    local real
    real="$(JANITOR_ONLY_PREFIX="$tmp" bash "$janitor")"
    echo "$real"
    grep -q "removed: $tmp/clean" <<<"$real" \
        || { echo "SELF-TEST FAIL: real run did not report removing the clean worktree"; failures=$((failures + 1)); }
    grep -q "KEPT $tmp/dirty" <<<"$real" \
        || { echo "SELF-TEST FAIL: real run did not name the dirty worktree as kept"; failures=$((failures + 1)); }
    [[ -d "$tmp/clean" ]] \
        && { echo "SELF-TEST FAIL: the clean worktree is still on disk"; failures=$((failures + 1)); }
    git worktree list --porcelain | grep -q "^worktree $tmp/clean$" \
        && { echo "SELF-TEST FAIL: the clean worktree is still registered with git"; failures=$((failures + 1)); }
    [[ -d "$tmp/dirty" && -f "$tmp/dirty/janitor-self-test-unique.txt" ]] \
        || { echo "SELF-TEST FAIL: the dirty worktree (or its unique file) was destroyed"; failures=$((failures + 1)); }

    echo
    git worktree remove --force "$tmp/dirty" >/dev/null 2>&1 || true
    git worktree prune >/dev/null 2>&1
    rm -rf -- "$tmp" >/dev/null 2>&1 || true
    echo "cleaned up $tmp"

    if [[ $failures -eq 0 ]]; then
        echo "SELF-TEST PASS: clean worktree removed in real mode and only offered in dry mode; dirty worktree kept and named."
        return 0
    fi
    echo "SELF-TEST FAILED with $failures problem(s)."
    return 1
}

if $SELF_TEST; then
    self_test || exit 1
    exit 0
fi

run_janitor
exit 0
