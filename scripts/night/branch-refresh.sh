#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# BRANCH-REFRESH — the nightly rebuild of the rehearsal branch from production's SCHEMA
# and a small curated seed. NEVER from production's data.
#
# WHY IT EXISTS (lane BRANCH-DRIFT, 2026-09-21, v5/BRANCH-DRIFT.md)
# -----------------------------------------------------------------
# The rehearsal branch stopped being a copy of production on 2026-09-18, when the owner's
# ruling sent every lane straight to the main database. Four days later production held
# 2,521 objects the branch lacked, 1,711 columns, 630 restrictive policies against the
# branch's 212, and 167 feature-knob keys. A sweep of 191 campaign suites against the
# branch produced FOUR passes; 93 died on drift alone. Rule 27's "rehearse on the branch
# first" was not a weak signal there — it was no signal.
#
# THE RULING THIS JOB IMPLEMENTS, verbatim from BRANCH-DRIFT.md §4 option (c):
# refresh the branch every night from production's SCHEMA plus a ~9.7 MB curated seed of
# reference tables — never from production's data. A full logical copy is 57 GB, reads at
# 19 MB/s, takes 3–6 hours, needs a paid disk grow, and traps production's DDL behind an
# hours-long ACCESS SHARE queue. The schema-only dump is 19 MB and 6m49s, measured.
#
# THE SHAPE OF THE BLAST RADIUS, stated plainly:
#   · PRODUCTION IS READ AND NEVER WRITTEN. Every production statement in this file is a
#     SELECT, a COPY … TO STDOUT or a pg_dump. There is no write path to production in any
#     flag combination.
#   · THE BRANCH IS THE ONLY THING WRITTEN, and it is written DESTRUCTIVELY: the campaign
#     schemas are dropped and recreated from production's dump. That is deliberate — the
#     branch is disposable by design, and a differential that hand-patches 1,400 objects a
#     night is the thing W0-SYNC proved does not survive this rate of change.
#   · THE WINDOW EXISTS FOR THE PRODUCTION READ, not for the branch write. A schema-only
#     pg_dump takes ACCESS SHARE on every table; at 2 p.m. that queues any lane's
#     ALTER TABLE for up to seven minutes and every reader behind it. At 2 a.m. it costs
#     nothing. So the production half runs ONLY inside the window, under a
#     --lock-wait-timeout and a session statement_timeout, and ABORTS at ten minutes.
#
# 🚨 THERE IS NO FORCE SWITCH. lib-night.sh's incident note says why: on 2026-09-21 a
# NIGHT_SWEEP_FORCE=1 flag removed the window and applied a migration to the live database
# at 17:19 Pacific. The only override here is NIGHT_REHEARSE=1, and it does NOT remove the
# window — it removes PRODUCTION. In rehearsal the production read is replaced by a read of
# the BRANCH'S OWN catalog, the drop set is narrowed to one probe schema this job creates
# for itself, and the plist is left alone.
#
# WHAT THIS JOB DOES NOT FIX, and it matters more than the drift: 94 of the 191 suites
# carry their own "this file runs on the MAIN database only" guard and will refuse a
# perfectly level branch. A refreshed branch raises the ceiling from 4 passes to at most
# 97, never 191. That is a separate defect with a separate owner.
# ─────────────────────────────────────────────────────────────────────────────
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

LABEL="com.aimatrx.night-sweep.branch-refresh"
LANE=BRANCH-REFRESH
LOCK=branch-refresh
HANDOFF=/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20
LOG="$HANDOFF/night-branch-refresh.log"
OPEN=0100 CLOSE=0330
DUMP_CAP=600               # seconds: the production schema dump aborts at TEN MINUTES
USE_CASES=/Users/armanisadeghi/code/aidream/apps/shared/records/src/use-cases
SUITES="$FRONTEND/scripts/campaign-tests"
PROBE_SCHEMA=zz_branch_refresh_probe

