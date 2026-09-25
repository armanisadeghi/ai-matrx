-- LANE S5-PRIME — THE GREEN SUITE. An archived thing takes its approvals out of the inbox, the
-- reason stays in history, and nothing about an archived thing can be decided or asked for.
-- One transaction, ends in ROLLBACK.
--
-- THE REAL USE CASE (owner law 2026-09-21, no fake test data):
--   Cedar Ridge Animal Hospital closes its summer boarding season on Labor Day. The practice
--   owner (admin@admin.com) archives the "Summer boarding 2026" table. Three reservation changes
--   and one new column ("Vaccination proof") were still waiting on the front-desk lead
--   (test@test.com). Before this lane they sat in her Monday inbox with live Approve buttons — a
--   yes would have edited a reservation for a season that is over. Now they are withdrawn, each
--   says why and when, and her inbox holds only what is still real: the rabies-certificate change
--   on a live table. A duplicate patient card the owner archives on its own takes its pending
--   change with it; a request to put back a boarding reservation is refused because its table is
--   archived; putting back an archived patient card in the live Patients table still waits.
--   Every business, pet, person and date below is synthesized. Nobody in it is real.
--
-- RUN IT (clone):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/uichamp_s5_green.sql
--
-- ITS RED: before the migration it fails at PART 0 naming the missing withdrawal question; with
-- PART 0 skipped (`-v skip0=1`) it fails at 2a — the archived season's approvals are still listed.
--
-- THE SEATS. Every asserted clause runs as `authenticated` with a person's own claims:
--   front-desk lead  test@test.com   (member; the tables are shared to her; she approves)
--   owner            admin@admin.com (owner; builds, files, archives)
-- Only the organization, memberships, knob and Home are written out of the seat, plus PART 5's
-- one deliberate "legacy row" (a withdrawn approval set back to pending the way a row filed before
-- this lane would look), and those steps assert nothing while they are out.

\set ON_ERROR_STOP on
\timing off

\set suite 'uichamp_s5_green.sql'
\set requires 'grant:authenticated:custom.work_inbox|grant:authenticated:custom.work_approval_decide|grant:authenticated:custom.table_archive'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\if :{?skip0}
\else
\set skip0 0
\endif

begin;
select set_config('uichamp.skip0', :'skip0', true);

do $t$
declare
  c_admin      constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_desk       constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j    constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_desk_j     constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_board   uuid;   -- Summer boarding 2026
  v_pat     uuid;   -- Patients
  v_res     uuid[] := '{}';
  v_asks    uuid[] := '{}';
  v_col     uuid;   -- the Vaccination proof column ask
  v_rabies  uuid;   -- the rabies-certificate ask (live)
  v_dup     uuid;   -- duplicate patient card
  v_dup_ask uuid;
  v_back    uuid;   -- archived patient card to put back
  v_back_ask uuid;
  v_id      uuid;
  v_out     jsonb;
  v_r       record;
  v_n       integer;
  v_caught  text;
  v_code    text;
  v_doc     jsonb;
