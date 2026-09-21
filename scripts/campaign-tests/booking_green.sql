-- scripts/campaign-tests/booking_green.sql — lane BOOKING, from the seat.
--
-- PRODUCTS row 14, *"Let clients book a 30-minute consult."* Every asserted clause below
-- PART 0 runs as `authenticated` — the role PostgREST serves a signed-in person — through
-- the doors that person reaches, EXCEPT the six public doors, which are server-lane BY
-- DECLARATION (`platform.client_callable_door` says so in as many words) and are therefore
-- reached by stepping out and SAYING SO each time.
--
-- The two seats: `admin@admin.com` owns the organization and the Table; `test@test.com` is
-- an ordinary member. The person booking has no seat at all.
--
-- WHAT IS DELIBERATELY NOT HERE: the race. Two holds on one slot from ONE session prove
-- nothing — the second insert sees the first through a snapshot it already owns and the
-- unique index never arbitrates. That clause lives in `booking_race.sh`, which opens two
-- real connections and commits.
--
-- Ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '60s';
set local statement_timeout = '600s';

do $suite$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_table   uuid;
  v_f1 uuid; v_f2 uuid;
  v_accept uuid; v_notify uuid;
  v_made   jsonb;
  v_form   uuid;
  v_slots  uuid;
  v_key    text;
  v_key2   text;
  v_hold   uuid;
  v_ref    text;
  v_rec    uuid;
  v_txt    text;
  v_n      bigint;
  v_row    record;
  v_doc    jsonb;
