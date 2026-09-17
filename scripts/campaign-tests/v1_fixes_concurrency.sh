#!/usr/bin/env bash
# LANE W1-V1-FIXES — FINDING 5, PROVEN WITH TWO REAL COMMITTING SESSIONS.
#
# `V1-MODEL` measured session B blocking 4.93 s on A's row lock and then reading version 2,
# not 3 — but A had ROLLED BACK, so the both-COMMIT case was never proven and the verifier
# correctly declined to claim it. This harness proves it: two separate psql processes, two
# separate backends, both COMMIT, against one real row in `custom.record` on the rehearsal
# branch.
#
# It answers two questions and writes both into the campaign's law:
#
#   PART 1 — LAST-WRITE-WINS IS HONEST. Two blind writers both commit. B must wait for A,
#            and the canonical `version` column must count BOTH writes: 1 -> 2 -> 3. A
#            second writer whose write lands at version 2 has silently overwritten A.
#   PART 2 — OPTIMISTIC CONCURRENCY IS THE PLATFORM'S RULE, AND IT IS OPT-IN PER WRITE
#            (common-docs /systems/platform/optimistic-concurrency). B declares the revision
#            it read; A commits first; B's compare-and-swap MISSES and B is told so with the
#            revision that won — instead of overwriting A.
#
# WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED (rule 3): drop `custom.record_update`,
# or remove the `expected_version` arm from it, and PART 2's write lands as a blind
# overwrite and the script fails naming the version it should have been refused at.
# A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE: PART 1 and PART 2 run the SAME two
# sessions over the same row and require OPPOSITE outcomes — both land / the second is
# refused — so a constant answer survives neither.
#
# IT IS NOT A MIGRATION and no sweep can see it. It COMMITS to the rehearsal branch (that is
# the whole point) and DELETES every row it created before it exits, including on failure.
#
#   bash scripts/campaign-tests/v1_fixes_concurrency.sh

set -euo pipefail
cd "$(dirname "$0")/../.."

PSQL="${PSQL:-$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)}"
DSN="$(grep '^SUPABASE_BRANCH_DATABASE_URL=' .env.local | cut -d= -f2-)"
[ -n "$DSN" ] || { echo "no SUPABASE_BRANCH_DATABASE_URL in .env.local"; exit 1; }

ORG='39c38960-d30c-4840-b0c1-c9960de95582'
TMP="$(mktemp -d)"
REC=""

