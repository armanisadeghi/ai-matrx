#!/usr/bin/env bash
# Guard for the release ship path: releasing is never harder than a plain push.
#
# Builds a throwaway origin + checkout, then releases under the three conditions
# that used to stop this script cold: uncommitted files in the checkout, a
# branch that has diverged from origin, and a foreign push landing in the
# middle of the release (the script's before-push test hook lands it). It passes only
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
for helper in release-stage.sh release-outcome.sh vercel-ignore-build.sh sync-main.py check-lockfile-keys.py lockfile-twins.sh check-matrx-packages.mjs; do
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

# ── stubs: the aidream applier (records its call) ────────────────────────────
mkdir -p "$SANDBOX/aidream/db" "$SANDBOX/bin"
: > "$SANDBOX/aidream/db/apply_migrations.py"
cat > "$SANDBOX/bin/uv" <<STUB
#!/usr/bin/env bash
echo "\$*" >> "$SANDBOX/uv-calls"
exit 0
STUB
chmod +x "$SANDBOX/bin/uv"

# ── release ──────────────────────────────────────────────────────────────────
set +e
# The foreign push lands through the script's before-push hook: migrations run
# alongside the push now, so they can no longer be the moment of the race.
RACE_CMD="[ -f '$SANDBOX/raced' ] || { touch '$SANDBOX/raced'; cd '$SANDBOX/other' && git pull -q origin main && echo race > race.txt && git add -A && git -c user.name=t -c user.email=t@t commit -qm race && git push -q origin main; }"
PATH="$SANDBOX/bin:$PATH" AIDREAM_DIR="$SANDBOX/aidream" RELEASE_AFTER_PHASE=off RELEASE_LOG_CAPTURED=1 RELEASE_TEST_BEFORE_PUSH="$RACE_CMD" \
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

# ── second release: a broken invocation, and a migration pass still running ──
# A bogus flag, a bogus --target and a --ship path that does not exist must all
# become WARNINGs, and the push must land WHILE the migration pass is still
# running (95dc1a2637 silently put the migration wait back in front of the push).
cat > "$SANDBOX/bin/uv" <<STUB
#!/usr/bin/env bash
if [[ "\$*" == *apply_migrations.py* ]]; then
    for _ in \$(seq 1 40); do
        if git --git-dir="$SANDBOX/origin.git" show main:package.json 2>/dev/null | grep -q '"version": "0.1.2"'; then
            touch "$SANDBOX/pushed-while-migrating"
            for _ in \$(seq 1 20); do
                [[ -d "$SANDBOX/checkout/.git/matrx-release-ship.lock" ]] || { touch "$SANDBOX/lock-free-while-migrating"; exit 0; }
                sleep 0.5
            done
            exit 0
        fi
        sleep 0.5
    done
fi
exit 0
STUB
chmod +x "$SANDBOX/bin/uv"
set +e
PATH="$SANDBOX/bin:$PATH" AIDREAM_DIR="$SANDBOX/aidream" RELEASE_AFTER_PHASE=off RELEASE_LOG_CAPTURED=1 \
    bash scripts/release.sh --bogus-flag --target nowhere --ship -- no/such/path.txt > "$SANDBOX/out2" 2>&1
STATUS2=$?
set -e
echo "release ship path — bad flags, bad --ship path, slow migrations"
check "a broken invocation still exits 0"         '[[ $STATUS2 -eq 0 ]]'
check "a broken invocation still ships v0.1.2"    'git ls-remote --tags origin | grep -q "refs/tags/v0.1.2$"'
check "the bad flag is a WARNING, not a refusal"  'grep -q "WARNING.*Unknown flag" "$SANDBOX/out2"'
check "the bad --ship path is a WARNING"          'grep -q "WARNING.*pathspec could not be committed" "$SANDBOX/out2"'
check "the push landed while migrations ran"      '[[ -f "$SANDBOX/pushed-while-migrating" ]]'
check "the lock was free while migrations ran"   '[[ -f "$SANDBOX/lock-free-while-migrating" ]]'

