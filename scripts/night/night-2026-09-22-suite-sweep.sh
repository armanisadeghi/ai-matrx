#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# NIGHT-SWEEP — ONE SHOT, 2026-09-22, 01:35 America/Los_Angeles.
#
# THE ONE THING STILL HELD FOR A WINDOW: the serial sweep of every campaign suite against the
# MAIN database. RED-SUITES-2 held it (a sweep of ~190 suites against the live instance is
# routine and big, Arman 2026-09-21), and tonight's branch run proved WHY it cannot be answered
# anywhere else: 94 of 191 suites refuse the branch by their own guard and 73 more die on branch
# drift, so only 4 ever reached a clause.
#
# 🚨 IT RUNS NOTHING BUT SUITES. No migration, no DDL of its own, no runner. Every suite file
# governs its own transaction and ends in its own ROLLBACK or COMMIT, exactly as when a person
# runs one by hand. This script opens one psql per suite and reads the output.
#
# HOW IT JUDGES: BY THE OUTPUT TEXT, NEVER BY THE EXIT CODE. psql exits 0 after a lock-timeout
# death, so an exit code is not evidence. A suite PASSes only when no ERROR/FATAL line appears.
#
# THE HARD STOP: it stops starting new suites at 03:30 Pacific and lists the remainder as
# NOT-RUN by name. A sweep that runs past the window is the thing the window exists to prevent.
#
# REHEARSAL: NIGHT_REHEARSE=1 runs it against the REHEARSAL BRANCH and refuses to accept a
# production connection string (lib-night.sh asks the server for its own system_identifier).
# There is deliberately NO switch that removes the window and runs the real thing — see the
# incident note at the top of lib-night.sh.
# ─────────────────────────────────────────────────────────────────────────────
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

LABEL="com.aimatrx.night-sweep.suite-sweep"
LANE=NIGHT-SWEEP
HANDOFF=/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20
LOG="$HANDOFF/night-2026-09-22-suites.log"
SUITES="$FRONTEND/scripts/campaign-tests"
OPEN=0135 CLOSE=0330
PER_SUITE_CAP=240          # seconds of wall clock any single suite may take
STOP_STARTING_AT=0330      # Pacific HHMM after which no new suite is started

[ "$REHEARSE" = "1" ] && LOG="${LOG%.log}-rehearsal.log"
exec >>"$LOG" 2>&1

say "─────────── NIGHT-SWEEP suite sweep starting (pid $$)${REHEARSE:+ }$([ "$REHEARSE" = 1 ] && print -n 'REHEARSAL') ───────────"

night_resolve_psql || exit $?
night_window_guard $OPEN $CLOSE || exit $?

# THE TARGET. A rehearsal may only ever reach the branch; the live run must be production.
if [ "$REHEARSE" = "1" ]; then
  DSN="$(night_branch_dsn)"
  [ -n "$DSN" ] || { say "REFUSED: no SUPABASE_BRANCH_DATABASE_URL. Nothing attempted."; exit 78; }
  PGA=("$DSN")
  night_assert_target branch "${PGA[@]}" || exit $?
else
  U="$(grep -m1 '^SUPABASE_MATRIX_USER=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  H="$(grep -m1 '^SUPABASE_MATRIX_HOST=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  PT="$(grep -m1 '^SUPABASE_MATRIX_PORT=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  N="$(grep -m1 '^SUPABASE_MATRIX_DATABASE_NAME=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  export PGPASSWORD="$(grep -m1 '^SUPABASE_MATRIX_PASSWORD=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  if [ -z "$H" ] || [ -z "$PGPASSWORD" ]; then say "REFUSED: the five SUPABASE_MATRIX_* values are not all present. Nothing attempted."; exit 78; fi
  PGA=(-h "$H" -p "$PT" -U "$U" -d "$N")
  night_assert_target production "${PGA[@]}" || exit $?
fi

cleanup() {
  local rc=$?
  say "cleanup (exit $rc)"
  night_release_lock
  night_self_destruct "$LABEL"
  say "─────────── NIGHT-SWEEP suite sweep finished, exit $rc ───────────"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

night_take_lock suites "$LANE" 'the serial campaign suite sweep, 2026-09-22 window' || exit $?

# A suite may not outlive a person's patience: 60s statements, 10s lock waits, as AUTH-504's
# ceilings already write into every suite file. This is the belt to that file's braces.
export PGOPTIONS='-c statement_timeout=60000 -c lock_timeout=10000'
say "PGOPTIONS: $PGOPTIONS"

cd "$FRONTEND" || exit 78
TSV="${LOG%.log}.tsv"
: > "$TSV"
TOTAL=0 RAN=0 PASS=0 FAIL=0 SKIPPED=0
typeset -a FILES NOTRUN
FILES=("${(@f)$(ls "$SUITES"/*.sql | grep -v '/_')}")
TOTAL=${#FILES[@]}
say "suites found: $TOTAL (the two _-prefixed fixtures are excluded; they exist to be \\i-included)"

for f in "${FILES[@]}"; do
  b="${f:t}"
  if [ "$(TZ=America/Los_Angeles date +%H%M)" -gt "$STOP_STARTING_AT" ] && [ "$REHEARSE" != "1" ]; then
    NOTRUN+=("$b"); SKIPPED=$((SKIPPED+1)); continue
  fi
  out="$(mktemp)"
  start=$(date +%s)
  timeout $PER_SUITE_CAP "$PSQL" "${PGA[@]}" -v ON_ERROR_STOP=1 -f "$f" > "$out" 2>&1
  rc=$?
  dur=$(( $(date +%s) - start ))
  RAN=$((RAN+1))
  if [ $rc -eq 124 ]; then
    verdict=TIMEOUT; sentence="killed at the ${PER_SUITE_CAP}s wall-clock cap"
  else
    line="$(grep -m1 -E 'ERROR:|FATAL:' "$out")"
    if [ -n "$line" ]; then verdict=FAIL; sentence="${line#psql:*: }"
    else verdict=PASS; sentence=""; fi
  fi
  [ "$verdict" = PASS ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
  printf '%s\t%s\t%ss\t%s\n' "$b" "$verdict" "$dur" "$(print -r -- "$sentence" | tr '\t\n' '  ' | cut -c1-260)" >> "$TSV"
  say "$(printf '%-52s %-8s %4ss  %s' "$b" "$verdict" "$dur" "$(print -r -- "$sentence" | cut -c1-110)")"
done

say "───────── SWEEP RESULT ─────────"
say "found $TOTAL · ran $RAN · PASS $PASS · FAIL $FAIL · NOT-RUN (hard stop at $STOP_STARTING_AT PT) $SKIPPED"
if [ $SKIPPED -gt 0 ]; then
  say "NOT-RUN, by name:"
  for b in "${NOTRUN[@]}"; do say "  $b"; done
fi
say "per-suite table: $TSV"
exit 0
