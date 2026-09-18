#!/usr/bin/env bash
# W3-WORK — THE TWO CLAUSES THAT CANNOT LIVE IN A ROLLED-BACK TRANSACTION.
#
#   PART A — REC-71. Two REAL concurrent psql sessions hold the same slot at the same time.
#            One commits; the other blocks on `custom.work_slots_declare`'s own unique index and
#            is refused BY THAT INDEX'S OWN NAME, and exactly one hold row survives.
#   PART B — REC-70. A graph whose third record is illegal, run in AUTOCOMMIT from a session
#            that never opened a transaction, counted before and after from a SEPARATE fresh
#            connection that never saw the failed statement. `w3_work_c44.sql`'s own PART 2
#            counts the same failure inside a SUBTRANSACTION of an already-open transaction and
#            says in its own comment that this is the weaker half — this is the real one.
#
# WHAT MAKES IT FAIL — THE CHANGE, NAMED (rule 3): drop the `unique` from the slot Field in
# `custom.work_slots_declare` and PART A's second hold commits, leaving two rows for one slot;
# make `custom.work_template_instantiate` commit each node as it is created instead of as one
# statement and PART B's failed graph leaves rows behind for the fresh session to find.
#
# IT IS NOT A MIGRATION and no sweep can see it. It COMMITS to the rehearsal branch — that is
# the whole point of PART A — and DELETES every row, table and index it created before it exits,
# including on failure.
#
#   bash scripts/campaign-tests/w3_work_parallel.sh
#
# macOS ships bash 3.2, which MIS-PARSES a here-document opened inside `$( )`. Every SQL block
# here is therefore written to a file first and fed with `-f`, per `w1_index_b1.sh`'s measured
# trap.

set -euo pipefail
cd "$(dirname "$0")/../.."

PSQL="${PSQL:-$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)}"
DSN="$(grep '^SUPABASE_BRANCH_DATABASE_URL=' .env.local | cut -d= -f2-)"
[ -n "$DSN" ] || { echo "no SUPABASE_BRANCH_DATABASE_URL in .env.local"; exit 1; }

ORG='39c38960-d30c-4840-b0c1-c9960de95582'
SLUG='zz_w3_work_parallel'
TMP="$(mktemp -d)"

cleanup() {
  "$PSQL" "$DSN" -q -v ON_ERROR_STOP=1 -c "
    set statement_timeout = '300s';
    do \$c\$
    declare r record; n bigint;
    begin
      with t as (select id from custom.record where organization_id = '$ORG'::uuid and data->>'slug' = '$SLUG')
      delete from custom.record r2 using t
       where r2.organization_id = '$ORG'::uuid
         and (r2.id = t.id or r2.table_id = t.id or (r2.data->>'entity_definition_id')::uuid = t.id);
      get diagnostics n = row_count;
      update platform.feature_knob set value = 'false'::jsonb
       where feature = 'custom' and key = 'field_index_guard';
      raise notice 'cleanup: % record(s) removed, custom/field_index_guard back to false', n;
    end \$c\$;" || echo "CLEANUP FAILED — the branch may still hold this script's Table, its slot index, or the guard switched ON. Run it again, or clear them by hand."
  rm -rf "$TMP"
}
trap cleanup EXIT

say() { printf '%s\n' "$*"; }
q()   { "$PSQL" "$DSN" -At -q -v ON_ERROR_STOP=1 -c "$1"; }

SYSID="$(q "select (pg_control_system()).system_identifier")"
[ "$SYSID" = "7678069749886157684" ] || { say "refusing: system_identifier $SYSID is not the rehearsal branch"; exit 1; }

q "update platform.feature_knob set value='true'::jsonb where feature='custom' and key='field_index_guard'" >/dev/null

