#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# BRANCH-REFRESH — the nightly rebuild of the rehearsal branch from the NIGHTLY DEV CLONE's
# SCHEMA and a small curated seed. IT NEVER TOUCHES PRODUCTION, IN ANY MODE.
#
# 🚨 THE CHAIR RULING THIS FILE NOW IMPLEMENTS (2026-09-22, lane BRANCH-REFRESH-2)
# --------------------------------------------------------------------------------
# The two branch-refresh jobs were UNLOADED at ~00:10 PT on 2026-09-22 on Arman's word. They
# write only the branch, but each took a ~7-minute `pg_dump --schema-only` of PRODUCTION, which
# holds ACCESS SHARE on every table; after Sunday night's lock incident nothing of that class was
# to run. THE REASON FOR THE PAUSE IS REMOVED BY CONSTRUCTION, NOT BY PERMISSION: the schema, the
# curated seed and the runner ledger now come from the NIGHTLY DEV CLONE
# (common-docs/operations/clone/CURRENT.md + CLONE-REF) — a physical copy of production refreshed
# by the backup process, where a 7-minute ACCESS SHARE costs production exactly nothing.
#
# There is NO production code path left in this file. The only source it can ever ask for is
# `night_assert_target clone`, and a production connection string handed to it in ANY variable,
# in ANY mode, is refused before anything is read or written. That assertion is keyed on
# (system_identifier, PROJECT REF) TOGETHER — a data clone is a physical restore and answers with
# PRODUCTION's own system identifier, so the number alone could not tell them apart (the identity
# trap, closed by lane CLONE-SUITES on 2026-09-22).
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
#   · PRODUCTION IS NEVER CONTACTED AT ALL. Not read, not written, in no mode and under no
#     variable. The source is the dev clone and the assertion refuses anything else.
#   · THE CLONE IS READ AND NEVER WRITTEN. Every clone statement in this file is a SELECT, a
#     COPY … TO STDOUT or a pg_dump.
#   · THE BRANCH IS THE ONLY THING WRITTEN, and it is written DESTRUCTIVELY: the campaign
#     schemas are dropped and recreated from the clone's dump. That is deliberate — the
#     branch is disposable by design, and a differential that hand-patches 1,400 objects a
#     night is the thing W0-SYNC proved does not survive this rate of change.
#   · THE WINDOW DOES NOT APPLY TO THIS JOB ANY MORE (chair ruling 2026-09-22). The window
#     exists to protect PRODUCTION; a run that reads the clone and writes the branch touches
#     production nowhere, so it may run at any hour and says so in its log. The exemption is
#     earned ONLY by the two assertions passing — it is not a flag, a variable or an argument,
#     and a run that has proven nothing, or that has proven production, gets the window
#     enforced exactly as before. night_window_guard is therefore called AFTER the assertions.
#   · The ten-minute dump cap stays as a sanity bound on a run that would otherwise sit on the
#     lock for the whole night; an abort writes nothing anywhere.
#
# 🚨 THERE IS NO FORCE SWITCH. lib-night.sh's incident note says why: on 2026-09-21 a
# NIGHT_SWEEP_FORCE=1 flag removed the window and applied a migration to the live database
# at 17:19 Pacific. The only override here is NIGHT_REHEARSE=1, and it does NOT remove the
# window — it removes the DESTRUCTION. A rehearsal reads the clone for real (that read is free
# now, so a rehearsal finally exercises the true source), but it narrows the drop set to one
# probe schema this job creates for itself, runs no identity purge, rewrites no ledger, rolls
# the identity seed back, and leaves the plist alone.
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
DUMP_CAP=600               # seconds: the clone schema dump aborts at TEN MINUTES.
                           # MEASURED on the clone 2026-09-22: 354s · 20 MB · 20,878 CREATE ·
                           # 9,961 GRANT statements. Production's own dump measured 409s. The clone
                           # runs Large compute where production runs XL and is still FASTER, so the
                           # cap keeps its 70% headroom and is not loosened. An abort writes nothing.
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

# 🚨 ONE ORGANIZATION IS COPIED, AND IT IS NOT A CUSTOMER. Measured on the clone 2026-09-22: every
# organization_id in platform.taxonomy_node (241 of 241 rows) and platform.provision_spec points at
# a SINGLE row — `Matrx System`, `is_system = true`. It is platform infrastructure, the same class
# of thing as the knobs and the doors, and without it every reference table fails its foreign key,
# which is exactly what happened on the first live run. The filter is `is_system` and nothing else:
# no personal organization and no customer organization can come across this wire.
# ── THE SEED SET IS DECLARED, NOT DERIVED ────────────────────────────────────
# 🚨 THE DEFECT THIS REPLACES (chair ruling 2026-09-22, lane BRANCH-SEED). Until today this job
# DERIVED its lookup set — "a `platform` table another table's foreign key points at, holding fewer
# than 2,000 rows" — plus eight registries named by hand, one at a time, as suites raised on them.
# A register nothing holds an FK to, or one living outside `platform`, was INVISIBLE to that
# derivation and arrived EMPTY on the branch. Measured: `platform.client_callable_door` 0 of 1,744,
# `tool.definition` 0 of 696, and before 2026-09-22 `platform.deprecated_relations`,
# `platform.shareable_resource_registry`, `custom.carrying_rule` and the `custom.record` kernel
# Tables. Every one of them made campaign suites fail on the branch for a reason that was NOT a
# defect, while the copied ledger told each campaign file it was "already applied".
#
# The set now comes from `scripts/night/branch-seed-tables.json` — CHECKED IN, generated by
# `scripts/night/branch-seed-census.sh --write` from a census of EVERY table in
# platform/tool/iam/custom/content_ir/history on the clone, each with its row count and the reason
# it is seeded or excluded. `--check` REFUSES when a table in those schemas is in neither list, so
# the next registry cannot arrive empty in silence. That guard runs below, before anything loads.
#
# Each entry carries the two things the loader needs beyond the name:
#   · filter_column  — the column that is an FK to `iam.organizations` (it is NOT always called
#                      `organization_id`: `platform.provision_spec` names it `owner_org_id`). A row
#                      crosses only when that column is NULL or the ONE `is_system` organization.
#   · truncate_first — true only when EVERY source row is platform-owned. A table holding any
#                      customer row is appended to, never emptied: the filtered copy was never
#                      going to replace those rows, so emptying it could only destroy.
SEED_LIST_JSON="$FRONTEND/scripts/night/branch-seed-tables.json"
SEED_CENSUS="$FRONTEND/scripts/night/branch-seed-census.sh"

# 🚨 NO CUSTOMER ROWS COME ACROSS THIS WIRE. Every platform table carries `organization_id` (the
# platform's own law), so "it has no org column" is not a safety filter here — the filter is the
# VALUE: a row is copied only when its organization_id is NULL or the ONE `is_system`
# organization. A customer's row cannot satisfy that, whatever table it sits in.
SYSTEM_ORG_SQL="select * from iam.organizations where is_system is true"

