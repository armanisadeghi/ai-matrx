#!/usr/bin/env bash
# Guard for the release ship path: releasing is never harder than a plain push.
#
# Builds a throwaway origin + checkout, then releases under the three conditions
# that used to stop this script cold: uncommitted files in the checkout, a
# branch that has diverged from origin, and a foreign push landing in the
# middle of the release (the stubbed migration applier lands it). It passes only
# if the tag reaches origin, the release commit carries the Vercel prefix, the
# local commit shipped, the foreign push survived, and the uncommitted file was
# never touched.
#
#   scripts/test-release-ship-path.sh                  # test scripts/release.sh
#   scripts/test-release-ship-path.sh <path-to-script> # test another copy (e.g. an old one)
#
# Port of aidream's scripts/test_release_ship_path.sh. `pnpm test:release-ship-path`.
set -euo pipefail

SCRIPT_UNDER_TEST="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/release.sh}"
SCRIPT_UNDER_TEST="$(cd "$(dirname "$SCRIPT_UNDER_TEST")" && pwd)/$(basename "$SCRIPT_UNDER_TEST")"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

git_q() { git -c user.name=test -c user.email=test@test -c core.hooksPath=/dev/null "$@" >/dev/null 2>&1; }

# ── origin + the shared checkout + a second writer ───────────────────────────
git_q init --bare -b main "$SANDBOX/origin.git"
git_q clone "$SANDBOX/origin.git" "$SANDBOX/checkout"
cd "$SANDBOX/checkout"
git config user.name test; git config user.email test@test
mkdir -p scripts
cp "$SCRIPT_UNDER_TEST" scripts/release.sh
# The primitives the script sources ride along when they sit beside it.
for helper in release-stage.sh release-outcome.sh vercel-ignore-build.sh; do
    [[ -f "$(dirname "$SCRIPT_UNDER_TEST")/$helper" ]] && cp "$(dirname "$SCRIPT_UNDER_TEST")/$helper" "scripts/$helper"
done
printf '{\n  "name": "sandbox",\n  "version": "0.1.0",\n  "private": true\n}\n' > package.json
echo "shared" > shared.txt
git_q add -A; git_q commit -m "seed"; git_q push origin main
git_q clone "$SANDBOX/origin.git" "$SANDBOX/other"

# Diverge: origin gains a commit, the checkout gains a different one.
( cd "$SANDBOX/other" && echo "theirs" > theirs.txt && git_q add -A && git_q commit -m "theirs" && git_q push origin main )
echo "mine" > mine.txt; git_q add mine.txt; git_q commit -m "mine"
# Dirty: a tracked file with uncommitted edits, as the shared checkout always has.
echo "uncommitted work" >> shared.txt

# ── stubs: the aidream applier (its first run lands a foreign push) ──────────
mkdir -p "$SANDBOX/aidream/db" "$SANDBOX/bin"
: > "$SANDBOX/aidream/db/apply_migrations.py"
cat > "$SANDBOX/bin/uv" <<STUB
#!/usr/bin/env bash
echo "\$*" >> "$SANDBOX/uv-calls"
if [[ "\$*" == *apply_migrations.py* && ! -f "$SANDBOX/raced" ]]; then
    touch "$SANDBOX/raced"
    ( cd "$SANDBOX/other" && git pull -q origin main && echo race > race.txt && git add -A \
        && git -c user.name=t -c user.email=t@t commit -qm race && git push -q origin main ) >/dev/null 2>&1
fi
exit 0
STUB
chmod +x "$SANDBOX/bin/uv"

# ── release ──────────────────────────────────────────────────────────────────
set +e
PATH="$SANDBOX/bin:$PATH" AIDREAM_DIR="$SANDBOX/aidream" RELEASE_AFTER_PHASE=off RELEASE_LOG_CAPTURED=1 \
    bash scripts/release.sh > "$SANDBOX/out" 2>&1
STATUS=$?
set -e

FAILED=0
check() { if eval "$2"; then echo "  ok    $1"; else echo "  FAIL  $1"; FAILED=1; fi; }
echo "release ship path — dirty checkout + diverged branch + push landing mid-release"
check "release exited 0"                         '[[ $STATUS -eq 0 ]]'
check "the push race really happened"            '[[ -f "$SANDBOX/raced" ]]'
check "migrations were applied (production target named)" 'grep -q -- "--source matrx-frontend --target production" "$SANDBOX/uv-calls" 2>/dev/null'
check "tag v0.1.1 is on origin"                  'git ls-remote --tags origin | grep -q "refs/tags/v0.1.1$"'
check "origin/main carries version 0.1.1"        'git fetch -q origin && git show origin/main:package.json | grep -q "\"version\": \"0.1.1\""'
check "origin/main is a Vercel release commit"   '[[ "$(git log -1 --format=%s origin/main)" == "release: v0.1.1" ]]'
check "the local commit shipped"                 'git cat-file -e origin/main:mine.txt 2>/dev/null'
check "the foreign mid-release push survived"    'git cat-file -e origin/main:race.txt 2>/dev/null'
check "uncommitted work was never touched"       'grep -q "uncommitted work" shared.txt'
check "the script never stashes"                 '! grep -qE "stash (push|pop)" scripts/release.sh'
check "no worktree or branch was created"        '[[ $(git worktree list | wc -l) -eq 1 && $(git branch | wc -l) -eq 1 ]]'
check "nothing was stashed"                      '[[ -z "$(git stash list)" ]]'
check "the checkout was fast-forwarded to the release" '[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]]'
check "clean run prints one line"                '[[ $(grep -c . "$SANDBOX/out") -le 2 ]]'
check "that line is the ship line"               'grep -q "^v0.1.1  pushed, build started  ([0-9]*s)$" "$SANDBOX/out"'
if [[ $FAILED -ne 0 ]]; then
    echo "--- script output ---"; tail -25 "$SANDBOX/out"
    exit 1
fi
