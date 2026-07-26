#!/usr/bin/env bash
# vercel-ignore-build.sh — Ignored Build Step for Vercel.
#
# Exit 0 → SKIP the build (no billable build minutes).
# Exit 1 → PROCEED with the build.
#
# One repo, THREE Vercel projects (deployment split 2026-07):
#   ai-matrx        (aimatrx.com)        MATRX_BUILD_TARGET=main
#   ai-matrx-manage (manage.aimatrx.com) MATRX_BUILD_TARGET=admin
#   ai-matrx-demos  (demos.aimatrx.com)  MATRX_BUILD_TARGET=demos
#
# Only release commits (from ./ship.sh / ./scripts/release.sh) build, and the
# commit-message prefix selects which project(s):
#   release:        → main only
#   release-admin:  → admin only
#   release-demos:  → demos only
#   release-all:    → all three
# Every other push to main is skipped — rapid agent pushes must never start a
# ~20-minute production build, let alone three.
#
# MATRX_BUILD_TARGET is a per-project Vercel env var. Missing → "main" so the
# original project keeps its exact pre-split behavior.
#
# Wired via vercel.json → ignoreCommand (shared by all three projects).
set -euo pipefail

target="${MATRX_BUILD_TARGET:-main}"

msg="${VERCEL_GIT_COMMIT_MESSAGE:-}"
if [[ -z "$msg" ]]; then
  msg="$(git log -1 --pretty=%B 2>/dev/null || true)"
fi

# First line only (multi-line bodies from Co-authored-by etc.)
msg="${msg%%$'\n'*}"
msg="${msg%%$'\r'*}"

build() {
  echo "[vercel-ignore] Building (target=${target}) — ${msg}"
  exit 1
}

case "$msg" in
  release-all:*) build ;;
  release-admin:*) if [[ "$target" == "admin" ]]; then build; fi ;;
  release-demos:*) if [[ "$target" == "demos" ]]; then build; fi ;;
  release:*) if [[ "$target" == "main" ]]; then build; fi ;;
esac

echo "[vercel-ignore] Skipping (target=${target}) — commit does not target this project: ${msg:-<empty>}"
echo "[vercel-ignore] Deploys only via ./ship.sh / ./scripts/release.sh (--target admin|demos|all for the satellites)."
exit 0
