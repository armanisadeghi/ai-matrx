-- LANE S4 — THE GREEN SUITE. "Move these six to Scheduled" and "approve these eight" are each
-- ONE call, and every card and every expense gets its own answer. Proved end to end in one
-- transaction that ends in ROLLBACK.
--
-- THE REAL USE CASE (owner law 2026-09-21, no fake test data):
--   Harbor Point Plumbing & Drain runs its week off a dispatch board: New → Scheduled → On site →
--   Done. The rule the office has always said out loud and never written down: a call is not
--   Scheduled until it has a service address, because a van cannot be sent to "somewhere in
--   Oceanside". Monday 7:40 AM the dispatcher (test@test.com) selects the six calls that came in
--   over the weekend and moves them to Scheduled. The Kowalski water-heater call came in by phone
--   with no address yet: it stays in New and says which column it needs. The other five land.
--   Then the office manager's inbox holds eight technician expenses from last week (parts runs,
--   a drain-camera rental, a dump fee, a lunch that is not the company's). She decides them at
--   once: six approved, the lunch declined, and the one she filed herself is not hers to approve.
--   Every business, person, street and amount below is synthesized. Nobody in it is real.
--
-- RUN IT (clone):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/uichamp_s4_green.sql
--
-- ITS RED: the same file, run with the doors absent (before the migration, or after its
-- inverse), fails at PART 0 naming the door; run with the doors but WITHOUT the chair-step grant,
-- it fails at PART 0 naming the grant. The grant is judged BEFORE the fixture on purpose: the
-- fixture below re-opens nothing, but a suite that did would hide a missing grant (G12's lesson).
--
-- THE SEATS. Every asserted clause runs as `authenticated` with a person's own claims:
--   dispatcher / approver  test@test.com   (member; the board and the expenses are shared to her)
--   owner                  admin@admin.com (owner; builds the board, files the expenses)
--   stranger               a signed-in account in no Harbor Point organization
-- The only steps that leave the seat are the organization, its memberships, the knob and the
-- Home record, and they assert nothing while they are out.

\set ON_ERROR_STOP on
\timing off

\set suite 'uichamp_s4_green.sql'
\set requires 'grant:authenticated:custom.pipeline_move|grant:authenticated:custom.work_approval_decide'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin      constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_disp       constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j    constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_disp_j     constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_board   uuid;
  v_exp     uuid;
  v_calls   uuid[] := '{}';
  v_kowal   uuid;
  v_id      uuid;
  v_moves   jsonb;
  v_out     jsonb;
  v_r       jsonb;
  v_items   uuid[] := '{}';
  v_lunch   uuid;
  v_mine    uuid;
  v_decs    jsonb;
  v_caught  text;
  v_state   text;
  v_ver     integer;
  v_old     integer;
  v_doc     jsonb;
  v_n       integer;
  i         integer;
begin
  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE DOORS EXIST AND A SIGNED-IN PERSON MAY CALL THEM. Judged first.
  -- ════════════════════════════════════════════════════════════════════════════
  if to_regprocedure('custom.pipeline_move_many(uuid, jsonb)') is null then
    raise exception '0a: custom.pipeline_move_many(uuid, jsonb) does not exist — there is no batch move';
  end if;
  if to_regprocedure('custom.work_decide_many(uuid, jsonb)') is null then
    raise exception '0a: custom.work_decide_many(uuid, jsonb) does not exist — there is no batch decide';
  end if;
  if not has_function_privilege('authenticated', 'custom.pipeline_move_many(uuid, jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'custom.work_decide_many(uuid, jsonb)', 'execute') then
    raise exception '0b: a signed-in person is refused EXECUTE on the batch doors — the chair-step grant file has not run';
  end if;
  if has_function_privilege('anon', 'custom.pipeline_move_many(uuid, jsonb)', 'execute')
     or has_function_privilege('anon', 'custom.work_decide_many(uuid, jsonb)', 'execute') then
    raise exception '0c: an anonymous caller may call a batch door';
  end if;
  raise notice 'PART 0 PASSED — both batch doors exist, signed-in people hold EXECUTE, anon does not.';

  -- ── the organization (out of the seat; asserts nothing) ──────────────────────
  perform set_config('app.actor_system', 'campaign-test/uichamp_s4_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Point Plumbing & Drain ' || substr(v_org::text, 1, 8),
          'harbor-point-s4-' || substr(v_org::text, 1, 8), 'HPD', c_admin);  -- matrx-real-data:allow HPD is Harbor Point (Plumbing &) Drain's own initials
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_disp,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'uichamp_s4_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Harbor Point')) returning id into v_home;

  -- ── take the seat ─────────────────────────────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0d: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0d: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — THE OWNER BUILDS THE DISPATCH BOARD AND WRITES THE ADDRESS RULE DOWN.
  -- ════════════════════════════════════════════════════════════════════════════
  v_board := custom.table_declare(v_org, jsonb_build_object(
    'name','Service calls','slug','service_calls_' || substr(v_org::text, 1, 8),'type','entity',
    'label_singular','Service call','label_plural','Service calls','title_field','customer','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','customer'),
                                jsonb_build_object('name','problem'),
                                jsonb_build_object('name','service_address')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_board, jsonb_build_object('key','customer','label','Customer','plain','text','sort',10));
  perform custom.field_declare(v_org, v_board, jsonb_build_object('key','problem','label','Problem','plain','text','sort',20));
  perform custom.field_declare(v_org, v_board, jsonb_build_object('key','service_address','label','Service address','plain','text','sort',30));
  perform custom.pipeline_declare(v_org, v_board, jsonb_build_object(
    'stage_field', jsonb_build_object('key','call_stage','label','Stage',
       'options', jsonb_build_array('New','Scheduled','On site','Done')),
    'transitions', jsonb_build_array(
       jsonb_build_object('from','New','to','Scheduled'),
       jsonb_build_object('from','Scheduled','to','On site'),
       jsonb_build_object('from','On site','to','Done')),
    'requires', jsonb_build_object('Scheduled', jsonb_build_array('service_address'))));

  -- The weekend's six calls.
  v_calls := v_calls || custom.record_write(v_org, v_board, jsonb_build_object(
    'customer','Delgado residence','problem','Kitchen sink backing up into the dishwasher',
    'service_address','418 Pacific Crest Dr, Oceanside','call_stage','New'));
  v_calls := v_calls || custom.record_write(v_org, v_board, jsonb_build_object(
    'customer','Seaside Laundromat','problem','Floor drain overflowing by machine 7',
    'service_address','2210 Mission Ave, Oceanside','call_stage','New'));
  v_calls := v_calls || custom.record_write(v_org, v_board, jsonb_build_object(
    'customer','Nguyen residence','problem','No hot water upstairs',
    'service_address','77 Lemon Grove Ln, Vista','call_stage','New'));
  v_kowal := custom.record_write(v_org, v_board, jsonb_build_object(
    'customer','Kowalski residence','problem','Water heater leaking in the garage (called in, no address yet)',
    'call_stage','New'));
  v_calls := v_calls || v_kowal;
  v_calls := v_calls || custom.record_write(v_org, v_board, jsonb_build_object(
    'customer','Harborview Bistro','problem','Grease trap alarm',
    'service_address','15 Harbor Dr S, Oceanside','call_stage','New'));
  v_calls := v_calls || custom.record_write(v_org, v_board, jsonb_build_object(
    'customer','Ramirez duplex','problem','Main line camera inspection before closing',
    'service_address','903 S Tremont St, Oceanside','call_stage','New'));
  -- The board is the dispatcher's to work.
  perform custom.share_grant(v_org, v_board, 'person', c_disp, 'editor'::public.permission_level);
  raise notice 'PART 1 PASSED — a board of six weekend calls, Scheduled requires a service address, shared to the dispatcher.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — MONDAY 7:40: SIX TO SCHEDULED, ONE CALL. Five land; Kowalski stays and names
  -- the column it needs.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_disp_j, true);
  select coalesce(jsonb_agg(jsonb_build_object('record_id', c, 'stage', 'Scheduled',
                                               'expected_version', (select h.version from custom.record_headers(v_org, array[c]) h))
                            order by o), '[]'::jsonb)
    into v_moves
    from unnest(v_calls) with ordinality u(c, o);
  v_out := custom.pipeline_move_many(v_org, v_moves);
  if (v_out ->> 'asked')::int <> 6 or (v_out ->> 'moved')::int <> 5 or (v_out ->> 'not_moved')::int <> 1 then
    raise exception '2a: six asked, five should move and one should not — the store answered %', v_out - 'results';
  end if;
  select r into v_r from jsonb_array_elements(v_out -> 'results') r where (r ->> 'record_id')::uuid = v_kowal;
  if v_r ->> 'verdict' <> 'needs_fields' then
    raise exception '2b: the call with no address was answered % — %', v_r ->> 'verdict', v_r;
  end if;
  if jsonb_array_length(v_r -> 'needs') <> 1 or v_r -> 'needs' -> 0 ->> 'label' <> 'Service address' then
    raise exception '2b: the dispatcher cannot be asked for what is missing — she was told %', v_r -> 'needs';
  end if;
  if coalesce(v_r ->> 'sentence', '') = '' then
    raise exception '2b: the refusal carries no sentence';
  end if;
  if lower(custom.read_record(v_org, v_kowal, true) ->> 'call_stage') <> 'new' then
    raise exception '2c: the refused card moved anyway: it is in %', custom.read_record(v_org, v_kowal, true) ->> 'call_stage';
  end if;
  select count(*) into v_n from unnest(v_calls) c
   where c <> v_kowal and lower(custom.read_record(v_org, c, true) ->> 'call_stage') = 'scheduled';
  if v_n <> 5 then
    raise exception '2d: five cards should be in Scheduled and % are', v_n;
  end if;
  select count(*) into v_n from jsonb_array_elements(v_out -> 'results') r
   where r ->> 'verdict' = 'moved' and (r ->> 'version') is not null;
  if v_n <> 5 then
    raise exception '2e: every moved card must come back with its new version, % did', v_n;
  end if;
  raise notice '2 PASSED — six asked in one call: five Scheduled, Kowalski held in New asking for "%": "%"',
    v_r -> 'needs' -> 0 ->> 'label', v_r ->> 'sentence';

  -- 2f — THE SAME CARD, ANSWERED ON THE WAY IN: she fills the address in as part of the move.
  v_out := custom.pipeline_move_many(v_org, jsonb_build_array(jsonb_build_object(
    'record_id', v_kowal, 'stage', 'Scheduled',
    'expected_version', (select h.version from custom.record_headers(v_org, array[v_kowal]) h),
    'also', jsonb_build_object('service_address', '5120 Via Montellano, Oceanside'))));
  if v_out -> 'results' -> 0 ->> 'verdict' <> 'moved' then
    raise exception '2f: with the address given, the move should land: %', v_out -> 'results' -> 0;
  end if;
  raise notice '2f PASSED — with the address filled in on the way, the sixth call is Scheduled too.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — A STALE CARD IS REFUSED, NEVER OVERWRITTEN.
  -- ════════════════════════════════════════════════════════════════════════════
  -- The dispatcher loaded the board. Then the office (admin) moved Seaside Laundromat to On site
  -- from the phone. Her batch still carries the version she loaded.
  v_id := v_calls[2];
  v_old := (select h.version from custom.record_headers(v_org, array[v_id]) h);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.pipeline_move(v_org, v_id, 'On site', '{}'::jsonb, v_old);
  perform set_config('request.jwt.claims', c_disp_j, true);
  v_out := custom.pipeline_move_many(v_org, jsonb_build_array(
    jsonb_build_object('record_id', v_id, 'stage', 'Scheduled', 'expected_version', v_old),
    jsonb_build_object('record_id', v_calls[3], 'stage', 'On site', 'expected_version', (select h.version from custom.record_headers(v_org, array[v_calls[3]]) h))));
  v_r := v_out -> 'results' -> 0;
  if v_r ->> 'verdict' <> 'changed_since_loaded' then
    raise exception '3a: a card changed since the board loaded was answered % — %', v_r ->> 'verdict', v_r;
  end if;
  if (v_r ->> 'current_version')::int <= v_old then
    raise exception '3a: the stale answer must name the version that won: %', v_r;
  end if;
  if lower(custom.read_record(v_org, v_id, true) ->> 'call_stage') <> 'on site' then
    raise exception '3b: THE OFFICE''S MOVE WAS OVERWRITTEN — the card is in %', custom.read_record(v_org, v_id, true) ->> 'call_stage';
  end if;
  if v_out -> 'results' -> 1 ->> 'verdict' <> 'moved' then
    raise exception '3c: a stale card held back the fresh one beside it: %', v_out -> 'results' -> 1;
  end if;
  raise notice '3 PASSED — the stale card is refused ("%"), the office''s move stands, the fresh card beside it still moved.',
    v_r ->> 'sentence';

  -- 3d — A MOVE WITHOUT A VERSION IS NOT TRIED (it could only ever overwrite).
  v_out := custom.pipeline_move_many(v_org, jsonb_build_array(
    jsonb_build_object('record_id', v_calls[1], 'stage', 'On site')));
  if v_out -> 'results' -> 0 ->> 'verdict' <> 'refused' or (v_out ->> 'moved')::int <> 0
     or lower(custom.read_record(v_org, v_calls[1], true) ->> 'call_stage') <> 'scheduled' then
    raise exception '3d: a versionless batch move was tried: %', v_out;
  end if;
  -- 3e — THE SAME CARD TWICE IN ONE BATCH: the second is not tried.
  v_out := custom.pipeline_move_many(v_org, jsonb_build_array(
    jsonb_build_object('record_id', v_calls[1], 'stage', 'On site', 'expected_version', (select h.version from custom.record_headers(v_org, array[v_calls[1]]) h)),
    jsonb_build_object('record_id', v_calls[1], 'stage', 'Done', 'expected_version', (select h.version from custom.record_headers(v_org, array[v_calls[1]]) h))));
  if v_out -> 'results' -> 0 ->> 'verdict' <> 'moved' or v_out -> 'results' -> 1 ->> 'verdict' <> 'refused' then
    raise exception '3e: a card named twice was answered %', v_out -> 'results';
  end if;
  raise notice '3d/3e PASSED — no version, not tried; the same card twice, the second not tried.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — NO RIGHT: a Viewer, a stranger, and the cap.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_board, 'person', c_disp, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_disp_j, true);
  v_ver := (select h.version from custom.record_headers(v_org, array[v_calls[5]]) h);
  v_out := custom.pipeline_move_many(v_org, jsonb_build_array(
    jsonb_build_object('record_id', v_calls[5], 'stage', 'On site', 'expected_version', v_ver)));
  if v_out -> 'results' -> 0 ->> 'verdict' <> 'no_right' or (v_out ->> 'moved')::int <> 0 then
    raise exception '4a: a Viewer moved a card, or was not told she may not: %', v_out;
  end if;
  if (select h.version from custom.record_headers(v_org, array[v_calls[5]]) h) <> v_ver then
    raise exception '4a: the Viewer''s refused move wrote to the card';
  end if;
  raise notice '4a PASSED — the Viewer is answered no_right: "%"', v_out -> 'results' -> 0 ->> 'sentence';
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_board, 'person', c_disp, 'editor'::public.permission_level);

  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform custom.pipeline_move_many(v_org, jsonb_build_array(
      jsonb_build_object('record_id', v_calls[5], 'stage', 'On site', 'expected_version', v_ver)));
    raise exception '4b: a stranger reached Harbor Point''s board';
  exception when insufficient_privilege then
    v_caught := sqlerrm;
  end;
  begin
    perform custom.work_decide_many(v_org, jsonb_build_array(jsonb_build_object('item', gen_random_uuid(), 'decision', 'approve')));
    raise exception '4b: a stranger reached Harbor Point''s inbox';
  exception when insufficient_privilege then null;
  end;
  raise notice '4b PASSED — a stranger is refused the whole call: "%"', v_caught;

  perform set_config('request.jwt.claims', c_disp_j, true);
  select jsonb_agg(jsonb_build_object('record_id', gen_random_uuid(), 'stage', 'Done', 'expected_version', 1))
    into v_moves from generate_series(1, 501);
  begin
    perform custom.pipeline_move_many(v_org, v_moves);
    raise exception '4c: 501 moves were taken in one call';
  exception when sqlstate '54000' then
    v_caught := sqlerrm;
  end;
  begin
    perform custom.pipeline_move_many(v_org, '[]'::jsonb);
    raise exception '4c: an empty batch answered as if something happened';
  exception when sqlstate '22023' then null;
  end;
  raise notice '4c PASSED — 501 is refused before anything is judged: "%"', v_caught;

  -- 4d — ANOTHER ORGANIZATION'S CARD reads exactly as an invented one.
  v_out := custom.pipeline_move_many(v_org, jsonb_build_array(
    jsonb_build_object('record_id', gen_random_uuid(), 'stage', 'Done', 'expected_version', 1)));
  if v_out -> 'results' -> 0 ->> 'verdict' <> 'refused' then
    raise exception '4d: an invented card was answered %', v_out -> 'results' -> 0;
  end if;
  raise notice '4d PASSED — an invented card: "%"', v_out -> 'results' -> 0 ->> 'sentence';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — THE OFFICE MANAGER'S EIGHT EXPENSES, DECIDED AT ONCE.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_exp := custom.table_declare(v_org, jsonb_build_object(
    'name','Technician expenses','slug','tech_expenses_' || substr(v_org::text, 1, 8),'type','entity',
    'label_singular','Expense','label_plural','Expenses','title_field','item','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','item'), jsonb_build_object('name','technician'),
                                jsonb_build_object('name','amount'), jsonb_build_object('name','status')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_exp, jsonb_build_object('key','item','label','Item','plain','text','sort',10));
  perform custom.field_declare(v_org, v_exp, jsonb_build_object('key','technician','label','Technician','plain','text','sort',20));
  perform custom.field_declare(v_org, v_exp, jsonb_build_object('key','amount','label','Amount','plain','number','sort',30));
  perform custom.field_declare(v_org, v_exp, jsonb_build_object('key','status','label','Status','plain','text','sort',40));
  perform custom.share_grant(v_org, v_exp, 'person', c_disp, 'editor'::public.permission_level);

  -- Seven filed by the owner for the technicians, addressed to the office manager.
  for v_doc in select value from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('item','Ferguson — 3/4" PEX and fittings, Delgado job','technician','Luis Ortega','amount',86.40),
      jsonb_build_object('item','Drain camera rental, one day','technician','Priya Raman','amount',145.00),
      jsonb_build_object('item','Palomar transfer station dump fee','technician','Luis Ortega','amount',62.00),
      jsonb_build_object('item','Water heater expansion tank, Nguyen job','technician','Sam Whitaker','amount',71.25),
      jsonb_build_object('item','Van 3 fuel, Tuesday','technician','Priya Raman','amount',94.18),
      jsonb_build_object('item','Grease trap gasket kit','technician','Sam Whitaker','amount',38.99),
      jsonb_build_object('item','Team lunch at Harbor Fish & Chips','technician','Luis Ortega','amount',112.60))) loop
    v_id := custom.record_write(v_org, v_exp, v_doc || jsonb_build_object('status', 'Submitted'));
    v_items := v_items || ((custom.work_approval_request(v_org, v_id,
      jsonb_build_object('kind','record_patch','patch', jsonb_build_object('status','Approved')),
      'Expense for approval', c_disp, 'person', null)) ->> 'approval_id')::uuid;
  end loop;
  v_lunch := v_items[7];
  -- The eighth she filed herself (her own mileage), addressed to the owner.
  perform set_config('request.jwt.claims', c_disp_j, true);
  v_id := custom.record_write(v_org, v_exp, jsonb_build_object(
    'item','Mileage to the Ramirez closing inspection','technician','Office','amount',23.45,'status','Submitted'));
  v_mine := ((custom.work_approval_request(v_org, v_id,
    jsonb_build_object('kind','record_patch','patch', jsonb_build_object('status','Approved')),
    'My mileage', c_admin, 'person', null)) ->> 'approval_id')::uuid;
  v_items := v_items || v_mine;

  -- 5a — THE INBOX HOLDS THEM, as the one queue answers it.
  select count(*) into v_n from custom.work_inbox(v_org, 200, 0, false) w
   where w.item_id = any(v_items);
  if v_n < 7 then
    raise exception '5a: the office manager''s inbox shows % of the eight', v_n;
  end if;

  -- 5b — EIGHT DECISIONS, ONE CALL.
  select jsonb_agg(jsonb_build_object('item', it,
                     'decision', case when it = v_lunch then 'decline' else 'approve' end,
                     'note', case when it = v_lunch then 'Team lunches come out of the social budget, not job expenses.' end)
                   order by o)
    into v_decs from unnest(v_items) with ordinality u(it, o);
  v_out := custom.work_decide_many(v_org, v_decs);
  if (v_out ->> 'asked')::int <> 8 or (v_out ->> 'approved')::int <> 6 or (v_out ->> 'declined')::int <> 1
     or (v_out ->> 'not_decided')::int <> 1 then
    raise exception '5b: eight decisions should be six approved, one declined, one not hers — the store answered %', v_out - 'results';
  end if;
  select r into v_r from jsonb_array_elements(v_out -> 'results') r where (r ->> 'item')::uuid = v_mine;
  if v_r ->> 'verdict' <> 'no_right' then
    raise exception '5c: her own expense was answered % — %', v_r ->> 'verdict', v_r;
  end if;
  select count(*) into v_n from custom.read_records_matching(v_org, v_exp, '{}'::jsonb, false, 100, 0) x
   where x.document ->> 'status' = 'Approved';
  if v_n <> 6 then
    raise exception '5d: six expenses should now read Approved and % do', v_n;
  end if;
  raise notice '5 PASSED — eight in one call: six approved and applied, the lunch declined, her own mileage "%"', v_r ->> 'sentence';

  -- 5e — DECIDED ONCE. The same approval again is already_decided, and nothing changes.
  v_out := custom.work_decide_many(v_org, jsonb_build_array(jsonb_build_object('item', v_items[1], 'decision', 'decline')));
  if v_out -> 'results' -> 0 ->> 'verdict' <> 'already_decided' then
    raise exception '5e: a decided approval was answered %', v_out -> 'results' -> 0;
  end if;
  -- 5f — a decision that is neither word is not tried.
  v_out := custom.work_decide_many(v_org, jsonb_build_array(jsonb_build_object('item', v_mine, 'decision', 'maybe')));
  if v_out -> 'results' -> 0 ->> 'verdict' <> 'refused' then
    raise exception '5f: "maybe" was tried as a decision: %', v_out -> 'results' -> 0;
  end if;
  raise notice '5e/5f PASSED — decided once ("%"); "maybe" is not a decision.',
    (custom.work_decide_many(v_org, jsonb_build_array(jsonb_build_object('item', v_items[2], 'decision', 'approve')))) -> 'results' -> 0 ->> 'sentence';

  -- 5g — the owner approves the one that was hers to approve.
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_out := custom.work_decide_many(v_org, jsonb_build_array(jsonb_build_object('item', v_mine, 'decision', 'approve')));
  if v_out -> 'results' -> 0 ->> 'verdict' <> 'approved' then
    raise exception '5g: the owner could not approve the office manager''s mileage: %', v_out -> 'results' -> 0;
  end if;
  raise notice '5g PASSED — the owner approves the mileage: "%"', v_out -> 'results' -> 0 ->> 'sentence';

  raise notice 'UICHAMP-S4 GREEN — every part passed.';
end
$t$;

rollback;