# ── PART A — REC-71: two REAL concurrent sessions on one slot ────────────────────────────
say "PART A — declaring the slot table…"
cat > "$TMP/decl.sql" <<SQL
set statement_timeout = '300s';
select custom.work_slots_declare('$ORG'::uuid, 'ZZ Parallel Rooms', '$SLUG');
SQL
DECL="$("$PSQL" "$DSN" -At -q -v ON_ERROR_STOP=1 -f "$TMP/decl.sql" | tail -1)"
STABLE="$(printf '%s' "$DECL" | sed -n 's/.*"table_id": *"\([^"]*\)".*/\1/p')"
IDX="$(printf '%s' "$DECL" | sed -n 's/.*"index_name": *"\([^"]*\)".*/\1/p')"
say "PART A —   slot table $STABLE, decided by $IDX"

cat > "$TMP/a.sql" <<SQL
\set ON_ERROR_STOP on
begin;
select custom.work_slot_hold('$ORG'::uuid, '$STABLE'::uuid, '2026-11-01T09:00', 'alice', interval '10 minutes');
select pg_sleep(3);
commit;
SQL
cat > "$TMP/b.sql" <<SQL
\set ON_ERROR_STOP on
\timing on
select custom.work_slot_hold('$ORG'::uuid, '$STABLE'::uuid, '2026-11-01T09:00', 'bob', interval '10 minutes');
SQL

"$PSQL" "$DSN" -q -f "$TMP/a.sql" > "$TMP/a.out" 2>&1 &
A_PID=$!
sleep 1
set +e
"$PSQL" "$DSN" -f "$TMP/b.sql" > "$TMP/b.out" 2>&1
B_RC=$?
set -e
wait "$A_PID"

N_HELD="$(q "select count(*) from custom.work_slot_holds('$ORG'::uuid, '$STABLE'::uuid) where slot_key = '2026-11-01T09:00'")"
if [ "$B_RC" -eq 0 ]; then
  say "FAIL: both concurrent sessions held the same slot. Holds now live for it: $N_HELD"; exit 1
fi
if ! grep -q "$IDX" "$TMP/b.out"; then
  say "FAIL: the loser was refused, but not by the slot index's own name. It read:"; cat "$TMP/b.out"; exit 1
fi
[ "$N_HELD" = "1" ] || { say "FAIL: exactly one hold must survive for the slot, and $N_HELD do."; exit 1; }
say "PART A —   winner (alice) committed; loser (bob) blocked on the index, then: $(grep -i 'ERROR' "$TMP/b.out" | head -1)"
say "PART A PASS — REC-71: two REAL concurrent sessions met the same unique index, one committed, one was refused by its own name, one hold survives."
say ""

# ── PART B — REC-70: mid-graph failure, counted from a session that never saw it ──────────
say "PART B — a graph whose third record is illegal, run in AUTOCOMMIT…"
cat > "$TMP/fixture.sql" <<SQL
set statement_timeout = '300s';
do \$f\$
declare v_t uuid;
begin
  v_t := custom.table_declare('$ORG'::uuid, jsonb_build_object(
    'name','ZZ W3 Work Parallel','slug','$SLUG','type','entity',
    'label_singular','Task','label_plural','Tasks','title_field','title',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','title'), jsonb_build_object('name','status')),
    'parent_id','11111111-0000-4000-8000-000000000001'));
  -- A REAL, promoted-store Field marked required — the table's own light 'fields' shorthand
  -- above is metadata only and is not what custom.validate_values enforces.
  insert into custom.record (organization_id, table_id, data_class, data)
  values ('$ORG'::uuid, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','status','label','Status','type','text','sort',10,'required',true,'multi',false,
    'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,
    'promoted',false,'entity_definition_id',v_t));
  perform set_config('zz.t', v_t::text, false);
end
\$f\$;
select current_setting('zz.t');
SQL
TABLE="$("$PSQL" "$DSN" -At -q -v ON_ERROR_STOP=1 -f "$TMP/fixture.sql" | tail -1)"
BEFORE="$(q "select count(*) from custom.record where organization_id='$ORG' and table_id='$TABLE'")"
say "PART B —   Table $TABLE, $BEFORE row(s) before the failed graph."

cat > "$TMP/graph.sql" <<SQL
\set ON_ERROR_STOP on
select custom.work_template_instantiate('$ORG'::uuid, custom.work_template_declare('$ORG'::uuid, 'ZZ half parallel', jsonb_build_object(
  'nodes', jsonb_build_array(
    jsonb_build_object('ref','a','table','$TABLE','data',jsonb_build_object('title','A','status','x')),
    jsonb_build_object('ref','b','table','$TABLE','data',jsonb_build_object('title','B','status','x')),
    jsonb_build_object('ref','c','table','$TABLE','data',jsonb_build_object('title','C'))),
  'relations', jsonb_build_array(jsonb_build_object('kind','owned','from','a','to','b')))));
SQL
set +e
"$PSQL" "$DSN" -q -v AUTOCOMMIT=on -f "$TMP/graph.sql" > "$TMP/graph.out" 2>&1
G_RC=$?
set -e
if [ "$G_RC" -eq 0 ]; then
  say "FAIL: the illegal graph was instantiated instead of refused."; cat "$TMP/graph.out"; exit 1
fi
say "PART B —   the graph was refused: $(grep -i 'ERROR' "$TMP/graph.out" | head -1)"

# a FRESH connection, never saw the failed statement.
AFTER="$(q "select count(*) from custom.record where organization_id='$ORG' and table_id='$TABLE'")"
if [ "$AFTER" != "$BEFORE" ]; then
  say "FAIL: the failed graph left $((AFTER - BEFORE)) row(s) behind, seen from a session that never issued it. Before $BEFORE, after $AFTER."; exit 1
fi
say "PART B —   a fresh session, autocommit, counted $BEFORE before and $AFTER after. Nothing survived."
say "PART B PASS — REC-70: a mid-graph failure in a real autocommit statement leaves zero rows, verified from a connection that never saw it fail."
say ""
say "=== W3-WORK parallel — REC-71's real concurrency and REC-70's real autocommit rollback, both taken on the rehearsal branch. Fixtures deleted. ==="
