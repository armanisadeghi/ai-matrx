-- LANE REALTIME-2 — THE OP ID AND THE ID-SET READ DOOR, FROM THE SEAT.
--
-- THE REAL USE CASE. Rincon Plumbing Co of Ventura County runs one Jobs board. Dana is in the
-- office and Marco, the field supervisor, has the same board open in the van. Two things have
-- to be true at once: when Dana adds Friday's call-out, MARCO's board changes without a
-- reload — and DANA's board does not do a second read of a page it has already updated,
-- because the only browser that already knows about a change is the one that made it.
--
-- RUN IT (writes records and a column, and ROLLS BACK; it is not a migration):
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/realtime2_opid_seat.sql
--
-- WHAT MAKES IT FAIL — the production changes, named:
--   · stop lifting `_op_id` out before the insert          → PART 2 (it lands on the record)
--   · stop putting it in the notice                        → PART 3
--   · accept a malformed one, or a batch with two of them  → PART 4, PART 5
--   · let the id-set door answer rows the ladder refuses    → PART 7
--   · let it answer above the page ceiling                  → PART 8
--
-- ITS RED TWIN is `realtime2_opid_seat_red.sql`.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'realtime2_opid_seat.sql'
\set requires 'grant:authenticated:custom.record_write'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- ── THE RECORD-STORE SWITCH, BORROWED (SUITES-TIDY 2026-09-22) ──────────────────────────────
-- `custom.system_enabled` defaults to FALSE and that is the DESIGN: the record store is opt-in
-- per organization (STORE-OFF / FIX-11A). This suite takes a seat in an organization that has
-- not opted in, so every write below was answered "This organization has not turned the record
-- store on yet, so custom.<door> is not taking writes." — correctly. The knob's DEFAULT is not
-- touched; the organization-scoped override is written inside THIS transaction and goes with
-- the ROLLBACK at the end of the file. See _borrow_store_switch.sql for why that is a stronger
-- borrow than scripts/lib/borrow-live-switch.sh, which a psql suite cannot source.
-- Rincon Plumbing Co
\set store_org '6069a466-1445-42df-a64e-cf37ecdc1b99'
\i scripts/campaign-tests/_borrow_store_switch.sql


do $seat$
declare
  v_answers jsonb;
  v_org    constant uuid := '6069a466-1445-42df-a64e-cf37ecdc1b99';  -- Rincon Plumbing Co
  v_jobs   constant uuid := 'af3bfff6-a255-41e5-9ac2-879d53816163';  -- its Jobs table
  v_admin  constant text := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com, the owner
  v_test   constant text := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, a member
  v_topic  constant text := 'custom:table:af3bfff6-a255-41e5-9ac2-879d53816163';
  v_boss   text := current_user;
  v_op     uuid := gen_random_uuid();
  v_op2    uuid := gen_random_uuid();
  v_rec    uuid;
  v_ids    uuid[];
  v_doc    jsonb;
  v_msg    jsonb;
  v_n      integer;
  v_page   integer;
