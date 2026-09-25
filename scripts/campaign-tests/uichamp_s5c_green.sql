-- LANE S5-PRIME-2 (VERIFIER-20) — THE GREEN SUITE FOR "A DECISION IS HELD FOR UNDO".
-- One transaction, ends in ROLLBACK.
--
-- THE REAL USE CASE: Cedar Ridge Animal Hospital's Monday inbox (the same fixture as
-- uichamp_s5b_green.sql — the owner's agent proposes Pepper's new rabies certificate, the owner
-- files the breed from the adoption papers, four call-backs sit with the front desk). The front
-- desk approves with a keystroke; the inbox must know how long to hold that yes with Undo showing:
-- the organization's 5 seconds, or none at all when a run is already waiting on the answer.
-- Every business, pet, person and date is synthesized.
--
-- ITS RED: before uichamp_s5c it fails at PART 0 — work_inbox answers no undo_seconds.
-- SEATS: test@test.com (member, the front desk) through `authenticated`; the organization, its
-- knob override and PART 2's `resumes_run_id` stamp are written out of the seat and assert nothing.

\set ON_ERROR_STOP on
\timing off

\set suite 'uichamp_s5c_green.sql'
\set requires 'grant:authenticated:custom.work_inbox|grant:authenticated:custom.work_assign'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin      constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_desk       constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j    constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_desk_j     constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  -- Monday 9 AM and Thursday 8 AM, Pacific (UTC-7 in late September).
  c_monday     constant timestamptz := '2026-09-28 09:00:00-07';
  c_thursday   constant timestamptz := '2026-10-01 08:00:00-07';
  v_owner   name;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_pat     uuid;
  v_calls   uuid;
  v_pepper  uuid;
  v_rabies  uuid;
  v_own     uuid;
  v_cb      uuid[] := '{}';
  v_id      uuid;
  v_out     jsonb;
  v_doc     jsonb;
  v_n       integer;
  v_m       integer;
  v_ver     integer;
  v_upd     timestamptz;
  v_hist    integer;
  v_caught  text;
  v_code    text;
  v_first   uuid;
  v_ids     uuid[];
  v_ids2    uuid[];
  v_r       record;
