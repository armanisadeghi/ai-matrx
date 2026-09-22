-- LANE REALTIME — THE RED TWIN of `realtime_topic_seat.sql`.
--
-- A guard you cannot show failing is not a guard. This installs, inside a transaction it
-- rolls back, the two shapes the green suite exists to refuse — the two an ordinary,
-- well-meaning change would produce — and asserts that the green suite's own clauses CATCH
-- each one. If any clause here reports that it passed, the matching clause over there is
-- decoration.
--
--   RED 1 — THE PREDICATE SAYS YES TO EVERYBODY. `custom.realtime_topic_admits` returns
--           `true` without asking the ladder. This is what "just get it working" looks like,
--           and it hands every member of every company every other company's live board.
--           Clauses 3c, 3f and 2b must all go red.
--   RED 2 — THE NOTICE CARRIES THE RECORD. `custom._realtime_notice` puts the row's values in
--           the payload "so the client does not have to re-read". That is the leak the whole
--           design is shaped around: one topic serves a whole table, and two people on that
--           table do not necessarily see the same rows in it. Clause 5 must go red.
--
-- RUN IT exactly like the green one; it writes nothing that survives:
--   "$PSQL" "$DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/realtime_topic_seat_red.sql

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'realtime_topic_seat_red.sql'
\set requires 'function:platform.memo_clear'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $red$
declare
  v_answers   jsonb;
  v_org       constant uuid := '6069a466-1445-42df-a64e-cf37ecdc1b99';  -- Rincon Plumbing Co
  v_other_org constant uuid := '5531d39c-e863-467a-9e36-ad7f14b2faeb';  -- the Oxnard branch
  v_jobs      constant uuid := 'af3bfff6-a255-41e5-9ac2-879d53816163';
  v_admin     constant text := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_test      constant text := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_topic     constant text := 'custom:table:af3bfff6-a255-41e5-9ac2-879d53816163';
  v_other_tbl uuid;
  v_new_id    uuid := gen_random_uuid();
  v_one       jsonb;
  v_caught    integer := 0;
begin
  update platform.feature_knob set value = 'true'::jsonb
   where feature = 'platform' and key = 'realtime_broadcast_enabled';
  perform platform.memo_clear();

  select r.id into v_other_tbl
    from custom.record r
   where r.organization_id = v_other_org and r.data_class = 'table' and r.deleted_at is null
   limit 1;

  -- ══ RED 1 ══════════════════════════════════════════════════════════════════════════════
  create or replace function custom.realtime_topic_admits(p_topic text)
  returns boolean language sql stable security definer set search_path to 'pg_catalog'
  as $body$ select true $body$;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_test, 'role', 'authenticated')::text, true);

  -- Clause 3c's question, asked of the broken body.
  if platform.realtime_topic_admits('custom:table:' || v_other_tbl::text) then
    v_caught := v_caught + 1;
    raise notice 'RED 1 / 3c CAUGHT — a non-member of the Oxnard branch IS admitted to its board';
  else
    raise exception 'RED 1 / 3c DID NOT GO RED: clause 3c cannot tell a yes-to-everybody predicate from the real one';
  end if;

  -- Clause 3f's question: nobody signed in at all.
  perform set_config('request.jwt.claims', '', true);
  perform platform.memo_clear();
  if platform.realtime_topic_admits(v_topic) then
    v_caught := v_caught + 1;
    raise notice 'RED 1 / 3f CAUGHT — a socket carrying no principal IS admitted';
  else
    raise exception 'RED 1 / 3f DID NOT GO RED';
  end if;

  -- Clause 2b's question: a table that does not exist.
  if platform.realtime_topic_admits('custom:table:' || gen_random_uuid()::text) then
    v_caught := v_caught + 1;
    raise notice 'RED 1 / 2b CAUGHT — a topic for a table that does not exist IS admitted';
  else
    raise exception 'RED 1 / 2b DID NOT GO RED';
  end if;

  reset role;

  -- ══ RED 2 ══════════════════════════════════════════════════════════════════════════════
  create or replace function custom._realtime_notice(
    p_organization_id uuid, p_table_id uuid, p_kind text, p_op text,
    p_record_ids jsonb, p_fields_changed boolean
  ) returns void language plpgsql volatile security definer set search_path to 'pg_catalog'
  as $body$
  declare
    v_id uuid := gen_random_uuid();
  begin
    -- "so the client does not have to re-read" — the helpful change that leaks.
    perform realtime.send(
      jsonb_build_object('id', v_id, 'table_id', p_table_id, 'kind', p_kind, 'op', p_op,
                         'record_ids', p_record_ids, 'fields_changed', p_fields_changed,
                         'at', now(),
                         'records', (select jsonb_agg(r.data) from custom.record r
                                      where r.organization_id = p_organization_id
                                        and r.id::text in (select jsonb_array_elements_text(p_record_ids)))),
      'records.changed', 'custom:table:' || p_table_id::text, true);
  end $body$;


  -- ── THE JOBS BOARD'S OWN RULE (SUITES-TIDY 2026-09-22) ────────────────────────────────
  -- Rincon's Jobs table carries a live table Rule, "New Job Request: every answer it asks for
  -- is there" (REC-15 / DOOR-17): customer, service address, service type and scheduled date
  -- must all be present. It was added to the board after this suite was written, so the insert
  -- below was refused by it on the clone — correctly, and for a reason that has nothing to do
  -- with what this suite asserts. The four answers are taken from a job already on the board
  -- rather than invented.
  select jsonb_build_object(
           'customer',       x.data ->> 'customer',
           'address',        x.data ->> 'address',
           'service_type',   x.data ->> 'service_type',
           'scheduled_date', x.data ->> 'scheduled_date')
    into v_answers
    from custom.record x
   where x.organization_id = v_org and x.table_id = v_jobs and x.deleted_at is null
     and x.data ? 'customer' and x.data ? 'address'
     and x.data ? 'service_type' and x.data ? 'scheduled_date'
   limit 1;
  if v_answers is null then
    raise exception 'the Rincon Jobs board has no job carrying all four answers its Rule asks for, so this fixture cannot be built from real data';
  end if;

  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_new_id, v_org, v_jobs, 'record',
          v_answers || jsonb_build_object('job_number', 'RPC-4418',
                             'address',    '2210 Ventura Ave, Ventura CA 93001',
                             'notes',      'Slab leak under the kitchen — locate and re-route.'),
          v_admin::uuid);

  select m.payload into v_one
    from realtime.messages m
   where m.topic = v_topic and m.payload -> 'record_ids' ? v_new_id::text
   order by m.inserted_at desc limit 1;

  if v_one is null then
    raise exception 'RED 2 setup failed: the leaky notice was not sent at all';
  end if;

  -- Clause 5, both halves.
  if (select count(*) from jsonb_object_keys(v_one) k
       where k not in ('id', 'table_id', 'kind', 'op', 'record_ids', 'fields_changed', 'at')) > 0
     and v_one::text ilike '%Ventura Ave%' then
    v_caught := v_caught + 1;
    raise notice 'RED 2 / 5 CAUGHT — the notice carries a key outside the six AND the job''s own words';
  else
    raise exception 'RED 2 / 5 DID NOT GO RED: clause 5 cannot see a value riding the notice';
  end if;

  if v_caught <> 4 then
    raise exception 'expected 4 caught clauses, got %', v_caught;
  end if;
  raise notice 'ALL RED CAUGHT (4/4) — realtime_topic_seat can go red';
end
$red$;

rollback;
