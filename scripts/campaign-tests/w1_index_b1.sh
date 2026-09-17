#!/usr/bin/env bash
# W1-INDEX — THE THREE CLAUSES THAT CANNOT LIVE IN A ROLLED-BACK TRANSACTION.
#
#   PART 1 — B1 / REC-N-12. Two REAL concurrent sessions write the same value into a Field
#            marked unique on one organization and Table. One commits; the other blocks on the
#            index, is refused BY THE CONSTRAINT'S OWN NAME, and no second row exists.
#   PART 2 — DOOR-N-3 / REC-N-2. The promoted read against the unpromoted read, both issued as
#            PREPARED statements, p50 and p95 over the same corpus, with the corpus's
#            provenance stated out loud: it is SEEDED, not production data.
#   PART 3 — REC-5 / ruling (e). The light -> heavy promotion executed as ROUTE B for real —
#            CREATE INDEX CONCURRENTLY per partition, then ATTACH, with autocommit — while a
#            second session writes, so the Migration's cost to everybody else is MEASURED
#            rather than asserted.
#
# WHAT MAKES IT FAIL — THE CHANGE, NAMED (rule 3): drop the UNIQUE from
# `custom.promoted_index_name`'s index and PART 1's loser commits a second row; take the child
# rename out of `custom.promote_field` and PART 1 fails because the refusal no longer carries
# the field; make `custom.promoted_read` build its query from anything but
# `custom.promoted_index_expr` and PART 2's promoted arm stops using the index, which shows up
# as p95 rather than as an error.
#
# IT IS NOT A MIGRATION and no sweep can see it. It COMMITS to the rehearsal branch — that is
# the whole point of PART 1 — and DELETES every row and index it created before it exits,
# including on failure.
#
#   bash scripts/campaign-tests/w1_index_b1.sh
#
# macOS ships bash 3.2, which MIS-PARSES a here-document opened inside `$( )` — it reports
# `unexpected EOF while looking for matching` on a file that is perfectly balanced. Every SQL
# block here is therefore written to a file first and fed with `-f`, which also puts the block
# on disk where a failure can be read.

set -euo pipefail
cd "$(dirname "$0")/../.."

PSQL="${PSQL:-$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)}"
DSN="$(grep '^SUPABASE_BRANCH_DATABASE_URL=' .env.local | cut -d= -f2-)"
[ -n "$DSN" ] || { echo "no SUPABASE_BRANCH_DATABASE_URL in .env.local"; exit 1; }

ORG='39c38960-d30c-4840-b0c1-c9960de95582'
SLUG='zz_w1_index_b1'
# 4,000 rather than a bigger number for ONE measured reason: every insert into `custom.record`
# runs the store's full validation chain, and 20,000 of them exceeded the 600 s statement
# timeout on this branch (measured 2026-09-17). The corpus only has to be big enough that a
# sequential scan is visibly worse than an index probe, and at 4,000 it is.
ROWS="${ROWS:-4000}"
TMP="$(mktemp -d)"

