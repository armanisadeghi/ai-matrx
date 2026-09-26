#!/usr/bin/env zsh
# scripts/lib/lease.sh — THE ONE SHARED SHELL HELPER for campaign_watch.build_lock leases.
# ══════════════════════════════════════════════════════════════════════════════════════════
#
# THE DEFECT THIS CLOSES (lane LEASE-HELPER, chaired by the Unified Data System program,
# 2026-09-23). `scripts/lib/build-lock.ts` is the ONE TypeScript take/renew/release path, and
# `scripts/night/lib-night.sh` carries a zsh copy of the same four SQL calls for unattended
# night jobs. Neither is reachable from an ordinary interactive shell command, so a lane
# reaching for a lock outside those two call sites has always had to write its own SQL — and
# on 2026-09-22 one lane did exactly that: an ad-hoc query read a column named `status`
# instead of `outcome`, always fell through to "not held", and the lane applied to the branch
# TWICE with no lease at all. Nothing stopped it, because there was nothing to reuse.
#
# This file is that reusable thing: a zsh script any lane can `source` or `execute` directly,
# built on the SAME FOUR DATABASE FUNCTIONS as build-lock.ts and lib-night.sh
# (`campaign_watch.lock_take` / `lock_renew` / `lock_release` / `build_lock_status`) — the SQL
# is written once, in the database; this file only calls it.
#
# CREDENTIALS: never on a command line, never in argv. This file sources
# `scripts/night/lib-night.sh` for its pgpass machinery — `night_lock_dsn` (the clone) writes the
# password into a per-process 0600 pgpass file and hands back a DSN with NO password in it,
# exactly the way every other lock caller on this database already works. There is no second
# way to get a password into a connection here.
#
# THE LOCK ROW LIVES ON THE DEV CLONE (lane DB-TOOLS-NO-BRANCH, 2026-09-25). It lived on the
# rehearsal branch until that branch was deleted (2026-09-26 00:30Z); this helper then refused
# every take. `pnpm db:rehearse` and `scripts/night/lib-night.sh` (`night_lock_dsn`) take their
# rows on the clone too. This file does not take a --target; there is one place a row is checked.
#
# USAGE
#   scripts/lib/lease.sh take    <lock> <lane> <note>
#   scripts/lib/lease.sh renew   <lock> <lane>
#   scripts/lib/lease.sh release <lock> <lane>
#   scripts/lib/lease.sh with <lock> [<lock> ...] -- <command...>
#   scripts/lib/lease.sh --self-test
#
# `take` proceeds (exit 0) ONLY when `campaign_watch.lock_take` answers exactly `taken` — an
# `evicted` or `renewed` outcome is still printed (the database's own sentence) but exits 1,
# same as `held` or any error, because this helper's contract is a clean take or nothing; a
# lane that wants eviction or renewal semantics uses build-lock.ts / lib-night.sh directly.
#
# `renew` and `release` expect the database to answer exactly `t` (boolean true) — anything
# else is announced and exits 1; a renew or release that matched nothing is news, never noise.
#
# `with <lock...> -- <command...>` takes every listed lock (all-or-nothing: if any take after
# the first fails, every lock already taken by THIS invocation is released before returning),
# starts a background renewer that renews every five minutes (a third of the 15-minute lease,
# same cadence as lib-night.sh's heartbeat), runs the command, and releases every lock on EVERY
# exit path — success, failure, or signal — via an EXIT trap.
#
# ══════════════════════════════════════════════════════════════════════════════════════════

set -u
emulate -L zsh

LEASE_SELF="${0:A}"
LEASE_DIR="${LEASE_SELF:h}"

# Reuse the night-job library for psql resolution and the pgpass-backed clone DSN — the same
# credential path every other lock caller on this database already uses. Sourcing it is safe
# from an interactive shell: it sets up its own per-process pgpass dir and never touches a
# launchd plist unless night_self_destruct is called, which this file never calls.
source "$LEASE_DIR/../night/lib-night.sh" || {
  print -u2 -r -- "REFUSED: could not source scripts/night/lib-night.sh — lease.sh has no credential path without it."
  return 78 2>/dev/null || exit 78
}

night_resolve_psql || { return 78 2>/dev/null || exit 78; }

LEASE_DSN=""
lease_dsn() {
  [ -n "$LEASE_DSN" ] && { print -r -- "$LEASE_DSN"; return 0; }
  LEASE_DSN="$(night_lock_dsn)" || {
    print -u2 -r -- "REFUSED: could not assemble the dev clone's connection (CLONE_DATABASE_URL, or CLONE-REF + its password file) — the lock row lives on the clone."
    return 78
  }
  print -r -- "$LEASE_DSN"
}

