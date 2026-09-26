#!/usr/bin/env zsh
# night-no-branch-census.sh — NO NIGHT JOB MAY STILL REQUIRE THE DELETED REHEARSAL BRANCH.
#
# 🚨 lane DB-TOOLS-NO-BRANCH, 2026-09-25. The rehearsal branch was deleted 2026-09-26 00:30Z.
# Every lock take in lib-night.sh and scripts/lib/lease.sh still read SUPABASE_BRANCH_DATABASE_URL,
# so every locking night job refused; two dated one-shots rehearsed only on the branch; body-drift
# offered `--target branch`. PROVISION-BATCH-FIX fixed one path (39ab7d7a2c) and the rest stayed.
# This census names every line that still ASKS for the branch:
#   night_branch_dsn · SUPABASE_BRANCH_DATABASE_URL · night_assert_target branch · night_target_dsn branch
# Exempt, by rule and not by list: comment lines; lib-night.sh's own refusing definitions; and a
# job RETIRED in its own bytes (a `say "RETIRED:` line followed by `exit 78`), whose later lines
# never run.
#
#   zsh scripts/night/night-no-branch-census.sh              census the working tree (exit 1 on a hit)
#   zsh scripts/night/night-no-branch-census.sh --self-test  RED on HEAD~ copies from before the fix, GREEN on the tree
set -u
FRONTEND=/Users/armanisadeghi/code/matrx-frontend
PATTERN='night_branch_dsn|SUPABASE_BRANCH_DATABASE_URL|night_assert_target branch|night_target_dsn branch|branch_dsn\('

# census <root>  — root holds night/*.sh night/*.py lib/lease.sh; prints hits, returns 1 on any
census() {
  local root="$1" f hits=0 base out
  for f in "$root"/night/*.sh "$root"/night/*.py "$root"/lib/lease.sh; do
    [ -f "$f" ] || continue
    base="${f:t}"
    [ "$base" = night-no-branch-census.sh ] && continue
    if grep -qE '^say "RETIRED:' "$f" && grep -qE '^exit 78' "$f"; then continue; fi
    out="$(grep -nE "$PATTERN" "$f" | grep -vE '^[0-9]+:\s*#' \
      | { if [ "$base" = lib-night.sh ]; then grep -vE '^[0-9]+:(night_branch_dsn\(\) \{|\s*branch\) night_branch_dsn; return 78 ;;|\s*say "REFUSED: the rehearsal branch was deleted|\s*say "  Rehearse on the quarantined clone)'; else cat; fi; })"
    if [ -n "$out" ]; then
      local rel="${f:h:t}/${f:t}"
      print -r -- "$out" | while IFS= read -r l; do print -r -- "  $rel:$l"; done
      hits=$((hits + $(print -r -- "$out" | grep -c .)))
    fi
  done
  if [ $hits -gt 0 ]; then print -r -- "  $hits line(s) still require the deleted rehearsal branch"; return 1; fi
  print -r -- "  no night job requires the rehearsal branch"
  return 0
}

if [ "${1:-}" = "--self-test" ]; then
  S="$(mktemp -d "${TMPDIR:-/tmp}/night-no-branch.XXXXXX")"
  trap '/bin/rm -rf -- "$S"' EXIT
  # RED: the tree as it stood before this lane (39ab7d7a2c had fixed only the assert path).
  REV=39ab7d7a2c
  mkdir -p "$S/red/night" "$S/red/lib"
  for f in "$FRONTEND"/scripts/night/*.sh "$FRONTEND"/scripts/night/*.py; do
    git -C "$FRONTEND" show "${REV}:scripts/night/${f:t}" > "$S/red/night/${f:t}" 2>/dev/null || rm -f "$S/red/night/${f:t}"
  done
  git -C "$FRONTEND" show "${REV}:scripts/lib/lease.sh" > "$S/red/lib/lease.sh"
  print -r -- "RED — the night scripts at $REV must be caught:"
  if census "$S/red"; then print -r -- "RED FAILED: the census passed the pre-fix tree"; exit 1; fi
  print -r -- "RED ok"
  print -r -- "GREEN — the working tree:"
  census "$FRONTEND/scripts" || { print -r -- "GREEN FAILED"; exit 1; }
  print -r -- "GREEN ok"
  print -r -- "night-no-branch census self-test PASSED"
  exit 0
fi
census "$FRONTEND/scripts"
