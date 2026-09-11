#!/usr/bin/env bash
# ship.sh — One release commit of YOUR named paths + version bump, then push.
#
# Does NOT commit your message first. Runs release.sh with --ship --message and
# release.sh makes a SINGLE commit:
#   release: v0.4.106 - Added new chat surface
#
# 🚨 THE RELEASE-COMMIT CONTENT LAW (scripts/release-stage.sh): the commit
# carries EXACTLY package.json (+ package-lock.json) and the paths you name
# after `--`. It never stages the working tree and never trusts the index —
# both are shared with dozens of other lanes, and release v0.4.1575
# (2026-08-31) shipped a broken build because the old `git add -A` here swept
# another lane's half-edited file into production. With a dirty tree and no
# paths, release.sh refuses and lists the dirt so you can name yours. With a
# clean tree and no paths it is a bump-only release.
#
# Usage:
#   ./ship.sh "Added new chat surface" -- features/chat lib/chat-api.ts
#   ./ship.sh "fix: thing" --minor -- features/thing/Fix.tsx
#   ./ship.sh "chore: bump deps" --no-migrate -- package.json pnpm-lock.yaml
#   ./ship.sh "release only what is committed"          # clean tree: bump only
#   ./ship.sh "preview" --dry-run -- features/chat      # prints the exact file
#                                                         list the commit would carry
#
# Flags before `--` pass through to scripts/release.sh
# (--patch|--minor|--major|--target|--dry-run|--no-migrate|--no-gates).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ $# -lt 1 ]]; then
    echo "Usage: ./ship.sh \"commit message\" [release.sh flags...] -- <paths you own...>" >&2
    echo "  Example: ./ship.sh \"Added new chat surface\" -- features/chat" >&2
    echo "  Produces one commit: release: vX.Y.Z - Added new chat surface" >&2
    echo "  carrying ONLY package.json + the named paths (never the whole tree)." >&2
    exit 1
fi

COMMIT_MSG="$1"
shift

exec "$ROOT/scripts/release.sh" --ship --message "$COMMIT_MSG" "$@"
