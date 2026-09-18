#!/usr/bin/env bash
#
# scripts/test-worktree-node-modules.sh — forcing test for
# ensure_worktree_node_modules() in scripts/agent-dev-server.sh (V-23 NEW-1).
#
# `git worktree add` never creates node_modules (it is gitignored) — a fresh
# worktree's node_modules is ABSENT, not a symlink, and the launcher used to
# handle only the symlink case ([[ -L "$nm" ]] || return 0 returned
# immediately for the absent case), so `pnpm preview:start` in a real worktree
# failed with "dependencies are missing; run pnpm install first" — a remedy
# that resolves a DIFFERENT dependency tree than the primary checkout's,
# because every @ai-matrx/* package and next/react/typescript floats on
# `latest`.
#
# This exercises all three cases against real temp git worktrees, since the
# function's behavior depends on `git rev-parse --git-common-dir`, not just
# path shape:
#   1. absent      -> hard-link copy from the primary checkout
#   2. symlink     -> hard-link copy from the symlink's target (kept working)
#   3. real dir    -> left alone, untouched
#
# Run directly: bash scripts/test-worktree-node-modules.sh
# Wired as:      pnpm test:worktree-node-modules

set -uo pipefail

REPO_ROOT_REAL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_SERVER="$REPO_ROOT_REAL/scripts/agent-dev-server.sh"

# Source the real script from its real location so preview-session.sh (a
# relative sibling) resolves and REPO_ROOT/log/fail/stat_fmt are all defined
# normally. We override the REPO_ROOT variable per test case below —
# ensure_worktree_node_modules() reads it at CALL time, not at source time.
# shellcheck source=scripts/agent-dev-server.sh
source "$DEV_SERVER"

FAILURES=0
pass() { printf '[test] PASS: %s\n' "$1"; }
failcase() { printf '[test] FAIL: %s\n' "$1" >&2; FAILURES=$((FAILURES + 1)); }

WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

make_primary() {
  local dir="$1"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" config user.email test@example.com
  git -C "$dir" config user.name test
  echo "node_modules/" > "$dir/.gitignore"
  git -C "$dir" add .gitignore
  git -C "$dir" commit -q -m init
  mkdir -p "$dir/node_modules/.bin"
  echo "primary-payload" > "$dir/node_modules/marker.txt"
}

# --- Case 1: absent node_modules in a real git worktree -------------------
case1() {
  local primary="$WORK/case1-primary" wt="$WORK/case1-worktree"
  make_primary "$primary"
  git -C "$primary" worktree add -q --detach "$wt" HEAD

  REPO_ROOT="$wt"
  ensure_worktree_node_modules
  local rc=$?

  if [[ $rc -ne 0 ]]; then
    failcase "case1 (absent): ensure_worktree_node_modules exited $rc"
    return
  fi
  if [[ -L "$wt/node_modules" ]]; then
    failcase "case1 (absent): node_modules is still a symlink, expected a real hard-linked dir"
    return
  fi
  if [[ ! -d "$wt/node_modules" ]]; then
    failcase "case1 (absent): node_modules was not created"
    return
  fi
  local links
  links="$(stat -c %h "$wt/node_modules/marker.txt" 2>/dev/null || stat -f %l "$wt/node_modules/marker.txt" 2>/dev/null)"
  if [[ "${links:-1}" -le 1 ]]; then
    failcase "case1 (absent): marker.txt has $links link(s), expected a hard link (>1) to the primary checkout"
    return
  fi
  if [[ "$(cat "$wt/node_modules/marker.txt")" != "primary-payload" ]]; then
    failcase "case1 (absent): copied content does not match the primary checkout"
    return
  fi
  pass "case1: absent node_modules in a real worktree becomes a hard-linked copy of the primary checkout's"
}

# --- Case 2: symlinked node_modules (kept working) -------------------------
case2() {
  local primary="$WORK/case2-primary" wt="$WORK/case2-worktree"
  make_primary "$primary"
  git -C "$primary" worktree add -q --detach "$wt" HEAD
  ln -s "$primary/node_modules" "$wt/node_modules"

  REPO_ROOT="$wt"
  ensure_worktree_node_modules
  local rc=$?

  if [[ $rc -ne 0 ]]; then
    failcase "case2 (symlink): ensure_worktree_node_modules exited $rc"
    return
  fi
  if [[ -L "$wt/node_modules" ]]; then
    failcase "case2 (symlink): node_modules is still a symlink, expected a real hard-linked dir"
    return
  fi
  local links
  links="$(stat -c %h "$wt/node_modules/marker.txt" 2>/dev/null || stat -f %l "$wt/node_modules/marker.txt" 2>/dev/null)"
  if [[ "${links:-1}" -le 1 ]]; then
    failcase "case2 (symlink): marker.txt has $links link(s), expected a hard link (>1)"
    return
  fi
  pass "case2: a pre-existing symlink is still replaced with a hard-linked copy"
}

# --- Case 3: real directory already present is left untouched -------------
case3() {
  local primary="$WORK/case3-primary" wt="$WORK/case3-worktree"
  make_primary "$primary"
  git -C "$primary" worktree add -q --detach "$wt" HEAD
  mkdir -p "$wt/node_modules"
  echo "already-here" > "$wt/node_modules/own-marker.txt"
  local before_inode
  before_inode="$(stat -c %i "$wt/node_modules/own-marker.txt" 2>/dev/null || stat -f %i "$wt/node_modules/own-marker.txt" 2>/dev/null)"

  REPO_ROOT="$wt"
  ensure_worktree_node_modules
  local rc=$?

  if [[ $rc -ne 0 ]]; then
    failcase "case3 (real dir): ensure_worktree_node_modules exited $rc"
    return
  fi
  if [[ ! -f "$wt/node_modules/own-marker.txt" ]]; then
    failcase "case3 (real dir): own content was removed"
    return
  fi
  local after_inode
  after_inode="$(stat -c %i "$wt/node_modules/own-marker.txt" 2>/dev/null || stat -f %i "$wt/node_modules/own-marker.txt" 2>/dev/null)"
  if [[ "$before_inode" != "$after_inode" ]]; then
    failcase "case3 (real dir): file was replaced (inode changed), expected untouched"
    return
  fi
  if [[ "$(cat "$wt/node_modules/own-marker.txt")" != "already-here" ]]; then
    failcase "case3 (real dir): content changed"
    return
  fi
  pass "case3: an already-real node_modules directory is left alone"
}

case1
case2
case3

if [[ "$FAILURES" -gt 0 ]]; then
  printf '[test] %d case(s) failed\n' "$FAILURES" >&2
  exit 1
fi
printf '[test] all cases passed\n'
