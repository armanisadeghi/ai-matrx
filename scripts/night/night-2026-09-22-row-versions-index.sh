#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# NIGHT-SWEEP — ONE SHOT, 2026-09-22, 01:20 America/Los_Angeles.
#
# 🚨 STATUS: SPENT, AND IT IS THE REASON lib-night.sh EXISTS.
# This job applied `redsuites2_a_new_organizations_first_migration_verb.sql` to the MAIN database
# — 82.08 s, 29 valid partition indexes, parent valid with 29 attached, zero blocked backends,
# ledgered 2026-09-22 00:19:57Z — but it ran at 17:19 Pacific, eight hours OUTSIDE the window,
# because its first cut carried `NIGHT_SWEEP_FORCE=1`: a switch that removed the window guard and
# ran the real thing. It was used to exercise an unrelated gate and it did the whole job.
#
# THAT SWITCH IS GONE, HERE AND EVERYWHERE. The only override is `NIGHT_REHEARSE=1`, which does
# not remove the window — it changes the DATABASE to the rehearsal branch and refuses a
# production connection string outright (the server is asked for its own system_identifier).
# The rule and the incident live once, at the top of `lib-night.sh`.
#
# The file is kept as the record and as the worked example the README points at. Re-running it
# now is a no-op: the migration is ledgered, and the runner will say so.
# ─────────────────────────────────────────────────────────────────────────────
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

LABEL="com.aimatrx.night-sweep.row-versions-index"
LANE=NIGHT-SWEEP
LOCK=history
MIG=redsuites2_a_new_organizations_first_migration_verb.sql
INVERSE="$FRONTEND/migrations/inverse/redsuites2_a_new_organizations_first_migration_verb_down.sql"
# The EXACT inverse proven on the branch under rule 27 — up -> inverse -> up, three real runs
# verified by pg_indexes: 29+1 valid -> 0 -> 29+1 valid. An unproven inverse may never
# accompany an index build on the live database.
INVERSE_SHA_PROVEN=d3c939651008797af477c5de1c938181459277405127952a4cc1587263c83af9
LOG=/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20/night-2026-09-22.log
OPEN=0100 CLOSE=0330

[ "$REHEARSE" = "1" ] && LOG="${LOG%.log}-rehearsal.log"
exec >>"$LOG" 2>&1

say "─────────── NIGHT-SWEEP row_versions index starting (pid $$)$([ "$REHEARSE" = 1 ] && print -n ' REHEARSAL') ───────────"
say "migration: $MIG   lane: $LANE   lock: $LOCK"

night_resolve_psql || exit $?
night_window_guard $OPEN $CLOSE || exit $?
night_inverse_gate "$INVERSE" "$INVERSE_SHA_PROVEN" || exit $?

if [ "$REHEARSE" = "1" ]; then
  TARGET=branch
  night_assert_target branch "$(night_branch_dsn)" || exit $?
else
  TARGET=production
  U="$(grep -m1 '^SUPABASE_MATRIX_USER=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  H="$(grep -m1 '^SUPABASE_MATRIX_HOST=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  PT="$(grep -m1 '^SUPABASE_MATRIX_PORT=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  N="$(grep -m1 '^SUPABASE_MATRIX_DATABASE_NAME=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  PW="$(grep -m1 '^SUPABASE_MATRIX_PASSWORD=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  [ -n "$PW" ] && night_pgpass_add "$H" "$PT" "$U" "$PW"
  night_assert_target production -h "$H" -p "$PT" -U "$U" -d "$N" || exit $?
  PW=""
fi

cleanup() {
  local rc=$?
  say "cleanup (exit $rc)"
  night_release_lock
  night_self_destruct "$LABEL"
  say "─────────── NIGHT-SWEEP row_versions index finished, exit $rc ───────────"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

night_take_lock "$LOCK" "$LANE" 'row_versions org-latest index, 2026-09-22 window' || exit $?

# No single statement may run longer than two hours.
export PGOPTIONS='-c statement_timeout=7200000 -c lock_timeout=10000'
say "PGOPTIONS: $PGOPTIONS"

cd "$AIDREAM" || exit 78
say "running: uv run python db/apply_migrations.py --source campaign --only $MIG --target $TARGET --lane $LANE --confirm-chair-step $MIG --no-generate"
uv run python db/apply_migrations.py \
  --source campaign --only "$MIG" --target "$TARGET" --lane "$LANE" \
  --confirm-chair-step "$MIG" --no-generate
RC=$?
say "runner exit: $RC"
exit $RC