begin
  select c.relowner::regrole::name into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if not exists (select 1 from pg_proc p where p.oid = 'custom.work_inbox(uuid, integer, integer, boolean, text)'::regprocedure
                  and 'undo_seconds' = any(p.proargnames) and 'undo_refusal' = any(p.proargnames)) then
    raise exception '0a: custom.work_inbox answers no undo_seconds — a decision cannot be held for Undo, so a keystroke is final';
  end if;
  if not has_function_privilege('authenticated', 'custom.work_inbox(uuid, integer, integer, boolean, text)', 'execute')
     or has_function_privilege('anon', 'custom.work_inbox(uuid, integer, integer, boolean, text)', 'execute') then
    raise exception '0b: the recreated inbox door lost its signed-in grant or gained an anonymous one';
  end if;
  if not exists (select 1 from platform.feature_knob where feature = 'custom' and key = 'decision_undo_seconds'
                  and default_value = '5'::jsonb and 'organization' = any(overridable_by)) then
    raise exception '0c: the hold is not an organization''s knob with a default of 5 seconds';
  end if;
  raise notice 'PART 0 PASSED — work_inbox carries undo_seconds and undo_refusal; the knob is 5 seconds, the organization''s to change.';

  -- ── the organization (out of the seat; asserts nothing) ──────────────────────
  perform set_config('app.actor_system', 'campaign-test/uichamp_s5c_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Animal Hospital ' || substr(v_org::text, 1, 8),
          'cedar-ridge-s5c-' || substr(v_org::text, 1, 8), 'CRA', c_admin);  -- matrx-real-data:allow CRA is Cedar Ridge Animal (Hospital)'s own initials
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_desk,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'uichamp_s5c_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Cedar Ridge')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0j: this suite did not take the seat — current_user is %', current_user;
  end if;
  perform set_config('custom.inbox_clock', c_monday::text, true);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — MONDAY MORNING. One ask for the owner and the front desk; four call-backs.
  -- ════════════════════════════════════════════════════════════════════════════
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

  v_calls := custom.table_declare(v_org, jsonb_build_object(
    'name','Front desk call-backs','slug','callbacks_' || substr(v_org::text, 1, 8),'type','entity',
    'label_singular','Call-back','label_plural','Call-backs','title_field','subject','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','subject'), jsonb_build_object('name','note')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key','subject','label','Subject','plain','text','sort',10));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object('key','note','label','Note','plain','text','sort',20));
  perform custom.share_grant(v_org, v_calls, 'person', c_desk, 'editor'::public.permission_level);
  perform custom.work_take_assignment(v_org, v_calls);   -- Assignee, Due date, Status

  v_pepper := custom.record_write(v_org, v_pat, jsonb_build_object('name','Pepper','species','Dog','rabies_certificate','RC-2025-0412'));
  for v_doc in select value from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('subject','Tran household: Biscuit''s dental estimate'),
      jsonb_build_object('subject','Delacroix household: Mochi''s lab results'),
      jsonb_build_object('subject','Okafor household: Juniper''s boarding dates'),
      jsonb_build_object('subject','Alvarez household: Rufus''s refill request'))) loop
    v_id := custom.record_write(v_org, v_calls, v_doc);
    perform custom.work_assign(v_org, v_id, c_desk, c_monday + interval '2 days', false);
    v_cb := v_cb || v_id;
  end loop;

  -- The owner's records agent read the September clinic's email and proposes the new certificate,
  -- naming the front desk to confirm it against the paper copy; an agent's proposal may also be
  -- decided by the person it works for, so it waits on both.
  v_rabies := ((custom.work_approval_request(v_org, v_pepper,
      jsonb_build_object('kind','record_patch','patch', jsonb_build_object('rabies_certificate','RC-2026-1187')),
      'New three-year certificate from the September clinic', c_desk, 'agent', null)) ->> 'approval_id')::uuid;
  -- And the owner's OWN request (a person's): it waits on the desk, never on the owner herself.
  v_own := ((custom.work_approval_request(v_org, v_pepper,
      jsonb_build_object('kind','record_patch','patch', jsonb_build_object('species','Dog (border collie)')),
      'Breed from the adoption papers', c_desk, 'person', null)) ->> 'approval_id')::uuid;

  perform set_config('request.jwt.claims', c_desk_j, true);
  select count(*) into v_n from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_rabies or w.item_id = v_own or w.item_id = any(v_cb);
  if v_n <> 6 then
    raise exception '1a: the front desk should see the rabies proposal, the breed request and four call-backs on Monday and sees %', v_n;
  end if;
  -- ONE PREDICATE: the inbox's assignments are exactly custom.work_list('mine').
  select array_agg(w.record_id order by w.record_id) into v_ids from custom.work_list(v_org, 'mine', false, 500, 0) w;
  select array_agg(w.item_id order by w.item_id) into v_ids2 from custom.work_inbox(v_org, 200, 0, false) w where w.kind = 'assignment';
  if v_ids is distinct from v_ids2 then
    raise exception '1b: the inbox''s assignments (%) are not work_list(''mine'') (%) — two predicates for one person''s work', v_ids2, v_ids;
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  if not exists (select 1 from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_rabies and w.actionable) then
    raise exception '1c: the owner cannot see (or cannot decide) the rabies ask';
  end if;
  if exists (select 1 from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_own) then
    raise exception '1d: the owner''s own request is listed to her with Approve, and the decide door refuses a requester — a control that fails when pressed';
  end if;
  begin
    perform custom.inbox_snooze(v_org, v_own, c_thursday);
    v_caught := null;
  exception when others then v_caught := sqlerrm; v_code := sqlstate; end;
  if v_caught is null or v_code <> 'P0002' then
    raise exception '1e: the owner snoozed her own request, which is not in her inbox (got % %)', v_code, v_caught;
  end if;
  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — THE DEFAULT: a pending ask is held 5 seconds; work and closed rows carry none.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_desk_j, true);
  select w.undo_seconds, w.undo_refusal into v_n, v_caught from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_rabies;
  if v_n is distinct from 5 or v_caught is not null then
    raise exception '1a: the rabies proposal should be held 5 seconds with no refusal and is % / %', v_n, v_caught;
  end if;
  if exists (select 1 from custom.work_inbox(v_org, 200, 0, false) w where w.kind = 'assignment' and w.undo_seconds is not null) then
    raise exception '1b: a call-back (work, not a decision) carries an undo window';
  end if;
  raise notice 'PART 1 PASSED — a pending decision is held 5 seconds; work carries no window.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — A RUN ALREADY WAITS ON THE ANSWER: made at once, and it says so.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_owner, true);
  update custom.record set data = data || jsonb_build_object('resumes_run_id', gen_random_uuid()::text)
   where organization_id = v_org and id = v_own;
  perform set_config('role', 'authenticated', true);
  select w.undo_seconds, w.undo_refusal into v_n, v_caught from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_own;
  if v_n is distinct from 0 or v_caught not like 'Something is already waiting on this decision%' then
    raise exception '2a: a decision a run waits on should be made at once and say so, and is % / %', v_n, v_caught;
  end if;
  raise notice 'PART 2 PASSED — "%"', v_caught;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — THE ORGANIZATION'S KNOB: Cedar Ridge sets 0, every decision is made at once.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_owner, true);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','decision_undo_seconds','organization', v_org, v_org, '0'::jsonb, 'uichamp_s5c_green');
  perform set_config('role', 'authenticated', true);
  select w.undo_seconds into v_n from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_rabies;
  if v_n is distinct from 0 then
    raise exception '3a: with the organization at 0 the proposal should be made at once and is held %', v_n;
  end if;
  raise notice 'PART 3 PASSED — the organization''s 0 makes every decision at once.';
  raise notice 'uichamp_s5c_green.sql: ALL PARTS PASSED';
end
$t$;

rollback;
