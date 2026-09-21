-- LANE REALTIME — THE LIVE TOPIC, FROM THE SEAT.
--
-- THE REAL USE CASE. Rincon Plumbing Co of Ventura County dispatches two-person crews from
-- one Jobs board. Dana in the office adds Friday's emergency call-out while Marco, the field
-- supervisor, has the same board open on a tablet in the van. Marco's board must show the new
-- job without him reloading anything, and it must never show him a job somebody deliberately
-- kept off his board. That is the whole of what this file proves, against the live database,
-- with real seats.
--
-- RUN IT (writes one record and one column, and ROLLS BACK; it is not a migration and no
-- sweep sees it):
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/realtime_topic_seat.sql
--
-- THE SEATS (no passwords, no sign-in, no secret read — `request.jwt.claims` with a bare
-- `sub` is exactly what the ladder reads):
--   admin     87a6e699-3622-4869-8843-d0867456c0dd — admin@admin.com, owner of Rincon Plumbing Co
--   test      4060701e-706a-4c76-b3ca-0bbc69fa5a14 — test@test.com, a MEMBER of Rincon Plumbing Co
--                                                    and NOT a member of the Oxnard branch
--
-- WHAT MAKES IT FAIL — the production changes, named:
--   · drop the knob read from the policy on `realtime.messages`   → PART 2
--   · answer the topic with anything but `custom.assert_may_know_table` → PART 3 (b), (c)
--   · loosen the topic grammar, or admit an unregistered prefix   → PART 3 (d), (e)
--   · let the store's own owner role be admitted as a subscriber  → PART 3 (f)
--   · put a VALUE in the notice payload                           → PART 5
--   · stop announcing a column change, or announce it on the Field kernel's topic → PART 6
--
-- ITS RED TWIN is `realtime_topic_seat_red.sql`, which asks the same questions of a policy
-- whose knob read has been removed and a topic function that answers `true` for anybody.

\set ON_ERROR_STOP on

begin;