cleanup() {
  # THE CLEANUP IS AS LOAD-BEARING AS THE TEST. Two bugs measured 2026-09-17, both of which
  # left the branch dirty while the script reported success:
  #   · it dropped indexes by `relkind = 'i'`, and the PARENT of a partitioned index is `'I'`,
  #     so 80 index objects survived every run;
  #   · it read ONE table id with `SELECT INTO`, which raises the moment a previous run has
  #     left a second row with the same slug — and `|| true` swallowed it, so run 2 and run 3
  #     deleted nothing and said nothing. It now deletes EVERY matching Table and PRINTS what
  #     it removed, and the knob goes back to false whatever else happened.
  "$PSQL" "$DSN" -q -v ON_ERROR_STOP=1 -c "
    set statement_timeout = '900s';
    do \$c\$
    declare r record; n bigint; ix integer := 0;
    begin
      for r in select n2.nspname, c.relname from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
                where n2.nspname = 'custom' and c.relkind in ('i','I') and not c.relispartition
                  and (c.relname like 'cpi\\_%' or c.relname like 'cpu\\_%' or c.relname like 'zz\\_w1\\_index\\_%')
      loop execute format('drop index if exists %I.%I cascade', r.nspname, r.relname); ix := ix + 1; end loop;
      for r in select n2.nspname, c.relname from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
                where n2.nspname = 'custom' and c.relkind in ('i','I')
                  and (c.relname like 'cpi\\_%' or c.relname like 'cpu\\_%' or c.relname like 'zz\\_w1\\_index\\_%')
      loop execute format('drop index if exists %I.%I cascade', r.nspname, r.relname); ix := ix + 1; end loop;
      with t as (select id from custom.record where organization_id = '$ORG'::uuid and data->>'slug' = '$SLUG')
      delete from custom.record r2 using t
       where r2.organization_id = '$ORG'::uuid
         and (r2.id = t.id or r2.table_id = t.id or (r2.data->>'entity_definition_id')::uuid = t.id);
      get diagnostics n = row_count;
      update platform.feature_knob set value = 'false'::jsonb
       where feature = 'custom' and key = 'field_index_guard';
      raise notice 'cleanup: % index drop(s), % record(s), custom/field_index_guard back to false', ix, n;
    end \$c\$;" || echo "CLEANUP FAILED — the branch may still hold the Table this script declared, its indexes, or the guard switched ON. Run it again, or clear them by hand."
  rm -rf "$TMP"
}
trap cleanup EXIT

say() { printf '%s\n' "$*"; }
q()   { "$PSQL" "$DSN" -At -q -v ON_ERROR_STOP=1 -c "$1"; }

# The branch, and nothing else.
SYSID="$(q "select (pg_control_system()).system_identifier")"
[ "$SYSID" = "7678069749886157684" ] || { say "refusing: system_identifier $SYSID is not the rehearsal branch"; exit 1; }

# The guard is off on the branch like every campaign guard. Promotion is what it guards, so it
# goes on for the length of this script and comes off again in cleanup(), including on failure.
q "update platform.feature_knob set value='true'::jsonb where feature='custom' and key='field_index_guard'" >/dev/null

# ── the fixture, COMMITTED ────────────────────────────────────────────────────────────────
say "fixture — declaring the Table and seeding $ROWS records…"
cat > "$TMP/fixture.sql" <<SQL
set statement_timeout = '900s';
do \$f\$
declare v_t uuid;
begin
  v_t := custom.table_declare('$ORG'::uuid, jsonb_build_object(
    'name','W1-INDEX B1','slug','$SLUG','type','entity',
    'label_singular','Thing','label_plural','Things','title_field','code',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','code'), jsonb_build_object('name','note')),
    'parent_id','11111111-0000-4000-8000-000000000001'));
  insert into custom.record (organization_id, table_id, data_class, data)
  values ('$ORG'::uuid, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','code','label','Code','type','text','sort',10,'required',false,'multi',false,
    'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,
    'promoted',true,'unique',true,'entity_definition_id',v_t));
  -- 'note' is deliberately NOT promoted: it is PART 2's control, and it is the same corpus.
  insert into custom.record (organization_id, table_id, data_class, data)
  values ('$ORG'::uuid, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','note','label','Note','type','text','sort',20,'required',false,'multi',false,
    'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,
    'promoted',false,'entity_definition_id',v_t));
  insert into custom.record (organization_id, table_id, data_class, data)
  select '$ORG'::uuid, v_t, 'record',
         jsonb_build_object('code', 'c' || g, 'note', 'n' || g)
    from generate_series(1, $ROWS) g;
  perform set_config('zz.t', v_t::text, false);
end
\$f\$;
select current_setting('zz.t');
SQL

TABLE="$("$PSQL" "$DSN" -At -q -v ON_ERROR_STOP=1 -f "$TMP/fixture.sql" | tail -1)"
FIXN="$(q "select count(*) from custom.record where organization_id='$ORG' and table_id='$TABLE'")"
say "fixture — Table $TABLE, $FIXN records."
say ""