begin
  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE QUESTION, THE TRIGGER, THE NEW COLUMNS, THE DOOR STILL OPEN.
  -- ════════════════════════════════════════════════════════════════════════════
  if current_setting('uichamp.skip0') <> '1' then
    if to_regprocedure('custom.work_approval_withdrawal(uuid, jsonb)') is null then
      raise exception '0a: custom.work_approval_withdrawal(uuid, jsonb) does not exist — nothing asks whether an approval''s subject is archived';
    end if;
    if not exists (select 1 from pg_trigger where tgrelid = 'custom.record'::regclass
                    and tgname = 'zz_w4_approvals_withdraw_on_archive') then
      raise exception '0b: archiving a record withdraws nothing — the trigger is absent';
    end if;
    if not exists (select 1 from pg_proc p where p.oid = 'custom.work_inbox(uuid, integer, integer, boolean)'::regprocedure
                    and 'decided_at' = any(p.proargnames) and 'table_name' = any(p.proargnames)) then
      raise exception '0c: custom.work_inbox answers no table and no decided_at — a closed item cannot say who and when';
    end if;
    if not has_function_privilege('authenticated', 'custom.work_inbox(uuid, integer, integer, boolean)', 'execute')
       or has_function_privilege('anon', 'custom.work_inbox(uuid, integer, integer, boolean)', 'execute') then
      raise exception '0d: the recreated inbox door lost its signed-in grant or gained an anonymous one';
    end if;
    if has_function_privilege('authenticated', 'custom.work_approval_withdrawal(uuid, jsonb)', 'execute') then
      raise exception '0e: the internal withdrawal question is callable by a client';
    end if;
    raise notice 'PART 0 PASSED — the question, the trigger, the six new inbox columns; the door is open to signed-in people only.';
  end if;

  -- ── the organization (out of the seat; asserts nothing) ──────────────────────
  perform set_config('app.actor_system', 'campaign-test/uichamp_s5_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Animal Hospital ' || substr(v_org::text, 1, 8),
          'cedar-ridge-s5-' || substr(v_org::text, 1, 8), 'CRA', c_admin);  -- matrx-real-data:allow CRA is Cedar Ridge Animal (Hospital)'s own initials
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_desk,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'uichamp_s5_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Cedar Ridge')) returning id into v_home;

  -- ── take the seat ─────────────────────────────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0f: this suite did not take the seat — current_user is %', current_user;
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — THE OWNER'S TWO TABLES AND FIVE ASKS, ALL ADDRESSED TO THE FRONT DESK.
  -- ════════════════════════════════════════════════════════════════════════════
  v_board := custom.table_declare(v_org, jsonb_build_object(
    'name','Summer boarding 2026','slug','boarding_2026_' || substr(v_org::text, 1, 8),'type','entity',
    'label_singular','Reservation','label_plural','Reservations','title_field','pet','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','pet'), jsonb_build_object('name','owner_name'),
                                jsonb_build_object('name','nights'), jsonb_build_object('name','run')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_board, jsonb_build_object('key','pet','label','Pet','plain','text','sort',10));
  perform custom.field_declare(v_org, v_board, jsonb_build_object('key','owner_name','label','Owner','plain','text','sort',20));
  perform custom.field_declare(v_org, v_board, jsonb_build_object('key','nights','label','Nights','plain','number','sort',30));
  perform custom.field_declare(v_org, v_board, jsonb_build_object('key','run','label','Run','plain','text','sort',40));
  perform custom.share_grant(v_org, v_board, 'person', c_desk, 'editor'::public.permission_level);

  v_pat := custom.table_declare(v_org, jsonb_build_object(
    'name','Patients','slug','patients_' || substr(v_org::text, 1, 8),'type','entity',
    'label_singular','Patient','label_plural','Patients','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','name'), jsonb_build_object('name','species'),
                                jsonb_build_object('name','rabies_certificate')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_pat, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_pat, jsonb_build_object('key','species','label','Species','plain','text','sort',20));
  perform custom.field_declare(v_org, v_pat, jsonb_build_object('key','rabies_certificate','label','Rabies certificate','plain','text','sort',30));
  perform custom.share_grant(v_org, v_pat, 'person', c_desk, 'editor'::public.permission_level);

  for v_doc in select value from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('pet','Biscuit (beagle)','owner_name','Tran household','nights',4,'run','Run 3'),
      jsonb_build_object('pet','Mochi (shiba inu)','owner_name','Delacroix household','nights',7,'run','Run 5'),
      jsonb_build_object('pet','Juniper (tabby)','owner_name','Okafor household','nights',3,'run','Cattery 2'))) loop
    v_id := custom.record_write(v_org, v_board, v_doc);
    v_res := v_res || v_id;
    v_asks := v_asks || ((custom.work_approval_request(v_org, v_id,
      jsonb_build_object('kind','record_patch','patch', jsonb_build_object('nights', (v_doc ->> 'nights')::int + 2)),
      'Owner called to extend the stay by two nights', c_desk, 'person', null)) ->> 'approval_id')::uuid;
  end loop;
  v_col := ((custom.work_approval_request(v_org, v_board,
      jsonb_build_object('kind','field_add','field', jsonb_build_object('key','vaccination_proof','label','Vaccination proof','plain','text')),
      'Kennel insurance wants proof of vaccination on every reservation', c_desk, 'person', null)) ->> 'approval_id')::uuid;
  v_asks := v_asks || v_col;

  v_id := custom.record_write(v_org, v_pat, jsonb_build_object('name','Pepper','species','Dog','rabies_certificate','RC-2025-0412'));
  v_rabies := ((custom.work_approval_request(v_org, v_id,
      jsonb_build_object('kind','record_patch','patch', jsonb_build_object('rabies_certificate','RC-2026-1187')),
      'New three-year certificate from the September clinic', c_desk, 'person', null)) ->> 'approval_id')::uuid;
  v_dup := custom.record_write(v_org, v_pat, jsonb_build_object('name','Pepper (duplicate card)','species','Dog'));
  v_dup_ask := ((custom.work_approval_request(v_org, v_dup,
      jsonb_build_object('kind','record_patch','patch', jsonb_build_object('rabies_certificate','RC-2026-1187')),
      'Same certificate, entered on the wrong card', c_desk, 'person', null)) ->> 'approval_id')::uuid;
  v_back := custom.record_write(v_org, v_pat, jsonb_build_object('name','Clementine','species','Cat'));
  perform custom.record_delete(v_org, v_back);
  v_back_ask := ((custom.work_approval_request(v_org, v_back,
      jsonb_build_object('kind','record_restore'),
      'Clementine is back as a patient after the move', c_desk, 'person', null)) ->> 'approval_id')::uuid;

  perform set_config('request.jwt.claims', c_desk_j, true);
  select count(*) into v_n from custom.work_inbox(v_org, 200, 0, false) w
   where w.item_id = any(v_asks || v_rabies || v_dup_ask || v_back_ask);
  if v_n <> 7 then
    raise exception '1a: the front desk should see all seven asks before anything is archived and sees %', v_n;
  end if;
  raise notice 'PART 1 PASSED — seven asks waiting on the front desk.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — THE OWNER CLOSES THE SEASON. The four boarding asks leave the inbox.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_out := custom.table_archive(v_org, v_board, 50, true);
  if not coalesce((v_out ->> 'done')::boolean, false) or not coalesce((v_out ->> 'table_archived')::boolean, false) then
    raise exception '2-: the season did not archive: %', v_out;
  end if;

  perform set_config('request.jwt.claims', c_desk_j, true);
  select count(*) into v_n from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = any(v_asks);
  if v_n <> 0 then
    raise exception '2a: % of the archived season''s four asks are still listed as waiting — somebody could approve a change to an archived reservation', v_n;
  end if;
  if not exists (select 1 from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_rabies and w.actionable) then
    raise exception '2b: the live rabies-certificate ask left the inbox with the archived ones';
  end if;
  -- 2c — CLOSED, AND SAYS WHO AND WHEN.
  for v_r in select * from custom.work_inbox(v_org, 200, 0, true) w where w.item_id = any(v_asks) loop
    if v_r.state <> 'withdrawn' or v_r.actionable or v_r.decided_at is null
       or v_r.decided_by is distinct from c_admin or v_r.decided_by_name is null
       or v_r.outcome not like '%archived on%' or v_r.table_id is distinct from v_board
       or v_r.table_name <> 'Summer boarding 2026' then
      raise exception '2c: a withdrawn ask does not say who and when: state %, by % (%), at %, table %, "%"',
        v_r.state, v_r.decided_by, v_r.decided_by_name, v_r.decided_at, v_r.table_name, v_r.outcome;
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n <> 4 then
    raise exception '2c: the decided view shows % of the four withdrawn asks', v_n;
  end if;
  raise notice 'PART 2 PASSED — the season''s four asks are withdrawn; the desk sees "%"',
    (select w.outcome from custom.work_inbox(v_org, 200, 0, true) w where w.item_id = v_asks[1]);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — THE REASON IS IN HISTORY.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  if not exists (select 1 from custom.record_history(v_org, v_asks[1], 20, 0) h
                  where h.changes::text like '%withdrawn_reason%' and h.changes::text like '%archived on%') then
    raise exception '3a: the approval''s history does not keep why it was withdrawn: %',
      (select jsonb_agg(h.changes) from custom.record_history(v_org, v_asks[1], 20, 0) h);
  end if;
  raise notice 'PART 3 PASSED — the approval''s own history keeps the withdrawal and its reason.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — A WITHDRAWN ASK CANNOT BE DECIDED, AND SAYS WHY.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_desk_j, true);
  v_out := custom.work_decide_many(v_org, jsonb_build_array(jsonb_build_object('item', v_asks[2], 'decision', 'approve')));
  if v_out -> 'results' -> 0 ->> 'verdict' <> 'already_decided'
     or v_out -> 'results' -> 0 ->> 'sentence' not like 'That was withdrawn on%' then
    raise exception '4a: approving a withdrawn ask answered %', v_out -> 'results' -> 0;
  end if;
  raise notice 'PART 4 PASSED — "%"', v_out -> 'results' -> 0 ->> 'sentence';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — A PENDING ROW ABOUT AN ARCHIVED THING (filed before this lane) IS REFUSED BY NAME.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'postgres', true);           -- out of the seat: make the legacy row
  update custom.record a
     set data = (a.data - 'withdrawn_reason' - 'withdrawn_by' - 'decided_at' - 'outcome') || '{"state":"pending"}'::jsonb
   where a.organization_id = v_org and a.id = v_asks[3];
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_desk_j, true);
  if exists (select 1 from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_asks[3]) then
    raise exception '5a: a pending ask about an archived reservation is listed as waiting';
  end if;
  if exists (select 1 from custom.work_inbox(v_org, 200, 0, true) w where w.item_id = v_asks[3]) then
    raise exception '5b: a pending ask about an archived reservation is listed even among the decided';
  end if;
  v_out := custom.work_decide_many(v_org, jsonb_build_array(jsonb_build_object('item', v_asks[3], 'decision', 'approve')));
  if v_out -> 'results' -> 0 ->> 'verdict' <> 'archived'
     or v_out -> 'results' -> 0 ->> 'sentence' not like '%Summer boarding 2026, which was archived on%' then
    raise exception '5c: approving an ask about an archived reservation answered %', v_out -> 'results' -> 0;
  end if;
  v_caught := null;
  begin
    perform custom.work_approval_decide(v_org, v_asks[3], true, null);
  exception when others then
    get stacked diagnostics v_caught = message_text, v_code = returned_sqlstate;
  end;
  if v_code is distinct from '55000' then
    raise exception '5d: the single decide door did not refuse it by name (% %)', v_code, v_caught;
  end if;
  raise notice 'PART 5 PASSED — "%"', v_caught;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 6 — ONE RECORD ARCHIVED ON ITS OWN TAKES ITS ASK WITH IT.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.record_delete(v_org, v_dup);
  perform set_config('request.jwt.claims', c_desk_j, true);
  if exists (select 1 from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_dup_ask) then
    raise exception '6a: the duplicate card was archived and its ask is still waiting';
  end if;
  select * into v_r from custom.work_inbox(v_org, 200, 0, true) w where w.item_id = v_dup_ask;
  if v_r.state is distinct from 'withdrawn' or v_r.outcome not like '%was archived on%' then
    raise exception '6b: the duplicate card''s ask reads % "%"', v_r.state, v_r.outcome;
  end if;
  raise notice 'PART 6 PASSED — "%"', v_r.outcome;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 7 — NOTHING IS ASKED ABOUT A RECORD IN AN ARCHIVED TABLE.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_caught := null; v_code := null;
  begin
    perform custom.work_approval_request(v_org, v_res[1], jsonb_build_object('kind','record_restore'),
      'Put Biscuit''s reservation back', c_desk, 'person', null);
  exception when others then
    get stacked diagnostics v_caught = message_text, v_code = returned_sqlstate;
  end;
  if v_code is distinct from '55000' or v_caught not like '%Summer boarding 2026, which is archived%' then
    raise exception '7a: asking to put back a reservation in the archived season answered % %', v_code, v_caught;
  end if;
  raise notice 'PART 7 PASSED — "%"', v_caught;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 8 — PUTTING BACK AN ARCHIVED CARD IN A LIVE TABLE STILL WAITS, AND CAN BE DECIDED.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_desk_j, true);
  if not exists (select 1 from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_back_ask and w.actionable) then
    raise exception '8a: the put-back of an archived patient card (a live table) was taken out of the inbox';
  end if;
  -- (Putting Clementine back is the store's own editor rung on the archived card, not this lane's
  -- question; 8a is the proof that archiving does not over-reach. The certificate is decided.)
  v_out := custom.work_decide_many(v_org, jsonb_build_array(
    jsonb_build_object('item', v_rabies, 'decision', 'approve')));
  if (v_out ->> 'approved')::int <> 1 then
    raise exception '8b: the live rabies-certificate ask was not approved: %', v_out;
  end if;
  select * into v_r from custom.work_inbox(v_org, 200, 0, true) w where w.item_id = v_rabies;
  if v_r.state <> 'approved' or v_r.decided_by is distinct from c_desk or v_r.decided_at is null
     or v_r.table_name <> 'Patients' or v_r.outcome is null then
    raise exception '8c: an approved ask does not say who and when: % by % at % in % "%"',
      v_r.state, v_r.decided_by_name, v_r.decided_at, v_r.table_name, v_r.outcome;
  end if;
  raise notice 'PART 8 PASSED — the put-back still waits; the certificate approved; closed row: % by % — "%"', v_r.state, v_r.decided_by_name, v_r.outcome;

  raise notice 'UICHAMP-S5 GREEN — every part passed.';
end
$t$;

rollback;
