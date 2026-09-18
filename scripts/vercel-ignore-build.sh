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
# THE STRANDED-RELEASE CLASS (fixed 2026-09-14). The decision used to read the
# HEAD commit message ONLY. The shared checkout's mandatory routine is
# commit → `git pull --no-rebase origin main` → push, so the pushed HEAD is
# routinely a MERGE commit and the `release:` commit sits one (or ten) commits
# behind it. Those releases never built: `release: a chat that was on a sandbox
# opens back on that sandbox` (f2386f68f0) was pushed under merge head
# 12ef018999 and deployment dpl_5yi53GmMDeawdPrxVYxV2DmdQmUP2 was CANCELED by
# this step. At least three releases were stranded that way in one day.
#
# The question is therefore NOT "is HEAD a release commit" but "does the range
# that this push ADDED to the branch contain a release commit for this target".
# The range is `$VERCEL_GIT_PREVIOUS_SHA..HEAD` — the previous SHA is the last
# commit Vercel actually deployed for THIS project and branch, so a release
# that already built is outside the range and never builds twice.
#
# Vercel clones shallow, so that commit is usually not in the clone; we deepen
# until it resolves. If no source answers (first ever deployment, an offline
# site, a production build older than the clone can reach, force-push) we fall
# back to the commits this push introduced relative to the merge base of HEAD's
# parents — which still catches the merge-head class — and otherwise to HEAD's
# own subject. Every path prints which range it judged and why.
#
# MATRX_BUILD_TARGET is a per-project Vercel env var. Missing → "main" so the
# original project keeps its exact pre-split behavior.
#
# Wired via vercel.json → ignoreCommand (shared by all three projects).
# Guard: scripts/vercel-ignore-build.test.mjs (`pnpm test:vercel-ignore`).
set -uo pipefail

target="${MATRX_BUILD_TARGET:-main}"

# --- does one commit subject order a build of THIS project? ------------------
targets_this_project() {
  case "$1" in
    release-all:*) return 0 ;;
    release-admin:*) [[ "$target" == "admin" ]] && return 0 ;;
    release-demos:*) [[ "$target" == "demos" ]] && return 0 ;;
    release:*) [[ "$target" == "main" ]] && return 0 ;;
  esac
  return 1
}

have_commit() {
  [[ -n "${1:-}" ]] && git cat-file -e "${1}^{commit}" 2>/dev/null
}

# Vercel clones at depth 10; deepen until the previous deployed SHA is present.
resolve_commit() {
  local sha="$1"
  have_commit "$sha" && return 0
  [[ -d .git ]] || return 1
  # GitHub serves arbitrary reachable SHAs directly.
  git fetch --quiet --no-tags --depth=1 origin "$sha" 2>/dev/null || true
  have_commit "$sha" && return 0
  local ref="${VERCEL_GIT_COMMIT_REF:-main}" d
  for d in 50 200 1000; do
    git fetch --quiet --no-tags --depth="$d" origin "$ref" 2>/dev/null || true
    have_commit "$sha" && return 0
  done
  # Deliberately no --unshallow: an unbounded fetch of this repository would
  # run on EVERY skipped push (dozens a day) to answer a question three bounded
  # deepenings already answer whenever the previous deployment is recent. If it
  # is older than 1000 commits, the caller says so and falls back.
  have_commit "$sha"
}

head_sha="${VERCEL_GIT_COMMIT_SHA:-}"
have_commit "$head_sha" || head_sha="$(git rev-parse HEAD 2>/dev/null || echo "")"

# --- the candidate subjects: everything this push added ----------------------
subjects=""
range_desc=""

# What is THIS project actually running right now?
live_deployed_sha() {
  local url="${MATRX_DEPLOYED_SHA_URL:-}"
  if [[ -z "$url" ]]; then
    [[ -n "${VERCEL_PROJECT_PRODUCTION_URL:-}" ]] || return 1
    url="https://${VERCEL_PROJECT_PRODUCTION_URL}/api/version"
  fi
  local body
  body="$(curl -fsSL --max-time 10 "$url" 2>/dev/null || true)"
  [[ -n "$body" ]] || return 1
  local sha
  sha="$(printf '%s' "$body" | sed -n 's/.*"commit"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{7,40\}\)".*/\1/p')"
  [[ -n "$sha" ]] || return 1
  printf '%s' "$sha"
}

