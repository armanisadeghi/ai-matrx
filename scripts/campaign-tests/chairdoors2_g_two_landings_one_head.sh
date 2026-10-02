#!/usr/bin/env bash
# LANE CHAIR-DOORS-2 — TWO CONCURRENT LANDINGS OF ONE CHAIN LEAVE ONE CURRENT ROW (v6 lane 4 KINDS-GLUE N-C1).
# Guard for migrations/campaign/chairdoors2_i_a_new_output_replaces_the_old_under_one_lock.sql.
#
# It has to COMMIT (two connections only see each other's committed rows), so it cannot be a rolled-back
# suite. It runs on the DEV CLONE only (refused anywhere else by the campaign preamble), as test@test.com's
# agent (a member of Cedar Ridge Physical Therapy), and archives everything it made before it exits.
#   1. Setup (committed): an output table in Cedar Ridge and a first landing → chain C, head H0.
#   2. Connection A lands a new version into C and holds its transaction open for 4 s.
#      Connection B, started 1 s later, lands another new version into C.
#   3. Verdict: chain C has exactly ONE current row, H0 is superseded, and the two new rows are
#      generations 2 and 3 (B waited for A and superseded A's row).
# MODE=door (default) calls custom.record_write_graph_superseding. MODE=plant calls a session-local copy of
# it with the one advisory lock taken out (pg_temp, nothing left on the clone; called from the owner seat
# with her claims, since the DDL guard keeps a client role off an undeclared definer) — it must come out RED,
# which is what shows the lock is the thing that makes this pass.
# THE VERDICT IS THE EXIT CODE: 0 GREEN, 3 RED.
#
# RUN IT:  cd matrx-frontend && bash scripts/campaign-tests/chairdoors2_g_two_landings_one_head.sh [door|plant]
set -uo pipefail
MODE="${1:-${MODE:-door}}"
cd "$(dirname "$0")/../.."
URL=$(grep -E '^CLONE_DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '"' | sed 's/:6543/:5432/')
PSQL="${PSQL:-/opt/homebrew/opt/libpq/bin/psql}"
q() { "$PSQL" "$URL" -X -q -At -v ON_ERROR_STOP=1 "$@"; }

# The campaign preamble decides the target: the dev clone, or nothing.
if ! "$PSQL" "$URL" -X -q -v ON_ERROR_STOP=1 -v suite=chairdoors2_g_two_landings_one_head.sh -v expect=clone \
     -f scripts/campaign-tests/_preamble.sql >/dev/null 2>&1; then
  echo "REFUSED: this guard runs on the dev clone only."; exit 3
fi

ORG=0a54df90-eab8-4d07-ab29-81a45fb41e04      # Cedar Ridge Physical Therapy
ME=4060701e-706a-4c76-b3ca-0bbc69fa5a14       # test@test.com (member)
MSG=82ffe2b2-96e4-468d-9fed-eb18db9583bf      # an assistant message in her Cedar Ridge chat
TAG="cd2g_race_$(date +%s)"
LOCK="cd2g-race-${TAG}|flashcard_set"
DOOR="custom.record_write_graph_superseding"

SEAT="select set_config('request.jwt.claims', json_build_object('sub','$ME','role','authenticated')::text, true),
             set_config('app.actor_tier','agent',true), set_config('app.actor_system','chat_kind_emission',true);"
PLANT="do \$p\$ declare d text; begin
  d := pg_get_functiondef('custom.record_write_graph_superseding(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure);
  d := replace(d, 'CREATE OR REPLACE FUNCTION custom.record_write_graph_superseding(', 'CREATE FUNCTION pg_temp.plant_superseding(');
  d := regexp_replace(d, 'perform pg_advisory_xact_lock\\(hashtextextended\\(''agent_output\\|''[^;]*;', '', 'g');
  if d ~ 'pg_advisory_xact_lock\\(hashtextextended\\(''agent_output' then raise exception 'plant: the lock line was not removed'; end if;
  execute d;
end \$p\$;"
# The plant is a session-local SECURITY DEFINER copy the DDL guard will not let a client role execute, so it
# is called from the owner seat with her claims and her agent's tier — the lock is the only thing it lacks.
if [ "$MODE" = plant ]; then CALL="pg_temp.plant_superseding"; PRE="$PLANT"; ROLE=""; else CALL="$DOOR"; PRE=""; ROLE="set local role authenticated;"; fi

if [ -z "$(q -c "select to_regprocedure('$DOOR(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)')")" ]; then
  echo "RED: $DOOR does not exist on this database, so nothing serializes two landings of one chain."; exit 3
fi

cleanup() {
  [ -n "${TABLE:-}" ] || return 0
  # The store's own archive door (archive, never delete): the Table and every record in it, restorable.
  if q -c "select set_config('app.actor_tier','system',true), set_config('app.actor_system','kinds_glue_output_tables',true);
           select custom.table_archive('$ORG', '$TABLE');" >/dev/null 2>&1; then
    echo "cleanup: archived the race table and its rows ($TABLE)"
  else
    echo "cleanup: FAILED to archive the race table $TABLE — archive it with custom.table_archive"
  fi
}
trap cleanup EXIT

# 1. Setup, committed.
SETUP=$(q <<SQL
begin;
select set_config('app.actor_tier','system',true), set_config('app.actor_system','kinds_glue_output_tables',true) \g /dev/null
select custom.table_ensure('$ORG', jsonb_build_object(
  'name', 'Race check deck outputs ${TAG}', 'slug', 'agent_output_${TAG}',
  'type','entity','weight','light','display','list','ordered',false,'row_order','manual','title_field','title',
  'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
  'label_plural','Race check deck outputs','label_singular','Race check deck output','agent_writable',true,'retention_days',365,
  'kept_by_the_app', true, 'kept_for','agent_output','kind','flashcard_set',
  'fields', jsonb_build_array(
    jsonb_build_object('key','title','label','Title','type','text'),
    jsonb_build_object('key','output_state','label','Output state','type','select','options',jsonb_build_array('draft','superseded'),'config',jsonb_build_object('kept_by','agent_output')),
    jsonb_build_object('key','output_chain','label','Chain','type','text','config',jsonb_build_object('kept_by','agent_output')),
    jsonb_build_object('key','output_generation','label','Generation','type','number','config',jsonb_build_object('kept_by','agent_output')),
    jsonb_build_object('key','output_replaced_by','label','Replaced by','type','text','config',jsonb_build_object('kept_by','agent_output'))))) as te \gset
select set_config('app.actor_tier','',true) \g /dev/null
set local role authenticated;
$SEAT
\o /dev/null
select $DOOR('$ORG', (:'te'::jsonb->>'table_id')::uuid, '$LOCK',
  jsonb_build_object('message_id','$MSG','fingerprint','${TAG}-0','ordinal',0),
  '{"title": "Post-op knee — week 1"}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{"mode":"first"}'::jsonb) as h0 \gset
\o
commit;
select (:'te'::jsonb->>'table_id') || ' ' || (:'te'::jsonb->>'home_id') || ' ' || (:'h0'::jsonb->>'parent_id');
SQL
) || { echo "RED: setup failed"; echo "$SETUP"; exit 3; }
read -r TABLE HOME_ID H0 <<<"$(echo "$SETUP" | tail -1)"
echo "setup: table $TABLE, chain/head $H0 (mode $MODE)"

land() { # $1 fingerprint, $2 hold seconds
  q <<SQL
$PRE
begin;
set local lock_timeout = '30s';
$ROLE
$SEAT
select $CALL('$ORG', '$TABLE', '$LOCK', jsonb_build_object('message_id','$MSG','fingerprint','$1','ordinal',0),
  jsonb_build_object('title', 'Post-op knee — version $1'), '[]'::jsonb, '[]'::jsonb,
  jsonb_build_object('mode','join','chain','$H0','reason','regenerated')) ->> 'parent_id';
select pg_sleep($2);
commit;
SQL
}
OUT_A=$(mktemp); OUT_B=$(mktemp)
( land "${TAG}-A" 4 >"$OUT_A" 2>&1 ) & PA=$!
sleep 1
T0=$(date +%s)
( land "${TAG}-B" 0 >"$OUT_B" 2>&1 ) & PB=$!
wait $PA; RA=$?; wait $PB; RB=$?; T1=$(date +%s)
A=$(grep -E '^[0-9a-f-]{36}$' "$OUT_A" | head -1); B=$(grep -E '^[0-9a-f-]{36}$' "$OUT_B" | head -1)
echo "A landed ${A:-nothing} (exit $RA); B landed ${B:-nothing} (exit $RB) after $((T1 - T0)) s"
[ $RA -eq 0 ] && [ $RB -eq 0 ] || { echo "RED: a landing failed"; cat "$OUT_A" "$OUT_B"; exit 3; }

VERDICT=$(q <<SQL
select format('heads=%s h0=%s a=%s/%s b=%s/%s a_replaced_by_b=%s',
  (select count(*) from custom.record r where r.organization_id='$ORG' and r.table_id='$TABLE' and r.deleted_at is null
      and r.data->>'output_chain'='$H0' and r.data->>'output_state'='draft'),
  (select r.data->>'output_state' from custom.record r where r.id='$H0'),
  (select r.data->>'output_state' from custom.record r where r.id='$A'), (select r.data->>'output_generation' from custom.record r where r.id='$A'),
  (select r.data->>'output_state' from custom.record r where r.id='$B'), (select r.data->>'output_generation' from custom.record r where r.id='$B'),
  (select r.data->>'output_replaced_by' = '$B' from custom.record r where r.id='$A'));
SQL
)
echo "verdict: $VERDICT"
if [ "$VERDICT" = "heads=1 h0=superseded a=superseded/2 b=draft/3 a_replaced_by_b=t" ]; then
  echo "GREEN: two concurrent landings of one chain left one current row ($MODE)"; exit 0
fi
echo "RED: two concurrent landings of one chain did not leave exactly one current row ($MODE)"; exit 3
