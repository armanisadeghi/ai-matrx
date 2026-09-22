#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# NIGHT-SWEEP — ONE SHOT, 2026-09-22, 01:20 America/Los_Angeles.
#
# WHAT IT DOES: applies `migrations/campaign/redsuites2_a_new_organizations_first_migration_verb.sql`
# to the MAIN (production) database. That file builds `(entity_type, organization_id, id desc)` on
# `history.row_versions` — 7,095 MB across 29 partitions — so that a brand-new organization's FIRST
# Migration verb stops scanning the whole table to answer "this org has no history yet".
#
# WHY IT IS SAFE IN A LIVE WINDOW: all 29 data-building statements are CREATE INDEX CONCURRENTLY,
# which never locks a partition against writers. The one non-concurrent statement is
# `create index if not exists history.rv_org_latest_idx on only history.row_versions`, which builds
# NOTHING (a partitioned parent index is catalog-only) and holds its ShareLock for milliseconds.
# The 29 `alter index ... attach partition` statements are catalog updates.
#
# WHY IT IS NOT `pnpm db:apply`: that runner refuses a CONCURRENTLY/autocommit file BY NAME. The
# only path for an autocommit file is aidream's runner, one statement at a time, which is what the
# migration's own header prescribes.
#
# WHY IT IS A LAUNCHD ONE-SHOT: the session that wrote it will not survive until 01:20. This script
# removes its own launchd plist on every exit path, so it can never fire twice.
#
# RUNNING IT BY HAND OUTSIDE THE WINDOW: NIGHT_SWEEP_FORCE=1 (say why in the log).
# ─────────────────────────────────────────────────────────────────────────────
set -u
setopt ERR_RETURN 2>/dev/null || true

LABEL="com.aimatrx.night-sweep.row-versions-index"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
FRONTEND=/Users/armanisadeghi/code/matrx-frontend
AIDREAM=/Users/armanisadeghi/code/aidream
LOG=/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20/night-2026-09-22.log
MIG=redsuites2_a_new_organizations_first_migration_verb.sql
LANE=NIGHT-SWEEP
LOCK=history

exec >>"$LOG" 2>&1
say() { print -r -- "[$(date -u +%FT%TZ)] $*"; }

say "─────────── NIGHT-SWEEP one-shot starting (pid $$) ───────────"
say "migration: $MIG   lane: $LANE   lock: $LOCK   target: production"

PSQL="${PSQL:-}"
[ -n "$PSQL" ] || PSQL=/opt/homebrew/opt/libpq/bin/psql
[ -x "$PSQL" ] || PSQL=/opt/homebrew/opt/postgresql@17/bin/psql
if [ ! -x "$PSQL" ]; then say "REFUSED: no psql binary found; nothing attempted."; exit 78; fi
say "psql: $PSQL"

# THE WINDOW. Arman, 2026-09-21: routine and big runs only between 1 and 4 AM Pacific. This job
# gives itself until 03:30 so a long CONCURRENTLY build still finishes inside the window.
HHMM=$(TZ=America/Los_Angeles date +%H%M)
TODAY=$(TZ=America/Los_Angeles date +%F)
if [ "${NIGHT_SWEEP_FORCE:-0}" != "1" ] && { [ "$HHMM" -lt 0100 ] || [ "$HHMM" -gt 0330 ]; }; then
  say "REFUSED: local Pacific time is $TODAY $HHMM, outside 01:00–03:30. Nothing attempted."
  exit 75
fi
say "window ok: Pacific $TODAY $HHMM"

BRANCH_DSN="$(grep -m1 '^SUPABASE_BRANCH_DATABASE_URL=' "$FRONTEND/.env.local" | cut -d= -f2- | tr -d '"')"
if [ -z "$BRANCH_DSN" ]; then say "REFUSED: no SUPABASE_BRANCH_DATABASE_URL; nothing attempted."; exit 78; fi

self_destruct() {
  # Unload and remove the plist so this can NEVER fire twice, whatever happened above.
  if [ -f "$PLIST" ]; then
    launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || launchctl unload "$PLIST" >/dev/null 2>&1 || true
    /bin/rm -f "$HOME/Library/LaunchAgents/${LABEL}.plist" && say "plist unloaded and removed: $PLIST"
  else
    say "plist already gone: $PLIST"
  fi
}

release_lock() {
  local out
  out="$("$PSQL" "$BRANCH_DSN" -qAt -c \
    "delete from campaign_watch.build_lock where lock_name = '$LOCK' and held_by = '$LANE' returning held_by" 2>&1)"
  if [ "$out" = "$LANE" ]; then say "lock released: $LOCK / $LANE"; else say "lock release returned: ${out:-(0 rows — not the holder)}"; fi
}

cleanup() {
  local rc=$?
  say "cleanup (exit $rc)"
  [ "${LOCK_TAKEN:-0}" = "1" ] && release_lock
  self_destruct
  say "─────────── NIGHT-SWEEP one-shot finished, exit $rc ───────────"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# TAKE the lock. A second lane gets 0 rows and never waits.
LOCK_TAKEN=0
TAKE="$("$PSQL" "$BRANCH_DSN" -qAt -c \
  "insert into campaign_watch.build_lock (lock_name, held_by, note) values ('$LOCK', '$LANE', 'row_versions org-latest index, 2026-09-22 window') on conflict (lock_name) do nothing returning held_by" 2>&1)"
if [ "$TAKE" != "$LANE" ]; then
  HOLDER="$("$PSQL" "$BRANCH_DSN" -qAt -c "select held_by||' since '||taken_at from campaign_watch.build_lock where lock_name='$LOCK'" 2>&1)"
  say "REFUSED: could not take lock '$LOCK' — held by ${HOLDER:-unknown}. Nothing applied."
  exit 75
fi
LOCK_TAKEN=1
say "lock taken: $LOCK / $LANE"

# The ceiling: no single statement may run longer than two hours.
export PGOPTIONS='-c statement_timeout=7200000 -c lock_timeout=10000'
say "PGOPTIONS: $PGOPTIONS"

cd "$AIDREAM" || exit 78
say "running: uv run python db/apply_migrations.py --source campaign --only $MIG --target production --lane $LANE --confirm-chair-step $MIG --no-generate"
uv run python db/apply_migrations.py \
  --source campaign \
  --only "$MIG" \
  --target production \
  --lane "$LANE" \
  --confirm-chair-step "$MIG" \
  --no-generate
RC=$?
say "runner exit: $RC"

if [ $RC -eq 0 ]; then
  say "verifying on production …"
  U="$(grep -m1 '^SUPABASE_MATRIX_USER=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  H="$(grep -m1 '^SUPABASE_MATRIX_HOST=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  PP="$(grep -m1 '^SUPABASE_MATRIX_PORT=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  N="$(grep -m1 '^SUPABASE_MATRIX_DATABASE_NAME=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  export PGPASSWORD="$(grep -m1 '^SUPABASE_MATRIX_PASSWORD=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  "$PSQL" -h "$H" -p "$PP" -U "$U" -d "$N" -At \
    -c "select 'partition indexes built: '||count(*) from pg_indexes where schemaname='history' and indexname like 'row_versions%_org_latest_idx'" \
    -c "select 'parent index valid: '||i.indisvalid from pg_class c join pg_index i on i.indexrelid=c.oid join pg_namespace n on n.oid=c.relnamespace where n.nspname='history' and c.relname='rv_org_latest_idx'" \
    -c "select 'ledger: '||source||' '||filename||' '||applied_at from public._schema_migrations where filename = '$MIG'"
  unset PGPASSWORD
fi
exit $RC