# ── third release: a live process holds the lock and never lets go ───────────
sleep 600 & HOLDER=$!
mkdir -p .git/matrx-release-ship.lock; echo "$HOLDER" > .git/matrx-release-ship.lock/pid
printf '#!/usr/bin/env bash\nexit 0\n' > "$SANDBOX/bin/uv"
T0=$SECONDS
set +e
PATH="$SANDBOX/bin:$PATH" AIDREAM_DIR="$SANDBOX/aidream" RELEASE_AFTER_PHASE=off RELEASE_LOG_CAPTURED=1 \
    bash scripts/release.sh > "$SANDBOX/out3" 2>&1
STATUS3=$?
set -e
WAITED=$((SECONDS - T0))
kill "$HOLDER" 2>/dev/null || true
echo "release ship path — a stuck lock holder"
check "a stuck lock still ships v0.1.3"          '[[ $STATUS3 -eq 0 ]] && git ls-remote --tags origin | grep -q "refs/tags/v0.1.3$"'
check "it waited no more than ~30s"               '[[ $WAITED -le 45 ]]'
check "the takeover is a WARNING"                 'grep -q "WARNING.*Release lock held" "$SANDBOX/out3"'

# ── fourth release: the applier holds one file and one waits on it ───────────
# What the terminal shows must NAME the file and the reason, inside its own
# opened-and-closed Migrations section — never "a migration failed, see the log".
cat > "$SANDBOX/bin/uv" <<'STUB'
#!/usr/bin/env bash
if [[ "$*" == *apply_migrations.py* && -n "${MATRX_MIGRATION_SUMMARY_JSON:-}" ]]; then
    cat > "$MATRX_MIGRATION_SUMMARY_JSON" <<'JSON'
{"applied": ["matrx-frontend/ok_one.sql"],
 "held": [{"file": "matrx-frontend/rcstore_b_document.sql", "kind": "provisioning",
           "reason": "it builds a new table on the live database, which locks sign-ins while it runs; rehearse it on the test copy, then apply it 1-4 AM PT"}],
 "waiting": [{"file": "matrx-frontend/rcstore_c_blocks.sql", "waits_on": "matrx-frontend/rcstore_b_document.sql"}],
 "chair_steps": []}
JSON
    exit 2
fi
exit 0
STUB
chmod +x "$SANDBOX/bin/uv"
set +e
PATH="$SANDBOX/bin:$PATH" AIDREAM_DIR="$SANDBOX/aidream" RELEASE_AFTER_PHASE=off RELEASE_LOG_CAPTURED=1 \
    bash scripts/release.sh > "$SANDBOX/out4" 2>&1
STATUS4=$?
set -e
echo "release ship path — a held migration is named, in its own section"
check "a held migration still ships v0.1.4"       '[[ $STATUS4 -eq 0 ]] && git ls-remote --tags origin | grep -q "refs/tags/v0.1.4$"'
check "the Migrations section opens"              'grep -qx "==================== Migrations ====================" "$SANDBOX/out4"'
check "the held file is named with its reason"    'grep -q "ERROR.*rcstore_b_document.sql was not applied: it builds a new table" "$SANDBOX/out4"'
check "the waiting file is a WARNING"             'grep -q "WARNING.*1 migration(s) wait on a held file: rcstore_c_blocks.sql" "$SANDBOX/out4"'
check "the Migrations section closes"             'grep -qx "==================== End of Migrations ====================" "$SANDBOX/out4"'
check "the vague old sentence is gone"            '! grep -q "failed to apply or was refused" "$SANDBOX/out4"'
# ── fifth + sixth releases: THE LOCKFILE GUARD (v0.4.3013, 2026-10-08) ──────
# A merge kept two identical lockfile blocks and every Vercel build died on
# ERR_PNPM_BROKEN_LOCKFILE. Identical duplicates are dropped inside the release
# commit (WARNING); duplicates that differ stop the release before the push.
printf '#!/usr/bin/env bash\nexit 0\n' > "$SANDBOX/bin/uv"
LOCK_BLOCK="  '@ai-matrx/records@0.84.4':\n    resolution: {integrity: sha512-abc}\n"
LOCK_HEAD="lockfileVersion: '9.0'\n\npackages:\n\n"
LOCK_TAIL="  '@ai-matrx/rich-content@0.2.55':\n    resolution: {integrity: sha512-def}\n"
( cd "$SANDBOX/other" && git pull -q origin main \
    && printf "${LOCK_HEAD}${LOCK_BLOCK}\n${LOCK_BLOCK}\n${LOCK_TAIL}" > pnpm-lock.yaml \
    && git add -A && git -c user.name=t -c user.email=t@t commit -qm "merge kept a duplicate block" && git push -q origin main )
