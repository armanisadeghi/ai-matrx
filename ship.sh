#!/usr/bin/env bash
# ship.sh — sync this checkout with GitHub, then release. (Arman, 2026-09-24)
#
#   1. scripts/sync-main.py   commits everything uncommitted ("local work not committed by agents
#                             who made them"), merges origin/main, sorts every conflict into
#                             _conflicts/ (auto-fixed / both-versions-kept / held), pushes.
#   2. scripts/release.sh     bumps the version and pushes the release commit; Vercel builds it.
#                             Runs whatever happened in step 1.
#   3. the open items         prints what is open in _conflicts/README.md, if anything, for the
#                             agent that resolves conflicts.
#
# Usage:
#   ./ship.sh                                   # sync + release with the default note
#   ./ship.sh "Added new chat surface"          # sync + release with a note
#   ./ship.sh "note" --minor --target all       # release.sh flags pass through
#   ./ship.sh "note" --dry-run                  # NO sync; release.sh --dry-run only
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
export RELEASE_STAGE_CALLER_PWD="$PWD"

NOTE="sync and release"
if [[ $# -gt 0 && "$1" != --* ]]; then
    NOTE="$1"
    shift
fi

DRY_RUN=false
for arg in "$@"; do [[ "$arg" == "--dry-run" ]] && DRY_RUN=true; done

# ── 1. sync ──────────────────────────────────────────────────────────────────
if $DRY_RUN; then
    echo "ship.sh: --dry-run, so the sync was skipped (it commits and pushes for real)."
    SYNC_RC=0
else
    python3 "$ROOT/scripts/sync-main.py"
    SYNC_RC=$?
    if [[ $SYNC_RC -ne 0 ]]; then
        echo ""
        echo "ship.sh: the sync did not finish (exit $SYNC_RC; its reason is printed above). Releasing anyway."
    fi
fi

# ── 2. release ───────────────────────────────────────────────────────────────
# ONE REPO, THREE SITES. scripts/vercel-ignore-build.sh builds manage.aimatrx.com
# and demos.aimatrx.com only for a "release-all:" (or release-admin:/release-demos:)
# commit; a plain "release:" builds www alone. From v0.4.2277 to v0.4.2298 on
# 2026-09-24 every ship went out as "release:" and the two other sites sat on a
# morning build for ten hours with every deploy cancelled by the ignored build
# step. A ship is a ship of the whole app: default to --target all unless the
# caller named a target.
TARGET_FLAG=()
case " $* " in
    *" --target "*) ;;
    *) TARGET_FLAG=(--target all) ;;
esac
echo ""
"$ROOT/scripts/release.sh" --message "$NOTE" "${TARGET_FLAG[@]}" "$@"
RELEASE_RC=$?

# ── 3. open items ────────────────────────────────────────────────────────────
echo ""
if ! $DRY_RUN; then
    if python3 "$ROOT/scripts/check-conflict-markers.py" >/tmp/ship-conflicts.$$ 2>&1; then
        echo "ship.sh: nothing open in _conflicts/."
    else
        echo "ship.sh: open items in _conflicts/README.md:"
        sed 's/^/  /' /tmp/ship-conflicts.$$
    fi
    rm -f /tmp/ship-conflicts.$$
fi

echo "ship.sh: sync exit $SYNC_RC, release exit $RELEASE_RC"
exit $RELEASE_RC