# ── take ──────────────────────────────────────────────────────────────────────────────────
# lease_take <lock> <lane> <note> — exits 0 ONLY on outcome == taken.
lease_take() {
  local lock="$1" lane="$2" note="${3:-}" dsn row outcome message
  if [ -z "$lock" ] || [ -z "$lane" ]; then
    print -u2 -r -- "REFUSED: take needs <lock> <lane> [note]."
    return 78
  fi
  dsn="$(lease_dsn)" || return 78
  row="$("$PSQL" "$dsn" -qAt -F'|' -v ON_ERROR_STOP=1 -c \
    "select outcome, message from campaign_watch.lock_take($(_lease_q "$lock"), $(_lease_q "$lane"), $(_lease_q_null "$note"))" 2>&1)"
  if [ $? -ne 0 ]; then
    print -u2 -r -- "REFUSED: campaign_watch.lock_take errored — ${row:-(no output)}."
    print -u2 -r -- "  If this is 42883/42703, the lease migration has not landed on this database:"
    print -u2 -r -- "  pnpm db:apply migrations/campaign/lockhyg_a_lock_row_carries_a_lease.sql --source campaign --target clone --lane <LANE>"
    return 78
  fi
  outcome="${row%%|*}"
  message="${row#*|}"
  print -r -- "$message"
  if [ "$outcome" = "taken" ]; then
    return 0
  fi
  print -u2 -r -- "REFUSED: lock '$lock' was not cleanly taken (outcome: $outcome). Exiting 1."
  return 1
}

# ── renew ─────────────────────────────────────────────────────────────────────────────────
lease_renew() {
  local lock="$1" lane="$2" dsn out
  if [ -z "$lock" ] || [ -z "$lane" ]; then
    print -u2 -r -- "REFUSED: renew needs <lock> <lane>."
    return 78
  fi
  dsn="$(lease_dsn)" || return 78
  out="$("$PSQL" "$dsn" -qAt -v ON_ERROR_STOP=1 -c \
    "select campaign_watch.lock_renew($(_lease_q "$lock"), $(_lease_q "$lane"))" 2>&1)"
  if [ "$out" = "t" ]; then
    print -r -- "lease renewed: $lock / $lane"
    return 0
  fi
  print -u2 -r -- "REFUSED: renew answered '${out:-(nothing)}' — $lane is NOT the current holder of '$lock'. Exiting 1."
  return 1
}

# ── release ───────────────────────────────────────────────────────────────────────────────
lease_release() {
  local lock="$1" lane="$2" dsn out
  if [ -z "$lock" ] || [ -z "$lane" ]; then
    print -u2 -r -- "REFUSED: release needs <lock> <lane>."
    return 78
  fi
  dsn="$(lease_dsn)" || return 78
  out="$("$PSQL" "$dsn" -qAt -v ON_ERROR_STOP=1 -c \
    "select campaign_watch.lock_release($(_lease_q "$lock"), $(_lease_q "$lane"))" 2>&1)"
  if [ "$out" = "t" ]; then
    print -r -- "lease released: $lock / $lane"
    return 0
  fi
  print -u2 -r -- "REFUSED: release answered '${out:-(nothing)}' — $lane was NOT the holder of '$lock'. Exiting 1."
  return 1
}

# ── quoting helpers (single-quoted SQL literals; NULL stays NULL) ───────────────────────────
_lease_q() { print -r -- "'${1//\'/\'\'}'"; }
_lease_q_null() { [ -z "${1:-}" ] && print -r -- "null" || _lease_q "$1"; }