# EVERY row this script creates is reachable from the Table it declares: the Table row
# itself (by slug), its Field rows (by entity_definition_id) and its records (by table_id).
# Deleting by REC alone leaves the definitions behind, which is how the first run of this
# script left a row on the branch.
cleanup() {
  "$PSQL" "$DSN" -q -c "
    with t as (select id from custom.record
                where organization_id='$ORG'::uuid and data->>'slug'='zz_v1_fixes_conc')
    delete from custom.record r using t
     where r.organization_id='$ORG'::uuid
       and (r.id = t.id or r.table_id = t.id or (r.data->>'entity_definition_id')::uuid = t.id);
  " >/dev/null 2>&1 || true
  [ -n "$REC" ] && "$PSQL" "$DSN" -q -c "delete from custom.record where organization_id='$ORG' and id='$REC';" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

say() { printf '%s\n' "$*"; }

# ── fixture, COMMITTED ────────────────────────────────────────────────────────────────
REC="$("$PSQL" "$DSN" -At -q -v ON_ERROR_STOP=1 <<SQL | tail -1
do \$f\$
declare v_table uuid; v_rec uuid;
begin
  v_table := custom.table_declare('$ORG'::uuid, jsonb_build_object(
    'name','V1 fixes concurrency','slug','zz_v1_fixes_conc','type','entity',
    'label_singular','Counter','label_plural','Counters','title_field','cnt',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','cnt')),
    'parent_id','11111111-0000-4000-8000-000000000001'));
  insert into custom.record (organization_id, table_id, data_class, data)
  values ('$ORG'::uuid, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','cnt','label','Counter','type','text','sort',10,'required',false,'multi',false,
    'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_table));
  insert into custom.record (organization_id, table_id, data_class, data)
  values ('$ORG'::uuid, v_table, 'record', jsonb_build_object('cnt','base'))
  returning id into v_rec;
  perform set_config('zz.rec', v_rec::text, false);
end
\$f\$;
select current_setting('zz.rec');
SQL
)"
say "fixture — record $REC at version $("$PSQL" "$DSN" -At -c "select version from custom.record where organization_id='$ORG' and id='$REC'")"

# ── PART 1 — two blind writers, both COMMIT ───────────────────────────────────────────
cat > "$TMP/a.sql" <<SQL
\set ON_ERROR_STOP on
begin;
update custom.record set data = data || '{"cnt":"A"}'::jsonb
 where organization_id='$ORG' and id='$REC';
select pg_sleep(3);
commit;
SQL
cat > "$TMP/b.sql" <<SQL
\set ON_ERROR_STOP on
\timing on
begin;
update custom.record set data = data || '{"cnt":"B"}'::jsonb
 where organization_id='$ORG' and id='$REC';
commit;
SQL

"$PSQL" "$DSN" -q -f "$TMP/a.sql" > "$TMP/a.out" 2>&1 &
A_PID=$!
sleep 1
"$PSQL" "$DSN" -f "$TMP/b.sql" > "$TMP/b.out" 2>&1
wait $A_PID
# the LONGEST statement time in B's session is its UPDATE waiting on A's row lock — the
# first `Time:` line belongs to `begin;` and is meaningless.
B_WAIT="$(grep -o 'Time: [0-9.]*' "$TMP/b.out" | awk '{print $2}' | sort -g | tail -1 || true)"

read -r V1 CNT1 <<<"$("$PSQL" "$DSN" -At -F' ' -c "select version, data->>'cnt' from custom.record where organization_id='$ORG' and id='$REC'")"
say "PART 1 — B blocked on A's row lock waited ${B_WAIT} ms; both committed; version=$V1 value=$CNT1"
[ "$V1" = "3" ] || { say "FAIL: two committed writes over version 1 must leave version 3, and it is $V1."; exit 1; }
[ "$CNT1" = "B" ] || { say "FAIL: the second committer's value must survive last-write-wins, and the row holds '$CNT1'."; exit 1; }
say "PART 1 PASS — both COMMITs produce versions 2 and 3; neither write is lost from the count, and B overwrote A UNSEEN. That is what makes PART 2 necessary."

# ── PART 2 — the same race, B declaring the revision it read ─────────────────────────
BASE="$V1"
cat > "$TMP/a2.sql" <<SQL
\set ON_ERROR_STOP on
begin;
select custom.record_update('$ORG'::uuid,'$REC'::uuid,'{"cnt":"A2"}'::jsonb, $BASE);
select pg_sleep(3);
commit;
SQL
cat > "$TMP/b2.sql" <<SQL
\set ON_ERROR_STOP on
begin;
select custom.record_update('$ORG'::uuid,'$REC'::uuid,'{"cnt":"B2"}'::jsonb, $BASE);
commit;
SQL

"$PSQL" "$DSN" -q -f "$TMP/a2.sql" > "$TMP/a2.out" 2>&1 &
A2_PID=$!
sleep 1
set +e
"$PSQL" "$DSN" -f "$TMP/b2.sql" > "$TMP/b2.out" 2>&1
B2_RC=$?
set -e
wait $A2_PID

read -r V2 CNT2 <<<"$("$PSQL" "$DSN" -At -F' ' -c "select version, data->>'cnt' from custom.record where organization_id='$ORG' and id='$REC'")"
if [ "$B2_RC" -eq 0 ]; then
  say "FAIL: B declared version $BASE, A committed first, and B's write was accepted anyway. Row is now version=$V2 value=$CNT2."
  exit 1
fi
if ! grep -qi 'someone else' "$TMP/b2.out"; then
  say "FAIL: B was refused, but not by name. It read:"; cat "$TMP/b2.out"; exit 1
fi
say "PART 2 — B refused: $(grep -i 'ERROR' "$TMP/b2.out" | head -1)"
say "PART 2 —   remedy: $(grep -i 'HINT' "$TMP/b2.out" | head -1)"
[ "$CNT2" = "A2" ] || { say "FAIL: A's value must be the one standing, and the row holds '$CNT2'."; exit 1; }
[ "$V2" = "$((BASE+1))" ] || { say "FAIL: exactly one write must have landed; version is $V2 against a base of $BASE."; exit 1; }
say "PART 2 PASS — the declared-revision write is a compare-and-swap: A wins, B is told which revision won, nothing is overwritten unseen."

# ── the positive control: B retries against the revision that won ────────────────────
"$PSQL" "$DSN" -q -v ON_ERROR_STOP=1 -c \
  "select custom.record_update('$ORG'::uuid,'$REC'::uuid,'{\"cnt\":\"B3\"}'::jsonb, $V2);" >/dev/null
read -r V3 CNT3 <<<"$("$PSQL" "$DSN" -At -F' ' -c "select version, data->>'cnt' from custom.record where organization_id='$ORG' and id='$REC'")"
[ "$CNT3" = "B3" ] && [ "$V3" = "$((V2+1))" ] || { say "FAIL: the resubmission against version $V2 did not land (version=$V3 value=$CNT3)."; exit 1; }
say "CONTROL PASS — resolution is just another write: resubmitted against version $V2, it lands at version $V3."

say "=== W1-V1-FIXES concurrency — both COMMITs count, and a declared revision turns the race into a decision. Fixture deleted. ==="