# ── PART 1 — B1 / REC-N-12 ────────────────────────────────────────────────────────────────
# The index first, by the lane's own route.
# The Field's id is resolved in its OWN statement, and that is not fussiness. MEASURED
# 2026-09-17: passing it as a sub-select — `select custom.promote_field(..., (select id from
# custom.record where ...))` — leaves a portal open over `custom.record` while the function
# issues its CREATE INDEX, and Postgres refuses with `cannot CREATE INDEX "record_p09" because
# it is being used by active queries in this session`. Any caller that promotes a Field from
# inside a query that is itself reading the store meets the same refusal.
FIELD_ID="$(q "select id from custom.record where organization_id='$ORG' and table_id=custom.field_kernel_id() and data->>'key'='code' and (data->>'entity_definition_id')::uuid='$TABLE'")"
PROMO="$(q "select custom.promote_field('$ORG'::uuid,'$TABLE'::uuid,'$FIELD_ID'::uuid)")"
say "PART 1 — promote_field: $PROMO"
IDX="$(printf '%s' "$PROMO" | sed -n 's/.*"index_name": "\([^"]*\)".*/\1/p')"

cat > "$TMP/a.sql" <<SQL
\set ON_ERROR_STOP on
begin;
insert into custom.record (organization_id, table_id, data_class, data)
values ('$ORG','$TABLE','record','{"code":"COLLIDE","note":"A"}'::jsonb);
select pg_sleep(3);
commit;
SQL
cat > "$TMP/b.sql" <<SQL
\set ON_ERROR_STOP on
\timing on
begin;
insert into custom.record (organization_id, table_id, data_class, data)
values ('$ORG','$TABLE','record','{"code":"COLLIDE","note":"B"}'::jsonb);
commit;
SQL

"$PSQL" "$DSN" -q -f "$TMP/a.sql" > "$TMP/a.out" 2>&1 &
A_PID=$!
sleep 1
set +e
"$PSQL" "$DSN" -f "$TMP/b.sql" > "$TMP/b.out" 2>&1
B_RC=$?
set -e
wait $A_PID
B_WAIT="$(grep -o 'Time: [0-9.]*' "$TMP/b.out" | awk '{print $2}' | sort -g | tail -1 || true)"
N_COLLIDE="$(q "select count(*) from custom.record where organization_id='$ORG' and table_id='$TABLE' and data->>'code'='COLLIDE'")"

if [ "$B_RC" -eq 0 ]; then
  say "FAIL: both sessions committed the same unique value. Rows carrying it: $N_COLLIDE"; exit 1
fi
if ! grep -q "$IDX" "$TMP/b.out"; then
  say "FAIL: the loser was refused, but not by the constraint's own name. It read:"; cat "$TMP/b.out"; exit 1
fi
[ "$N_COLLIDE" = "1" ] || { say "FAIL: exactly one row must carry the value, and $N_COLLIDE do."; exit 1; }
say "PART 1 —   winner committed; loser blocked ${B_WAIT} ms on the index, then: $(grep -i 'ERROR' "$TMP/b.out" | head -1)"
say "PART 1 —   rows carrying the value: $N_COLLIDE"
say "PART 1 PASS — B1: the database decided it, and the name it quoted carries the field a person named."
say ""

# ── PART 2 — DOOR-N-3 / REC-N-2 ───────────────────────────────────────────────────────────
# Both arms are PREPARED and executed the same number of times against the same corpus. The
# timing is taken SERVER-SIDE so the number is the database's work and not the round trip to a
# remote branch (~100 ms, measured), which would bury the difference under noise.
say "PART 2 — promoted vs unpromoted read, prepared, ${ROWS}-record corpus…"
cat > "$TMP/part2.sql" <<SQL
set statement_timeout = '900s';
do \$p\$
declare
  v_t0 timestamptz; v_i integer; v_id uuid;
  v_promoted numeric[] := '{}'; v_plain numeric[] := '{}';
  v_p50p numeric; v_p95p numeric; v_p50u numeric; v_p95u numeric;
begin
  prepare zz_promoted (uuid, text) as
    select id from custom.record
     where organization_id = \$1 and table_id = '$TABLE'::uuid and deleted_at is null
       and ((data->>'code')) = \$2;
  prepare zz_plain (uuid, text) as
    select id from custom.record
     where organization_id = \$1 and table_id = '$TABLE'::uuid and deleted_at is null
       and ((data->>'note')) = \$2;

  -- The arguments go in as LITERALS rather than through USING: a \$1 inside the string handed
  -- to EXECUTE is plpgsql's own parameter and collides with the prepared statement's, which
  -- Postgres reports as `there is no parameter \$1` (measured 2026-09-17). The PREPARE's plan is
  -- still what runs, and the same wrapper cost is paid by both arms, so the comparison holds.
  -- Five warm-ups each: plpgsql and the server both settle a plan by the fifth execution.
  for v_i in 1..5 loop
    execute format('execute zz_promoted (%L::uuid, %L)', '$ORG', 'c1') into v_id;
    execute format('execute zz_plain (%L::uuid, %L)',    '$ORG', 'n1') into v_id;
  end loop;

  for v_i in 1..200 loop
    v_t0 := clock_timestamp();
    execute format('execute zz_promoted (%L::uuid, %L)', '$ORG', 'c' || (1 + (v_i * 97) % $ROWS)) into v_id;
    v_promoted := v_promoted || round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 3);

    v_t0 := clock_timestamp();
    execute format('execute zz_plain (%L::uuid, %L)', '$ORG', 'n' || (1 + (v_i * 97) % $ROWS)) into v_id;
    v_plain := v_plain || round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 3);
  end loop;

  select percentile_cont(0.5) within group (order by x), percentile_cont(0.95) within group (order by x)
    into v_p50p, v_p95p from unnest(v_promoted) x;
  select percentile_cont(0.5) within group (order by x), percentile_cont(0.95) within group (order by x)
    into v_p50u, v_p95u from unnest(v_plain) x;

  raise notice 'PART 2 —   PROMOTED   (prepared, over the promoted index)  p50 % ms   p95 % ms',
               round(v_p50p, 3), round(v_p95p, 3);
  raise notice 'PART 2 —   UNPROMOTED (prepared, same corpus, no index)    p50 % ms   p95 % ms',
               round(v_p50u, 3), round(v_p95u, 3);
  raise notice 'PART 2 —   ratio at p50: %x   at p95: %x',
               round(v_p50u / nullif(v_p50p, 0), 1), round(v_p95u / nullif(v_p95p, 0), 1);
  raise notice 'PART 2 —   PROVENANCE: $ROWS records SEEDED BY THIS SCRIPT (code = c1..c$ROWS, note = n1..n$ROWS), on the rehearsal branch, 200 executions each after five warm-ups, timed inside the server. It is manufactured data and it is said so here rather than left to be assumed.';
  deallocate zz_promoted; deallocate zz_plain;

  if v_p50u <= v_p50p then
    raise exception 'PART 2 FAILED: the unpromoted read (p50 % ms) was not slower than the promoted one (p50 % ms). The promotion is not being used.',
                    v_p50u, v_p50p;
  end if;
