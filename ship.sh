#!/usr/bin/env bash
# ship.sh — One release commit for your working tree + version bump, then push.
#
# Does NOT commit your message first. Stages everything, runs release.sh with
# --ship --message, and release.sh makes a SINGLE commit:
#   release: v0.4.106 - Added new chat surface
#
# Usage:
#   ./ship.sh "Added new chat surface"
#   ./ship.sh "fix: thing" --minor
#   ./ship.sh "chore: bump deps" --no-migrate
#
# Extra flags pass through to scripts/release.sh
# (--patch|--minor|--major|--dry-run|--no-migrate|--no-gates).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ $# -lt 1 ]]; then
    echo "Usage: ./ship.sh \"commit message\" [release.sh flags...]" >&2
    echo "  Example: ./ship.sh \"Added new chat surface\"" >&2
    echo "  Produces one commit: release: vX.Y.Z - Added new chat surface" >&2
    exit 1
fi

COMMIT_MSG="$1"
shift

exec "$ROOT/scripts/release.sh" --ship --message "$COMMIT_MSG" "$@"