# ── with <lock...> -- <command...> ───────────────────────────────────────────────────────────
lease_with() {
  local -a locks; locks=()
  while [ $# -gt 0 ] && [ "$1" != "--" ]; do locks+=("$1"); shift; done
  if [ "${1:-}" != "--" ]; then
    print -u2 -r -- "REFUSED: 'with' needs <lock...> -- <command...>."
    return 78
  fi
  shift
  if [ $# -eq 0 ]; then
    print -u2 -r -- "REFUSED: 'with' needs a command after --."
    return 78
  fi
  if [ ${#locks[@]} -eq 0 ]; then
    print -u2 -r -- "REFUSED: 'with' needs at least one lock name."
    return 78
  fi
  local lane="${LEASE_LANE:-${MATRX_LANE:-}}"
  local note="${LEASE_NOTE:-lease.sh with}"
  if [ -z "$lane" ]; then
    print -u2 -r -- "REFUSED: 'with' needs a lane — set LEASE_LANE (or MATRX_LANE)."
    return 78
  fi

  local -a taken; taken=()
  local lock heartbeat_pid=""

  _lease_with_release_all() {
    if [ -n "$heartbeat_pid" ]; then
      kill "$heartbeat_pid" 2>/dev/null
      wait "$heartbeat_pid" 2>/dev/null
      heartbeat_pid=""
    fi
    local l
    for l in "${taken[@]}"; do
      lease_release "$l" "$lane" || true
    done
    taken=()
  }
  trap '_lease_with_release_all' EXIT INT TERM

  for lock in "${locks[@]}"; do
    if ! lease_take "$lock" "$lane" "$note"; then
      print -u2 -r -- "REFUSED: could not take every lock 'with' needs; releasing what it already has."
      _lease_with_release_all
      trap - EXIT INT TERM
      return 75
    fi
    taken+=("$lock")
  done
  print -r -- "locks held: ${taken[*]} / $lane — running: $*"

  # A renewer every five minutes — a third of the 15-minute lease, same cadence lib-night.sh
  # uses — so two consecutive missed renews (a pooler hiccup) still leave the lease live.
  (
    while sleep "${LEASE_BEAT_SECONDS:-300}"; do
      for l in "${taken[@]}"; do
        lease_renew "$l" "$lane" >/dev/null 2>&1 || true
      done
    done
  ) &
  heartbeat_pid=$!

  "$@"
  local rc=$?

  _lease_with_release_all
  trap - EXIT INT TERM
  return $rc
}

# ── self-test ────────────────────────────────────────────────────────────────────────────
lease_self_test() {
  local dsn lock="lease_selftest_$$" other="OTHER-LANE-$$" self="SELF-LANE-$$"
  dsn="$(lease_dsn)" || return 78
  local failures=0

  print -r -- "── lease.sh self-test — lock '$lock' ──"

  # Make sure nothing of this name is lying around from a previous crashed run.
  "$PSQL" "$dsn" -qAt -c "delete from campaign_watch.build_lock where lock_name = $(_lease_q "$lock")" >/dev/null 2>&1

  print -r -- "1) planting a HELD lock under another lane ($other)…"
  if ! lease_take "$lock" "$other" "self-test plant"; then
    print -u2 -r -- "   UNEXPECTED: planting the lock itself failed."
    failures=$((failures + 1))
  fi

  print -r -- "2) take as a DIFFERENT lane ($self) must REFUSE and exit 1…"
  if lease_take "$lock" "$self" "self-test intruder"; then
    print -u2 -r -- "   RED: take succeeded against a live foreign holder — THIS IS THE DEFECT."
    failures=$((failures + 1))
  else
    print -r -- "   GREEN: take refused (exit 1), as required."
  fi

  print -r -- "3) cleaning up the planted lock ($other)…"
  lease_release "$lock" "$other" >/dev/null || {
    print -u2 -r -- "   UNEXPECTED: could not release the planted lock."
    failures=$((failures + 1))
  }

  print -r -- "4) happy path: take then release as $self…"
  if ! lease_take "$lock" "$self" "self-test happy path"; then
    print -u2 -r -- "   RED: happy-path take failed."
    failures=$((failures + 1))
  fi
  if ! lease_release "$lock" "$self" >/dev/null; then
    print -u2 -r -- "   RED: happy-path release failed."
    failures=$((failures + 1))
  fi

  print -r -- "5) verifying zero rows remain for '$lock'…"
  local left
  left="$("$PSQL" "$dsn" -qAt -c "select count(*) from campaign_watch.build_lock where lock_name = $(_lease_q "$lock")" 2>&1)"
  if [ "$left" = "0" ]; then
    print -r -- "   GREEN: 0 rows left."
  else
    print -u2 -r -- "   RED: $left row(s) left for '$lock'."
    failures=$((failures + 1))
  fi

  print -r -- ""
  if [ "$failures" -eq 0 ]; then
    print -r -- "✓ lease.sh self-test PASSED"
    return 0
  fi
  print -u2 -r -- "✗ lease.sh self-test FAILED ($failures problem(s))"
  return 1
}

# ── dispatch ─────────────────────────────────────────────────────────────────────────────
# Runs for BOTH `source scripts/lib/lease.sh take ...` and `zsh scripts/lib/lease.sh take ...`
# (`$@` carries the verb either way in zsh). Sourcing with NO arguments — the normal way another
# script pulls in the functions (lease_take / lease_renew / lease_release / lease_with) to call
# them itself — dispatches nothing.
if [ $# -gt 0 ]; then
  case "$1" in
    take)    shift; lease_take "$@"; return $? 2>/dev/null || exit $? ;;
    renew)   shift; lease_renew "$@"; return $? 2>/dev/null || exit $? ;;
    release) shift; lease_release "$@"; return $? 2>/dev/null || exit $? ;;
    with)    shift; lease_with "$@"; return $? 2>/dev/null || exit $? ;;
    --self-test) lease_self_test; return $? 2>/dev/null || exit $? ;;
    *)
      print -u2 -r -- "REFUSED: unknown verb '${1}'. Known: take, renew, release, with, --self-test."
      return 78 2>/dev/null || exit 78 ;;
  esac
fi