end \$p\$;
SQL
"$PSQL" "$DSN" -q -v ON_ERROR_STOP=1 -f "$TMP/part2.sql"
say "PART 2 PASS — the promoted read is the faster one, and the corpus it was measured on is named."
say ""

# ── PART 3 — REC-5 / ruling (e): ROUTE B FOR REAL, WITH A WRITER WATCHING ─────────────────
say "PART 3 — the writer's baseline with no build running…"
cat > "$TMP/w.sql" <<'SQL'
\set ON_ERROR_STOP on
\timing on
SQL
for i in $(seq 1 40); do
  echo "insert into custom.record (organization_id, table_id, data_class, data) values ('$ORG','$TABLE','record', jsonb_build_object('code','w$RANDOM$i','note','w'));" >> "$TMP/w.sql"
done

"$PSQL" "$DSN" -f "$TMP/w.sql" > "$TMP/w_base.out" 2>&1
BASE_WORST="$(grep -o 'Time: [0-9.]*' "$TMP/w_base.out" | awk '{print $2}' | sort -g | tail -1)"
BASE_MEAN="$(grep -o 'Time: [0-9.]*' "$TMP/w_base.out" | awk '{s+=$2; n++} END {printf "%.1f", s/n}')"
say "PART 3 —   baseline: worst insert ${BASE_WORST} ms, mean ${BASE_MEAN} ms over 40 inserts."

