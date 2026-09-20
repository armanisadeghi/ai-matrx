#!/usr/bin/env bash
# LANE BOOKING — THE ONE CLAUSE THAT CANNOT LIVE IN A ROLLED-BACK TRANSACTION.
#
# TWO REAL CONCURRENT SESSIONS ASK FOR THE SAME SLOT ON ONE BOOKING PAGE. One gets it.
# The other is refused BY NAME, in a sentence a person can act on. That is PRODUCTS row
# 14's whole primitive (P9) and it is the only thing a booking product has to get right
# that a form does not.
#
# WHY A ROLLED-BACK SUITE CANNOT PROVE IT. Two `custom.booking_hold` calls in ONE
# transaction are one session: the second insert sees the first one's row through the
# snapshot it already owns, and the unique index never has to arbitrate between two
# sessions at all. A green suite built that way proves the store can count to two.
#
# HOW THIS FORCES THE RACE DETERMINISTICALLY. Session A opens a transaction, takes the
# hold and DOES NOT COMMIT — so it holds the index lock on that slot key. Session B, on
# its OWN connection, asks for the same slot and BLOCKS inside the index until A commits;
# then the insert fails with 23505 and `custom.booking_hold` turns it into its sentence.
# The block is real: B's wall-clock is reported below and is the length of A's sleep.
#
# WHAT MAKES IT FAIL — THE CHANGE, NAMED. Take `unique` off `slot_key` in
# `custom.work_slots_declare` and both holds commit, and this script says so. Catch the
# unique violation anywhere but `custom.booking_hold` and B gets a raw 23505 instead of a
# sentence. Make `custom.booking_hold` check "is this slot taken" with a SELECT before its
# INSERT and both sessions read "free" and both write.
#
# IT COMMITS, and it deletes what it made before it exits, including on failure. It runs
# against the MAIN database, because that is where the booking doors live.
#
#   bash scripts/campaign-tests/booking_race.sh
#
# macOS ships bash 3.2, which MIS-PARSES a here-document opened inside `$( )`. Every SQL
# block here is written to a file first and fed with `-f`, which also puts the block on
# disk where a failure can be read.

set -euo pipefail
cd "$(dirname "$0")/../.."

PSQL="${PSQL:-$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)}"
ENVFILE="../aidream/.env"
[ -f "$ENVFILE" ] || ENVFILE=".env"
host=$(grep '^SUPABASE_MATRIX_HOST=' "$ENVFILE" | cut -d= -f2- | tr -d '"')
port=$(grep '^SUPABASE_MATRIX_PORT=' "$ENVFILE" | cut -d= -f2- | tr -d '"')
user=$(grep '^SUPABASE_MATRIX_USER=' "$ENVFILE" | cut -d= -f2- | tr -d '"')
db=$(grep '^SUPABASE_MATRIX_DATABASE_NAME=' "$ENVFILE" | cut -d= -f2- | tr -d '"')
PGPASSWORD=$(grep '^SUPABASE_MATRIX_PASSWORD=' "$ENVFILE" | cut -d= -f2- | tr -d '"')
export PGPASSWORD
[ -n "$host" ] || { echo "no SUPABASE_MATRIX_HOST in $ENVFILE"; exit 1; }

run() { "$PSQL" -h "$host" -p "$port" -U "$user" -d "$db" -v ON_ERROR_STOP=1 "$@"; }

WORK=$(mktemp -d)
ADMIN='87a6e699-3622-4869-8843-d0867456c0dd'
ORG=$("$PSQL" -h "$host" -p "$port" -U "$user" -d "$db" -At -c "select gen_random_uuid()")

