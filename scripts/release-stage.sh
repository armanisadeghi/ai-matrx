#!/usr/bin/env bash
# release-stage.sh — THE RELEASE-COMMIT CONTENT LAW for a shared checkout.
#
# Scope: this governs ONLY the commit release.sh itself makes. `./ship.sh` runs
# scripts/sync-main.py first, which commits EVERY uncommitted file in the checkout
# and pushes it live — by design (Arman, 2026-09-24; common-docs
# policies/shared-checkout.md). Everything saved goes live; that is never a risk
# to report. release.sh's own commit just stays exact so its message is true.
#
# The rule this file enforces, and that `scripts/release.sh --ship` obeys:
#
#   The release commit contains EXACTLY the version files plus the paths the
#   invoker NAMED. Nothing is discovered from the working tree, and nothing is
#   taken from the index — the index is shared too (another lane's `git add`
#   sits there beside yours), so "whatever is staged" is not "yours" either.
#   Every other dirty path is left to the sync step, which commits and ships it.
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

# Normalises every named path to a repo-relative path and refuses anything that
# could mean more than the invoker owns. A deny-list of spellings is not enough:
# `**`, `*.py`, `:(glob)**`, `:!mine`, `mine/..` and the repo's absolute path all
# mean "the whole tree" to git (the 2026-09-19 adversarial review committed every
# foreign file through each of them). So:
#   - pathspec magic (a leading `:`) and glob characters (`*` `?` `[`) are refused;
#   - the path is resolved against the CALLER's directory (RELEASE_STAGE_CALLER_PWD,
#     default $PWD) — ship.sh cds to the repo root, so a bare relative path would
#     otherwise silently mean a different file;
#   - a path that resolves to the repo root or outside the repo is refused;
#   - the path must exist in the working tree, the index, or HEAD (a rename's old
#     side or a staged deletion lives only in HEAD).
# On success the normalised paths are in RELEASE_STAGE_PATHS.
# Every git call the staging functions make (via _rs_git) treats a path as a literal file name: no magic
# (`:!x`), no globs, no backslash escapes — even for a name that only becomes
# one after normalisation (`./:!mine` → `:!mine`), found by the second review.
# Scoped to these calls, never exported: release.sh sources this file.
_rs_git() { GIT_LITERAL_PATHSPECS=1 git "$@"; }

# True when every component of <root>/<rel> exists on disk with EXACTLY that
# spelling (macOS APFS is case-insensitive; git is not — `MINE/a.py` would pass
# `-e` yet match nothing in git, and the release would go ahead as "no change").
_rs_exact_case() {
    local root="$1" rel="$2" cur="$1" part
    local IFS=/
    for part in $rel; do
        [[ -z "$part" ]] && continue
        if ! ls -a "$cur" 2>/dev/null | grep -qxF -- "$part"; then return 1; fi
        cur="$cur/$part"
    done
    return 0
}