git_q pull --no-rebase origin main || true
set +e
PATH="$SANDBOX/bin:$PATH" AIDREAM_DIR="$SANDBOX/aidream" RELEASE_AFTER_PHASE=off RELEASE_LOG_CAPTURED=1 \
    bash scripts/release.sh > "$SANDBOX/out5" 2>&1
STATUS5=$?
set -e
git fetch -q origin
echo "release ship path — the lockfile guard"
check "an identical duplicate still ships v0.1.5" '[[ $STATUS5 -eq 0 ]] && git ls-remote --tags origin | grep -q "refs/tags/v0.1.5$"'
check "the released lockfile parses clean"        'git show origin/main:pnpm-lock.yaml | python3 scripts/check-lockfile-keys.py --stdin pnpm-lock.yaml'
check "the released lockfile kept one block"      '[[ $(git show origin/main:pnpm-lock.yaml | grep -c "@ai-matrx/records@0.84.4") -eq 1 ]]'
check "the repair is a Lockfile WARNING"          'grep -q "WARNING.*Lockfile.*identical duplicate blocks" "$SANDBOX/out5"'
( cd "$SANDBOX/other" && git pull -q origin main \
    && printf "${LOCK_HEAD}${LOCK_BLOCK}\n${LOCK_BLOCK//abc/xyz}\n${LOCK_TAIL}" > pnpm-lock.yaml \
    && git add -A && git -c user.name=t -c user.email=t@t commit -qm "merge kept two different blocks" && git push -q origin main )
BEFORE6=$(git ls-remote origin refs/heads/main | cut -f1)
set +e
PATH="$SANDBOX/bin:$PATH" AIDREAM_DIR="$SANDBOX/aidream" RELEASE_AFTER_PHASE=off RELEASE_LOG_CAPTURED=1 \
    bash scripts/release.sh > "$SANDBOX/out6" 2>&1
STATUS6=$?
set -e
check "an unreadable lockfile stops the release"  '[[ $STATUS6 -ne 0 ]]'
check "nothing was pushed for it"                 '[[ "$(git ls-remote origin refs/heads/main | cut -f1)" == "$BEFORE6" ]] && ! git ls-remote --tags origin | grep -q "refs/tags/v0.1.6$"'
check "the stop names the lockfile"               'grep -q "pnpm-lock.yaml in the release tree cannot be parsed" "$SANDBOX/out6"'
# ── seventh + eighth releases: THE TWINS GUARD (v0.4.3061, 2026-10-08) ──────
# The lockfile parsed, but held two versions of one @ai-matrx package; Vercel's
# postinstall (check-matrx-packages.mjs --duplicates) refused it on every project.
# A stub pnpm stands in for the registry: in the 7th run its `update` collapses the
# twins (remedied inside the release commit, WARNING); in the 8th it cannot, and
# nothing may be pushed.
twin_lock() {  # $1 = the app's design-system version, $2 = meet's
    local pkgs="  '@ai-matrx/design-system@$1':\n    resolution: {integrity: sha512-a}\n\n"
    [[ "$1" != "$2" ]] && pkgs+="  '@ai-matrx/design-system@$2':\n    resolution: {integrity: sha512-b}\n\n"
    local snaps="  '@ai-matrx/design-system@$1': {}\n\n"
    [[ "$1" != "$2" ]] && snaps+="  '@ai-matrx/design-system@$2': {}\n\n"
    printf "lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      '@ai-matrx/design-system':\n        specifier: latest\n        version: $1\n      '@ai-matrx/meet':\n        specifier: latest\n        version: 0.11.29\n\npackages:\n\n${pkgs}  '@ai-matrx/meet@0.11.29':\n    resolution: {integrity: sha512-c}\n\nsnapshots:\n\n${snaps}  '@ai-matrx/meet@0.11.29':\n    dependencies:\n      '@ai-matrx/design-system': $2\n"
}
cat > "$SANDBOX/bin/pnpm" <<STUB
#!/usr/bin/env bash
echo "\$*" >> "$SANDBOX/pnpm-calls"
if [[ "\$1" == update && -f "$SANDBOX/pnpm-can-remedy" ]]; then
    $(declare -f twin_lock)
    twin_lock 0.86.27 0.86.27 > pnpm-lock.yaml