cleanup() {
  cat > "$WORK/down.sql" <<SQL
delete from custom.anon_submission where organization_id = '$ORG';
delete from custom.anon_replay where organization_id = '$ORG';
delete from custom.anon_hit where organization_id = '$ORG';
delete from custom.anon_form where organization_id = '$ORG';
delete from custom.record where organization_id = '$ORG';
delete from platform.knob_override where organization_id = '$ORG';
delete from iam.memberships where organization_id = '$ORG';
delete from iam.organizations where id = '$ORG';
SQL
  run -q -f "$WORK/down.sql" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "── fixtures (organization $ORG) ─────────────────────────────────────────────"
cat > "$WORK/up.sql" <<SQL
\set ON_ERROR_STOP on
begin;
-- Other lanes are writing this database continuously and iam.organizations is the busiest
-- table on it. A two-second default turns contention into a red suite, which is the one
-- thing a suite must never say when nothing is wrong.
set local lock_timeout = '60s';
set local statement_timeout = '600s';
do \$s\$
declare
  c_admin constant uuid := '$ADMIN';
  v_org   constant uuid := '$ORG';
  v_home uuid; v_table uuid; v_f1 uuid; v_f2 uuid; v_accept uuid; v_made jsonb;
  v_boss text := current_user;
begin
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'ZZZ BOOKING race ' || left(v_org::text,8), 'zzz-book-race-' || left(v_org::text,8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org,'organization',v_org,c_admin,'owner','active',c_admin);
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note,updated_by)
  values ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'booking_race.sh',c_admin);

  perform set_config('app.actor_system','campaign-test/booking_race.sh',true);
  perform set_config('request.jwt.claims','{"sub":"$ADMIN","role":"authenticated"}',true);
  -- THE SEAT. Everything the owner does below goes through the doors a signed-in person
  -- reaches; the race itself is run by the SERVER lane, which is what the public page is.
  perform set_config('role','authenticated',true);
  if current_user <> 'authenticated' then
    raise exception 'this script did not take the seat — current_user is %', current_user;
  end if;

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name','Clinic','description','the race fixture','_actor','user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name','Consults','slug','consults_race','description','the race fixture',
      'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
      'row_order','sorted','default_sort',jsonb_build_array(jsonb_build_object('field','full_name','direction','asc')),
      'agent_writable',true,'label_singular','Consult','label_plural','Consults','title_field','full_name',
      'fields',jsonb_build_array(jsonb_build_object('name','full_name')),
      'parent_id',v_home));
  v_f1 := custom.field_declare(v_org,v_table,jsonb_build_object('label','full name','key','full_name','type','text','required',true));
  v_accept := custom.rule_declare(v_org, jsonb_build_object(
      'name','race: every answer it asks for is there','kind','predicate',
      'uses',jsonb_build_array('validate'),'scope_table_id',v_table,'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','present','args',jsonb_build_array(jsonb_build_object('field',v_f1))),
      'description','the race fixture''s accept Rule'), null);
  v_made := custom.booking_declare(v_org, v_table, 'Race consult',
      jsonb_build_array(jsonb_build_object('field','full_name','ask','Your name','required',true)),
      jsonb_build_object('timezone','UTC','slot_minutes',30,'lead_minutes',0,'max_per_day',20,'days',2,
        'windows', jsonb_build_array(
          jsonb_build_object('weekday',0,'from','00:00','to','23:30'),
          jsonb_build_object('weekday',1,'from','00:00','to','23:30'),
          jsonb_build_object('weekday',2,'from','00:00','to','23:30'),
          jsonb_build_object('weekday',3,'from','00:00','to','23:30'),
          jsonb_build_object('weekday',4,'from','00:00','to','23:30'),
          jsonb_build_object('weekday',5,'from','00:00','to','23:30'),
          jsonb_build_object('weekday',6,'from','00:00','to','23:30'))),
      '{}'::jsonb, null, v_accept, null, null, null, v_home);
  perform custom.anon_publish(v_org, (v_made ->> 'form_id')::uuid, true);
  perform set_config('role', v_boss, true);
  raise notice 'FORM %', v_made ->> 'form_id';
