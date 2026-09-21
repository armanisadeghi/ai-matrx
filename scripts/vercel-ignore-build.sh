#!/usr/bin/env bash
# vercel-ignore-build.sh — Ignored Build Step for Vercel.
#
# Exit 0 -> SKIP the build (no billable build minutes).
# Exit 1 -> PROCEED with the build.
#
# One repo, THREE Vercel projects (deployment split 2026-07):
#   ai-matrx        (aimatrx.com)        MATRX_BUILD_TARGET=main
#   ai-matrx-manage (manage.aimatrx.com) MATRX_BUILD_TARGET=admin
#   ai-matrx-demos  (demos.aimatrx.com)  MATRX_BUILD_TARGET=demos
#
# Only a release commit pushed as HEAD may build, and its subject selects the
# project(s):
#   release:        -> main only
#   release-admin:  -> admin only
#   release-demos:  -> demos only
#   release-all:    -> all three
# Every other push is skipped. Never search earlier commits for a release
# prefix: while a release is still building, the production SHA lags main, so
# range scanning makes every later ordinary push rediscover the same release
# and start a duplicate build.
#
# scripts/release.sh constructs the release commit directly on origin/main and
# pushes it as HEAD. Strict HEAD-message gating is therefore both sufficient
# and the only unambiguous one-push/one-build policy.
#
# MATRX_BUILD_TARGET is a per-project Vercel env var. Missing -> "main" so the
# original project keeps its pre-split behavior.
#
# Wired via vercel.json -> ignoreCommand (shared by all three projects).
# Guard: scripts/vercel-ignore-build.test.mjs (`pnpm test:vercel-ignore`).
set -uo pipefail

target="${MATRX_BUILD_TARGET:-main}"

targets_this_project() {
  case "$1" in
    release-all:*) return 0 ;;
    release-admin:*) [[ "$target" == "admin" ]] && return 0 ;;
    release-demos:*) [[ "$target" == "demos" ]] && return 0 ;;
    release:*) [[ "$target" == "main" ]] && return 0 ;;
  esac
  return 1
}

# Vercel supplies the pushed HEAD subject. Fall back to the checked-out HEAD so
# the guard remains deterministic in local tests and manual diagnostics.
head_subject="${VERCEL_GIT_COMMIT_MESSAGE:-}"
if [[ -z "$head_subject" ]]; then
  head_sha="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
  head_subject="$(git log -1 --pretty=%s "$head_sha" 2>/dev/null || true)"
fi
head_subject="${head_subject%%$'\n'*}"
head_subject="${head_subject%%$'\r'*}"

if targets_this_project "$head_subject"; then
  echo "[vercel-ignore] Building (target=${target}) — pushed HEAD is a release commit: ${head_subject}"
  exit 1
fi

echo "[vercel-ignore] Skipping (target=${target}) — pushed HEAD is not a release commit for this project. HEAD: ${head_subject:-<empty>}"
echo "[vercel-ignore] Deploys only via ./ship.sh / ./scripts/release.sh (--target admin|demos|all for the satellites)."
exit 0
