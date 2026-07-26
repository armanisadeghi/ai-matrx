#!/usr/bin/env bash
# ship.sh — Stage everything, commit with your message, then run ./scripts/release.sh
#
# Usage:
#   ./ship.sh "feat: describe your change"
#   ./ship.sh "fix: thing" --minor
#   ./ship.sh "chore: bump deps"
#
# Extra flags are passed through to scripts/release.sh (--patch|--minor|--major|--dry-run|--no-migrate|--no-gates).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ $# -lt 1 ]]; then
    echo "Usage: ./ship.sh \"commit message\" [release.sh flags...]" >&2
    echo "  Example: ./ship.sh \"added mcp tools\"" >&2
    exit 1
fi

COMMIT_MSG="$1"
shift

git add -A

if git diff --cached --quiet; then
    echo "[ship] Nothing new to commit — working tree already matches index." >&2
else
    git commit -m "$COMMIT_MSG"
fi

exec "$ROOT/scripts/release.sh" "$@"