end;
\$s\$;
commit;
SQL
set +e
run -At -f "$WORK/up.sql" > "$WORK/up.out" 2>&1
UP_RC=$?
set -e
if [ "$UP_RC" != "0" ]; then
  echo "FAIL: the fixture did not build —"
  tail -20 "$WORK/up.out"
  exit 1
fi
FORM=$(sed -n 's/.*NOTICE:  FORM //p' "$WORK/up.out" | tail -1)
[ -n "$FORM" ] || { echo "FAIL: the fixture made no booking page"; tail -25 "$WORK/up.out"; exit 1; }
echo "   booking page $FORM"

SLOT=$(run -At --single-transaction -c "set local role service_role" \
  -c "select s->>'key' from custom.booking_public('$FORM'::uuid, 1), jsonb_array_elements(slots) s where not (s->>'taken')::boolean order by 1 limit 1" | tail -1)
[ -n "$SLOT" ] || { echo "FAIL: the page offered no free slot"; exit 1; }
echo "   racing for $SLOT"

echo "── the race ─────────────────────────────────────────────────────────────────"
cat > "$WORK/a.sql" <<SQL
begin;
set local role service_role;
select 'A|' || state || '|' || coalesce(hold_id::text,'-')
  from custom.booking_hold('$FORM'::uuid, '$SLOT', 'https://race.test', 'bucket-a', 'a');
select pg_sleep(5);
commit;
SQL
cat > "$WORK/b.sql" <<SQL
begin;
set local role service_role;
select 'B|' || state || '|' || coalesce(message,'-')
  from custom.booking_hold('$FORM'::uuid, '$SLOT', 'https://race.test', 'bucket-b', 'b');
commit;
SQL

run -At -q -o "$WORK/a.out" -f "$WORK/a.sql" &
A_PID=$!
sleep 1
B_START=$(date +%s)
run -At -q -o "$WORK/b.out" -f "$WORK/b.sql"
B_END=$(date +%s)
wait $A_PID

A=$(grep '^A|' "$WORK/a.out" | head -1)
B=$(grep '^B|' "$WORK/b.out" | head -1)
BLOCKED=$((B_END - B_START))
echo "   $A"
echo "   $B"
echo "   session B waited ${BLOCKED}s inside the index for A to commit"

FAIL=0
case "$A" in
  A\|held\|*) echo "   PASS  A holds the slot" ;;
  *) echo "   FAIL  A did not hold it: $A"; FAIL=1 ;;
esac
case "$B" in
  B\|taken\|*) echo "   PASS  B is refused, and told" ;;
  *) echo "   FAIL  B was not refused by name: $B"; FAIL=1 ;;
esac
case "$B" in
  *"Somebody took that time a moment before you did"*) echo "   PASS  the refusal is a sentence, not a code" ;;
  *) echo "   FAIL  the refusal does not say what happened: $B"; FAIL=1 ;;
esac
if [ "$BLOCKED" -lt 2 ]; then
  echo "   FAIL  B did not block, so the two never raced — it answered in ${BLOCKED}s"
  FAIL=1
else
  echo "   PASS  B really blocked on the index (${BLOCKED}s)"
fi

SLOTS=$(run -At -q -c "reset role" -c "select count(*) from custom.record r join custom.record t on t.id = r.table_id
  where r.organization_id = '$ORG' and r.deleted_at is null and r.data ? 'slot_key'
    and r.data ->> 'slot_key' = '$SLOT'" | tail -1)
if [ "$SLOTS" = "1" ]; then
  echo "   PASS  exactly one hold exists on that slot"
else
  echo "   FAIL  $SLOTS holds exist on one slot"
  FAIL=1
fi

echo "─────────────────────────────────────────────────────────────────────────────"
if [ "$FAIL" = "0" ]; then
  echo "ALL PARTS PASSED — two real sessions, one slot, one booking, one refusal by name."
else
  echo "RED — see the FAIL lines above."
fi
exit "$FAIL"
