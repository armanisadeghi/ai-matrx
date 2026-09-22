#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# THE SERIAL CAMPAIGN-SUITE SWEEP, AGAINST THE NIGHTLY DEV CLONE — AND NOTHING ELSE.
#
# WHY THIS FILE EXISTS. The one-shot `night-2026-09-22-suite-sweep.sh` ran ~190 suites serially
# against PRODUCTION. It was UNLOADED on Arman's word on 2026-09-21: a sweep of that size against
# the live instance is the class of Sunday night's lock incident. The way the suites come back is
# against the nightly clone — a full copy of production's data with cron, pg_net, wrappers and the
# platform scheduler quarantined, where a heavy job hurts nobody
# (common-docs/projects/database-workload-safety/DEV-CLONE-AND-BACKUP.md).
#
# 🚨 SO THIS SCRIPT HAS NO PRODUCTION MODE AND NO WAY TO ACQUIRE ONE. `night_assert_target clone`
# is the only target it ever asks for; a production connection string handed to it in any variable
# is refused before a single suite is opened, and so is the rehearsal branch. There is deliberately
# no `--target` flag, no override and no force switch — see the incident note at the top of
# lib-night.sh for what a "force" switch costs.
#
# 🚨 AND IT DOES NOT KEY ON `pg_control_system().system_identifier` ALONE. The clone is a physical
# restore and answers with PRODUCTION's identifier. The assertion compares the system identifier
# AND the project ref carried by the connection (`postgres.<ref>`), both read from the checked-in
# CLONE-REF. That pair is the only thing that can tell these two databases apart.
#
# NO WINDOW GUARD, ON PURPOSE. The maintenance window exists to keep heavy work off the live
# database; the whole point of the clone is that heavy work on it needs no window. It also takes no
# `campaign_watch.build_lock` — that lock governs the rehearsal branch, which this run never
# touches.
#
# IT RUNS NOTHING BUT SUITES. No migration, no DDL of its own, no runner. Every suite governs its
# own transaction and ends in its own ROLLBACK or COMMIT, exactly as when a person runs one by hand.
#
# HOW IT JUDGES: BY THE OUTPUT TEXT, NEVER BY THE EXIT CODE. psql exits 0 after a lock-timeout
# death. A suite PASSes only when no ERROR/FATAL line appears AND it did not SKIP — the preamble
# answers a missing dependency with `SKIPPED: … this is NOT a pass`, and scoring that as a pass is
# how 9 of 14 "passes" were counted on the branch on 2026-09-21.
#
#   ./scripts/night/clone-suite-sweep.sh [<log path>]
# ─────────────────────────────────────────────────────────────────────────────
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

LANE=CLONE-SUITES
HANDOFF=/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20
LOG="${1:-$HANDOFF/night-$(date -u +%F)-clone-suites.log}"
SUITES="$FRONTEND/scripts/campaign-tests"
PER_SUITE_CAP=180          # seconds of wall clock any single suite may take

exec >>"$LOG" 2>&1

say "─────────── $LANE serial suite sweep against the DEV CLONE (pid $$) ───────────"

night_resolve_psql || exit $?

DSN="$(night_clone_dsn)" || true
if [ -z "${DSN:-}" ]; then
  say "REFUSED: the dev clone's connection could not be assembled. Set CLONE_DATABASE_URL, or make"
  say "  sure common-docs/operations/clone/CLONE-REF names a readable password_file. Nothing attempted."
  exit 78
fi
night_assert_target clone "$DSN" || exit $?

# A suite may not outlive a person's patience: 60s statements, 10s lock waits.
export PGOPTIONS='-c statement_timeout=60000 -c lock_timeout=10000'
say "PGOPTIONS: $PGOPTIONS"

