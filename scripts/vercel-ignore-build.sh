#!/usr/bin/env bash
# vercel-ignore-build.sh — Ignored Build Step for Vercel.
#
# Exit 0 → SKIP the build (no billable build minutes).
# Exit 1 → PROCEED with the build.
#
# Only `./ship.sh` / `./scripts/release.sh` commits (message starts with
# `release:`) may start a production build. Every other push to main used to
# kick off a ~20-minute production deploy; rapid agent pushes then overlapped
# the release build and we paid for two (or more) concurrent builds.
#
# Wired via vercel.json → ignoreCommand.
set -euo pipefail

msg="${VERCEL_GIT_COMMIT_MESSAGE:-}"
if [[ -z "$msg" ]]; then
  msg="$(git log -1 --pretty=%B 2>/dev/null || true)"
fi

# First line only (multi-line bodies from Co-authored-by etc.)
msg="${msg%%$'\n'*}"
msg="${msg%%$'\r'*}"

if [[ "$msg" == release:* ]]; then
  echo "[vercel-ignore] Building — release commit: ${msg}"
  exit 1
fi

echo "[vercel-ignore] Skipping — not a release commit: ${msg:-<empty>}"
echo "[vercel-ignore] Production deploys only from ./ship.sh / ./scripts/release.sh."
exit 0