try_range_from() {
  local prev="$1" source="$2"
  [[ -n "$prev" && -n "$head_sha" && "$prev" != "$head_sha" ]] || return 1
  resolve_commit "$prev" || return 1
  git merge-base --is-ancestor "$prev" "$head_sha" 2>/dev/null || return 1
  subjects="$(git log --format=%s "${prev}..${head_sha}" 2>/dev/null || true)"
  range_desc="${prev:0:9}..${head_sha:0:9} (${source})"
  return 0
}

try_range_from "${VERCEL_GIT_PREVIOUS_SHA:-}" "VERCEL_GIT_PREVIOUS_SHA — the last deployment of this project" || true

if [[ -z "$range_desc" ]]; then
  live_sha="$(live_deployed_sha || true)"
  if [[ -n "$live_sha" ]]; then
    try_range_from "$live_sha" "the commit this project's production domain reports serving" || \
      echo "[vercel-ignore] The live site reports ${live_sha:0:9}, which this clone cannot place — falling back."
  else
    echo "[vercel-ignore] No previous deployed SHA: VERCEL_GIT_PREVIOUS_SHA is empty and the live /api/version did not answer one."
  fi
fi

if [[ -z "$range_desc" && -n "$head_sha" ]]; then
  # No usable previous SHA. Take the commits this push introduced around a
  # merge head: everything reachable from HEAD but not from the merge base of
  # HEAD's parents. For a non-merge HEAD this degrades to HEAD itself.
  parents=()
  while read -r p; do [[ -n "$p" ]] && parents+=("$p"); done < <(git rev-list --parents -n 1 "$head_sha" 2>/dev/null | tr ' ' '\n' | tail -n +2)
  if [[ ${#parents[@]} -ge 2 ]]; then
    base="$(git merge-base --octopus "${parents[@]}" 2>/dev/null || true)"
    if [[ -n "$base" ]]; then
      subjects="$(git log --format=%s -n 200 "$head_sha" --not "$base" 2>/dev/null || true)"
      range_desc="${base:0:9}..${head_sha:0:9} (merge head; no previous deployment SHA available)"
    fi
  fi
fi

if [[ -z "$range_desc" ]]; then
  msg="${VERCEL_GIT_COMMIT_MESSAGE:-}"
  [[ -n "$msg" ]] || msg="$(git log -1 --pretty=%B "${head_sha:-HEAD}" 2>/dev/null || true)"
  subjects="${msg%%$'\n'*}"
  subjects="${subjects%%$'\r'*}"
  if [[ -n "$head_sha" ]]; then
    range_desc="HEAD only (nothing could say what this project last deployed, and HEAD is not a merge)"
  else
    range_desc="HEAD only (no git history available)"
  fi
fi

head_subject="${VERCEL_GIT_COMMIT_MESSAGE:-}"
if [[ -z "$head_subject" ]]; then
  head_subject="$(git log -1 --pretty=%s "${head_sha:-HEAD}" 2>/dev/null || true)"
fi
head_subject="${head_subject%%$'\n'*}"
head_subject="${head_subject%%$'\r'*}"

while IFS= read -r subject; do
  subject="${subject%%$'\r'*}"
  [[ -n "$subject" ]] || continue
  if targets_this_project "$subject"; then
    echo "[vercel-ignore] Building (target=${target}) — release commit in ${range_desc}: ${subject}"
    [[ "$subject" == "$head_subject" ]] || echo "[vercel-ignore] HEAD is not that commit (HEAD: ${head_subject}) — a release reached the branch behind a merge commit."
    exit 1
  fi
done <<< "$subjects"

echo "[vercel-ignore] Skipping (target=${target}) — no release commit for this project in ${range_desc}. HEAD: ${head_subject:-<empty>}"
echo "[vercel-ignore] Deploys only via ./ship.sh / ./scripts/release.sh (--target admin|demos|all for the satellites)."
exit 0
