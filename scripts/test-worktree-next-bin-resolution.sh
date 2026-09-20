#!/usr/bin/env bash
#
# scripts/test-worktree-next-bin-resolution.sh — forcing test for
# resolve_next_bin() in scripts/agent-dev-server.sh.
#
# 2026-09-19 defect: the shared preview crashed starting Next.js from a fresh
# worktree at `.matrx/acquisition-frontier/checkout` with
#   Error: Cannot find module
#   '/Users/…/matrx-frontend/Users/…/matrx-frontend/node_modules/next/dist/bin/next'
# — a DOUBLED absolute path. Root cause: the launcher used to exec
# `node_modules/.bin/next`, a pnpm-generated POSIX shim that finds its real
# target by counting a FIXED number of `..` hops from its own directory up to
# what it assumes is the filesystem root, then re-descending through the
# target's absolute path (baked in at generation time, leading slash
# stripped). `ensure_worktree_node_modules` hard-links (`cp -al`) the primary
# checkout's node_modules into the worktree UNCHANGED — same bytes, same baked
# -in hop count — but the worktree lives at a different nesting depth, so the
# hop count that was correct for the primary checkout stops short of the
# filesystem root and the shim silently doubles the primary checkout's own
# path onto itself instead of erroring.
#
# The fix (resolve_next_bin) never depends on that shim's path arithmetic: it
# points straight at `node_modules/next/dist/bin/next`, a real Node script
# reachable through `node_modules/next` — a normal symlink into the pnpm
# store that resolves correctly no matter how deeply the checkout is nested.
#
# This test reproduces the actual defect SHAPE — a worktree nested several
# directories deeper than the primary checkout, exactly like
# `.matrx/acquisition-frontier/checkout` — hard-links node_modules into it via
# the real ensure_worktree_node_modules(), then proves resolve_next_bin()
# both names a path INSIDE the worktree (never the doubled/outside path the
# old shim produced) and that `node` can actually execute it as the
# worktree's own copy.
#
# Run directly: bash scripts/test-worktree-next-bin-resolution.sh
# Wired as:      pnpm test:worktree-next-bin-resolution

set -uo pipefail

REPO_ROOT_REAL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_SERVER="$REPO_ROOT_REAL/scripts/agent-dev-server.sh"

# Source the real script so resolve_next_bin/ensure_worktree_node_modules/log
# /fail/stat_fmt are all the real, current implementations. Override REPO_ROOT
# per case below — both functions read it at CALL time, not at source time.
# shellcheck source=scripts/agent-dev-server.sh
source "$DEV_SERVER"

FAILURES=0
pass() { printf '[test] PASS: %s\n' "$1"; }
failcase() { printf '[test] FAIL: %s\n' "$1" >&2; FAILURES=$((FAILURES + 1)); }

WORK="$(mktemp -d)"
WORK="$(cd "$WORK" && pwd -P)"  # resolve macOS's /var -> /private/var symlink once, up front
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

# Build a primary checkout whose node_modules carries a REAL next entry point
# (a runnable node script) plus a `.bin/next` shim shaped exactly like the
# broken one found in production: a fixed "5 hops up, then re-descend the
# baked-in absolute path" shim. The shim is deliberately left in node_modules
# so this test proves resolve_next_bin() does not need it (and would still be
# correct even if the shim is present and broken).
make_primary() {
  local dir="$1"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" config user.email test@example.com
  git -C "$dir" config user.name test
  echo "node_modules/" > "$dir/.gitignore"
  git -C "$dir" add .gitignore
  git -C "$dir" commit -q -m init

  mkdir -p "$dir/node_modules/.bin" "$dir/node_modules/next/dist/bin"
  cat > "$dir/node_modules/next/dist/bin/next" <<EOF
#!/usr/bin/env node
console.log("MARKER:" + __dirname);
EOF
  chmod +x "$dir/node_modules/next/dist/bin/next"

  # The shim exactly as pulled from the field: 5 "../" hops (correct ONLY for
  # a .bin dir this many levels below filesystem root) then the primary
  # checkout's own absolute path with the leading slash stripped.
  local abs_no_slash="${dir#/}"
  cat > "$dir/node_modules/.bin/next" <<EOF
#!/bin/sh
basedir=\$(dirname "\$(echo "\$0" | sed -e 's,\\\\,/,g')")
if [ -x "\$basedir/node" ]; then
  exec "\$basedir/node"  "\$basedir/../../../../../$abs_no_slash/node_modules/next/dist/bin/next" "\$@"
else
  exec node  "\$basedir/../../../../../$abs_no_slash/node_modules/next/dist/bin/next" "\$@"
fi
EOF
  chmod +x "$dir/node_modules/.bin/next"
}

# --- resolve_next_bin() names a path INSIDE a deeply-nested worktree -------
case_worktree_depth() {
  local primary="$WORK/primary" wt
  make_primary "$primary"
  # Reproduce the real defect shape: worktree several directories deeper than
  # the primary checkout, like .matrx/acquisition-frontier/checkout.
  wt="$primary/.matrx/acquisition-frontier/checkout"
  mkdir -p "$(dirname "$wt")"
  git -C "$primary" worktree add -q --detach "$wt" HEAD

  REPO_ROOT="$wt"
  ensure_worktree_node_modules || { failcase "setup: ensure_worktree_node_modules failed"; return; }

  local resolved rc
  resolved="$(resolve_next_bin)"
  rc=$?

  if [[ $rc -ne 0 ]]; then
    failcase "resolve_next_bin exited $rc for a freshly hard-linked worktree"
    return
  fi
  if [[ "$resolved" != "$wt"/* ]]; then
    failcase "resolved path '$resolved' is not inside the worktree '$wt' (this is the doubled-path defect shape)"
    return
  fi
  if [[ ! -f "$resolved" ]]; then
    failcase "resolved path '$resolved' does not exist"
    return
  fi

  local node_bin output expected_dir
  node_bin="$(command -v node || true)"
  if [[ -z "$node_bin" ]]; then
    failcase "no 'node' on PATH to execute the resolved binary with"
    return
  fi
  output="$("$node_bin" "$resolved")"
  expected_dir="$wt/node_modules/next/dist/bin"
  if [[ "$output" != "MARKER:$expected_dir" ]]; then
    failcase "executing the resolved binary printed '$output', expected 'MARKER:$expected_dir' (the WORKTREE's own copy)"
    return
  fi
  pass "resolve_next_bin: names and runs the worktree's own next entry point, unaffected by the broken .bin/next shim also present"
}

# --- resolve_next_bin() fails cleanly with no node_modules -----------------
case_missing() {
  local wt="$WORK/missing"
  mkdir -p "$wt"
  REPO_ROOT="$wt"
  if resolve_next_bin >/dev/null 2>&1; then
    failcase "resolve_next_bin succeeded with no node_modules present at all"
    return
  fi
  pass "resolve_next_bin: fails (non-zero) when node_modules/next/dist/bin/next is absent"
}

case_worktree_depth
case_missing

if [[ "$FAILURES" -gt 0 ]]; then
  printf '[test] %d case(s) failed\n' "$FAILURES" >&2
  exit 1
fi
printf '[test] all cases passed\n'
