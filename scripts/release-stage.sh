#!/usr/bin/env bash
# release-stage.sh — THE RELEASE-COMMIT CONTENT LAW for a shared checkout.
#
# A release must never ship content no one committed. On this checkout Arman
# plus dozens of agents edit at once, so at any moment the working tree holds
# other lanes' half-written files. Release v0.4.1575 (2026-08-31, b2f1bd7c4e)
# was made by `./ship.sh`, whose `--ship` mode did `git add -A`: it swept
# `features/mandates/authoring/AutomationButton.tsx` mid-edit, while its import
# still pointed at a module that did not exist, and Vercel built that commit —
# a broken production build, repaired only in 6d07c466b2. The staging step was
# the whole defect: nothing else in the release could have excluded the file.
#
# The rule this file enforces, and that `scripts/release.sh --ship` obeys:
#
#   The release commit contains EXACTLY the version files plus the paths the
#   invoker NAMED. Nothing is discovered from the working tree, and nothing is
#   taken from the index — the index is shared too (another lane's `git add`
#   sits there beside yours), so "whatever is staged" is not "yours" either.
#   Every other dirty path stays exactly as it was, uncommitted, for its owner.
#
# Mechanism: `git add -- <named paths>` (so new files become known), then
# `git commit -m <msg> -- <version files> <named paths>`. A pathspec commit
# takes the WORKING-TREE content of those paths only and disregards whatever is
# staged for any other path — foreign staged files cannot ride along either.
# aidream's release.sh commits the same way (`git commit -m … -- pyproject.toml
# uv.lock db/MIGRATIONS_STATUS.md`); the convention is now the same in both.
#
# Usage from release.sh:   source scripts/release-stage.sh
#   release_stage_validate_paths "${SHIP_PATHS[@]}"    # refuses tree-wide specs
#   release_stage_commit "<msg>" "<version files...>" -- "${SHIP_PATHS[@]}"
#   release_stage_preview "<version files...>" -- "${SHIP_PATHS[@]}"
#
# Self-test (the guard, proven failing-then-passing on every run):
#   bash scripts/release-stage.sh --self-test     (pnpm check:ship-stage:self-test)
# It builds a throwaway repo, plants an invoker-owned file AND a concurrent
# broken foreign edit (staged and unstaged variants, plus an untracked file),
# shows that the OLD staging (`git add -A`) puts the foreign edit in the release
# commit, then shows that release_stage_commit does not — the foreign edits are
# still dirty in the tree afterwards, untouched.

# Refuse anything that means "the whole tree". A directory pathspec is fine
# (the invoker owns that directory); `.`, `:/`, `*` and an empty spec are just
# `git add -A` wearing a hat.
release_stage_validate_paths() {
    local p
    for p in "$@"; do
        case "$p" in
            ""|"."|"./"|":/"|":/."|"*"|"./*"|":(top)"|":(top).")
                echo "release-stage: pathspec '$p' names the whole working tree — that is the sweep this law forbids. Name the files or directories you own." >&2
                return 1 ;;
        esac
        # Must exist in the working tree or be tracked (a deletion is a legitimate change).
        if [[ ! -e "$p" ]] && ! git ls-files --error-unmatch -- "$p" >/dev/null 2>&1; then
            echo "release-stage: pathspec '$p' matches nothing in the working tree or the index." >&2
            return 1
        fi
    done
    return 0
}

