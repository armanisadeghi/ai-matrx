#!/usr/bin/env bash
# ship-demos.sh — rebuild ONLY demos.aimatrx.com (or, with --lab, ONLY lab.aimatrx.com), fast,
# with nothing else attached.
#
#   --lab   ships to lab.aimatrx.com: only app/(lab)/lab/<name>/page.lab.tsx pages, no AppShell,
#           ~10 s compile and ~1.5 min push-to-live (demos is ~8 min). See app/(lab)/README.md.
#
#   pnpm ship:demos                                  # push what is committed, rebuild demos
#   pnpm ship:demos "tweak foo demo"                 # same, with a note
#   pnpm ship:demos "tweak foo demo" -- app/(dev)/demos/foo/page.dev.tsx   # commit these paths first
#   pnpm ship:demos "note" --watch                   # also wait for the Vercel build and print the URL
#   pnpm ship:demos "note" --lab --watch -- "app/(lab)/lab/foo/page.lab.tsx"   # the fast lab site
#
# What it does, and nothing more (same for --lab, with "release-lab:"):
#   1. (optional) commits EXACTLY the named paths (`git commit --only`, never the shared index)
#   2. fetches origin/main and builds a "release-demos: ..." commit on top of it with git
#      plumbing (local commits merged in when they merge cleanly; files on disk never touched)
#   3. pushes it as HEAD of main — scripts/vercel-ignore-build.sh lets ONLY ai-matrx-demos build
#
# What it deliberately skips (that is release.sh's job, on its own cadence): migrations, quality
# gates, version bump, tag, the www/manage builds. No version bump means the next release.sh run
# reads the same version from origin/main, so the two never collide.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
REMOTE=origin
BRANCH=main
VERCEL_SCOPE=team_zWxJHqDHuRr1kpl9Hu9oON3g
VERCEL_PROJECT=ai-matrx-demos
PREFIX="release-demos:"

NOTE=""
WATCH=false
PATHS=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --watch) WATCH=true ;;
        --lab) VERCEL_PROJECT=ai-matrx-lab; PREFIX="release-lab:" ;;
        --) shift; PATHS=("$@"); break ;;
        -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
        *) NOTE="${NOTE:+$NOTE }$1" ;;
    esac
    shift
done

started=$(date +%s)

# ── 1. commit the named paths ────────────────────────────────────────────────
if [[ ${#PATHS[@]} -gt 0 ]]; then
    git add -- "${PATHS[@]}" || { echo "ship-demos: could not stage ${PATHS[*]}"; exit 1; }
    if git diff --cached --quiet -- "${PATHS[@]}"; then
        echo "ship-demos: the named paths have no changes; shipping what is already committed."
    else
        git commit --only -m "demos: ${NOTE:-update}" -- "${PATHS[@]}" >/dev/null \
            || { echo "ship-demos: commit of ${PATHS[*]} failed"; exit 1; }
        echo "ship-demos: committed $(git rev-parse --short HEAD) ${PATHS[*]}"
    fi
fi

# ── 2 + 3. build the release-demos commit on origin/main and push it ─────────
MSG="$PREFIX ${NOTE:-rebuild} ($(date -u +%Y-%m-%dT%H:%MZ))"
for attempt in 1 2 3 4 5; do
    git fetch --quiet "$REMOTE" "$BRANCH" || { echo "ship-demos: cannot reach $REMOTE"; exit 1; }
    base=$(git rev-parse "$REMOTE/$BRANCH")
    head=$(git rev-parse HEAD)
    ff=false
    if git merge-base --is-ancestor "$base" "$head"; then
        # Local main already contains origin/main: ship local main as-is.
        tree=$(git rev-parse "$head^{tree}"); parents=(-p "$head"); ff=true
    elif git merge-base --is-ancestor "$head" "$base"; then
        tree=$(git rev-parse "$base^{tree}"); parents=(-p "$base")
    elif tree=$(git merge-tree --write-tree "$base" "$head" 2>/dev/null); then
        parents=(-p "$base" -p "$head")
    else
        tree=$(git rev-parse "$base^{tree}"); parents=(-p "$base")
        echo "ship-demos: WARNING local commits conflict with $REMOTE/$BRANCH — shipping $REMOTE/$BRANCH WITHOUT ${head:0:9}. Merge, then run again."
    fi
    sha=$(git commit-tree "$tree" "${parents[@]}" -m "$MSG") || { echo "ship-demos: commit-tree failed"; exit 1; }
    if git push --quiet "$REMOTE" "$sha:refs/heads/$BRANCH" 2>/dev/null; then
        # Fast-forward the local ref only when the tree is identical to HEAD's, so the
        # working tree and index stay exactly as their owners left them.
        $ff && git update-ref "refs/heads/$BRANCH" "$sha" "$head" 2>/dev/null
        echo "ship-demos: pushed ${sha:0:9} — $VERCEL_PROJECT build started ($(( $(date +%s) - started ))s)"
        break
    fi
    [[ $attempt -eq 5 ]] && { echo "ship-demos: lost the push race 5 times; run again"; exit 1; }
    echo "ship-demos: origin moved, retrying ($attempt)"
done

$WATCH || exit 0

# ── optional: wait for the Vercel build ──────────────────────────────────────
command -v vercel >/dev/null || { echo "ship-demos: vercel CLI not installed; skip --watch"; exit 0; }
echo "ship-demos: waiting for Vercel to pick up ${sha:0:9}…"
url=""
for _ in $(seq 1 40); do
    url=$(vercel ls "$VERCEL_PROJECT" --scope "$VERCEL_SCOPE" -m "githubCommitSha=$sha" 2>/dev/null \
        | grep -oE "https://$VERCEL_PROJECT-[a-z0-9]+-[a-z0-9-]+\.vercel\.app" | head -1)
    [[ -n "$url" ]] && break
    sleep 3
done
[[ -z "$url" ]] && { echo "ship-demos: no deployment appeared for ${sha:0:9} within 2 min"; exit 1; }
echo "ship-demos: building $url"
vercel inspect "$url" --wait --timeout 20m --scope "$VERCEL_SCOPE" >/dev/null 2>&1
state=$(vercel inspect "$url" --scope "$VERCEL_SCOPE" 2>&1 | sed -n 's/^[[:space:]]*status[[:space:]]*//p' | head -1)
echo "ship-demos: ${state:-unknown} after $(( $(date +%s) - started ))s — $url"
[[ "$state" == *Ready* ]] || { echo "ship-demos: build log: vercel inspect $url --logs --scope $VERCEL_SCOPE"; exit 1; }