# Schemas this job NEVER dumps and NEVER drops.
#   · Postgres and Supabase-managed namespaces (auth, storage, realtime, extensions, …) —
#     standard Supabase practice: their contents are the platform's, not ours, and the
#     branch already carries them.
#   · extension-hosting namespaces (partman, cron, net, pgsodium, vault) — an extension's
#     own objects are restored by CREATE EXTENSION, not by a schema dump.
#   · campaign_watch — THIS JOB'S OWN LOCK LIVES THERE. Dropping it mid-run would delete
#     the lock the trap is about to release.
typeset -a NEVER
NEVER=(information_schema auth storage realtime supabase_functions supabase_migrations
       extensions graphql graphql_public vault pgsodium pgsodium_masks pgbouncer
       cron net partman campaign_watch _analytics _realtime _supavisor)

# The curated seed, in FK order. These are PLATFORM CONFIGURATION and are copied verbatim.
# Identities and organizations are NOT in this list — they are synthesized below, because
# the no-fake-test-data law forbids a row copied from a real person, and BRANCH-DRIFT.md §2
# found 527 of production's auth.users ids already sitting on this branch.
#   · platform.knob_override is deliberately EXCLUDED: every row references an organization
#     we do not copy, so copying it could only produce FK failures. The 13 suites that died
#     on knob_override_knob_fkey were INSERTING their own overrides; what they need is
#     feature_knob's 167 missing keys, which this list carries.
typeset -a SEED_TABLES
SEED_TABLES=(platform.taxonomy_node platform.entity_types platform.feature_knob
             platform.client_callable_door platform.provision_spec)

# Step (4)'s verdict set: the 4 suites that passed on the branch on 2026-09-22, and 10 that
# died on drift — one per failure shape (missing schema, missing platform function, missing
# custom relation/function/type, missing public door, and three knob_override_knob_fkey).
typeset -a VERIFY_SUITES
VERIFY_SUITES=(
  doorsonly4_platform_admin_reads_do_not_move.sql
  doorsonly4_the_generator_emits_the_new_set.sql
  w1_org_c7.sql
  w1_org_red.sql
  acquisition_console_rls_seat.sql
  argsruled_green.sql
  asof_green.sql
  booking_green.sql
  capture_red.sql
  doorsonly5_categories_doors_work_from_a_seat.sql
  doorsonly5_rulebook_doors_work_from_a_seat.sql
  dash_green.sql
  digests_green.sql
  enrich_green.sql
)

[ "$REHEARSE" = "1" ] && LOG="${LOG%.log}-rehearsal.log"
exec >>"$LOG" 2>&1

say "─────────── BRANCH-REFRESH starting (pid $$)$([ "$REHEARSE" = 1 ] && print -n ' REHEARSAL') ───────────"

night_resolve_psql || exit $?
PGDUMP="${PSQL:h}/pg_dump"
if [ ! -x "$PGDUMP" ]; then say "REFUSED: no pg_dump beside $PSQL. Nothing attempted."; exit 78; fi
say "pg_dump: $PGDUMP ($("$PGDUMP" --version))"

night_window_guard $OPEN $CLOSE || exit $?

# ── THE TARGETS ──────────────────────────────────────────────────────────────
# The branch is the ONLY database this job writes, in every mode, and it is asserted first.
BRANCH_DSN="$(night_branch_dsn)"
if [ -z "$BRANCH_DSN" ]; then say "REFUSED: no SUPABASE_BRANCH_DATABASE_URL. Nothing attempted."; exit 78; fi
night_assert_target branch "$BRANCH_DSN" || exit $?

# The SOURCE is production on a live run and the BRANCH'S OWN CATALOG in a rehearsal.
# A rehearsal does not read production at all — that is what makes "the window is not
# enforced in rehearsal" safe.
typeset -a SRC
if [ "$REHEARSE" = "1" ]; then
  SRC=("$BRANCH_DSN")
  SRC_NAME="the branch's own catalog (REHEARSAL — production is not touched)"
  night_assert_target branch "${SRC[@]}" || exit $?