begin
  -- ── fixtures, as the connected role (a seat is a PERSON; these make one) ───────
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Sunrise Yoga Studio ' || left(v_org::text, 8),
          'sunrise-yoga-studio-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin),
         (v_org, 'organization', v_org, c_dana, 'member', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'booking_green.sql', c_admin);

  perform set_config('app.actor_system', 'campaign-test/booking_green.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ PART 0 — TAKE THE SEAT AND PROVE IT ═══════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — seated as %, which cannot read custom.record directly', current_user;

  -- ══ PART 1 — a Table, its Fields, and the two Rules ════════════════════════════
  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Clinic', 'description', 'the suite''s home', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Consults', 'slug', 'consults', 'description', 'the suite''s table',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'full_name', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Consult', 'label_plural', 'Consults',
      'title_field', 'full_name',
      'fields', jsonb_build_array(jsonb_build_object('name', 'full_name'),
                                  jsonb_build_object('name', 'email')),
      'parent_id', v_home));
  v_f1 := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'full name', 'key', 'full_name', 'type', 'text', 'required', true));
  v_f2 := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'email', 'key', 'email', 'type', 'text', 'required', true));
  v_accept := custom.rule_declare(v_org, jsonb_build_object(
      'name', 'consult: every answer it asks for is there', 'kind', 'predicate',
      'uses', jsonb_build_array('validate'), 'scope_table_id', v_table, 'applies_to_types', '[]'::jsonb,
      'expr', jsonb_build_object('op', 'and', 'args', jsonb_build_array(
                jsonb_build_object('op', 'present', 'args', jsonb_build_array(jsonb_build_object('field', v_f1))),
                jsonb_build_object('op', 'present', 'args', jsonb_build_array(jsonb_build_object('field', v_f2))))),
      'description', 'DOOR-17: a booking becomes a record only when this Rule admits it.'), null);
  v_notify := custom.rule_declare(v_org, jsonb_build_object(
      'name', 'consult: tell someone', 'kind', 'predicate',
      'uses', jsonb_build_array('membership'), 'scope_table_id', v_table, 'applies_to_types', '[]'::jsonb,
      'expr', jsonb_build_object('const', true),
      'description', 'DOOR-18: an ordinary subscription Rule.',
      'subscription', jsonb_build_object('saved_view_id', null, 'cadence', 'immediate',
                                         'channel', 'in_app', 'recipient_user_id', c_admin,
                                         'event_key', 'custom.booking.made')), null);
  raise notice 'PART 1 PASSED — a Table, two Fields, an accept Rule and a subscription Rule';

  -- ══ PART 2 — HOURS THAT ARE IMPOSSIBLE ARE REFUSED BY NAME ═════════════════════
  begin
    perform custom.booking_declare(v_org, v_table, 'Bad zone',
      jsonb_build_array(jsonb_build_object('field', 'full_name', 'required', true)),
      jsonb_build_object('timezone', 'Mars/Olympus'), '{}'::jsonb, null, v_accept, null, null, null, v_home);
    raise exception '2a: a timezone that does not exist was accepted';
  exception when sqlstate '22023' then
    get stacked diagnostics v_txt = message_text;
    if v_txt not like '%Mars/Olympus%' then
      raise exception '2a: refused, but did not name the timezone: %', v_txt;
    end if;
    raise notice 'PART 2a PASSED — "%"', v_txt;
  end;
  begin
    perform custom.booking_declare(v_org, v_table, 'Backwards',
      jsonb_build_array(jsonb_build_object('field', 'full_name', 'required', true)),
      jsonb_build_object('windows', jsonb_build_array(jsonb_build_object('weekday', 1, 'from', '17:00', 'to', '09:00'))),
      '{}'::jsonb, null, v_accept, null, null, null, v_home);
    raise exception '2b: a window that ends before it starts was accepted';
  exception when sqlstate '22023' then
    get stacked diagnostics v_txt = message_text;
    raise notice 'PART 2b PASSED — "%"', v_txt;
  end;
  begin
    perform custom.booking_declare(v_org, v_table, 'A stranger''s hours',
      jsonb_build_array(jsonb_build_object('field', 'full_name', 'required', true)),
      jsonb_build_object('windows', jsonb_build_array(jsonb_build_object(
        'weekday', 1, 'from', '09:00', 'to', '17:00',
        'member_user_id', '00000000-0000-0000-0000-000000000001'))),
      '{}'::jsonb, null, v_accept, null, null, null, v_home);
    raise exception '2c: a window naming a non-member was accepted';
  exception when sqlstate '23503' then
    get stacked diagnostics v_txt = message_text;
    raise notice 'PART 2c PASSED — "%"', v_txt;
  end;
  begin
    perform custom.booking_declare(v_org, v_table, 'Asking for the time',
      jsonb_build_array(jsonb_build_object('field', 'slot', 'required', true)),
      '{}'::jsonb, '{}'::jsonb, null, v_accept, null, null, null, v_home);
    raise exception '2d: a page was allowed to ask the visitor for the time it already holds';
  exception when sqlstate '22023' then
    get stacked diagnostics v_txt = message_text;
    raise notice 'PART 2d PASSED — "%"', v_txt;
  end;

  -- ══ PART 3 — THE WHOLE PAGE, IN ONE ACT ════════════════════════════════════════
  v_made := custom.booking_declare(v_org, v_table, 'Book a 30-minute consult',
      jsonb_build_array(
        jsonb_build_object('field', 'full_name', 'ask', 'What is your name?', 'required', true),
        jsonb_build_object('field', 'email', 'ask', 'Where should we send the confirmation?', 'required', true)),
      jsonb_build_object('timezone', 'UTC', 'slot_minutes', 30, 'lead_minutes', 0,
                         'max_per_day', 20, 'days', 2,
                         'windows', jsonb_build_array(
                           jsonb_build_object('weekday', 0, 'from', '00:00', 'to', '23:30'),
                           jsonb_build_object('weekday', 1, 'from', '00:00', 'to', '23:30'),
                           jsonb_build_object('weekday', 2, 'from', '00:00', 'to', '23:30'),
                           jsonb_build_object('weekday', 3, 'from', '00:00', 'to', '23:30'),
                           jsonb_build_object('weekday', 4, 'from', '00:00', 'to', '23:30'),
                           jsonb_build_object('weekday', 5, 'from', '00:00', 'to', '23:30'),
                           jsonb_build_object('weekday', 6, 'from', '00:00', 'to', '23:30'))),
      jsonb_build_object('intro', 'A half hour with one of our consultants.'),
      null, v_accept, v_notify, null, null, v_home);
  v_form := (v_made ->> 'form_id')::uuid;
  v_slots := (v_made ->> 'slot_table_id')::uuid;
  if v_form is null or v_slots is null then
    raise exception '3: booking_declare made no page (%)', v_made::text;
  end if;
  if (v_made ->> 'questions_asked')::int <> 2 or (v_made ->> 'questions_filled_in')::int <> 3 then
    raise exception '3: the page asks % questions and fills in % — expected 2 and 3',
                    v_made ->> 'questions_asked', v_made ->> 'questions_filled_in';
  end if;
  -- THE SLOTS TABLE IS FOUND, NOT REMADE. A second page over the same Table must hold
  -- against the SAME index or each has a private idea of what is free.
  if (custom.booking_declare(v_org, v_table, 'A second page over the same table',
        jsonb_build_array(jsonb_build_object('field', 'full_name', 'required', true)),
        '{}'::jsonb, '{}'::jsonb, null, v_accept, null, null, null, v_home) ->> 'slot_table_id')::uuid
     is distinct from v_slots then
    raise exception '3: a second page over the same Table got its own slots Table, so the unique index protects nothing';
  end if;
  raise notice 'PART 3 PASSED — the page, its slots Table (%), 2 questions asked and 3 filled in, in % ms',
               v_slots, v_made ->> 'ms';

  -- ══ PART 4 — CLOSED BY DEFAULT ═════════════════════════════════════════════════
  -- Stepping out: the public doors are server-lane BY DECLARATION.
  perform set_config('role', v_boss, true);
  if exists (select 1 from custom.booking_public(v_form, 1)) then
    raise exception '4: an unpublished booking page answered the public door';
  end if;
  perform set_config('role', 'authenticated', true);
  perform custom.anon_publish(v_org, v_form, true);
  raise notice 'PART 4 PASSED — closed until custom.anon_publish, which is a person''s act';

  -- ══ PART 5 — THE PUBLIC FACE ═══════════════════════════════════════════════════
  perform set_config('role', v_boss, true);   -- server lane by declaration
  select * into v_row from custom.booking_public(v_form, 1);
  if v_row.state <> 'open' then
    raise exception '5: a published page is %', v_row.state;
  end if;
  if jsonb_array_length(v_row.fields) <> 2 then
    raise exception '5: the public face shows % fields — slot, status and booked_with must be hidden',
                    jsonb_array_length(v_row.fields);
  end if;
  if v_row.honeypot_key is null then
    raise exception '5: no decoy field';
  end if;
  if jsonb_array_length(v_row.slots) = 0 then
    raise exception '5: the page offers no times';
  end if;
  if v_row.availability ? 'slot_table_id' then
    raise exception '5: the public face hands out the slots Table id';
  end if;
  select s ->> 'key' into v_key from jsonb_array_elements(v_row.slots) s
   where not (s ->> 'taken')::boolean order by 1 limit 1;
  select s ->> 'key' into v_key2 from jsonb_array_elements(v_row.slots) s
   where not (s ->> 'taken')::boolean and s ->> 'key' <> v_key order by 1 limit 1;
  raise notice 'PART 5 PASSED — open, 2 questions, a decoy, % times on offer, first free %',
               jsonb_array_length(v_row.slots), v_key;

  -- ══ PART 6 — A TIME THAT WAS NEVER OFFERED IS REFUSED ══════════════════════════
  select * into v_row from custom.booking_hold(v_form, '2001-01-01T09:00:00Z', 'https://s.test', 'seat-bucket', null);
  if v_row.state <> 'not_offered' then
    raise exception '6: a time this page never offered was %', v_row.state;
  end if;
  raise notice 'PART 6 PASSED — "%"', v_row.message;

  -- ══ PART 7 — HOLD, THEN THE DETAILS ════════════════════════════════════════════
  select * into v_row from custom.booking_hold(v_form, v_key, 'https://s.test', 'seat-bucket', null);
  if v_row.state <> 'held' or v_row.hold_id is null then
    raise exception '7: the first hold on a free slot was % (%)', v_row.state, v_row.message;
  end if;
  v_hold := v_row.hold_id;

  -- The slot leaves the board at once, for everybody.
  select count(*) into v_n from custom.booking_public(v_form, 1) b, jsonb_array_elements(b.slots) s
   where s ->> 'key' = v_key and (s ->> 'taken')::boolean;
  if v_n <> 1 then
    raise exception '7: a held slot is still shown as free';
  end if;

  -- A VISITOR CANNOT SEND THE TIME ITSELF.
  begin
    perform custom.booking_confirm(v_form, v_hold, 'https://s.test',
              jsonb_build_object('full_name', 'Dana', 'email', 'd@x.test', 'slot', '2001-01-01T09:00:00Z'),
              'seat-bucket', null, 'ck1');
    raise exception '7: a payload naming slot was accepted';
  exception when sqlstate '42501' then
    get stacked diagnostics v_txt = message_text;
    if v_txt not like '%slot%' then
      raise exception '7: refused but did not name the key: %', v_txt;
    end if;
    raise notice 'PART 7a PASSED — "%"', v_txt;
  end;

  -- SOMEBODY ELSE'S HOLD IS NOT YOURS.
  begin
    perform custom.booking_confirm(v_form, v_hold, 'https://s.test',
              jsonb_build_object('full_name', 'Mallory', 'email', 'm@x.test'),
              'another-bucket', null, 'ck2');
    raise exception '7: a different caller booked somebody else''s hold';
  exception when sqlstate '42501' then
    get stacked diagnostics v_txt = message_text;
    raise notice 'PART 7b PASSED — "%"', v_txt;
  end;

  -- AND THE ANSWERS STILL HAVE TO BE THERE.
  begin
    perform custom.booking_confirm(v_form, v_hold, 'https://s.test',
              jsonb_build_object('full_name', 'Dana Ops'), 'seat-bucket', null, 'ck3');
    raise exception '7: a booking missing a required answer was accepted';
  exception when sqlstate '22004' then
    get stacked diagnostics v_txt = message_text;
    raise notice 'PART 7c PASSED — "%"', v_txt;
  end;


  -- ══ PART 8 — THE BOOKING ITSELF ═══════════════════════════════════════════════
  perform set_config('role', v_boss, true);   -- server lane by declaration
  select s ->> 'key' into v_key from custom.booking_public(v_form, 1) b, jsonb_array_elements(b.slots) s
   where not (s ->> 'taken')::boolean order by 1 limit 1;
  select s ->> 'key' into v_key2 from custom.booking_public(v_form, 1) b, jsonb_array_elements(b.slots) s
   where not (s ->> 'taken')::boolean and s ->> 'key' <> v_key order by 1 limit 1;

  select * into v_row from custom.booking_hold(v_form, v_key, 'https://s.test', 'seat-bucket', null);
  v_hold := v_row.hold_id;
  select * into v_row from custom.booking_confirm(v_form, v_hold, 'https://s.test',
            jsonb_build_object('full_name', 'Dana Ops', 'email', 'dana@example.test'),
            'seat-bucket', null, 'ck-ok');
  if v_row.state <> 'booked' or v_row.record_id is null or v_row.booking_ref is null then
    raise exception '8: the booking is % (%)', v_row.state, v_row.message;
  end if;
  v_ref := v_row.booking_ref; v_rec := v_row.record_id;
  if length(v_ref) <> 32 then
    raise exception '8: the visitor''s link is % characters, not 128 bits of hex', length(v_ref);
  end if;

  -- IT IS A RECORD IN THE ORGANIZATION'S OWN TABLE, with its provenance.
  select r.data into v_doc from custom.record r where r.id = v_rec;
  if v_doc ->> 'slot' is distinct from v_key
     or v_doc ->> 'status' <> 'booked'
     or v_doc -> '_source' ->> 'via' <> 'form'
     or (v_doc -> '_source' ->> 'form_id')::uuid <> v_form then
    raise exception '8: the booking record does not carry its time and its provenance: %', v_doc::text;
  end if;
  raise notice 'PART 8 PASSED — the booking is a record: % at %, source %',
               v_doc ->> 'full_name', v_doc ->> 'slot', v_doc -> '_source' ->> 'via';

  -- ══ PART 9 — THE CALENDAR HOLD IS THE SLOT HOLD, KEPT UNTIL THE END ════════════
  select count(*) into v_n from custom.record r
   where r.organization_id = v_org and r.deleted_at is null
     and r.data ->> 'slot_key' = v_key
     and (r.data ->> 'expires_at')::timestamptz = v_key::timestamptz + interval '30 minutes';
  if v_n <> 1 then
    raise exception '9: the calendar hold does not run to the end of the appointment';
  end if;
  raise notice 'PART 9 PASSED — one hold on that slot, expiring at the end of the half hour';

  -- ══ PART 10 — THE VISITOR'S OWN LINK ═══════════════════════════════════════════
  select * into v_row from custom.booking_manage(v_ref, 1);
  if v_row.state <> 'booked' or v_row.slot_key <> v_key then
    raise exception '10: the visitor''s own link shows % at %', v_row.state, v_row.slot_key;
  end if;
  select count(*) into v_n from jsonb_array_elements(v_row.slots) s where (s ->> 'mine')::boolean;
  if v_n <> 1 then
    raise exception '10: the person''s own time is not marked as theirs, so the screen says no to itself';
  end if;
  raise notice 'PART 10 PASSED — their own appointment, with their own time marked theirs';

  -- ══ PART 11 — THE MOVE MOVES BOTH HALVES ═══════════════════════════════════════
  select * into v_row from custom.booking_reschedule(v_ref, v_key2, 'https://s.test', 'seat-bucket');
  if v_row.state <> 'moved' then
    raise exception '11: the move is % (%)', v_row.state, v_row.message;
  end if;
  select r.data into v_doc from custom.record r where r.id = v_rec;
  if v_doc ->> 'slot' <> v_key2 then
    raise exception '11: the record still says %', v_doc ->> 'slot';
  end if;
  select count(*) into v_n from custom.record r
   where r.organization_id = v_org and r.deleted_at is null and r.data ->> 'slot_key' = v_key2;
  if v_n <> 1 then
    raise exception '11: the calendar hold did not move with the record';
  end if;
  select count(*) into v_n from custom.record r
   where r.organization_id = v_org and r.deleted_at is null and r.data ->> 'slot_key' = v_key;
  if v_n <> 0 then
    raise exception '11: the old time is still held, so it never went back on offer';
  end if;
  raise notice 'PART 11 PASSED — the record and the calendar hold both moved, and the old time is free';

  -- ══ PART 12 — CANCEL KEEPS THE BOOKING AND FREES THE TIME ══════════════════════
  select * into v_row from custom.booking_cancel(v_ref, 'https://s.test');
  if v_row.state <> 'cancelled' then
    raise exception '12: the cancel is %', v_row.state;
  end if;
  select r.data into v_doc from custom.record r where r.id = v_rec and r.deleted_at is null;
  if v_doc is null then
    raise exception '12: cancelling DELETED the booking — a lost hour must still be countable';
  end if;
  if v_doc ->> 'status' <> 'cancelled' then
    raise exception '12: the booking still says %', v_doc ->> 'status';
  end if;
  select count(*) into v_n from custom.record r
   where r.organization_id = v_org and r.deleted_at is null and r.data ->> 'slot_key' = v_key2;
  if v_n <> 0 then
    raise exception '12: the cancelled time is still held';
  end if;
  -- And it is idempotent, because a person taps twice.
  select * into v_row from custom.booking_cancel(v_ref, 'https://s.test');
  if v_row.state <> 'cancelled' then
    raise exception '12: cancelling twice answered %', v_row.state;
  end if;
  raise notice 'PART 12 PASSED — kept and marked, the time back on offer, and tapping twice is safe';

  -- ══ PART 13 — THE OWNER'S LIST, AND THE WALL ═══════════════════════════════════
  perform set_config('request.jwt.claims',
    '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  select * into v_row from custom.bookings(v_org, null) where title = 'Book a 30-minute consult';
  if v_row.state <> 'open' or v_row.cancelled <> 1 then
    raise exception '13: the owner''s list says % with % cancelled', v_row.state, v_row.cancelled;
  end if;
  raise notice 'PART 13 PASSED — "% · % · % minutes · % cancelled"',
               v_row.title, v_row.state, v_row.slot_minutes, v_row.cancelled;

  -- A person in the WRONG organization is told THAT, by name.
  begin
    perform custom.bookings('00000000-0000-0000-0000-000000000001'::uuid, null);
    raise exception '13: a stranger read another organization''s booking pages';
  exception when sqlstate '42501' then
    get stacked diagnostics v_txt = message_text;
    raise notice 'PART 13b PASSED — "%"', v_txt;
  end;

  perform set_config('role', v_boss, true);
  raise notice 'ALL PARTS PASSED';
end;
$suite$;

rollback;