fi
exit 0
STUB
chmod +x "$SANDBOX/bin/pnpm"
touch "$SANDBOX/pnpm-can-remedy"
( cd "$SANDBOX/other" && git pull -q origin main && twin_lock 0.86.26 0.86.27 > pnpm-lock.yaml \
    && git add -A && git -c user.name=t -c user.email=t@t commit -qm "meet: adopt 0.11.29 (twins)" && git push -q origin main )
check "the fixture really fails the Vercel postinstall check" '! (mkdir -p "$SANDBOX/fx" && git --git-dir="$SANDBOX/origin.git" show main:pnpm-lock.yaml > "$SANDBOX/fx/pnpm-lock.yaml" && node scripts/check-matrx-packages.mjs --duplicates --root "$SANDBOX/fx" >/dev/null 2>&1)'
set +e
PATH="$SANDBOX/bin:$PATH" AIDREAM_DIR="$SANDBOX/aidream" RELEASE_AFTER_PHASE=off RELEASE_LOG_CAPTURED=1 \
    bash scripts/release.sh > "$SANDBOX/out7" 2>&1
STATUS7=$?
set -e
git fetch -q origin
echo "release ship path — the twins guard"
check "remediable twins still ship a release"     '[[ $STATUS7 -eq 0 ]] && [[ "$(git log -1 --format=%s origin/main)" == release:* ]]'
check "the released lockfile passes the postinstall check" 'mkdir -p "$SANDBOX/rel" && git show origin/main:pnpm-lock.yaml > "$SANDBOX/rel/pnpm-lock.yaml" && node scripts/check-matrx-packages.mjs --duplicates --root "$SANDBOX/rel" >/dev/null 2>&1'
check "the remedy ran lockfile-only over @ai-matrx/*" 'grep -q "update -r @ai-matrx/\* --depth Infinity --lockfile-only" "$SANDBOX/pnpm-calls" 2>/dev/null'
check "the remedy is a Lockfile WARNING"          'grep -q "WARNING.*Lockfile.*two versions of one @ai-matrx package.*remedied" "$SANDBOX/out7"'
rm -f "$SANDBOX/pnpm-can-remedy"
( cd "$SANDBOX/other" && git pull -q origin main && twin_lock 0.86.28 0.86.29 > pnpm-lock.yaml \
    && git add -A && git -c user.name=t -c user.email=t@t commit -qm "twins again" && git push -q origin main )
BEFORE8=$(git ls-remote origin refs/heads/main | cut -f1)
set +e
PATH="$SANDBOX/bin:$PATH" AIDREAM_DIR="$SANDBOX/aidream" RELEASE_AFTER_PHASE=off RELEASE_LOG_CAPTURED=1 \
    bash scripts/release.sh > "$SANDBOX/out8" 2>&1
STATUS8=$?
set -e
check "unremediable twins stop the release"       '[[ $STATUS8 -ne 0 ]]'
check "nothing was pushed for them"               '[[ "$(git ls-remote origin refs/heads/main | cut -f1)" == "$BEFORE8" ]]'
check "the stop names the twins"                  'grep -q "@ai-matrx twins that Vercel.s postinstall" "$SANDBOX/out8"'
if [[ $FAILED -ne 0 ]]; then
    echo "--- script output ---"; tail -25 "$SANDBOX/out"; echo "--- second run ---"; tail -25 "$SANDBOX/out2" 2>/dev/null; echo "--- third run ---"; tail -25 "$SANDBOX/out3" 2>/dev/null; echo "--- fourth run ---"; tail -25 "$SANDBOX/out4" 2>/dev/null; echo "--- fifth run ---"; tail -25 "$SANDBOX/out5" 2>/dev/null; echo "--- sixth run ---"; tail -25 "$SANDBOX/out6" 2>/dev/null; echo "--- seventh run ---"; tail -25 "$SANDBOX/out7" 2>/dev/null; echo "--- eighth run ---"; tail -25 "$SANDBOX/out8" 2>/dev/null
    exit 1
fi