# 🚨 A CAPPED SUITE MUST NOT POISON THE NEXT ONE. `timeout` kills psql — the CLIENT. The server
# backend keeps running its statement and keeps every lock it holds, so the suites that follow die
# on `lock_timeout` and are scored FAIL for something they never did. Measured on the first clone
# sweep, 2026-09-22: one 180s cap was followed by EIGHT consecutive lock-timeout "failures", and all
# three re-run in isolation PASS. So every suite is tagged with its own application_name, and after a
# cap we terminate that backend on the server and wait for the lock table to clear before moving on.
sweep_reap() {  # sweep_reap <application_name>
  local n killed i
  killed="$("$PSQL" "$DSN" -qAt -c \
    "select count(*) from (select pg_terminate_backend(pid) from pg_stat_activity
       where application_name = '$1' and pid <> pg_backend_pid()) t" 2>&1)"
  say "  reaped server backends for $1: ${killed:-?}"
  for i in 1 2 3 4 5 6 7 8 9 10; do
    n="$("$PSQL" "$DSN" -qAt -c 'select count(*) from pg_locks where not granted' 2>&1)"
    [ "$n" = "0" ] && return 0
    sleep 2
  done
  say "  WARNING: the lock table still shows ${n:-?} ungranted locks; the next suites may be scored unfairly"
}

cd "$FRONTEND" || exit 78
TSV="${LOG%.log}.tsv"
: > "$TSV"
RAN=0 PASS=0 FAIL=0 SKIPPED_BY_SUITE=0 TIMEOUT=0
typeset -a FILES
FILES=("${(@f)$(ls "$SUITES"/*.sql | grep -v '/_')}")
TOTAL=${#FILES[@]}
say "suites found: $TOTAL (the _-prefixed files are excluded; they exist to be \\i-included)"

START=$(date +%s)
for f in "${FILES[@]}"; do
  b="${f:t}"
  out="$(mktemp)"
  start=$(date +%s)
  app="clone-sweep-$$-$b"
  # -v expect=clone makes every suite's own preamble assert the clone as well, so a suite can
  # never be talked onto another database by the connection it is handed.
  PGAPPNAME="$app" timeout $PER_SUITE_CAP "$PSQL" "$DSN" -v ON_ERROR_STOP=1 -v expect=clone -f "$f" > "$out" 2>&1
  rc=$?
  dur=$(( $(date +%s) - start ))
  RAN=$((RAN+1))
  if [ $rc -eq 124 ]; then
    verdict=TIMEOUT; sentence="killed at the ${PER_SUITE_CAP}s wall-clock cap"
    sweep_reap "$app"
  else
    line="$(grep -m1 -E 'ERROR:|FATAL:' "$out")"
    skipline="$(grep -m1 -E '^SKIPPED:' "$out")"
    if [ -n "$line" ]; then verdict=FAIL; sentence="${line#psql:*: }"
    elif [ -n "$skipline" ]; then verdict=SKIP; sentence="$skipline"
    else verdict=PASS; sentence=""; fi
  fi
  case "$verdict" in
    PASS)    PASS=$((PASS+1)) ;;
    SKIP)    SKIPPED_BY_SUITE=$((SKIPPED_BY_SUITE+1)) ;;
    TIMEOUT) TIMEOUT=$((TIMEOUT+1)); FAIL=$((FAIL+1)) ;;
    *)       FAIL=$((FAIL+1)) ;;
  esac
  printf '%s\t%s\t%ss\t%s\n' "$b" "$verdict" "$dur" "$(print -r -- "$sentence" | tr '\t\n' '  ' | cut -c1-260)" >> "$TSV"
  say "$(printf '%-52s %-8s %4ss  %s' "$b" "$verdict" "$dur" "$(print -r -- "$sentence" | cut -c1-110)")"
done

say "───────── SWEEP RESULT (DEV CLONE) ─────────"
say "found $TOTAL · ran $RAN · PASS $PASS · SKIP $SKIPPED_BY_SUITE (the suite said its dependency is absent — NOT a pass) · FAIL $FAIL (of which TIMEOUT $TIMEOUT)"
say "elapsed $(( ($(date +%s) - START) / 60 )) minutes"
say "per-suite table: $TSV"
exit 0