begin
  -- ── PART 0: THIS SUITE TAKES THE SEAT. ─────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice '0  OK  seat taken: authenticated, and custom.record is unreadable from it';

  -- ── THE JOBS BOARD'S OWN RULE (SUITES-TIDY 2026-09-22) ────────────────────────────────
  -- Rincon's Jobs table carries a live table Rule, "New Job Request: every answer it asks for
  -- is there" (REC-15 / DOOR-17): customer, service address, service type and scheduled date
  -- must all be present. It was added to the board after this suite was written, so every
  -- write below was refused by it on the clone — correctly. The four answers are taken from a
  -- job that is already on the board rather than invented, so the fixture is a real call-out
  -- and the Rule is satisfied the way a dispatcher satisfies it.
  select jsonb_build_object(
           'customer',       x.document ->> 'customer',
           'address',        x.document ->> 'address',
           'service_type',   x.document ->> 'service_type',
           'scheduled_date', x.document ->> 'scheduled_date')
    into v_answers
    from custom.read_records(v_org, v_jobs, false, 200, 0) x
   where x.document ? 'customer' and x.document ? 'address'
     and x.document ? 'service_type' and x.document ? 'scheduled_date'
   limit 1;
  if v_answers is null then
    raise exception 'the Rincon Jobs board has no job carrying all four answers its Rule asks for, so this fixture cannot be built from real data';
  end if;

  -- ── PART 1: DANA ADDS FRIDAY'S CALL-OUT, DECLARING HER OWN OPERATION. ──────────────────
  v_rec := custom.record_write(v_org, v_jobs, v_answers || jsonb_build_object(
             '_op_id',     v_op::text,
             'job_number', 'RPC-SEAT-' || substr(v_op::text, 1, 8),
             'address',    '118 Loma Vista Rd, Ventura CA 93001',
             'notes',      'Emergency call-out: water heater flooding the garage.'));
  raise notice '1  OK  the write door took a record carrying _op_id';

  -- ── PART 2: IT IS NOT ON THE RECORD. ───────────────────────────────────────────────────
  -- Read through the door, because what a PERSON can get back is the question.
  v_doc := custom.read_record(v_org, v_rec, false);
  if v_doc ? '_op_id' then
    raise exception '2: _op_id was persisted on the record and the read door hands it back: %', v_doc;
  end if;
  if (v_doc ->> 'job_number') is null then
    raise exception '2: the record came back without the field that was written — %', v_doc;
  end if;
  raise notice '2  OK  _op_id is nowhere on the record, and the real fields are';

  -- ── PART 3: THE NOTICE CARRIES IT. ─────────────────────────────────────────────────────
  -- 🚨 FIND THE NOTICE BY THE RECORD IT NAMES, NEVER BY "the latest one on the topic".
  -- The first draft of this suite took the newest message and clause 9 caught it red-handed:
  -- this board is a real board in a live database and other sessions write to it, so "most
  -- recent" is somebody else's write often enough to make a green run meaningless.
  perform set_config('role', v_boss, true);   -- realtime.messages is not a client door's table
  select m.payload into v_msg from realtime.messages m
   where m.topic = v_topic and m.inserted_at >= date_trunc('day', now())
     and m.payload -> 'record_ids' @> to_jsonb(array[v_rec])
   order by m.inserted_at desc limit 1;
  set local role authenticated;
  if v_msg is null then
    raise exception '3: adding a job announced nothing naming % on %', v_rec, v_topic;
  end if;
  if (v_msg ->> 'op_id') is distinct from v_op::text then
    raise exception '3: the notice carries op_id % and the writer declared %', v_msg ->> 'op_id', v_op;
  end if;
  if (v_msg -> 'record_ids') is null or not (v_msg -> 'record_ids' @> to_jsonb(array[v_rec])) then
    raise exception '3: the notice does not name the record it announced — %', v_msg;
  end if;
  -- AND STILL NOT ONE VALUE. op_id is WHICH CLICK, never WHAT CHANGED.
  if v_msg::text like '%Loma Vista%' or v_msg::text like '%water heater%' then
    raise exception '3: the notice carries a value of the record it names — %', v_msg;
  end if;
  raise notice '3  OK  the notice carries the writer''s op_id, names the record, and holds no value';

  -- ── PART 4: A MALFORMED OP ID IS REFUSED BY NAME. ──────────────────────────────────────
  begin
    perform custom.record_write(v_org, v_jobs, v_answers || jsonb_build_object('_op_id', 'not-a-uuid', 'job_number', 'RPC-BAD'));
    raise exception '4: a malformed _op_id was accepted';
  exception when others then
    if sqlstate = 'P0001' and sqlerrm like '%_op_id was accepted%' then raise; end if;
    if sqlerrm not like '%_op_id must be a uuid%' then
      raise exception '4: a malformed _op_id was refused for the wrong reason: % / %', sqlstate, sqlerrm;
    end if;
  end;
  raise notice '4  OK  a malformed _op_id is refused by name, and nothing was written';

  -- ── PART 5: ONE STATEMENT IS ONE OPERATION. ────────────────────────────────────────────
  -- A fifty-row paste is ONE click. Two different ids in one batch would make one notice that
  -- could only name one of them, so the other writer would be told to drop an echo that was
  -- never its own — the one way an echo filter loses a real change.
  begin
    perform custom.record_write_many(v_org, v_jobs, array[
      v_answers || jsonb_build_object('_op_id', v_op::text,  'job_number', 'RPC-BATCH-A'),
      v_answers || jsonb_build_object('_op_id', v_op2::text, 'job_number', 'RPC-BATCH-B')]);
    raise exception '5: a batch carrying two different _op_id values was accepted';
  exception when others then
    if sqlerrm like '%was accepted%' then raise; end if;
    if sqlerrm not like '%two different _op_id values%' then
      raise exception '5: the mixed batch was refused for the wrong reason: % / %', sqlstate, sqlerrm;
    end if;
  end;
  raise notice '5  OK  a batch carrying two different op ids is refused by name';

  -- ── PART 6: A BATCH SHARING ONE OP ID WRITES, AND ANNOUNCES ITSELF ONCE. ───────────────
  v_ids := custom.record_write_many(v_org, v_jobs, array[
             v_answers || jsonb_build_object('_op_id', v_op2::text, 'job_number', 'RPC-BATCH-1', 'address', '2210 E Main St, Ventura CA 93001'),
             v_answers || jsonb_build_object('_op_id', v_op2::text, 'job_number', 'RPC-BATCH-2', 'address', '805 S Seaward Ave, Ventura CA 93001'),
             v_answers || jsonb_build_object('_op_id', v_op2::text, 'job_number', 'RPC-BATCH-3', 'address', '1701 Poli St, Ventura CA 93001')]);
  if coalesce(cardinality(v_ids), 0) <> 3 then
    raise exception '6: the batch wrote % records, not 3', coalesce(cardinality(v_ids), 0);
  end if;
  perform set_config('role', v_boss, true);
  select count(*) into v_n from realtime.messages m
   where m.topic = v_topic and m.inserted_at >= date_trunc('day', now())
     and m.payload ->> 'op_id' = v_op2::text;
  set local role authenticated;
  if v_n <> 1 then
    raise exception '6: three rows in one statement announced themselves % times, not once', v_n;
  end if;
  raise notice '6  OK  three rows in one statement: one notice, carrying the one op id';

  -- ── PART 7: THE ID-SET DOOR READS ONLY WHAT WAS ASKED FOR, THROUGH THE SAME LADDER. ────
  select count(*) into v_page from custom.read_records(v_org, v_jobs, false, 200, 0);
  select count(*) into v_n    from custom.read_records_by_ids(v_org, v_jobs, v_ids);
  if v_n <> 3 then
    raise exception '7: the id-set door was asked for 3 ids and answered % rows', v_n;
  end if;
  if v_page <= 3 then
    raise exception '7: this board holds only % rows, so the clause proves nothing — it needs a page bigger than the id set', v_page;
  end if;
  raise notice '7  OK  the page holds % rows; asking for 3 ids answers 3', v_page;

  -- An id that does not exist is simply absent — it never refuses the rest.
  select count(*) into v_n from custom.read_records_by_ids(v_org, v_jobs, v_ids || gen_random_uuid());
  if v_n <> 3 then
    raise exception '7b: adding an id that does not exist changed the answer to % rows', v_n;
  end if;
  raise notice '7b OK  an id nobody can see is absent from the answer, not a refusal of it';

  -- AND IT ASKS THE SAME WALL. A member of another company is refused the Table itself.
  perform set_config('request.jwt.claims', json_build_object('sub', v_test, 'role', 'authenticated')::text, true);
  begin
    perform custom.read_records_by_ids('0fec03d8-afe5-4ea0-bf14-d0ab18e4a536'::uuid,  -- Ridgeline PT, a company test@test.com is NOT in (FIXTURE-ORGS 2026-09-23: repointed from an archived duplicate to the family's one kept org)
                                       'f9d61a79-0780-4cd2-9b58-3e2a25042714'::uuid,  -- its appointments table
                                       array[gen_random_uuid()]);
    raise exception '7c: a non-member read a table in a company she does not belong to';
  exception when others then
    if sqlerrm like '%a non-member read%' then raise; end if;
    null;  -- the ladder refused, which is the clause
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  raise notice '7c OK  the id-set door asks the same organization wall the page door asks';

  -- ── PART 8: THE SAME PAGE CEILING, REFUSED BY NAME. ────────────────────────────────────
  begin
    perform custom.read_records_by_ids(v_org, v_jobs,
             (select array_agg(gen_random_uuid()) from generate_series(1, 1001)));
    raise exception '8: the id-set door answered above the page ceiling';
  exception when others then
    if sqlerrm like '%answered above the page ceiling%' then raise; end if;
    if sqlerrm not like '%read_records_by_ids was asked for 1001 rows%' then
      raise exception '8: refused above the ceiling for the wrong reason: % / %', sqlstate, sqlerrm;
    end if;
  end;
  raise notice '8  OK  above the ceiling it refuses by name, the way every page door does';

  -- ── PART 9: A WRITE THAT DECLARES NOTHING STILL WORKS, AND ANNOUNCES NO OP ID. ─────────
  -- Every agent tool and every server-side write is this case, and nothing about it changed.
  v_rec := custom.record_write(v_org, v_jobs, v_answers || jsonb_build_object(
             'job_number', 'RPC-NO-OPID', 'address', '34 N Palm St, Ventura CA 93001'));
  perform set_config('role', v_boss, true);
  select m.payload into v_msg from realtime.messages m
   where m.topic = v_topic and m.inserted_at >= date_trunc('day', now())
     and m.payload -> 'record_ids' @> to_jsonb(array[v_rec])
   order by m.inserted_at desc limit 1;
  set local role authenticated;
  if v_msg is null then
    raise exception '9: the write announced nothing naming %', v_rec;
  end if;
  if (v_msg -> 'op_id') is not null and jsonb_typeof(v_msg -> 'op_id') <> 'null' then
    raise exception '9: a write that declared no _op_id announced op_id % — a browser would drop somebody else''s change', v_msg ->> 'op_id';
  end if;
  raise notice '9  OK  a write declaring nothing announces op_id null, so no browser drops it';

  raise notice 'ALL GREEN — 11 clauses';
end
$seat$;

rollback;
