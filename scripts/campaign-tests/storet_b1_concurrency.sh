#!/usr/bin/env bash
# STORE-T — B1, WITH TWO REAL COMMITTING SESSIONS, BOTH IN A SIGNED-IN SEAT.
#
# B1: "Two sessions write the same value into a Field marked unique on the same organization
# and Table at the same moment. One commits. The other blocks until the winner commits, is then
# refused by the database's own unique-index name, and no second row exists."
#
# Before this lane there was nothing to test: `custom._field_shape_guard` refused the rule at
# declaration time — "the field Code carries a rule of kind unique, which this validator cannot
# execute" — and two sessions writing the same value both won.
#
# WHAT THIS PROVES, and what it does not. `custom.record` is HASH-PARTITIONED on
# `organization_id`, so a unique index over one column's values would be one expression index
# per field, created with ACCESS EXCLUSIVE on a live sixteen-partition table (lane TABLE-DELETE
# measured that dying on `lock_timeout` under ordinary traffic). So uniqueness is a
# transaction-scoped advisory lock plus the existence check, in `custom._unique_rule_holds`.
# That delivers B1's BEHAVIOUR exactly — the loser BLOCKS until the winner commits, is then
# refused BY THE COLUMN'S NAME, and no second row exists — and it does not deliver an index's
# name. This script asserts the behaviour and says so rather than claiming the index.
#
# BOTH SESSIONS `set role authenticated`, so the write goes through the grant, the door and the
# one ladder exactly as a browser's would.
#
# IT IS NOT A MIGRATION and no sweep can see it. It COMMITS to the MAIN database — that is the
# whole point of a two-session race — and DELETES every row it created before it exits,
# including on failure.
#
#   bash scripts/campaign-tests/storet_b1_concurrency.sh

set -euo pipefail
cd "$(dirname "$0")/../.."

PSQL="${PSQL:-$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)}"
env_of() { grep -m1 "^$1=" .env.local ../aidream/.env 2>/dev/null | head -1 | sed "s/^[^=]*=//" | tr -d "\"'"; }
export PGPASSWORD="$(env_of SUPABASE_MATRIX_PASSWORD)"
DSN="host=$(env_of SUPABASE_MATRIX_HOST) port=$(env_of SUPABASE_MATRIX_PORT) user=$(env_of SUPABASE_MATRIX_USER) dbname=$(env_of SUPABASE_MATRIX_DATABASE_NAME) sslmode=require"
[ -n "$PGPASSWORD" ] || { echo "no SUPABASE_MATRIX_PASSWORD in .env.local or ../aidream/.env"; exit 1; }

ADMIN='87a6e699-3622-4869-8843-d0867456c0dd'
ORG="$("$PSQL" "$DSN" -At -c 'select gen_random_uuid()')"
TMP="$(mktemp -d)"

cleanup() {
  "$PSQL" "$DSN" -q -c "
    delete from custom.record          where organization_id='$ORG'::uuid;
    delete from platform.associations  where organization_id='$ORG'::uuid;
    delete from platform.knob_override where organization_id='$ORG'::uuid;
    delete from iam.memberships        where organization_id='$ORG'::uuid;
    delete from history.migration_log  where organization_id='$ORG'::uuid;
    delete from iam.organizations      where id='$ORG'::uuid;
  " >/dev/null 2>&1 || true
}
trap cleanup EXIT

say() { printf '%s\n' "$*"; }

if [ "$("$PSQL" "$DSN" -At -c 'select system_identifier from pg_control_system()')" != "7642734024280108049" ]; then
  say "FAIL: this script runs on the MAIN database only."; exit 1
fi