RELEASE_STAGE_PATHS=()
release_stage_validate_paths() {
    RELEASE_STAGE_PATHS=()
    local root caller p abs d b dres full rel
    root="$(cd "$(_rs_git rev-parse --show-toplevel)" && pwd -P)" || return 1
    caller="${RELEASE_STAGE_CALLER_PWD:-$PWD}"
    if [[ $# -eq 0 ]]; then
        echo "release-stage: no paths named." >&2
        return 1
    fi
    for p in "$@"; do
        case "$p" in
            "")
                echo "release-stage: empty pathspec refused." >&2; return 1 ;;
            :*)
                echo "release-stage: pathspec '$p' uses git pathspec magic — refused; it can name the whole tree. Name plain files or directories you own." >&2; return 1 ;;
            *[\*\?\[\\]*)
                echo "release-stage: pathspec '$p' contains a glob or escape character — refused; a glob can name other lanes' files. Name plain files or directories you own." >&2; return 1 ;;
        esac
        if [[ "$p" == /* ]]; then abs="$p"; else abs="$caller/$p"; fi
        abs="${abs%/}"
        d="$(dirname "$abs")"; b="$(basename "$abs")"
        if [[ "$b" == "." || "$b" == ".." ]]; then d="$abs"; b=""; fi
        if ! dres="$(cd "$d" 2>/dev/null && pwd -P)"; then
            echo "release-stage: pathspec '$p' is in a directory that does not exist (name its nearest existing parent)." >&2; return 1
        fi
        full="$dres${b:+/$b}"
        if [[ "$full" == "$root" ]]; then
            echo "release-stage: pathspec '$p' resolves to the repository root — that is the sweep this law forbids. Name the files or directories you own." >&2; return 1
        fi
        if [[ "$full" != "$root/"* ]]; then
            echo "release-stage: pathspec '$p' resolves outside this repository ($full)." >&2; return 1
        fi
        rel="${full#"$root"/}"
        case "$rel" in
            *$'\n'*|*$'\r'*)
                echo "release-stage: pathspec '$p' contains a line break — refused." >&2; return 1 ;;
            :*|*/:*)
                echo "release-stage: pathspec '$p' normalises to '$rel', which starts a component with ':' (git pathspec magic) — refused." >&2; return 1 ;;
            *[\*\?\[\\]*)
                echo "release-stage: pathspec '$p' normalises to '$rel', which contains a glob or escape character — refused." >&2; return 1 ;;
        esac
        if [[ -e "$root/$rel" ]]; then
            if ! _rs_exact_case "$root" "$rel"; then
                echo "release-stage: pathspec '$p' does not match the on-disk spelling (letter case) — git would see no change. Use the exact name." >&2; return 1
            fi
            local probe="$root/$rel"; [[ -d "$probe" ]] || probe="$(dirname "$probe")"
            local top; top="$(cd "$(_rs_git -C "$probe" rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null && pwd -P)"
            if [[ "$top" != "$root" || ( -d "$root/$rel" && -e "$root/$rel/.git" ) ]]; then
                echo "release-stage: pathspec '$p' is inside a submodule or nested repository — its changes are not this repo's to commit." >&2; return 1
            fi
        fi
        if [[ ! -e "$root/$rel" ]] \
            && ! _rs_git -C "$root" ls-files --error-unmatch -- "$rel" >/dev/null 2>&1 \
            && ! _rs_git -C "$root" cat-file -e "HEAD:$rel" 2>/dev/null; then
            echo "release-stage: pathspec '$p' matches nothing in the working tree, the index, or HEAD." >&2; return 1
        fi
        RELEASE_STAGE_PATHS+=("$rel")
    done
    return 0
}

# Changed paths, one per line, unquoted, renames split into both sides.
_rs_status() {
    _rs_git -c core.quotePath=false status --porcelain -z --no-renames --untracked-files=all "$@" 2>/dev/null \
        | tr '\0' '\n' | cut -c4- | sed '/^$/d' | sort -u
}

# Prints the exact file list the commit would carry, and the dirty paths it
# leaves behind.
release_stage_preview() {
    local version_files=() ship_paths=() p
    while [[ $# -gt 0 && "$1" != "--" ]]; do version_files+=("$1"); shift; done
    [[ "${1:-}" == "--" ]] && shift
    ship_paths=("$@")

    local candidate=""
    if [[ ${#version_files[@]} -gt 0 || ${#ship_paths[@]} -gt 0 ]]; then
        candidate="$(_rs_status -- ${version_files[@]+"${version_files[@]}"} ${ship_paths[@]+"${ship_paths[@]}"})"
    fi
    echo "  Release commit will carry ONLY:"
    for p in ${version_files[@]+"${version_files[@]}"}; do echo "    $p   (version file)"; done
    if [[ -n "$candidate" ]]; then
        while IFS= read -r p; do
            local is_version=false v
            for v in ${version_files[@]+"${version_files[@]}"}; do [[ "$p" == "$v" ]] && is_version=true; done
            $is_version || echo "    $p"
        done <<< "$candidate"
    elif [[ ${#ship_paths[@]} -gt 0 ]]; then
        echo "    (named paths carry no change against HEAD — nothing of yours is dirty)"
    fi

    local excluded
    excluded="$(_rs_status | comm -23 - <(printf '%s\n' "$candidate" | sort -u) | sed '/^$/d')"
    if [[ -n "$excluded" ]]; then
        echo "  Dirty paths NOT in the release commit (other lanes' work — left untouched):"
        echo "$excluded" | sed 's/^/    /'
    fi
}

release_stage_commit() {
    local msg="$1"; shift
    local version_files=() ship_paths=()
    while [[ $# -gt 0 && "$1" != "--" ]]; do version_files+=("$1"); shift; done
    [[ "${1:-}" == "--" ]] && shift
    ship_paths=("$@")

    if [[ ${#ship_paths[@]} -gt 0 ]]; then
        release_stage_validate_paths ${ship_paths[@]+"${ship_paths[@]}"} || return 1
        ship_paths=("${RELEASE_STAGE_PATHS[@]}")
        local root p; root="$(_rs_git rev-parse --show-toplevel)"
        for p in "${ship_paths[@]}"; do
            # A path living only in HEAD (rename's old side, staged deletion) has nothing to add.
            if [[ -e "$root/$p" ]] || _rs_git -C "$root" ls-files --error-unmatch -- "$p" >/dev/null 2>&1; then
                _rs_git -C "$root" add -- "$p"
            fi
        done
    fi
    _rs_git -C "$(_rs_git rev-parse --show-toplevel)" commit -q -m "$msg" -- ${version_files[@]+"${version_files[@]}"} ${ship_paths[@]+"${ship_paths[@]}"}
}

# ── Self-test ────────────────────────────────────────────────────────────────
_release_stage_self_test() {
    set -euo pipefail
    # ship.sh exports the real invoker's directory before release.sh changes
    # directories.  The harness below deliberately creates its own throwaway
    # repositories, so inheriting that production caller makes every relative
    # fixture path resolve against the real checkout and falsely look outside
    # the fixture repository.
    unset RELEASE_STAGE_CALLER_PWD
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

    # 3. Every spelling of "more than I own" is refused. Until 2026-09-19 this
    #    was a deny-list of exact strings, and '**', '*.ts', ':(glob)**',
    #    ':!features/mine', 'features/..', the repo's absolute path and more
    #    all committed the whole tree (found by adversarial review of aidream's port).
    git init -q "$new/nested"; echo 'x' > "$new/nested/f.ts"
    local spec
    for spec in "." "./" ".//" "././" ":/" "*" "**" "*.ts" ":(glob)**" ":/*" ":(top,glob)**" ":(icase)*" \
                ":!features/mine" ":(exclude)features/mine" "features/.." "features/mine/../.." "$new" "$new/" ".." "/etc/hosts" \
                "features/*" "features/theirs/?roken.ts" "./:!features/mine" "features/../:(exclude)features" \
                "features/mine/a\\.ts" "FEATURES/mine/a.ts" "nested" "nested/f.ts"; do
        if ( cd "$new" && release_stage_validate_paths "$spec" 2>/dev/null ); then failt "pathspec '$spec' was accepted"; else pass "pathspec '$spec' refused"; fi
    done
    if ( cd "$new" && release_stage_validate_paths "features/nowhere" 2>/dev/null ); then failt "nonexistent pathspec accepted"; else pass "nonexistent pathspec refused"; fi
    rm -rf "$new/nested"
    # A preview never lists foreign files as carried: magic is refused before listing.
    ( cd "$new" && GIT_LITERAL_PATHSPECS= release_stage_validate_paths './:!features/mine' 2>/dev/null ) \
        && failt "'./:!features/mine' validated (preview would list foreign files)" || pass "'./:!features/mine' refused before any preview"
    # A path is resolved from the CALLER's directory, not the repo root.
    ( cd "$new/features" && RELEASE_STAGE_PATHS=(); release_stage_validate_paths mine >/dev/null 2>&1; [[ "${RELEASE_STAGE_PATHS[0]:-}" == "features/mine" ]] ) \
        && pass "relative path resolved from the caller's directory to a repo-relative path" || failt "relative path not resolved from the caller's directory"

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