# Prints the exact file list the release commit would carry, and the dirty
# paths it will leave behind — so a dry run tells the truth about content.
release_stage_preview() {
    local version_files=() ship_paths=() p
    while [[ $# -gt 0 && "$1" != "--" ]]; do version_files+=("$1"); shift; done
    [[ "${1:-}" == "--" ]] && shift
    ship_paths=("$@")

    local candidate
    candidate="$(git status --porcelain --untracked-files=all -- ${version_files[@]+"${version_files[@]}"} ${ship_paths[@]+"${ship_paths[@]}"} 2>/dev/null | cut -c4- | sort -u)"
    echo "  Release commit will carry ONLY:"
    for p in ${version_files[@]+"${version_files[@]}"}; do echo "    $p   (version file)"; done
    if [[ -n "$candidate" ]]; then
        while IFS= read -r p; do
            local is_version=false v
            for v in ${version_files[@]+"${version_files[@]}"}; do [[ "$p" == "$v" ]] && is_version=true; done
            $is_version || echo "    $p"
        done <<< "$candidate"
    fi
    if [[ ${#ship_paths[@]} -gt 0 ]]; then
        local named
        named="$(git status --porcelain --untracked-files=all -- ${ship_paths[@]+"${ship_paths[@]}"} 2>/dev/null)"
        [[ -z "$named" ]] && echo "    (named paths carry no change against HEAD — nothing of yours is dirty)"
    fi

    local excluded
    excluded="$(git status --porcelain --untracked-files=all 2>/dev/null | cut -c4- | sort -u | comm -23 - <(printf '%s\n' "$candidate" | sort -u))"
    if [[ -n "$excluded" ]]; then
        echo "  Dirty paths NOT in the release commit (other lanes' work — left untouched):"
        echo "$excluded" | sed 's/^/    /'
    fi
}

# Stage the named paths and make a pathspec-scoped commit of them + the
# version files. Never touches any other path, staged or not.
release_stage_commit() {
    local msg="$1"; shift
    local version_files=() ship_paths=()
    while [[ $# -gt 0 && "$1" != "--" ]]; do version_files+=("$1"); shift; done
    [[ "${1:-}" == "--" ]] && shift
    ship_paths=("$@")

    if [[ ${#ship_paths[@]} -gt 0 ]]; then
        release_stage_validate_paths ${ship_paths[@]+"${ship_paths[@]}"} || return 1
        git add -- ${ship_paths[@]+"${ship_paths[@]}"}
    fi
    git commit -q -m "$msg" -- ${version_files[@]+"${version_files[@]}"} ${ship_paths[@]+"${ship_paths[@]}"}
}

# ── Self-test ────────────────────────────────────────────────────────────────
_release_stage_self_test() {
    set -euo pipefail
    local here; here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    _RS_TMP="$(mktemp -d)"
    local tmp="$_RS_TMP"
    trap 'rm -rf "$_RS_TMP"' EXIT
    local failures=0
    pass() { echo "  [ok]   $*"; }
    failt() { echo "  [FAIL] $*" >&2; failures=$((failures + 1)); }

    mk_repo() {
        local d="$1"
        git init -q "$d"
        git -C "$d" config user.email t@t; git -C "$d" config user.name t; git -C "$d" config commit.gpgsign false
        echo '{"version":"0.0.1"}' > "$d/package.json"
        mkdir -p "$d/features/mine" "$d/features/theirs"
        echo 'export const mine = 1;' > "$d/features/mine/a.ts"
        echo "import { X } from '@/components/official/X';" > "$d/features/theirs/broken.ts"
        echo 'ok' > "$d/features/theirs/staged.ts"
        git -C "$d" add -A && git -C "$d" commit -q -m init
    }
    # The concurrent lane: one unstaged broken edit, one staged broken edit,
    # one untracked new file. The invoker: one edit + one new file in features/mine.
    plant() {
        local d="$1"
        echo 'export const mine = 2;' > "$d/features/mine/a.ts"
        echo 'export const b = 1;' > "$d/features/mine/new.ts"
        echo "import { X } from '@/components/ui/does-not-exist';" > "$d/features/theirs/broken.ts"
        echo "import { Y } from '@/nope';" > "$d/features/theirs/staged.ts"
        git -C "$d" add -- features/theirs/staged.ts
        echo 'wip' > "$d/features/theirs/untracked.ts"
        echo '{"version":"0.0.2"}' > "$d/package.json"
    }

    echo "release-stage self-test"

    # 1. Failing baseline: the old mechanism (git add -A) ships the foreign edits.
    local old="$tmp/old"; mk_repo "$old"; plant "$old"
    ( cd "$old" && git add -A && git commit -q -m "release: v0.0.2 - old sweep" )
    local old_files; old_files="$(git -C "$old" show --stat --format= HEAD | grep '|' | awk '{print $1}')"
    if grep -q 'features/theirs/broken.ts' <<< "$old_files" && grep -q 'features/theirs/untracked.ts' <<< "$old_files"; then
        pass "baseline reproduced: 'git add -A' put the foreign broken edit in the release commit (the v0.4.1575 class)"
    else
        failt "baseline did not reproduce — the test harness is wrong"
    fi

    # 2. The law: named paths only.
    local new="$tmp/new"; mk_repo "$new"; plant "$new"
    ( cd "$new" && release_stage_commit "release: v0.0.2 - law" package.json -- features/mine )
    local new_files; new_files="$(git -C "$new" show --stat --format= HEAD | grep '|' | awk '{print $1}')"
    for want in package.json features/mine/a.ts features/mine/new.ts; do
        grep -qx "$want" <<< "$new_files" && pass "commit carries $want" || failt "commit is missing $want"
    done
    for bad in features/theirs/broken.ts features/theirs/staged.ts features/theirs/untracked.ts; do
        if grep -qx "$bad" <<< "$new_files"; then failt "commit carries foreign $bad"; else pass "commit excludes foreign $bad"; fi
    done
    # The foreign work is still there, still dirty, exactly as its owner left it.
    local left; left="$(git -C "$new" status --porcelain --untracked-files=all | sort)"
    [[ "$left" == *"features/theirs/broken.ts"* ]] && pass "foreign unstaged edit left dirty for its owner" || failt "foreign unstaged edit vanished"
    [[ "$left" == *"features/theirs/staged.ts"* ]] && pass "foreign STAGED edit left staged for its owner (shared index disregarded)" || failt "foreign staged edit vanished"
    [[ "$left" == *"features/theirs/untracked.ts"* ]] && pass "foreign untracked file left alone" || failt "foreign untracked file vanished"
    grep -q "does-not-exist" "$new/features/theirs/broken.ts" && pass "foreign file content untouched" || failt "foreign file content changed"
    [[ "$(git -C "$new" show HEAD:package.json)" == '{"version":"0.0.2"}' ]] && pass "version file committed from the working tree" || failt "version bump not committed"

    # 3. Tree-wide pathspecs are refused.
    for spec in "." ":/" "*"; do
        if ( cd "$new" && release_stage_validate_paths "$spec" 2>/dev/null ); then failt "pathspec '$spec' was accepted"; else pass "pathspec '$spec' refused"; fi
    done
    if ( cd "$new" && release_stage_validate_paths "features/nowhere" 2>/dev/null ); then failt "nonexistent pathspec accepted"; else pass "nonexistent pathspec refused"; fi

    # 4. A deletion the invoker owns is a legitimate named path.
    local del="$tmp/del"; mk_repo "$del"; plant "$del"
    rm "$del/features/mine/a.ts"
    ( cd "$del" && release_stage_commit "release: v0.0.2 - del" package.json -- features/mine/a.ts )
    git -C "$del" show --stat --format= HEAD | grep -q 'features/mine/a.ts' && pass "named deletion committed" || failt "named deletion not committed"

    # 5. Preview names the content truthfully.
    local pv="$tmp/preview"; mk_repo "$pv"; plant "$pv"
    local prev; prev="$(cd "$pv" && release_stage_preview package.json -- features/mine)"
    grep -q 'features/mine/a.ts' <<< "$prev" && grep -q 'NOT in the release commit' <<< "$prev" && grep -q 'features/theirs/broken.ts' <<< "$prev" \
        && pass "preview lists carried paths and the excluded foreign dirt" || { failt "preview output wrong:"; echo "$prev" >&2; }

    if (( failures > 0 )); then
        echo "release-stage self-test: $failures failure(s)" >&2
        return 1
    fi
    echo "release-stage self-test: all checks passed"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    case "${1:-}" in
        --self-test) _release_stage_self_test ;;
        *) echo "Usage: source $0   |   bash $0 --self-test" >&2; exit 2 ;;
    esac
fi