# ── the throwaway organization, the table and the unique column — COMMITTED ────────────
# ONE TRANSACTION, because the connection is the transaction pooler: a session GUC set by one
# statement is not there for the next one unless both are inside the same transaction.
read -r TBL FLD <<<"$("$PSQL" "$DSN" -At -F' ' -v ON_ERROR_STOP=1 <<SQL | grep -E '^[0-9a-f-]{36} [0-9a-f-]{36}$' | tail -1
begin;
do \$f\$
declare v_home uuid; v_tbl uuid; v_fld uuid;
begin
  perform set_config('app.actor_system','campaign-test/storet_b1', true);
  perform set_config('request.jwt.claims','{"sub":"$ADMIN","role":"authenticated"}', true);
  insert into iam.organizations (id,name,slug,abbreviation,created_by)
  values ('$ORG'::uuid,'ZZ STORE-T B1','zz-storet-b1-'||substr('$ORG',1,8),'ZTB','$ADMIN'::uuid);
  insert into iam.memberships (organization_id,container_type,container_id,user_id,role,status)
  values ('$ORG'::uuid,'organization','$ORG'::uuid,'$ADMIN'::uuid,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note)
  values ('custom','system_enabled','organization','$ORG'::uuid,'$ORG'::uuid,'true'::jsonb,'campaign-test/storet_b1');
  insert into custom.record (organization_id, table_id, data)
  values ('$ORG'::uuid, null, jsonb_build_object('name','ZZ HQ')) returning id into v_home;
  v_tbl := custom.table_declare('$ORG'::uuid, jsonb_build_object(
    'name','ZZ B1','slug','zz_storet_b1','type','entity','label_singular','Part','label_plural','Parts',
    'title_field','pname','display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','pname')),'parent_id',v_home::text));
  v_fld := custom.field_declare('$ORG'::uuid, v_tbl, jsonb_build_object(
    'label','Code','plain','text',
    'rules', jsonb_build_array(jsonb_build_object('kind','unique'))));
  perform set_config('zz.t', v_tbl::text, true);
  perform set_config('zz.f', v_fld::text, true);
end
\$f\$;
select current_setting('zz.t'), current_setting('zz.f');
commit;
SQL
)"
say "fixture — organization $ORG, table $TBL, unique column $FLD"

# ── the race. A holds the lock for 3 seconds, then commits; B starts one second in. ────
for who in a b; do
  cat > "$TMP/$who.sql" <<SQL
\set ON_ERROR_STOP on
\timing on
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"$ADMIN","role":"authenticated"}', true);
select set_config('app.actor_system','campaign-test/storet_b1', true);
select custom.record_write('$ORG'::uuid,'$TBL'::uuid, jsonb_build_object('pname','$who','code','SAME-VALUE'));
$( [ "$who" = a ] && echo 'select pg_sleep(3);' )
commit;
SQL
done

"$PSQL" "$DSN" -q -f "$TMP/a.sql" > "$TMP/a.out" 2>&1 &
A_PID=$!
sleep 1
set +e
"$PSQL" "$DSN" -f "$TMP/b.sql" > "$TMP/b.out" 2>&1
B_RC=$?
set -e
wait $A_PID || true

# The longest statement time in B's session is its write waiting on A's advisory lock.
B_WAIT="$(grep -o 'Time: [0-9.]*' "$TMP/b.out" | awk '{print $2}' | sort -g | tail -1 || true)"
ROWS="$("$PSQL" "$DSN" -At -c "select count(*) from custom.record where organization_id='$ORG' and table_id='$TBL' and deleted_at is null and data->>'code'='SAME-VALUE'")"

say "A committed. B exited $B_RC after waiting ${B_WAIT:-?} ms. Rows holding the value: $ROWS"
say "B said: $(grep -m1 -i 'error' "$TMP/b.out" || echo '(nothing)')"

[ "$B_RC" != "0" ] || { say "FAIL: the second session committed the same value — B1 says it must be refused."; exit 1; }
grep -qi 'already has Code' "$TMP/b.out" || { say "FAIL: B was refused, but not by the column's name. B's output:"; cat "$TMP/b.out"; exit 1; }
[ "$ROWS" = "1" ] || { say "FAIL: $ROWS rows hold the value — no second row may exist."; exit 1; }
awk -v w="${B_WAIT:-0}" 'BEGIN { if (w+0 < 1500) { print "FAIL: B waited only " w " ms, so it never blocked on A — it read before A committed and was refused by luck."; exit 1 } }'

say "B1 PASS — the loser BLOCKED ${B_WAIT} ms until the winner committed, was then refused naming the column, and exactly one row holds the value."
say "NOT CLAIMED: the refusal does not carry a unique INDEX's name, because there is no index — see the header."