# ── the tolerant seed loader ─────────────────────────────────────────────────
# 🚨 ONE REFUSED ROW MUST NOT TAKE THE OTHER N WITH IT. `\copy … from` is a single statement: the
# first row a guard or a foreign key rejects aborts the whole load. Measured on the first live run
# (2026-09-22 14:57Z): all five reference tables and the entire 4,861-row runner ledger loaded ZERO
# rows, each on one bad row — the branch came out of a "refresh" with no knobs and no ledger at
# all, which is worse than the drift the job exists to fix.
#
# So every row gets its own subtransaction, and the count of refusals is REPORTED WITH ITS FIRST
# REASON rather than swallowed. A partial load that says exactly what it dropped is honest; an
# all-or-nothing load that says "ERROR" and leaves the table empty is not.
# An optional third argument is SQL run against the staged rows BEFORE they are inserted — the one
# legitimate edit is re-pointing an authorship column at an identity that exists on this branch,
# because the source's `created_by` names a production user the purge deliberately removed.
# A fourth argument is a PRELUDE emitted before the \\copy — whole statements and psql
# metacommands of its own, so a loader can stage a second file it needs (the door's type-name
# sidecar is the one that exists). It is written literally, so each line carries its own
# terminator; nothing is appended to it.
# 🚨 THE COLUMN LIST, AND THE TRUNCATE THAT WAITS FOR THE COPY. Two defects the first live
# seed-only run caused (2026-09-22 17:4xZ), both from the same assumption — that the branch's table
# is shaped like the source's:
#   · `platform.feature_knob` has THREE more columns on the clone (archived_at/_reason/_by) than on
#     this branch, so the copy died on `extra data after last expected column` — AFTER the table had
#     been truncated. 955 rows on the branch became ZERO. The seed now reads and writes the
#     INTERSECTION of the two column lists, by NAME, so drift costs the drifted columns and nothing
#     else; and the TRUNCATE has moved INSIDE this transaction, AFTER the copy, so a copy that fails
#     rolls back with the branch's rows still there.
#   · `first_err` was only recorded on pass > 1, so a table every row of which is refused on pass 1
#     reported `(no reason captured)` — `tool.definition` refused all 693 and said nothing. The
#     reason is now captured on every pass and the LAST pass's is the one reported, which is the
#     pass whose refusals are real rather than ordering.
seed_load() {  # seed_load <schema.table> <tsv> [<fix sql>] [<prelude>] [<truncate 0|1>] [<column list>]
  local t="$1" f="$2" fix="${3:-}" pre="${4:-}" trunc="${5:-0}" cols="${6:-}" out
  local collist="" truncsql=""
  [ -n "$cols" ] && collist=" ($cols)"
  [ "$trunc" = "1" ] && truncsql="truncate table $t cascade;"
  out="$("$PSQL" "$BRANCH_DSN" -qAt 2>&1 <<SQL
begin;
create temp table _seed_stage (like $t including defaults) on commit drop;
create temp table _seed_done (c tid primary key) on commit drop;
${pre}
\\copy _seed_stage${collist} from '$f'
${truncsql}
${fix:+$fix;}
-- 🚨 IMMEDIATE, so a per-row handler can actually see the refusal. platform.client_callable_door
-- carries DEFERRED constraint triggers (the §6d-4 definer/access-decision guards). Deferred, they
-- fire at COMMIT, long after the per-row subtransactions have closed: the load reported
-- "loaded=1692 refused=43" and then left ZERO rows behind, because one row's commit-time refusal
-- rolled the whole transaction back (measured 2026-09-22). Made immediate, each bad row is caught,
-- counted and named where it happens, and the good 1,692 survive.
set constraints all immediate;
do \$SEEDLOAD\$
declare r record; ok int := 0; bad int := 0; pass int := 0; moved int; first_err text; pass_err text;
begin
  -- REPEATED PASSES UNTIL ONE MOVES NOTHING. platform.taxonomy_node has a self-referencing
  -- parent_id, so a child staged before its parent is refused on the first pass and accepted on
  -- the next. A single pass lost 75 of its 241 rows, and every table keyed on those nodes lost
  -- rows behind it (measured 2026-09-22). Reaching a fixed point costs a few seconds and is the
  -- difference between a seeded branch and a half-seeded one.
  loop
    pass := pass + 1; moved := 0;
    for r in select ctid as c from _seed_stage
             where ctid not in (select c from _seed_done) loop
      begin
        -- Addressed by ctid, NOT by a record parameter: a row from a temp table is a generic
        -- \`record\` and \`insert … select (\$1).*\` on one answers "record type has not been registered".
        execute format('insert into %s select * from _seed_stage where ctid = %L', '$t', r.c);
        insert into _seed_done values (r.c);
        ok := ok + 1; moved := moved + 1;
      exception when others then
        -- Captured on EVERY pass, and the LAST pass's is what gets reported: a pass-1 refusal is
        -- often just ordering (a child before its parent), but a table whose every row is refused
        -- never reaches pass 2 and used to report "(no reason captured)".
        if pass_err is null then pass_err := left(sqlerrm, 160); end if;
      end;
    end loop;
    if pass_err is not null then first_err := pass_err; end if;
    pass_err := null;
    exit when moved = 0 or pass >= 8;
  end loop;
  bad := (select count(*) from _seed_stage) - ok;
  if bad > 0 and first_err is null then first_err := '(no reason captured)'; end if;
  raise notice 'SEEDLOAD loaded=% refused=% passes=% first=%', ok, bad, pass, coalesce(first_err, '(none)');
end
\$SEEDLOAD\$;
commit;
SQL
)"
  # The SEEDLOAD notice is what the DO block believed; an ERROR after it is the COMMIT disagreeing,
  # and the second must never be hidden by the first — `client_callable_door` reported loaded=1692
  # and left ZERO rows behind because a commit-time refusal was being swallowed (2026-09-22).
  local note err
  note="$(print -r -- "$out" | grep -m1 'SEEDLOAD')"
  err="$(print -r -- "$out" | grep -m1 -E 'ERROR:|FATAL:')"
  if [ -n "$note" ] && [ -n "$err" ]; then print -r -- "${note#NOTICE:  } — BUT THE TRANSACTION THEN FAILED: ${err}"
  elif [ -n "$note" ]; then print -r -- "${note#NOTICE:  }"
  elif [ -n "$err" ]; then print -r -- "$err"
  else print -r -- "(no answer)"; fi
}

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

# ── SEED-ONLY ────────────────────────────────────────────────────────────────
# NIGHT_SEED_ONLY=1 runs the SEED and nothing else: the same assertions, the same lock, the same
# declared-seed guard, the same per-row loader — but no dump, no roles step, no drop, no restore,
# no identity purge and no ledger rewrite. It exists because the registries go stale on their own
# schedule (a campaign lands a new register at noon and every suite on the branch fails on it),
# and re-running the whole destructive refresh to fix that is both slower and far more dangerous.
#
# 🚨 IT IS NOT A FORCE SWITCH. It removes NOTHING: the window exemption is still earned only by the
# two target assertions, exactly as a full run earns it, and this mode does strictly LESS to the
# branch than a full run does — it writes only the seeded tables the checked-in list declares.
SEED_ONLY="${NIGHT_SEED_ONLY:-0}"
[ "$SEED_ONLY" = "1" ] && LOG="${LOG%.log}-seed-only.log"
[ "$REHEARSE" = "1" ] && LOG="${LOG%.log}-rehearsal.log"
exec >>"$LOG" 2>&1

say "─────────── BRANCH-REFRESH starting (pid $$)$([ "$REHEARSE" = 1 ] && print -n ' REHEARSAL') ───────────"

night_resolve_psql || exit $?
PGDUMP="${PSQL:h}/pg_dump"
if [ ! -x "$PGDUMP" ]; then say "REFUSED: no pg_dump beside $PSQL. Nothing attempted."; exit 78; fi
say "pg_dump: $PGDUMP ($("$PGDUMP" --version))"

# ── THE TARGETS ──────────────────────────────────────────────────────────────
# The branch is the ONLY database this job writes, in every mode, and it is asserted first.
BRANCH_DSN="$(night_branch_dsn)"
if [ -z "$BRANCH_DSN" ]; then say "REFUSED: no SUPABASE_BRANCH_DATABASE_URL. Nothing attempted."; exit 78; fi
night_assert_target branch "$BRANCH_DSN" || exit $?

# ── THE SOURCE: THE NIGHTLY DEV CLONE, IN EVERY MODE ─────────────────────────
# 🚨 There is ONE source and it is the clone. `night_assert_target clone` is the only target this
# job ever asks of a source, so a production connection string handed to it — in CLONE_DATABASE_URL,
# in CLONE-REF, or anywhere else — is REFUSED here, before the schema list is read and long before
# anything is dropped. The refusal names what the server actually is. There is no `--target`, no
# production branch of this `if`, and nothing to set that would create one.
#
# The clone is a physical restore of production's cluster and therefore answers with PRODUCTION's
# `pg_control_system().system_identifier`. The assertion compares the system identifier AND the
# project ref carried by the connection (`postgres.<ref>`), both read from the checked-in
# CLONE-REF; an unreadable CLONE-REF is a refusal, never a fallback.
typeset -a SRC
SRC_DSN="$(night_clone_dsn)" || true
if [ -z "${SRC_DSN:-}" ]; then
  say "REFUSED: the dev clone's connection could not be assembled. Set CLONE_DATABASE_URL, or make"
  say "  sure common-docs/operations/clone/CLONE-REF names a readable password_file."
  say "  This job has NO other source — it does not fall back to production. Nothing attempted."
  exit 78
fi
night_assert_target clone "$SRC_DSN" || exit $?
SRC=("$SRC_DSN")
SRC_NAME="the nightly dev clone (READ ONLY) — production is not contacted in any mode"
say "source: $SRC_NAME"
say "clone register: $(night_ref_key "$CLONE_REF_FILE" clone_name) · ref $(night_ref_key "$CLONE_REF_FILE" clone_ref) · promoted $(night_ref_key "$CLONE_REF_FILE" promoted)"

# ── THE WINDOW, ASKED ONLY NOW ───────────────────────────────────────────────
# Deliberately AFTER both assertions. The chair ruled on 2026-09-22 that the window exists to
# protect PRODUCTION, and this run has just PROVEN that the only databases it touches are the
# clone (read) and the branch (write) — so the window protects nothing here and does not apply.
# The exemption is earned by that proof and by nothing else: had either assertion named
# production, or had neither run, night_window_guard would enforce 0100-0330 exactly as before.
night_window_guard $OPEN $CLOSE || exit $?

cleanup() {
  local rc=$?
  say "cleanup (exit $rc)"
  night_release_lock
  # 🚨 A SEED-ONLY RUN DOES NOT CONSUME THE ONE-SHOT. `night_self_destruct` unloads and deletes the
  # plist the FULL refresh is armed with; a seed-only run is not that run and disarming it would
  # silently cancel tonight's refresh. Measured: the 17:35Z seed-only run did exactly that, and the
  # 01:05 one-shot had to be re-armed by hand.
  if [ "$SEED_ONLY" = "1" ]; then
    say "SEED-ONLY: the one-shot plist is left armed (this run is not the run it schedules)."
  else
    night_self_destruct "$LABEL"
  fi
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
if [ "$SEED_ONLY" = "1" ]; then
  say "SEED-ONLY: no schema dump, no roles step, no drop and no restore. Only the declared seed"
  say "  set is read from the clone and loaded onto the branch."
  DUMP_SECS=0 RESTORE_SECS=0 RERR=0
else
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
  # 🚨 NOT --no-acl. The first cut carried it, and it strips EVERY GRANT from the dump — the
  # rehearsal's 16 MB file contained zero. Since step (3) DROPS these schemas, a grant-less dump
  # would have left the branch with no privileges at all: `EXECUTE on custom.record_write /
  # record_update / record_delete / table_declare to authenticated` is what SUITE-TARGET and
  # AIDREAM-RED measured the branch lacking (all four read `f` on the branch and `t` on the clone
  # on 2026-09-22), and a refresh that destroyed them would have made the branch worse than the
  # drift it was fixing. --no-owner stays (both databases connect as `postgres`); the ACLs come
  # across, and they are asserted BY NAME in step (4) rather than assumed.
  # 🚨 THE DUMP DOES NOT CARRY THE PASSWORD IN argv. A DSN handed to pg_dump is readable in
  # `ps aux` by every process on this machine for the whole ten minutes the dump runs — measured
  # on 2026-09-22, the clone's database password was sitting there in plain text. So the
  # connection is split into -h/-p/-U/-d and the password goes through PGPASSWORD, which the
  # process table does not show, and is unset again immediately afterwards.
  if ! night_dsn_args "$SRC_DSN" || [ ${#NIGHT_DSN_ARGS[@]} -lt 8 ]; then
    say "REFUSED: the clone connection could not be split for the dump. Nothing done."; exit 78
  fi
  typeset -a DUMPCONN; DUMPCONN=("${NIGHT_DSN_ARGS[@]}")
  export PGPASSWORD="$NIGHT_DSN_PASSWORD"; NIGHT_DSN_PASSWORD=""
  PGOPTIONS='-c statement_timeout=600000' timeout $DUMP_CAP "$PGDUMP" "${DUMPCONN[@]}" \
    --schema-only --no-owner --no-comments --quote-all-identifiers \
    --lock-wait-timeout=5000 "${DUMPARGS[@]}" -f "$DUMP" 2> "$WORK/dump.err"
  DRC=$?
  DUMP_SECS=$(( $(date +%s) - DUMP_START ))
  if [ $DRC -eq 124 ]; then
    say "REFUSED: the schema dump exceeded the ${DUMP_CAP}s cap (${DUMP_SECS}s) and was aborted."
    say "  The clone was only ever READ; production was never contacted; nothing was written anywhere."
    say "  Nothing done."
    exit 75
  fi
  if [ $DRC -ne 0 ] || [ ! -s "$DUMP" ]; then
    say "REFUSED: pg_dump failed after ${DUMP_SECS}s: $(head -3 "$WORK/dump.err" | tr '\n' ' ')"
    say "  The clone was only ever READ; production was never contacted. Nothing done."; exit 78
  fi
  say "dump ok: ${DUMP_SECS}s · $(du -h "$DUMP" | cut -f1) · $(grep -c '^CREATE ' "$DUMP") CREATE · $(grep -c '^GRANT ' "$DUMP") GRANT statements"
  # A dump with no GRANTs would destroy every privilege on the branch. Refuse before the drop.
  if [ "$(grep -c '^GRANT ' "$DUMP")" -eq 0 ]; then
    say "REFUSED: the schema dump carries ZERO GRANT statements, so applying it would leave the"
    say "  branch with no privileges at all. Nothing was written anywhere. Nothing done."
    exit 78
  fi
  [ -s "$WORK/dump.err" ] && say "pg_dump stderr (first 3): $(head -3 "$WORK/dump.err" | tr '\n' ' ')"
  unset PGPASSWORD   # the dump is done; nothing after this point needs it

  # ─────────────────────────────────────────────────────────────────────────────
  # (1b) THE ROLES THE DUMP NAMES — created on the branch BEFORE the restore.
  #
  # 🚨 ROLES ARE CLUSTER-LEVEL AND A SCHEMA DUMP DOES NOT CARRY THEM. Measured on the first live
  # run (2026-09-22): the restore produced 885 ERROR lines and every single one of them was
  # `role "svc_seo" does not exist` (580) or `role "cli_login_postgres" does not exist` (305) —
  # a GRANT naming a role this branch had never heard of. `pg_dump` emits the GRANT and assumes
  # the role is already there, exactly as `pg_dumpall --globals-only` would have created it.
  #
  # THE FIX IS THE CLASS, NOT THE TWO NAMES. The set is DERIVED from the source catalog every
  # night — every non-`pg_` role the clone has and the branch lacks — so a role somebody adds next
  # month is created the first night it appears instead of producing a few hundred silent failures.
  # The branch's own list is re-read afterwards and a role the dump names that still does not exist
  # is a REFUSAL, here, before anything has been dropped.
  #
  # WHAT IS AND IS NOT COPIED:
  #   · NOLOGIN, ALWAYS. No password is read from the source and none is set here; a login role
  #     with no password is a role nothing can connect as, which is what a rehearsal branch wants.
  #     If a job ever genuinely needs to log in as one, give it a branch-only password from the
  #     branch env — never from the source, and never written into this file or the log.
  #   · INHERIT / NOINHERIT, BYPASSRLS and CREATEROLE are mirrored from the source's catalog.
  #   · SUPERUSER, REPLICATION and CREATEDB are NOT mirrored: the branch connects as `postgres`,
  #     which is not a superuser on a Supabase branch and cannot grant them. The log names any
  #     role that carried one so the difference is stated rather than hidden.
  #   · Memberships are mirrored where the branch is allowed to grant them. `grant "postgres" to
  #     "cli_login_postgres"` is refused on the branch (`only roles with the ADMIN option on role
  #     "postgres" may grant this role`) and that refusal is harmless — a NOLOGIN role that exists
  #     only to be the grantee of an EXECUTE does not need to inherit anything — so it is logged,
  #     never fatal.
  #   · OWNERSHIP IS NOT RESTORED, because the dump carries `--no-owner` on purpose. On the clone
  #     `svc_seo` owns the `seo` schema and 29 of its relations; on the branch `postgres` owns
  #     them. Every EXPLICIT grant crosses (measured: 30 relation ACL entries on both sides after
  #     this step); the owner-implicit entries do not, and that is the intended difference.
  # ─────────────────────────────────────────────────────────────────────────────
  say "─── (1b) roles: creating any the dump names that this branch lacks ───"
  SRC_ROLES="$("$PSQL" "${SRC[@]}" -qAtF'|' -c \
    "select rolname, rolinherit, rolbypassrls, rolcreaterole, rolcanlogin, rolsuper, rolreplication, rolcreatedb
       from pg_roles where rolname !~ '^pg_' order by 1" 2>&1)"
  if print -r -- "$SRC_ROLES" | grep -qE 'ERROR|FATAL'; then
    say "REFUSED: could not read the source role catalog: $(print -r -- "$SRC_ROLES" | head -1). Nothing written anywhere."
    exit 78
  fi
  BRANCH_ROLES="$("$PSQL" "$BRANCH_DSN" -qAt -c "select rolname from pg_roles where rolname !~ '^pg_'" 2>&1)"
  if print -r -- "$BRANCH_ROLES" | grep -qE 'ERROR|FATAL'; then
    say "REFUSED: could not read the branch role catalog: $(print -r -- "$BRANCH_ROLES" | head -1). Nothing written anywhere."
    exit 78
  fi
  typeset -a ROLES_MADE ROLES_FAILED
  ROLES_MADE=(); ROLES_FAILED=()
  print -r -- "$SRC_ROLES" | while IFS='|' read -r rn rinh rbyp rcrr rlog rsup rrep rcdb; do
    [ -n "$rn" ] || continue
    [[ $'\n'"$BRANCH_ROLES"$'\n' == *$'\n'"$rn"$'\n'* ]] && continue
    named=0; grep -q "\"$rn\"" "$DUMP" && named=1
    opts="nologin"
    [ "$rinh" = "t" ] && opts="$opts inherit" || opts="$opts noinherit"
    [ "$rbyp" = "t" ] && opts="$opts bypassrls"
    [ "$rcrr" = "t" ] && opts="$opts createrole"
    o="$("$PSQL" "$BRANCH_DSN" -qAt -c "create role \"$rn\" with $opts" 2>&1)"
    if print -r -- "$o" | grep -qE 'ERROR:|FATAL:'; then
      say "  $rn: NOT CREATED — $(print -r -- "$o" | grep -m1 -E 'ERROR:|FATAL:')"
      print -r -- "$rn" >> "$WORK/roles.failed"
    else
      say "  $rn: created [$opts]$([ "$rlog" = t ] && print -n ' (LOGIN on the source, deliberately NOLOGIN here)')$([ "$rsup$rrep$rcdb" != "fff" ] && print -n ' (source also carries superuser/replication/createdb, which this branch cannot grant)')$([ $named = 1 ] && print -n ' — named by the dump' || print -n ' — not named by the dump, created for completeness')"
      print -r -- "$rn" >> "$WORK/roles.made"
    fi
  done
  [ -f "$WORK/roles.made" ]   && ROLES_MADE=("${(@f)$(cat "$WORK/roles.made")}")
  [ -f "$WORK/roles.failed" ] && ROLES_FAILED=("${(@f)$(cat "$WORK/roles.failed")}")
  if [ ${#ROLES_MADE[@]} -eq 0 ] && [ ${#ROLES_FAILED[@]} -eq 0 ]; then
    say "  the branch already has every role the source does; nothing to create."
  fi
  # Memberships, mirrored where the branch may grant them. Never fatal.
  if [ ${#ROLES_MADE[@]} -gt 0 ]; then
    MEMS="$("$PSQL" "${SRC[@]}" -qAtF'|' -c \
      "select g.rolname, m.rolname from pg_auth_members am
         join pg_roles m on m.oid = am.member join pg_roles g on g.oid = am.roleid
        where (m.rolname = any(array['${(j:',':)ROLES_MADE}']) or g.rolname = any(array['${(j:',':)ROLES_MADE}']))
          and g.rolname !~ '^pg_' and m.rolname !~ '^pg_'" 2>&1 | sort -u)"
    print -r -- "$MEMS" | while IFS='|' read -r grp mem; do
      [ -n "$grp" ] && [ -n "$mem" ] || continue
      o="$("$PSQL" "$BRANCH_DSN" -qAt -c "grant \"$grp\" to \"$mem\"" 2>&1)"
      if print -r -- "$o" | grep -qE 'ERROR:|FATAL:'; then
        say "  membership $mem -> $grp NOT mirrored (harmless for a NOLOGIN grantee): $(print -r -- "$o" | grep -m1 -E 'ERROR:|FATAL:' | cut -c1-120)"
      else
        say "  membership $mem -> $grp mirrored"
      fi
    done
  fi
  # THE CHECK THAT MAKES THIS A GUARD AND NOT A HOPE: re-read the branch's own catalog and refuse
  # if the dump still names a role that does not exist. Nothing has been dropped at this point.
  BRANCH_ROLES="$("$PSQL" "$BRANCH_DSN" -qAt -c "select rolname from pg_roles where rolname !~ '^pg_'" 2>&1)"
  typeset -a ROLES_STILL_MISSING; ROLES_STILL_MISSING=()
  print -r -- "$SRC_ROLES" | cut -d'|' -f1 | while read -r rn; do
    [ -n "$rn" ] || continue
    [[ $'\n'"$BRANCH_ROLES"$'\n' == *$'\n'"$rn"$'\n'* ]] && continue
    grep -q "\"$rn\"" "$DUMP" && print -r -- "$rn" >> "$WORK/roles.missing"
  done
  [ -f "$WORK/roles.missing" ] && ROLES_STILL_MISSING=("${(@f)$(cat "$WORK/roles.missing")}")
  if [ ${#ROLES_STILL_MISSING[@]} -gt 0 ]; then
    say "REFUSED: the dump names ${#ROLES_STILL_MISSING[@]} role(s) this branch still does not have:"
    say "  ${(j:, :)ROLES_STILL_MISSING}"
    say "  Restoring now would fail every GRANT naming them — 885 such failures on 2026-09-22 —"
    say "  and the branch would come out of the refresh without those privileges. Nothing was"
    say "  dropped and nothing was written anywhere. Nothing done."
    exit 78
  fi
  say "  every role the dump names exists on the branch."
fi

# ─────────────────────────────────────────────────────────────────────────────
# (2) THE CURATED SEED — read in the same window, from the same source.
#     Platform configuration is copied verbatim; people are never copied.
# ─────────────────────────────────────────────────────────────────────────────
# ── THE DECLARED SEED SET: the guard first, then the read ────────────────────
# 🚨 A TABLE NOBODY HAS RULED ON IS A REFUSAL, HERE, BEFORE ANYTHING IS DROPPED OR LOADED. The
# census is what makes the set DECLARED rather than derived, and a stale census is exactly the
# failure it exists to prevent — a registry that appeared this month, is in neither list, and
# would arrive empty on the branch in silence.
say "─── (2) the declared seed set ───"
SEEDCHK="$(zsh "$SEED_CENSUS" --check 2>&1)"
if [ $? -ne 0 ]; then
  say "REFUSED: the declared seed list does not cover the census schemas on the clone."
  print -r -- "$SEEDCHK" | head -20 | while read -r l; do say "  $l"; done
  say "  Fix: pnpm check:branch-seed-list:write, read the diff, commit it. Nothing was written anywhere."
  exit 78
fi
say "  $(print -r -- "$SEEDCHK" | tail -1)"

SYSORG_ID="$("$PSQL" "${SRC[@]}" -qAt -c "select id from iam.organizations where is_system is true limit 1" 2>/dev/null | tr -d ' ')"
if [ -z "$SYSORG_ID" ]; then
  say "REFUSED: the one is_system organization could not be read from the source, so no row filter"
  say "  can be applied and a customer row could cross. Nothing written anywhere."
  exit 78
fi
# The row filter for EVERY seeded table, from the same checked-in file. It is NOT always called
# `organization_id` (`platform.provision_spec` names it `owner_org_id`), and the curated five are
# filtered by it exactly like the rest — until today they were copied whole, which carried
# provision_spec's three customer rows onto the branch.
# 🚨 THE COLUMN INTERSECTION, READ ONCE FROM BOTH CATALOGS. The branch is not always shaped like
# the source — `platform.feature_knob` carries three columns on the clone that this branch lacks —
# and `select *` into a differently shaped table is `extra data after last expected column`, which
# on 2026-09-22 emptied that table and loaded nothing back. Every seeded table is therefore read
# and written by the NAMES both sides have, in the source's order. A table the branch does not have
# at all gets an empty list and is skipped by name.
typeset -A SRC_COLS BR_COLS
COLSQL="select n.nspname||'.'||c.relname, string_agg(quote_ident(a.attname), ',' order by a.attnum)
          from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
         where c.relkind in ('r','p') and a.attnum > 0 and not a.attisdropped
           and n.nspname = any(array['platform','tool','iam','custom','content_ir','history','public'])
         group by 1"
while IFS='|' read -r ct cv; do [ -n "$ct" ] && SRC_COLS[$ct]="$cv"; done < <("$PSQL" "${SRC[@]}" -qAtF'|' -c "$COLSQL" 2>/dev/null)
while IFS='|' read -r ct cv; do [ -n "$ct" ] && BR_COLS[$ct]="$cv"; done < <("$PSQL" "$BRANCH_DSN" -qAtF'|' -c "$COLSQL" 2>/dev/null)
say "  column catalogs read: ${#SRC_COLS[@]} tables on the source, ${#BR_COLS[@]} on the branch"

# common_cols <schema.table> -> the quoted columns both sides have, in the source's order
common_cols() {
  local t="$1" out="" c
  [ -n "${SRC_COLS[$t]:-}" ] && [ -n "${BR_COLS[$t]:-}" ] || { print -n ""; return 1; }
  for c in ${(s:,:)SRC_COLS[$t]}; do
    [[ ",${BR_COLS[$t]}," == *",$c,"* ]] && out="${out:+$out,}$c"
  done
  print -n -- "$out"
}

typeset -A SEED_FILTER
while IFS='|' read -r ft fv; do SEED_FILTER[$ft]="$fv"; done < <(python3 -c '
import json, sys
for t in json.load(open(sys.argv[1]))["tables"]:
    print("%s|%s" % (t["table"], t.get("filter_column") or ""))
' "$SEED_LIST_JSON" 2>/dev/null)

say "─── (2) curated seed: reading the reference tables ───"
typeset -a SEED_OK
for t in "${SEED_TABLES[@]}"; do
  f="$WORK/seed_${t//./_}.tsv"
  col="${SEED_FILTER[$t]:-}"
  cc="$(common_cols "$t")"
  if [ -z "$cc" ]; then say "  $t: the branch does not have this table (or shares no column with the source); skipped"; continue; fi
  if [ -n "$col" ]; then CSEL="select $cc from $t where \"$col\" is null or \"$col\" = '$SYSORG_ID'"
  else                   CSEL="select $cc from $t"; fi
  out="$("$PSQL" "${SRC[@]}" -qAt -c "\copy ($CSEL) to '$f'" 2>&1)"
  if [ -f "$f" ] && ! print -r -- "$out" | grep -qE 'ERROR|FATAL'; then
    SEED_OK+=("$t"); say "  $t: $(wc -l < "$f" | tr -d ' ') rows, $(du -h "$f" | cut -f1)"
  else
    say "  $t: NOT READ — $(print -r -- "$out" | head -1); it will be skipped"
  fi
done
say "seed tables read: ${#SEED_OK[@]} of ${#SEED_TABLES[@]}"

# ── THE DOOR'S TYPE OIDs, READ BY NAME ───────────────────────────────────────
# 🚨 `platform.client_callable_door.identity_argtypes` IS AN `oid[]`, AND AN OID IS NOT PORTABLE.
# A restored database assigns fresh OIDs to every user-defined type, so a verbatim copy of this
# column names the SOURCE's `permission_level`, `visibility`, `custom.record` … and the branch's
# `door_identity_is_the_catalogs` trigger (DD-223) correctly answers "the identity_argtypes on
# this row name no live function". Measured 2026-09-22: 43 of the 50 rows refused every run were
# exactly this, and the 1,685 that landed were the doors whose arguments are all BUILT-IN types,
# whose OIDs are fixed by Postgres and therefore happened to match.
#
# So the OIDs are carried across BY NAME: the source reports each row's argument types as
# `schema.typename`, and the branch resolves them back to its own OIDs before the insert. The
# guard is not touched — it is SATISFIED, with the identity it was always meant to check.
#
# `regclass` / `regprocedure` columns (platform.entity_types.table_ref, version_store_ref,
# platform.realtime_topic_prefix.admits_fn) need no such help: COPY renders those by NAME
# already. A BARE `oid` or `oid[]` column is the unportable shape, and the loop below names any
# other one that turns up in the seed set so this is never rediscovered by a silent refusal.
DOOR_TYPES="$WORK/door_argtypes.tsv"
DOUT2="$("$PSQL" "${SRC[@]}" -qAt -c "\copy (select d.id::text, coalesce((select string_agg(t.typnamespace::regnamespace::text||'.'||quote_ident(t.typname), ',' order by o.ord) from unnest(d.identity_argtypes) with ordinality o(x, ord) left join pg_type t on t.oid = o.x), '') from platform.client_callable_door d where d.identity_argtypes is not null and array_length(d.identity_argtypes,1) > 0) to '$DOOR_TYPES'" 2>&1)"
if [ -s "$DOOR_TYPES" ] && ! print -r -- "$DOUT2" | grep -qE 'ERROR|FATAL'; then
  say "  door identity_argtypes, read as type NAMES: $(wc -l < "$DOOR_TYPES" | tr -d ' ') row(s) — OIDs are not portable and are translated on the branch"
else
  say "  door identity_argtypes NOT READ — $(print -r -- "$DOUT2" | head -1). The door load will refuse every row whose arguments include a user-defined type."
  DOOR_TYPES=""
fi
# Any OTHER bare oid/oid[] column in the seed set has the same defect and no translation here.
OIDCOLS="$("$PSQL" "${SRC[@]}" -qAt -c "select n.nspname||'.'||c.relname||'.'||a.attname from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and a.attnum>0 and not a.attisdropped and format_type(a.atttypid,a.atttypmod) in ('oid','oid[]') and n.nspname||'.'||c.relname = any(array['${(j:',':)SEED_TABLES}'])" 2>/dev/null | grep -v 'client_callable_door.identity_argtypes')"
[ -n "$OIDCOLS" ] && say "  🚨 other bare oid column(s) in the seed set, which this job does NOT translate: $(print -r -- "$OIDCOLS" | tr '\n' ' ')"

# name|filter_column|truncate_first, for every table the file rules SEEDED.
# 🚨 NOT tab-separated. TAB is IFS *whitespace*, so `read -r a b c` COLLAPSES two of them and every
# field after an empty one shifts left: a table with no organization key came out with col="1" and
# the read became `where "1" is null`, which is `column "1" does not exist` — 50 of the 101 declared
# tables silently NOT READ on the first live seed-only run (2026-09-22 17:35Z). `|` never collapses. The five
# curated tables above are loaded in their own FK order, so they are dropped from this set rather
# than read and loaded twice.
typeset -a LOOKUP_OK LOOKUP_FILTER LOOKUP_TRUNC
LOOKUP_OK=(); typeset -A LOOKUP_FILTER LOOKUP_TRUNC
DECLARED="$(python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
skip = set(sys.argv[2].split())
for t in d["tables"]:
    if t.get("seed") and t["table"] not in skip:
        print("%s|%s|%s" % (t["table"], t.get("filter_column") or "", "1" if t.get("truncate_first") else "0"))
' "$SEED_LIST_JSON" "${SEED_TABLES[*]}" 2>&1)"
if print -r -- "$DECLARED" | grep -q 'Traceback'; then
  say "REFUSED: $SEED_LIST_JSON could not be read: $(print -r -- "$DECLARED" | tail -1). Nothing written anywhere."
  exit 78
fi
say "  tables the checked-in list declares SEEDED (beyond the curated ${#SEED_TABLES[@]}): $(print -r -- "$DECLARED" | grep -c . )"
print -r -- "$DECLARED" | while IFS='|' read -r t col trunc; do
  [ -n "$t" ] || continue
  f="$WORK/lookup_${t//./_}.tsv"
  cc="$(common_cols "$t")"
  if [ -z "$cc" ]; then say "    $t: the branch does not have this table (or shares no column with the source); skipped"; continue; fi
  if [ -n "$col" ]; then SEL="select $cc from $t where \"$col\" is null or \"$col\" = '$SYSORG_ID'"
  else                   SEL="select $cc from $t"; fi
  o="$("$PSQL" "${SRC[@]}" -qAt -c "\copy ($SEL) to '$f'" 2>&1)"
  if [ -f "$f" ] && ! print -r -- "$o" | grep -qE 'ERROR|FATAL'; then
    n="$(wc -l < "$f" | tr -d ' ')"
    if [ "$n" = "0" ]; then say "    $t: 0 platform-owned rows on the source right now; not loaded"
    else print -r -- "$t|$col|$trunc|$n" >> "$WORK/lookups.read"; fi
  else
    say "    $t: NOT READ — $(print -r -- "$o" | head -1)"
  fi
done
if [ -f "$WORK/lookups.read" ]; then
  while IFS='|' read -r t col trunc n; do
    LOOKUP_OK+=("$t"); LOOKUP_FILTER[$t]="$col"; LOOKUP_TRUNC[$t]="$trunc"
  done < "$WORK/lookups.read"
fi
say "  declared tables with platform-owned rows to load: ${#LOOKUP_OK[@]}"

SYSORG="$WORK/seed_system_org.tsv"
SYSORG_COLS="$(common_cols iam.organizations)"
SOUT="$("$PSQL" "${SRC[@]}" -qAt -c "\copy (select $SYSORG_COLS from iam.organizations where is_system is true) to '$SYSORG'" 2>&1)"
if [ -f "$SYSORG" ] && ! print -r -- "$SOUT" | grep -qE 'ERROR|FATAL'; then
  say "  the system organization(s): $(wc -l < "$SYSORG" | tr -d ' ') row(s) — is_system only, never a customer"
else
  say "  the system organization: NOT READ — $(print -r -- "$SOUT" | head -1). Every reference table will fail its foreign key."
  SYSORG=""
fi

say "─── (2) the runner ledger, read from the source ───"
# 🚨 THE GUARD'S OWN EXEMPTION TABLE COMES FIRST. `_schema_migrations_slot_guard` refuses a file
# whose number slot is already held by a different applied migration — and the source's own ledger
# holds 202 such pairs, grandfathered because they were written before the guard existed. The
# platform authors built the escape hatch themselves: `public._schema_migration_slot_grandfather`
# lists, per (source, slot), the FILENAMES that legitimately share it, and the guard consults it by
# name. That table is in `public`, so the `platform`-scoped lookup derivation never picked it up
# and the branch's copy was EMPTY — which is the whole of the 202. Seeded first, 202 refusals go to
# zero with the guard fully armed (measured on the branch, 2026-09-22).
GRANDFATHER="$WORK/slot_grandfather.tsv"
GFOUT="$("$PSQL" "${SRC[@]}" -qAt -c "\copy (select * from public._schema_migration_slot_grandfather) to '$GRANDFATHER'" 2>&1)"
if [ -f "$GRANDFATHER" ] && ! print -r -- "$GFOUT" | grep -qE 'ERROR|FATAL'; then
  say "  public._schema_migration_slot_grandfather: $(wc -l < "$GRANDFATHER" | tr -d ' ') rows (the slot guard's own exemption list)"
else
  say "  the slot-grandfather list NOT READ — $(print -r -- "$GFOUT" | head -1). ~202 ledger rows will be refused on legitimate historical slot collisions."
  GRANDFATHER=""
fi
LEDGER="$WORK/ledger.tsv"
LOUT="$("$PSQL" "${SRC[@]}" -qAt -c "\copy (select * from public._schema_migrations) to '$LEDGER'" 2>&1)"
if print -r -- "$LOUT" | grep -qE 'ERROR|FATAL'; then
  say "  ledger NOT READ — $(print -r -- "$LOUT" | head -1). '--target branch' will judge 'already applied' wrongly."
  LEDGER=""
else
  say "  public._schema_migrations: $(wc -l < "$LEDGER" | tr -d ' ') rows"
fi
# No PGPASSWORD is ever set by this job: the clone DSN carries its own password, and the
# production credentials in aidream/.env are never read here at all.

# ─────────────────────────────────────────────────────────────────────────────
# (3) THE BRANCH APPLY — the only writes in this file.
# ─────────────────────────────────────────────────────────────────────────────
say "─── (3) branch apply ───"
# The target is asserted AGAIN, immediately before the first destructive statement. The
# assertion above was several minutes and one pg_dump ago; this one is the last thing
# between this job and a DROP SCHEMA.
night_assert_target branch "$BRANCH_DSN" || exit $?

if [ "$SEED_ONLY" = "1" ]; then
  say "SEED-ONLY: nothing is dropped, nothing is restored, the ledger is not rewritten and the"
  say "  identities are left exactly as they are. The branch keeps its schema; only the declared",
  say "  seed tables below are written."
else
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

  # 🚨 THE DROP IS BATCHED AND ITERATED, BECAUSE ONE STATEMENT CANNOT HOLD THE LOCKS.
  # The first cut dropped all 64 schemas in ONE `DROP SCHEMA … CASCADE` "so cross-schema
  # dependencies cannot order us wrong". At this estate's size that transaction needs a lock per
  # object and dies on `ERROR: out of shared memory / HINT: You might need to increase
  # "max_locks_per_transaction"` (measured 2026-09-22 13:36:33Z) — leaving the branch untouched but
  # unrefreshed, every night, silently, the moment the estate crossed the threshold.
  #
  # Batching does not reintroduce the ordering problem: CASCADE already reaches across schemas, and
  # this loop runs to a FIXED POINT — it re-reads which of the drop set still exist after every pass
  # and keeps going until none do. A pass that removes nothing is a refusal that NAMES what is left,
  # never a silent partial drop.
  #
  # The explicit lock_timeout is here because the database asked for one: the branch carries
  # `ddl_lock_timeout_guard`, which bounds an unqualified DROP SCHEMA's wait to TWO SECONDS ("set an
  # explicit nonzero lock_timeout before DDL to choose a different bound"). Two seconds is a
  # production read budget; sixty is the deliberate bound for the disposable rehearsal branch.
  # ONE SCHEMA PER TRANSACTION, and the reason is a measured number. The branch runs
  # `max_locks_per_transaction = 64` with `max_connections = 60`, so the WHOLE cluster has roughly
  # 3,840 lock slots; a DROP SCHEMA CASCADE takes one per relation it reaches, and the branch's
  # largest schemas hold 925 (`hr`), 563 (`seo`) and 543 (`custom`) relations. Eight schemas in one
  # transaction therefore blew the lock table every time (`out of shared memory`, 13:47Z), while one
  # at a time fits with room to spare. The parameter is not ours to raise on a Supabase branch.
  DROP_BATCH=1

  # THE DOORS COME OUT FIRST, BECAUSE A PLATFORM GUARD IS DOING ITS JOB. `provision_shape_guard`
  # fires at ddl_command_end and refuses any transaction that reaches COMMIT with a
  # `platform.client_callable_door` row naming a function the catalog no longer holds — which is
  # every statement of a teardown. The answer is NOT to disable a platform guard: it is to remove
  # the rows it is protecting, in the right order. The table is in SEED_TABLES and is reloaded
  # verbatim from the clone a few steps below, so this is a move, not a loss.
  say "emptying platform.client_callable_door ($("$PSQL" "$BRANCH_DSN" -qAt -c 'select count(*) from platform.client_callable_door' 2>&1) rows) so provision_shape_guard has nothing to protect mid-teardown; the clone's copy is reloaded below"
  DOUT="$("$PSQL" "$BRANCH_DSN" -qAt -c "truncate table platform.client_callable_door cascade" 2>&1)"
  print -r -- "$DOUT" | grep -qE 'ERROR:|FATAL:' && say "  could not empty it — $(print -r -- "$DOUT" | grep -m1 -E 'ERROR:|FATAL:'); the drop will very likely refuse"

  say "dropping ${#DROP_SET[@]} schema(s), CASCADE, one per transaction, iterated to a fixed point"
  typeset -a REMAIN; REMAIN=("${DROP_SET[@]}")
  DROP_PASS=0
  while [ ${#REMAIN[@]} -gt 0 ]; do
    DROP_PASS=$((DROP_PASS+1))
    if [ $DROP_PASS -gt 12 ]; then
      say "REFUSED: after $((DROP_PASS-1)) passes ${#REMAIN[@]} schema(s) still exist: ${(j:, :)REMAIN}"
      say "  The branch is mid-refresh; re-run the job. Nothing else was attempted."
      exit 78
    fi
    BEFORE=${#REMAIN[@]}
    for ((i=1; i<=${#REMAIN[@]}; i+=DROP_BATCH)); do
      typeset -a CHUNK; CHUNK=("${(@)REMAIN[i,i+DROP_BATCH-1]}")
      DROPOUT="$("$PSQL" "$BRANCH_DSN" -qAt \
        -c "set lock_timeout = '60s'" \
        -c "drop schema if exists ${(j:, :)CHUNK} cascade" 2>&1)"
      if print -r -- "$DROPOUT" | grep -qE 'ERROR:|FATAL:'; then
        say "  pass $DROP_PASS, batch ${(j:,:)CHUNK}: $(print -r -- "$DROPOUT" | grep -m1 -E 'ERROR:|FATAL:')"
      fi
    done
    # Re-read the truth from the catalog rather than trusting the statements above.
    STILL="$("$PSQL" "$BRANCH_DSN" -qAt -c \
      "select nspname from pg_namespace where nspname = any(array['${(j:',':)DROP_SET}']) order by 1" 2>&1)"
    if print -r -- "$STILL" | grep -qE 'ERROR:|FATAL:'; then
      say "REFUSED: could not re-read the schema list after pass $DROP_PASS — $(print -r -- "$STILL" | head -1). Nothing else attempted."
      exit 78
    fi
    REMAIN=("${(@f)STILL}"); [ "$REMAIN[1]" = "" ] && REMAIN=()
    say "  pass $DROP_PASS: ${#REMAIN[@]} of ${#DROP_SET[@]} schema(s) still present"
    if [ ${#REMAIN[@]} -gt 0 ] && [ ${#REMAIN[@]} -eq $BEFORE ]; then
      say "REFUSED: pass $DROP_PASS removed nothing and ${#REMAIN[@]} schema(s) remain: ${(j:, :)REMAIN}"
      say "  The branch is mid-refresh; re-run the job. Nothing else was attempted."
      exit 78
    fi
  done
  say "  dropped: all ${#DROP_SET[@]} schema(s) gone, confirmed from the catalog in $DROP_PASS pass(es)."

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
    say "purging copied identities: the branch holds $("$PSQL" "$BRANCH_DSN" -qAt -c 'select count(*) from auth.users' 2>&1) auth.users rows, 527 of which BRANCH-DRIFT.md measured as identical to production's (copied by the 2026-09-16 transplant)"
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
    # THE EXEMPTION LIST FIRST, OR 202 ROWS ARE REFUSED ON HISTORY THE SOURCE ITSELF RECORDS.
    if [ -n "$GRANDFATHER" ]; then
      "$PSQL" "$BRANCH_DSN" -qAt -c "truncate table public._schema_migration_slot_grandfather" >/dev/null 2>&1
      say "  slot grandfather: $(seed_load public._schema_migration_slot_grandfather "$GRANDFATHER"); branch now holds $("$PSQL" "$BRANCH_DSN" -qAt -c 'select count(*) from public._schema_migration_slot_grandfather' 2>&1) rows"
    fi
    # 🚨 ROW BY ROW, because the ledger carries a trigger that RAISES. `_schema_migrations_slot_guard`
    # refuses a file whose migration NUMBER is already held by a different filename, and the clone's
    # own ledger contains such a pair (`aidream/0002_cld_files_realtime.sql` vs
    # `0002_rag_organization_retrofit.sql`). As one `\copy` that single row aborted all 4,861 and the
    # branch ledger came out EMPTY (measured 2026-09-22 14:57:22Z). The refused rows are counted and
    # their first reason printed; a ledger missing a handful of collided rows is a usable ledger, an
    # empty one is not.
    say "  ledger: $(seed_load public._schema_migrations "$LEDGER"); branch now holds $("$PSQL" "$BRANCH_DSN" -qAt -c 'select count(*) from public._schema_migrations' 2>&1) rows"
    # WHAT IS LEFT, NAMED. After the grandfather list the only refusals are the rows the ledger's
    # checksum guard calls permanently unverifiable — a checksum that is not a SHA-256 hex digest,
    # written before 2026-08-29, for which the guard deliberately offers NO exemption and this job
    # deliberately offers no workaround. Measured on the branch 2026-09-22: 255 refused -> 43, all 43
    # of this one shape. Those 43 migrations will be judged UNAPPLIED by `--target branch`.
    BADSUM="$("$PSQL" "$SRC_DSN" -qAt -c "select count(*) from public._schema_migrations where checksum !~ '^[0-9a-f]{64}\$'" 2>&1)"
    say "  of the source's rows, $BADSUM carry a checksum that is not a SHA-256 digest; the ledger's own"
    say "    checksum guard refuses those and offers no exemption, so they cannot be seeded and"
    say "    '--target branch' will judge those migrations unapplied. That is the source's history, not a copy defect."
  else
    say "ledger re-seed skipped ($([ "$REHEARSE" = 1 ] && print -n 'rehearsal — the branch ledger is not rewritten' || print -n 'the ledger could not be read'))"
  fi

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
  # 🚨 `on conflict do nothing` WITHOUT a target. The purge deliberately KEEPS admin@admin.com and
  # test@test.com, so those rows are normally already present — and `on conflict (id)` covers only the
  # primary key, so the insert died on `users_email_partial_key` and took the whole transaction, and
  # every organization below it, with it (measured 2026-09-22 14:57:31Z). Targetless DO NOTHING
  # covers every unique constraint on the table, which is exactly the intent: keep whoever is there.
  print -r -- "on conflict do nothing;"
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
    print -r -- "select '$sn', '$id', '$abbr', '${ind//\'/\'\'}', false, false, u.id, u.id, jsonb_build_object('cleanupTag','$tag','test_fixture',true,'useCaseId','$id') from auth.users u where u.email = 'admin@admin.com'"
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

fi

say "loading the curated seed"
# 🚨 ORDER: the system organization, then the tables that reference it. On the first live run the
# seed ran BEFORE the identities and every table died on `*_organization_id_fkey` — the rows all
# point at one `is_system` organization that nothing had put back yet.
if [ -n "$SYSORG" ] && [ "$REHEARSE" != "1" ]; then
  # Its created_by/updated_by name a production user this job purged, so they are re-pointed at
  # the branch's own admin identity. Nothing else about the row is touched.
  say "  iam.organizations (is_system only): $(seed_load iam.organizations "$SYSORG" "update _seed_stage set created_by = (select id from auth.users where email = 'admin@admin.com'), updated_by = (select id from auth.users where email = 'admin@admin.com')" "" 0 "$SYSORG_COLS")"
fi
# The curated five obey the SAME truncate rule as the declared set: emptied only when every source
# row is platform-owned. `platform.provision_spec` is the one of them that is not (16 of 19), and
# truncating it would have destroyed the branch's own three rows for nothing.
typeset -A CURATED_TRUNC
while IFS='|' read -r ct cv; do CURATED_TRUNC[$ct]="$cv"; done < <(python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
for t in d["tables"]:
    print("%s|%s" % (t["table"], "1" if t.get("truncate_first") else "0"))
' "$SEED_LIST_JSON" 2>/dev/null)
for t in "${SEED_OK[@]}"; do
  f="$WORK/seed_${t//./_}.tsv"
  [ "${CURATED_TRUNC[$t]:-1}" = "1" ] || say "  $t: NOT emptied — the source holds customer rows this branch must keep out, so the filtered copy is appended"
  PRE="" FIX=""
  if [ "$t" = "platform.client_callable_door" ] && [ -n "$DOOR_TYPES" ]; then
    # Re-point every row's identity_argtypes at THIS database's OIDs for the same type NAMES.
    # A row naming a type the branch does not have is left alone and refused by the guard with
    # its own message, which is the honest outcome: the branch really is missing that type.
    PRE="create temp table _door_types (id uuid, names text) on commit drop;
\\copy _door_types from '$DOOR_TYPES'"
    FIX="update _seed_stage s set identity_argtypes = x.oids from _door_types m, lateral (select array_agg(to_regtype(n)::oid order by ord) as oids, count(*) filter (where to_regtype(n) is null) as unresolved from unnest(string_to_array(m.names, ',')) with ordinality u(n, ord)) x where m.id = s.id and x.unresolved = 0"
  fi
  say "  $t: $(seed_load "$t" "$f" "$FIX" "$PRE" "${CURATED_TRUNC[$t]:-1}" "$(common_cols "$t")")  -> $("$PSQL" "$BRANCH_DSN" -qAt -c "select count(*) from $t" 2>&1) rows on the branch"
done
# WHAT THE DOOR TABLE STILL REFUSES, AND WHY IT IS NOT A COPY DEFECT. After the OID translation the
# residue measured on 2026-09-22 was 9 of 1,735: two rows naming functions this branch does not hold
# (campaign_watch.consumer_access_diff — `campaign_watch` is deliberately never dumped, its lock
# lives there; and one function the dump had not yet caught up with), and SEVEN rows that the
# SOURCE'S OWN GUARD would refuse if they were re-inserted there: SECURITY DEFINER functions opened
# to clients that take an id and reach no access decision (public.fork_shared_quiz,
# fork_shared_flashcard_set, fork_shared_conversation, hr_wf_for_target, record_guest_execution,
# dict_resolve, web.assert_crawl_artifact_file_reused). Their bodies are byte-identical on the
# clone, so they are grandfathered rows that predate the guard — the `seo.keyword_value_map` class
# the guard's own message cites. They are named individually below so nobody reads them as noise.
DOORMISS="$("$PSQL" "$BRANCH_DSN" -qAt -c "select count(*) from platform.client_callable_door" 2>&1)"
say "  doors on the branch: $DOORMISS (source has $("$PSQL" "$SRC_DSN" -qAt -c 'select count(*) from platform.client_callable_door' 2>&1)); a residue here is a SOURCE row that the source's own guards would refuse, not a copy defect — see the note above this line in the job."

# The derived lookup/registry tables, after the curated five (feature_knob and taxonomy_node are
# what several of them key on). Each is emptied first: `\copy`-style appends die on their own
# primary key when a run is repeated.
# 🚨 A TABLE THAT HOLDS ANY CUSTOMER ROW IS NEVER EMPTIED. `truncate_first` is true only when
# EVERY source row is platform-owned, so emptying it makes a repeated run match the source exactly.
# Where the source holds customer rows the filtered copy was never going to replace them, so a
# truncate could only DESTROY — those tables are appended to, and a row already present is refused
# by its own primary key, counted, and named.
for t in "${LOOKUP_OK[@]}"; do
  f="$WORK/lookup_${t//./_}.tsv"
  say "  $t: $(seed_load "$t" "$f" "" "" "${LOOKUP_TRUNC[$t]}" "$(common_cols "$t")")  -> $("$PSQL" "$BRANCH_DSN" -qAt -c "select count(*) from $t" 2>&1) rows on the branch$([ "${LOOKUP_TRUNC[$t]}" = "1" ] || print -n ' (appended: the source holds customer rows this branch must keep out, so it is never emptied)')"
done

# BRANCH-REF re-point. Same database, so the identifier must NOT have moved; if it has,
# something is very wrong and this job says so rather than rewriting the file.
NOWID="$("$PSQL" "$BRANCH_DSN" -qAt -c 'select system_identifier from pg_control_system()' 2>&1 | tr -d ' ')"
WANTID="$(grep -m1 '^system_identifier' "$BRANCH_REF_FILE" | sed -E 's/.*= *//' | tr -d ' ')"
if [ "$NOWID" = "$WANTID" ]; then say "BRANCH-REF: unchanged ($NOWID) — as expected, this is the same database"
else say "🚨 BRANCH-REF: the branch now answers $NOWID, not $WANTID. plan/BRANCH-REF needs a person."; fi

# ─────────────────────────────────────────────────────────────────────────────
# (4) THE VERDICT — the drift number, then the suites.
# ─────────────────────────────────────────────────────────────────────────────
if [ "$SEED_ONLY" = "1" ]; then
  say "SEED-ONLY: the schema-drift gate is not run — this mode changed no schema."
  DNUM=skipped DEXIT=0
else
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
fi

# SUITE-TARGET and AIDREAM-RED measured what the branch lacks and the clone has. Measured on
# 2026-09-22, before this refresh:
#   · EXECUTE for `authenticated` on custom.record_write / record_update / record_delete /
#     table_declare — all four `f` on the branch, all four `t` on the clone.
#   · platform.feature_knob rows for feature `custom` — 32 on the branch, 48 on the clone.
# Neither is seeded by hand: the grants ride the dump's ACLs and the knobs ride the verbatim
# platform.feature_knob copy. So they are ASSERTED here, by name and by count, instead of being
# inferred from a suite tally — a refresh that silently dropped one of them is the exact failure
# the --no-acl defect would have produced.
say "─── (4) verification: the grants and knobs the branch was measured to lack ───"
typeset -a NEED_EXEC
NEED_EXEC=(record_write record_update record_delete table_declare)
GRANTS_OK=1
for fn in "${NEED_EXEC[@]}"; do
  g="$("$PSQL" "$BRANCH_DSN" -qAt -c "select coalesce(bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')), false) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='custom' and p.proname='$fn'" 2>&1)"
  say "  exec:authenticated custom.$fn -> ${g:-(no answer)}"
  [ "$g" = "t" ] || GRANTS_OK=0
done
KC="$("$PSQL" "$BRANCH_DSN" -qAt -c "select count(*) from platform.feature_knob where feature='custom'" 2>&1)"
KS="$("$PSQL" "$SRC_DSN" -qAt -c "select count(*) from platform.feature_knob where feature='custom'" 2>&1)"
say "  platform.feature_knob feature='custom' -> $KC row(s) on the branch, $KS on the clone (was 32 vs 48)"
K="$("$PSQL" "$BRANCH_DSN" -qAt -c "select count(*) from platform.feature_knob where feature='custom' and key='member_default_visibility'" 2>&1)"
say "  row platform.feature_knob custom/member_default_visibility -> ${K:-(no answer)} row(s)   (21 suites skip without it)"
if [ "$GRANTS_OK" != "1" ] || [ "${KC:-0}" != "${KS:-x}" ]; then
  say "  🚨 the refresh did not bring one of these across. A missing grant means the dump's ACLs"
  say "     did not carry it; a knob count below the clone's means the feature_knob copy did not"
  say "     land. Neither is fixed by seeding it by hand here — the source read is what to look at."
else
  say "  all four grants present and the knob count matches the clone."
fi

if [ "$SEED_ONLY" = "1" ]; then
  say "SEED-ONLY: the 14-suite verdict is not run — it judges a refresh, and this mode is not one."
  VPASS=0 VSKIP=0 VFAIL=0
else
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
    elif [ -n "$skip" ]; then
      VSKIP=$((VSKIP+1))
      # _preamble.sql names the token it lacks after "does not have: ". Collect them, so the
      # tally at the end says WHAT the refresh failed to bring, not merely how many skipped.
      print -r -- "${skip##*does not have: }" >> "$WORK/missing-tokens.txt"
      say "  $(printf '%-56s %-6s %s' "$b" SKIP "$(print -r -- "$skip" | cut -c1-110)")"
    else VPASS=$((VPASS+1)); say "  $(printf '%-56s %s' "$b" PASS)"; fi
  done
  say "suites: PASS $VPASS · SKIP $VSKIP · FAIL $VFAIL  (was PASS 4 / FAIL 10 on 2026-09-22 before the refresh; a SKIP is the suite saying the branch still lacks its dependency)"
  if [ -s "$WORK/missing-tokens.txt" ]; then
    say "tokens the refresh did not bring, by how many of these suites named them:"
    tr '|' '\n' < "$WORK/missing-tokens.txt" | sed 's/^ *//;s/ *$//' | sort | uniq -c | sort -rn \
      | while read -r c t; do say "    $c × $t"; done
  fi

fi

say "───────── BRANCH-REFRESH RESULT ─────────"
say "dump ${DUMP_SECS}s · restore ${RESTORE_SECS}s · restore errors $RERR · drift ${DNUM:-0} · suites PASS $VPASS SKIP $VSKIP FAIL $VFAIL"
say "work directory left in place for inspection: $WORK"
exit 0