do $seat$
declare
  v_org       constant uuid := '6069a466-1445-42df-a64e-cf37ecdc1b99';  -- Rincon Plumbing Co
  v_other_org constant uuid := '5531d39c-e863-467a-9e36-ad7f14b2faeb';  -- the Oxnard branch
  v_jobs      constant uuid := 'af3bfff6-a255-41e5-9ac2-879d53816163';  -- its Jobs table
  v_admin     constant text := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_test      constant text := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_topic     constant text := 'custom:table:af3bfff6-a255-41e5-9ac2-879d53816163';
  v_other_tbl uuid;
  v_ok        boolean;
  v_before    bigint;
  v_msgs      jsonb;
  v_one       jsonb;
  v_new_id    uuid := gen_random_uuid();
  v_field_id  uuid := gen_random_uuid();
  v_n         integer;
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
  raise notice '0 OK  seat taken: authenticated, and custom.record is unreadable from it';

  -- ── PART 1: DANA ADDS FRIDAY'S EMERGENCY CALL-OUT. ─────────────────────────────────────
  -- FIRST, so that every clause after it is read against a topic that really does carry
  -- messages. A "zero" on an empty topic proves nothing at all.
  reset role;
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_new_id, v_org, v_jobs, 'record',
          jsonb_build_object('job_number', 'RPC-4417',
                             'address',    '118 Loma Vista Rd, Ventura CA 93001',
                             'notes',      'Emergency call-out: water heater flooding the garage. Shut-off at street.'),
          v_admin::uuid);
  select count(*) into v_n from realtime.messages where topic = v_topic;
  if v_n = 0 then
    raise exception '1: adding a job announced nothing on %', v_topic;
  end if;
  raise notice '1 OK  the board''s topic now carries % message(s)', v_n;

  -- ── PART 1b: WITH THE SWITCH OFF, THE BOARD'S OWNER READS NONE OF THEM. ────────────────
  -- The RED half of the knob, and it is read against the very messages PART 1 just made.
  update platform.feature_knob set value = 'false'::jsonb
   where feature = 'platform' and key = 'realtime_broadcast_enabled';
  perform platform.memo_clear();
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('realtime.topic', v_topic, true);
  select count(*) into v_n from (select 1 from realtime.messages limit 1) probe;  -- BOUNDED: the policy decides this, not a grant, and Realtime's own check is bounded too
  if v_n <> 0 then
    raise exception '1b: with the switch OFF the owner of this table still read % message(s) on her own topic', v_n;
  end if;
  raise notice '1b OK  switch off: the owner of the Jobs board reads none of them';

  -- ── PART 2: THE SWITCH ON. ─────────────────────────────────────────────────────────────
  reset role;
  update platform.feature_knob set value = 'true'::jsonb
   where feature = 'platform' and key = 'realtime_broadcast_enabled';
  perform platform.memo_clear();
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('realtime.topic', v_topic, true);
  select count(*) into v_n from (select 1 from realtime.messages limit 1) probe;
  if v_n = 0 then
    raise exception '2: with the switch ON the owner of the Jobs board still reads nothing on her own topic';
  end if;
  raise notice '2 OK  switch on: the same seat, the same topic, now reads its messages';

  -- AND THE SEAT NEXT DOOR STILL READS NOTHING. The switch widens nothing but the switch.
  perform set_config('request.jwt.claims', json_build_object('sub', v_test, 'role', 'authenticated')::text, true);
  perform set_config('realtime.topic', 'custom:table:' || gen_random_uuid()::text, true);
  perform platform.memo_clear();
  select count(*) into v_n from (select 1 from realtime.messages limit 1) probe;
  if v_n <> 0 then
    raise exception '2b: a topic naming a table that does not exist read % message(s)', v_n;
  end if;
  raise notice '2b OK  switch on: a topic for a table that does not exist still reads 0';

  -- ── PART 3: WHO THE TOPIC ADMITS, ASKED SIX WAYS. ──────────────────────────────────────
  -- (a) Dana, who owns the board.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform platform.memo_clear();
  if not platform.realtime_topic_admits(v_topic) then
    raise exception '3a: the owner of Rincon Plumbing Co is not admitted to her own Jobs board''s topic';
  end if;
  raise notice '3a OK  the owner is admitted';

  -- (b) Marco, a member of the same company.
  perform set_config('request.jwt.claims', json_build_object('sub', v_test, 'role', 'authenticated')::text, true);
  perform platform.memo_clear();
  if not platform.realtime_topic_admits(v_topic) then
    raise exception '3b: a member of Rincon Plumbing Co is not admitted to the Jobs board''s topic';
  end if;
  raise notice '3b OK  a member of the company is admitted';

  -- (c) The SAME person, on a table in a branch she is not in. The refusal that matters:
  --     it is not "the topic looked wrong", it is the ladder saying no.
  reset role;
  select r.id into v_other_tbl
    from custom.record r
   where r.organization_id = v_other_org and r.data_class = 'table' and r.deleted_at is null
   limit 1;
  set local role authenticated;
  perform platform.memo_clear();
  if v_other_tbl is null then
    raise exception '3c: the Oxnard branch has no table, so this clause proves nothing';
  end if;
  if platform.realtime_topic_admits('custom:table:' || v_other_tbl::text) then
    raise exception '3c: a non-member of the Oxnard branch was admitted to one of its tables'' topics';
  end if;
  raise notice '3c OK  a non-member is refused a table in a company she does not belong to';

  -- (d) A topic that is not a topic.
  if platform.realtime_topic_admits('custom:table:not-a-uuid')
     or platform.realtime_topic_admits('custom:tableau:' || v_jobs::text)
     or platform.realtime_topic_admits('custom:table:' || v_jobs::text || ':extra') then
    raise exception '3d: the topic grammar admitted something that is not custom:table:<uuid>';
  end if;
  raise notice '3d OK  a malformed topic, and a prefix that merely starts the same, are both refused';

  -- (e) A prefix no schema has claimed.
  if platform.realtime_topic_admits('workspace:tasks:' || v_jobs::text) then
    raise exception '3e: an unregistered topic prefix was admitted';
  end if;
  raise notice '3e OK  an unregistered prefix is refused';

  -- (f) Nobody signed in.
  perform set_config('request.jwt.claims', '', true);
  perform platform.memo_clear();
  if platform.realtime_topic_admits(v_topic) then
    raise exception '3f: a socket carrying no principal was admitted';
  end if;
  raise notice '3f OK  a socket with nobody signed in is refused';

  -- ── PART 4: WHAT THE NOTICE FOR THAT JOB ACTUALLY SAYS. ───────────────────────────────
  reset role;
  select jsonb_agg(m.payload order by m.inserted_at) into v_msgs
    from realtime.messages m
   where m.topic = v_topic and m.event = 'records.changed'
     and m.payload ->> 'kind' = 'record';
  if v_msgs is null or jsonb_array_length(v_msgs) = 0 then
    raise exception '4: adding a job announced nothing on %', v_topic;
  end if;
  v_one := v_msgs -> (jsonb_array_length(v_msgs) - 1);
  if v_one ->> 'op' <> 'created' then
    raise exception '4: the notice says op=% for a job that was created', v_one ->> 'op';
  end if;
  if not (v_one -> 'record_ids' ? v_new_id::text) then
    raise exception '4: the notice does not name the job that was added: %', v_one -> 'record_ids';
  end if;
  raise notice '4 OK  adding a job announces op=created naming its id on the table''s own topic';

  -- ── PART 5: THE NOTICE CARRIES NO VALUES. ──────────────────────────────────────────────
  -- The clause the whole design rests on. Per-record visibility is decided at READ time, so a
  -- payload carrying a value would travel past it: one topic serves the whole board, and two
  -- people on that board do not necessarily see the same jobs on it.
  if (select count(*) from jsonb_object_keys(v_one) k
       where k not in ('id', 'table_id', 'kind', 'op', 'record_ids', 'fields_changed', 'at')) > 0 then
    raise exception '5: the notice carries a key outside the six it is allowed: %',
      (select string_agg(k, ', ') from jsonb_object_keys(v_one) k);
  end if;
  if v_one::text ilike '%Loma Vista%' or v_one::text ilike '%water heater%'
     or v_one::text ilike '%RPC-4417%' then
    raise exception '5: the notice carries the job''s own words — %', v_one;
  end if;
  raise notice '5 OK  the notice is six keys and not one value of the record it names';

  -- ── PART 6: A COLUMN IS ADDED, AND IT LANDS ON THE TABLE''S TOPIC, NOT THE KERNEL''S. ──
  -- THROUGH THE DOOR, not by hand: adding a column is `custom.field_declare`, which is what
  -- the Add-field control on the grid calls. A suite that writes a Field row itself would be
  -- testing a shape no person can produce.
  perform custom.field_declare(v_org, v_jobs,
    jsonb_build_object('key', 'permit_number', 'label', 'Permit number', 'type', 'text'));

  select count(*) into v_n
    from realtime.messages m
   where m.topic = v_topic and m.payload ->> 'kind' = 'field';
  if v_n = 0 then
    raise exception '6: adding a column to the Jobs board announced nothing on the board''s topic';
  end if;
  if exists (select 1 from realtime.messages m
              where m.topic = 'custom:table:' || custom.field_kernel_id()::text) then
    raise exception '6: a column change was announced on the Field KERNEL''s topic, which nobody watches';
  end if;
  raise notice '6 OK  adding a column announces kind=field on the table''s own topic, never the kernel''s';

  raise notice 'ALL GREEN — realtime_topic_seat';
end
$seat$;

rollback;