else
  U="$(grep -m1 '^SUPABASE_MATRIX_USER=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  H="$(grep -m1 '^SUPABASE_MATRIX_HOST=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  PT="$(grep -m1 '^SUPABASE_MATRIX_PORT=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  N="$(grep -m1 '^SUPABASE_MATRIX_DATABASE_NAME=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  export PGPASSWORD="$(grep -m1 '^SUPABASE_MATRIX_PASSWORD=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  if [ -z "$H" ] || [ -z "$PGPASSWORD" ]; then
    say "REFUSED: the five SUPABASE_MATRIX_* values are not all present. Nothing attempted."; exit 78
  fi
  SRC=(-h "$H" -p "$PT" -U "$U" -d "$N")
  SRC_NAME="production (READ ONLY)"
  night_assert_target production "${SRC[@]}" || exit $?
fi
say "source: $SRC_NAME"

cleanup() {
  local rc=$?
  say "cleanup (exit $rc)"
  night_release_lock
  night_self_destruct "$LABEL"
  say "─────────── BRANCH-REFRESH finished, exit $rc ───────────"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

night_take_lock "$LOCK" "$LANE" 'nightly rehearsal-branch refresh from production schema' || exit $?

WORK="$(mktemp -d)"
say "work directory: $WORK"

# ─────────────────────────────────────────────────────────────────────────────
# (1) THE PRODUCTION READ — schema only, inside the window, capped at ten minutes.
# ─────────────────────────────────────────────────────────────────────────────
say "─── (1) source read: the schema list ───"
SCHEMA_SQL="select nspname from pg_namespace
            where nspname !~ '^pg_' and nspname <> all(array['${(j:',':)NEVER}'])
            order by 1"
SCHEMAS="$("$PSQL" "${SRC[@]}" -qAt -c "begin transaction read only; $SCHEMA_SQL" 2>&1)"
if print -r -- "$SCHEMAS" | grep -qE 'ERROR|FATAL'; then
  say "REFUSED: could not read the source schema list: $(print -r -- "$SCHEMAS" | head -1). Nothing done."; exit 78
fi
typeset -a SCHEMA_LIST; SCHEMA_LIST=("${(@f)SCHEMAS}")
say "schemas in the refresh set: ${#SCHEMA_LIST[@]}"
say "  ${(j:, :)SCHEMA_LIST}"

typeset -a DUMPARGS
for s in "${SCHEMA_LIST[@]}"; do DUMPARGS+=(-n "$s"); done

say "─── (1) source read: pg_dump --schema-only (cap ${DUMP_CAP}s) ───"
DUMP="$WORK/schema.sql"
# --lock-wait-timeout: pg_dump gives up rather than queueing behind somebody's DDL.
# statement_timeout: no single catalog statement may sit on production for long.
# timeout $DUMP_CAP: the whole dump aborts at ten minutes, as the brief requires.
DUMP_START=$(date +%s)
PGOPTIONS='-c statement_timeout=600000' timeout $DUMP_CAP "$PGDUMP" "${SRC[@]}" \
  --schema-only --no-owner --no-acl --no-comments --quote-all-identifiers \
  --lock-wait-timeout=5000 "${DUMPARGS[@]}" -f "$DUMP" 2> "$WORK/dump.err"
DRC=$?
DUMP_SECS=$(( $(date +%s) - DUMP_START ))
if [ $DRC -eq 124 ]; then
  say "REFUSED: the schema dump exceeded the ${DUMP_CAP}s cap (${DUMP_SECS}s) and was aborted."
  say "  Production was only ever READ; nothing was written anywhere. Nothing done."
  exit 75
fi
if [ $DRC -ne 0 ] || [ ! -s "$DUMP" ]; then
  say "REFUSED: pg_dump failed after ${DUMP_SECS}s: $(head -3 "$WORK/dump.err" | tr '\n' ' ')"
  say "  Production was only ever READ. Nothing done."; exit 78
fi
say "dump ok: ${DUMP_SECS}s · $(du -h "$DUMP" | cut -f1) · $(grep -c '^CREATE ' "$DUMP") CREATE statements"
[ -s "$WORK/dump.err" ] && say "pg_dump stderr (first 3): $(head -3 "$WORK/dump.err" | tr '\n' ' ')"

# ─────────────────────────────────────────────────────────────────────────────
# (2) THE CURATED SEED — read in the same window, from the same source.
#     Platform configuration is copied verbatim; people are never copied.
# ─────────────────────────────────────────────────────────────────────────────
say "─── (2) curated seed: reading the reference tables ───"
typeset -a SEED_OK
for t in "${SEED_TABLES[@]}"; do
  f="$WORK/seed_${t//./_}.tsv"
  out="$("$PSQL" "${SRC[@]}" -qAt -c "\copy (select * from $t) to '$f'" 2>&1)"
  if [ -f "$f" ] && ! print -r -- "$out" | grep -qE 'ERROR|FATAL'; then
    SEED_OK+=("$t"); say "  $t: $(wc -l < "$f" | tr -d ' ') rows, $(du -h "$f" | cut -f1)"
  else
    say "  $t: NOT READ — $(print -r -- "$out" | head -1); it will be skipped"
  fi
done
say "seed tables read: ${#SEED_OK[@]} of ${#SEED_TABLES[@]}"

say "─── (2) the runner ledger, read from the source ───"
LEDGER="$WORK/ledger.tsv"
LOUT="$("$PSQL" "${SRC[@]}" -qAt -c "\copy (select * from public._schema_migrations) to '$LEDGER'" 2>&1)"
if print -r -- "$LOUT" | grep -qE 'ERROR|FATAL'; then
  say "  ledger NOT READ — $(print -r -- "$LOUT" | head -1). '--target branch' will judge 'already applied' wrongly."
  LEDGER=""
else
  say "  public._schema_migrations: $(wc -l < "$LEDGER" | tr -d ' ') rows"
fi
unset PGPASSWORD   # production credentials are not needed again, in any mode

# ─────────────────────────────────────────────────────────────────────────────
# (3) THE BRANCH APPLY — the only writes in this file.
# ─────────────────────────────────────────────────────────────────────────────
say "─── (3) branch apply ───"
# The target is asserted AGAIN, immediately before the first destructive statement. The
# assertion above was several minutes and one pg_dump ago; this one is the last thing
# between this job and a DROP SCHEMA.
night_assert_target branch "$BRANCH_DSN" || exit $?

typeset -a DROP_SET
if [ "$REHEARSE" = "1" ]; then
  # A rehearsal proves the drop / recreate / restore / verify path on a schema this job
  # makes for itself. It never drops a schema a peer lane is working in.
  "$PSQL" "$BRANCH_DSN" -qAt -c "create schema if not exists $PROBE_SCHEMA; create table if not exists $PROBE_SCHEMA.proof(id int);" >/dev/null 2>&1
  DROP_SET=("$PROBE_SCHEMA")
  say "REHEARSAL: the drop set is narrowed to $PROBE_SCHEMA (${#SCHEMA_LIST[@]} schemas would be dropped on a live run)"
else
  DROP_SET=("${SCHEMA_LIST[@]}")
fi

say "capturing the extensions that live in the drop set, so they can be put back"
EXTS="$("$PSQL" "$BRANCH_DSN" -qAtF'|' -c \
  "select extname, extnamespace::regnamespace::text from pg_extension
   where extnamespace::regnamespace::text = any(array['${(j:',':)DROP_SET}'])" 2>&1)"
say "  extensions to recreate: ${EXTS:-(none)}"

say "dropping ${#DROP_SET[@]} schema(s), CASCADE, in ONE statement so cross-schema dependencies cannot order us wrong"
DROPOUT="$("$PSQL" "$BRANCH_DSN" -v ON_ERROR_STOP=1 -qAt \
  -c "drop schema if exists ${(j:, :)DROP_SET} cascade" 2>&1)"
if print -r -- "$DROPOUT" | grep -qE 'ERROR|FATAL'; then
  say "REFUSED: the drop failed — $(print -r -- "$DROPOUT" | head -1). The branch is mid-refresh; re-run the job."
  exit 78
fi
say "  dropped."

# THE PURGE, HERE AND NOT LATER. `delete from auth.users` cascades into every dependent the
# campaign schemas declare; the rehearsal died on `iam.memberships.user_id` NOT NULL for exactly
# that reason. Run immediately after the drop, while nothing in the refresh set exists to
# reference it, and the delete has nothing to cascade into. A rehearsal drops nothing, so it
# does not run this at all and says why.
if [ "$REHEARSE" = "1" ]; then
  say "REHEARSAL: the auth.users purge is NOT run — this run dropped nothing, so the campaign"
  say "  schemas still reference auth.users and the delete would cascade into them. On a live"
  say "  run it happens here, after the drop, with nothing left to cascade into."
else
  say "purging copied identities: the branch holds $("$PSQL" "$BRANCH_DSN" -qAt -c 'select count(*) from auth.users' 2>&1) auth.users rows, 527 of which BRANCH-DRIFT.md measured as identical to production's"
  POUT="$("$PSQL" "$BRANCH_DSN" -v ON_ERROR_STOP=1 -qAt -c \
    "delete from auth.users where email is distinct from 'admin@admin.com' and email is distinct from 'test@test.com'" 2>&1)"
  if print -r -- "$POUT" | grep -qE 'ERROR|FATAL'; then say "  purge FAILED: $(print -r -- "$POUT" | head -1)"
  else say "  purged; $("$PSQL" "$BRANCH_DSN" -qAt -c 'select count(*) from auth.users' 2>&1) auth.users row(s) remain"; fi
fi

say "recreating the schemas and their extensions"
{ for s in "${DROP_SET[@]}"; do print -r -- "create schema if not exists \"$s\";"; done
  print -r -- "$EXTS" | while IFS='|' read -r e ns; do
    [ -n "$e" ] && print -r -- "create extension if not exists \"$e\" with schema \"$ns\";"
  done
} > "$WORK/prepare.sql"
"$PSQL" "$BRANCH_DSN" -qAt -f "$WORK/prepare.sql" 2>&1 | grep -E 'ERROR|FATAL' | head -5 | while read -r l; do say "  prepare: $l"; done

# pg_dump emits `CREATE SCHEMA "x";` for schemas we have just pre-created (they had to exist
# before the extensions went back in). Make those tolerant; nothing else in the file is touched.
sed -E 's/^CREATE SCHEMA ("?[A-Za-z0-9_]+"?);$/CREATE SCHEMA IF NOT EXISTS \1;/' "$DUMP" > "$WORK/schema.apply.sql"

say "restoring the schema dump onto the branch"
# ON_ERROR_STOP is deliberately OFF: a schema restore of this size always produces some
# already-exists and dependency noise, and stopping on the first line would leave the branch
# in a worse state than finishing. THE DRIFT NUMBER IN STEP (4) IS THE VERDICT, not this
# exit code — judged by output text, as the README requires.
RESTORE_START=$(date +%s)
"$PSQL" "$BRANCH_DSN" -q -f "$WORK/schema.apply.sql" > "$WORK/restore.out" 2>&1
RESTORE_SECS=$(( $(date +%s) - RESTORE_START ))
# psql writes `psql:<file>:<line>: ERROR:  …`, never a bare `ERROR:` at column 0. The first
# cut of this line counted '^ERROR:' and reported ZERO of the rehearsal's 23,610 errors — a
# green manufactured by a grep anchor. Match the text, never the column.
RERR=$(grep -c 'ERROR:' "$WORK/restore.out")
RDUP=$(grep -c 'already exists' "$WORK/restore.out")
say "restore finished in ${RESTORE_SECS}s with $RERR ERROR line(s), of which $RDUP are 'already exists'"
if [ "$RERR" -gt 0 ]; then
  say "first restore errors:"
  grep 'ERROR:' "$WORK/restore.out" | head -20 | while read -r l; do say "    ${l##*/}"; done
fi

if [ -n "$LEDGER" ] && [ "$REHEARSE" != "1" ]; then
  say "re-seeding the runner ledger from the source, so '--target branch' judges 'already applied' correctly"
  LIN="$("$PSQL" "$BRANCH_DSN" -qAt -c "\copy public._schema_migrations from '$LEDGER'" 2>&1)"
  say "  ledger: ${LIN:-loaded}; branch now holds $("$PSQL" "$BRANCH_DSN" -qAt -c 'select count(*) from public._schema_migrations' 2>&1) rows"
else
  say "ledger re-seed skipped ($([ "$REHEARSE" = 1 ] && print -n 'rehearsal — the branch ledger is not rewritten' || print -n 'the ledger could not be read'))"
fi

say "loading the curated seed"
# `\copy … from` APPENDS. On a live run the table was just recreated empty by the restore, but
# a partial run, a re-run, or a rehearsal leaves rows behind and every one of these five tables
# then dies on its own primary key — which is exactly what the rehearsal showed. Empty the
# table this job is about to refill, in the same statement, and say so.
for t in "${SEED_OK[@]}"; do
  f="$WORK/seed_${t//./_}.tsv"
  o="$("$PSQL" "$BRANCH_DSN" -qAt -c "truncate table $t cascade" 2>&1)"
  if print -r -- "$o" | grep -qE 'ERROR|FATAL'; then say "  $t: could not empty it — $(print -r -- "$o" | head -1); skipping"; continue; fi
  o="$("$PSQL" "$BRANCH_DSN" -qAt -c "\copy $t from '$f'" 2>&1)"
  if print -r -- "$o" | grep -qE 'ERROR|FATAL'; then say "  $t: $(print -r -- "$o" | head -1)"
  else say "  $t: ${o:-loaded} ($("$PSQL" "$BRANCH_DSN" -qAt -c "select count(*) from $t" 2>&1) rows on the branch)"; fi
done

# ── The identities: SYNTHESIZED, NEVER COPIED ────────────────────────────────
# The owner's law, 2026-09-21: never real people; never a row copied from customers or
# production. BRANCH-DRIFT.md §2 found 527 of this branch's 546 auth.users ids identical to
# production's, copied by the 2026-09-16 transplant. This step is what removes them: the
# branch keeps exactly two identities — admin@admin.com and test@test.com — and one
# organization per registered REAL-DATA use case, each carrying that business's real name
# and its own cleanup tag in settings.
say "─── (2b) synthesizing identities and organizations (never copied) ───"
SEEDSQL="$WORK/identities.sql"
{
print -r -- "begin;"
print -r -- "insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)"
print -r -- "values ('00000000-0000-4000-a000-00000000ad31'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'admin@admin.com', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(), now(), now(), '{\"provider\":\"email\",\"providers\":[\"email\"]}'::jsonb, '{\"full_name\":\"Matrx Admin\"}'::jsonb),"
print -r -- "       ('00000000-0000-4000-a000-00000000e571'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'test@test.com',  extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(), now(), now(), '{\"provider\":\"email\",\"providers\":[\"email\"]}'::jsonb, '{\"full_name\":\"Matrx Tester\"}'::jsonb)"
print -r -- "on conflict (id) do nothing;"
# One organization per registered use case, named for the real business it describes.
for f in "$USE_CASES"/*.ts; do
  b="${f:t:r}"
  case "$b" in index|registry|types|validate|placeholders|use-cases.test) continue ;; esac
  id="$(grep -m1 -E '^  id: "' "$f" | sed -E 's/.*"(.*)".*/\1/')"
  tag="$(grep -m1 -E '^  cleanupTag: "' "$f" | sed -E 's/.*"(.*)".*/\1/')"
  name="$(awk '/^  business: \{/{f=1} f && /^    name: "/{sub(/.*name: "/,""); sub(/",?$/,""); print; exit}' "$f")"
  ind="$(grep -m1 -E '^  industry: "' "$f" | sed -E 's/.*"(.*)".*/\1/')"
  [ -n "$id" ] && [ -n "$name" ] || continue
  abbr="$(print -r -- "$name" | awk '{for(i=1;i<=NF&&i<=4;i++) printf "%s", toupper(substr($i,1,1))}')"
  sn="${name//\'/\'\'}"
  print -r -- "insert into iam.organizations (name, slug, abbreviation, description, is_personal, is_system, created_by, updated_by, settings)"
  print -r -- "values ('$sn', '$id', '$abbr', '${ind//\'/\'\'}', false, false, '00000000-0000-4000-a000-00000000ad31'::uuid, '00000000-0000-4000-a000-00000000ad31'::uuid, jsonb_build_object('cleanupTag','$tag','test_fixture',true,'useCaseId','$id'))"
  print -r -- "on conflict do nothing;"
done
print -r -- "commit;"
} > "$SEEDSQL"
if [ "$REHEARSE" = "1" ]; then
  say "REHEARSAL: the identity seed is GENERATED and syntax-checked, not applied (it would delete this branch's auth.users)"
  say "  generated $(grep -c '^insert into iam.organizations' "$SEEDSQL") organization insert(s) from $USE_CASES"
  # It is PROVEN, not assumed: the whole seed runs inside a transaction whose COMMIT has been
  # replaced by a ROLLBACK, so every statement is executed against the real branch and then
  # undone. A syntax or constraint failure shows up here, in the rehearsal, where it is cheap.
  sed 's/^commit;$/rollback;/' "$SEEDSQL" > "$WORK/identities.rehearse.sql"
  ROUT="$("$PSQL" "$BRANCH_DSN" -v ON_ERROR_STOP=1 -qAt -f "$WORK/identities.rehearse.sql" 2>&1)"
  if print -r -- "$ROUT" | grep -qE 'ERROR|FATAL'; then
    say "  identity seed REHEARSED AND FAILED: $(print -r -- "$ROUT" | grep -m1 -E 'ERROR|FATAL')"
  else
    say "  identity seed rehearsed clean and rolled back (nothing kept)"
  fi
else
  IOUT="$("$PSQL" "$BRANCH_DSN" -v ON_ERROR_STOP=1 -qAt -f "$SEEDSQL" 2>&1)"
  if print -r -- "$IOUT" | grep -qE 'ERROR|FATAL'; then
    say "  identities: $(print -r -- "$IOUT" | grep -m1 -E 'ERROR|FATAL')"
  else
    say "  identities: $("$PSQL" "$BRANCH_DSN" -qAt -c 'select count(*) from auth.users' 2>&1) auth.users, $("$PSQL" "$BRANCH_DSN" -qAt -c 'select count(*) from iam.organizations' 2>&1) organizations — all synthesized"
  fi
fi

# BRANCH-REF re-point. Same database, so the identifier must NOT have moved; if it has,
# something is very wrong and this job says so rather than rewriting the file.
NOWID="$("$PSQL" "$BRANCH_DSN" -qAt -c 'select system_identifier from pg_control_system()' 2>&1 | tr -d ' ')"
WANTID="$(grep -m1 '^system_identifier' "$BRANCH_REF_FILE" | sed -E 's/.*= *//' | tr -d ' ')"
if [ "$NOWID" = "$WANTID" ]; then say "BRANCH-REF: unchanged ($NOWID) — as expected, this is the same database"
else say "🚨 BRANCH-REF: the branch now answers $NOWID, not $WANTID. plan/BRANCH-REF needs a person."; fi

# ─────────────────────────────────────────────────────────────────────────────
# (4) THE VERDICT — the drift number, then the suites.
# ─────────────────────────────────────────────────────────────────────────────
say "─── (4) verification: pnpm check:branch-schema-drift ───"
cd "$FRONTEND" || exit 78
node node_modules/tsx/dist/cli.mjs scripts/check-branch-schema-drift.ts > "$WORK/drift.out" 2>&1
DEXIT=$?
# THE NUMBER IS READ FROM A COLOURED LINE. `\e[31mPRODUCTION HAS 1375 OBJECT(S)…` — the
# first cut took the first digits it saw and reported "31", the ANSI colour code, as the drift.
# Strip the escapes first, then take the number that follows the words.
sed -E $'s/\033\[[0-9;]*m//g' "$WORK/drift.out" > "$WORK/drift.plain"
DNUM="$(sed -nE 's/.*PRODUCTION HAS ([0-9]+) OBJECT.*/\1/p' "$WORK/drift.plain" | head -1)"
say "drift gate exit $DEXIT · production-only objects in the failing scope: ${DNUM:-0}"
tail -25 "$WORK/drift.plain" | while read -r l; do say "  | $l"; done

say "─── (4) verification: 14 suites in rehearsal mode against the branch ───"
export PGOPTIONS='-c statement_timeout=60000 -c lock_timeout=10000'
VPASS=0 VFAIL=0 VSKIP=0
for b in "${VERIFY_SUITES[@]}"; do
  f="$SUITES/$b"
  if [ ! -f "$f" ]; then say "  $(printf '%-56s %s' "$b" 'MISSING')"; continue; fi
  o="$(mktemp)"
  timeout 240 "$PSQL" "$BRANCH_DSN" -v ON_ERROR_STOP=1 -f "$f" > "$o" 2>&1
  # A SUITE THAT SKIPS IS NOT A SUITE THAT PASSES. The campaign suites now answer a missing
  # dependency with `SKIPPED: … this is NOT a pass` and exit 0 instead of raising — so the
  # inherited "no ERROR line means PASS" rule scored 9 skips as passes in the rehearsal and
  # reported 13/14 on a branch that still lacks `media`, `custom.organization_kernel_id()` and
  # 162 knob keys. Read the suite's own word first.
  line="$(grep -m1 -E 'ERROR:|FATAL:' "$o")"
  skip="$(grep -m1 -E '^SKIPPED:' "$o")"
  if [ -n "$line" ]; then VFAIL=$((VFAIL+1)); say "  $(printf '%-56s %-6s %s' "$b" FAIL "$(print -r -- "${line#psql:*: }" | cut -c1-110)")"
  elif [ -n "$skip" ]; then VSKIP=$((VSKIP+1)); say "  $(printf '%-56s %-6s %s' "$b" SKIP "$(print -r -- "$skip" | cut -c1-110)")"
  else VPASS=$((VPASS+1)); say "  $(printf '%-56s %s' "$b" PASS)"; fi
done
say "suites: PASS $VPASS · SKIP $VSKIP · FAIL $VFAIL  (was PASS 4 / FAIL 10 on 2026-09-22 before the refresh; a SKIP is the suite saying the branch still lacks its dependency)"

say "───────── BRANCH-REFRESH RESULT ─────────"
say "dump ${DUMP_SECS}s · restore ${RESTORE_SECS}s · restore errors $RERR · drift ${DNUM:-0} · suites PASS $VPASS SKIP $VSKIP FAIL $VFAIL"
say "work directory left in place for inspection: $WORK"
exit 0