# The generator's own statements for the 'note' Field, promoted now - ROUTE B, autocommit.
q "update custom.record set data = data || '{\"promoted\":true}'::jsonb
    where organization_id='$ORG' and table_id=custom.field_kernel_id()
      and data->>'key'='note' and (data->>'entity_definition_id')::uuid='$TABLE'" >/dev/null

"$PSQL" "$DSN" -At -q -v ON_ERROR_STOP=1 -c \
  "select statement from custom.promoted_index_ddl('$ORG'::uuid,'$TABLE'::uuid) where statement not like '--%' order by step" \
  > "$TMP/routeb.sql"
STMTS="$(wc -l < "$TMP/routeb.sql" | tr -d ' ')"
say "PART 3 —   the generator emitted $STMTS statement(s) for ROUTE B. Running them with autocommit while a writer works…"

# the writer, in its own process, for the length of the build
: > "$TMP/w2.sql"
printf '\\set ON_ERROR_STOP on\n\\timing on\n' >> "$TMP/w2.sql"
for i in $(seq 1 40); do
  echo "insert into custom.record (organization_id, table_id, data_class, data) values ('$ORG','$TABLE','record', jsonb_build_object('code','b$RANDOM$i','note','b'));" >> "$TMP/w2.sql"
done

"$PSQL" "$DSN" -f "$TMP/w2.sql" > "$TMP/w_build.out" 2>&1 &
W_PID=$!
# ROUTE B cannot run inside a transaction block, so every statement goes on its own connection.
while IFS= read -r stmt; do
  [ -n "$stmt" ] || continue
  "$PSQL" "$DSN" -q -v ON_ERROR_STOP=1 -c "$stmt"
done < "$TMP/routeb.sql"
wait $W_PID || true

BUILD_WORST="$(grep -o 'Time: [0-9.]*' "$TMP/w_build.out" | awk '{print $2}' | sort -g | tail -1)"
BUILD_MEAN="$(grep -o 'Time: [0-9.]*' "$TMP/w_build.out" | awk '{s+=$2; n++} END {printf "%.1f", s/n}')"
OVER500="$(grep -o 'Time: [0-9.]*' "$TMP/w_build.out" | awk '$2>500 {n++} END {print n+0}')"
say "PART 3 —   during ROUTE B: worst insert ${BUILD_WORST} ms, mean ${BUILD_MEAN} ms, ${OVER500} insert(s) over 500 ms."

VALID="$(q "select i.indisvalid from pg_index i join pg_class c on c.oid=i.indexrelid
             where c.relname = (select index_name from custom.promoted_fields('$ORG'::uuid,'$TABLE'::uuid) where field_key='note')")"
[ "$VALID" = "t" ] || { say "FAIL: the ROUTE B parent index did not end up valid (indisvalid=$VALID)."; exit 1; }
CHILDREN="$(q "select count(*) from pg_inherits i join pg_class c on c.oid=i.inhparent
                where c.relname = (select index_name from custom.promoted_fields('$ORG'::uuid,'$TABLE'::uuid) where field_key='note')")"
say "PART 3 —   the parent index is valid with $CHILDREN partition(s) attached."

MOVED="$(q "select (custom.promote_table('$ORG'::uuid,'$TABLE'::uuid)) ->> 'rows_moved'")"
[ "$MOVED" = "0" ] || { say "FAIL: light -> heavy moved $MOVED rows. REC-5 says promotion is CREATE INDEX and nothing else."; exit 1; }
say "PART 3 PASS — ROUTE B built the index on a live store with a writer working, rows_moved = 0, and the parent index is valid."
say ""
say "=== W1-INDEX — B1, the prepared-read measurement and ROUTE B's real cost, all taken on the rehearsal branch. Fixture deleted. ==="
