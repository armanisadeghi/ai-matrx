-- LANE S5-PRIME-2 — THE GREEN SUITE. Each person snoozes and clears their own inbox, a snoozed item
-- comes back at its time, something left waiting gets ONE reminder, and the inbox, the badge's count
-- and the reminders read one predicate. One transaction, ends in ROLLBACK.
--
-- THE REAL USE CASE (UI-CHAMPIONS-PLAN S5'; owner law 2026-09-21, no fake test data):
--   Cedar Ridge Animal Hospital, Monday 28 September 2026, 9 AM. The practice owner
--   (admin@admin.com) filed a change to Pepper's rabies certificate — the new three-year
--   certificate from the September clinic — and named the front-desk lead (test@test.com) to
--   confirm it against the paper copy; as owner she can approve it too. She is in surgery until
--   Thursday, so she snoozes it until Thursday 8 AM. For the front desk it still shows. The front desk has four call-backs assigned to
--   her; she has already phoned three, so she clears them, and then puts one back when the owner
--   adds a note to it. On Thursday at 8 AM the snoozed ask is back at the top of the owner's inbox
--   and she is told so, once. Everything still waiting after three days gets one reminder, and
--   running the reminders again sends nothing. Every business, pet, person and date is synthesized.
--
-- RUN IT (clone):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/uichamp_s5b_green.sql
--
-- ITS RED: before the migration it fails at PART 0 naming the missing per-person state
-- (`custom.inbox_item_state` does not exist).
--
-- THE SEATS. Every asserted inbox clause runs as `authenticated` with a person's own claims:
--   front-desk lead  test@test.com   (member; named to confirm the ask; holds the call-backs)
--   owner            admin@admin.com (owner; files the ask, may approve it, snoozes it)
-- Out of the seat: the organization, memberships, switch, Home, and PART 5's reminder tick (it is
-- pg_cron's job, run as the store's owner, exactly as cron runs it).

\set ON_ERROR_STOP on
\timing off

\set suite 'uichamp_s5b_green.sql'
\set requires 'grant:authenticated:custom.work_approval_request|grant:authenticated:custom.work_assign|grant:authenticated:custom.record_update'
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

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE STATE, THE DOORS, THE GRANTS, THE TICK.
  -- ════════════════════════════════════════════════════════════════════════════
  if to_regclass('custom.inbox_item_state') is null then
    raise exception '0a: custom.inbox_item_state does not exist — there is nowhere for one person''s snooze or clear to live, so snoozing would have to touch the approval itself';
  end if;
  if to_regprocedure('custom.work_inbox(uuid, integer, integer, boolean, text)') is null then
    raise exception '0b: custom.work_inbox takes no view — a snoozed or cleared item could never be listed again';
  end if;
  for v_r in select unnest(array[
      'custom.work_inbox(uuid, integer, integer, boolean, text)',
      'custom.inbox_snooze(uuid, uuid, timestamptz)', 'custom.inbox_unsnooze(uuid, uuid)',
      'custom.inbox_clear(uuid, uuid)', 'custom.inbox_unclear(uuid, uuid)',
      'custom.inbox_counts(uuid)']) as fn loop
    if to_regprocedure(v_r.fn) is null then
      raise exception '0c: % does not exist', v_r.fn;
    end if;
    if not has_function_privilege('authenticated', v_r.fn, 'execute') then
      raise exception '0d: % is not open to signed-in people (a real browser would be refused)', v_r.fn;
    end if;
    if has_function_privilege('anon', v_r.fn, 'execute') then
      raise exception '0e: % is open to anonymous callers', v_r.fn;
    end if;
  end loop;
  for v_r in select unnest(array['custom._inbox_items(uuid, uuid, boolean)', 'custom._inbox_now()',
                                 'custom.inbox_remind_tick()']) as fn loop
    if has_function_privilege('authenticated', v_r.fn, 'execute') then
      raise exception '0f: the internal % is callable by a client', v_r.fn;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'custom.inbox_item_state', 'select')
     or has_table_privilege('anon', 'custom.inbox_item_state', 'select') then
    raise exception '0g: a client can read custom.inbox_item_state directly — somebody else''s snoozes would be readable';
  end if;
  -- Active wherever pg_net exists (production); scheduled but inactive on the quarantined clone.
  if not exists (select 1 from cron.job where jobname = 'custom-inbox-remind-tick'
                  and command ~ 'custom\.inbox_remind_tick\(\)'
                  and (active or not exists (select 1 from pg_extension where extname = 'pg_net'))) then
    raise exception '0h: nothing runs the reminders — no pg_cron job custom-inbox-remind-tick';
  end if;
  if not exists (select 1 from platform.feature_knob where feature = 'custom' and key = 'inbox_reminder_after_days'
                  and default_value = '3'::jsonb and 'organization' = any(overridable_by)) then
    raise exception '0i: the reminder age is not an organization''s knob with a default of 3 days';
  end if;
  raise notice 'PART 0 PASSED — per-person state, five doors and the new inbox view open to signed-in people only; internals closed; the tick scheduled; the knob at 3 days.';

  -- ── the organization (out of the seat; asserts nothing) ──────────────────────
  perform set_config('app.actor_system', 'campaign-test/uichamp_s5b_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Animal Hospital ' || substr(v_org::text, 1, 8),
          'cedar-ridge-s5b-' || substr(v_org::text, 1, 8), 'CRA', c_admin);  -- matrx-real-data:allow CRA is Cedar Ridge Animal (Hospital)'s own initials
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_desk,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'uichamp_s5b_green');
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
  raise notice 'PART 1 PASSED — Monday: the ask waits on both, four call-backs on the desk, and the inbox''s assignments are work_list(mine).';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — THE OWNER SNOOZES IT UNTIL THURSDAY 8 AM. Only her inbox changes.
  -- ════════════════════════════════════════════════════════════════════════════
  -- (the approval's own bytes are read out of the seat: a person reads records through doors)
  perform set_config('role', v_owner, true);
  select r.version, r.updated_at into v_ver, v_upd from custom.record r where r.organization_id = v_org and r.id = v_rabies;
  select count(*) into v_hist from history.row_versions h where h.row_id = v_rabies;
  perform set_config('role', 'authenticated', true);

  -- the refusals first
  begin
    perform custom.inbox_snooze(v_org, v_rabies, c_monday - interval '1 hour');
    v_caught := null;
  exception when others then v_caught := sqlerrm; v_code := sqlstate; end;
  if v_caught is null or v_code <> '22023' then
    raise exception '2-a: snoozing into the past was not refused as 22023 (got % %)', v_code, v_caught;
  end if;
  begin
    perform custom.inbox_snooze(v_org, gen_random_uuid(), c_thursday);
    v_caught := null;
  exception when others then v_caught := sqlerrm; v_code := sqlstate; end;
  if v_caught is null or v_code <> 'P0002' or v_caught not like 'There is nothing in your inbox%' then
    raise exception '2-b: snoozing an invented id was not refused by name (got % %)', v_code, v_caught;
  end if;
  begin
    perform custom.inbox_snooze(v_org, v_cb[1], c_thursday);   -- the desk's call-back, not the owner's
    v_caught := null;
  exception when others then v_caught := sqlerrm; v_code := sqlstate; end;
  if v_caught is null or v_code <> 'P0002' then
    raise exception '2-c: the owner snoozed a call-back that is not in her inbox (got % %)', v_code, v_caught;
  end if;

  v_out := custom.inbox_snooze(v_org, v_rabies, c_thursday);
  if v_out ->> 'state' <> 'snoozed' or (v_out ->> 'snoozed_until')::timestamptz <> c_thursday then
    raise exception '2a: the snooze answered %', v_out;
  end if;
  if exists (select 1 from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_rabies) then
    raise exception '2b: the snoozed ask is still in the owner''s inbox';
  end if;
  select count(*), max(w.snoozed_count) into v_n, v_m from custom.work_inbox(v_org, 200, 0, false, 'snoozed') w where w.item_id = v_rabies and w.snoozed_until = c_thursday;
  if v_n <> 1 or v_m <> 1 then
    raise exception '2c: the owner''s snoozed view should hold the ask until Thursday 8 AM with snoozed_count 1 (rows %, count %)', v_n, v_m;
  end if;
  select c.waiting, c.snoozed into v_n, v_m from custom.inbox_counts(v_org) c;
  if v_n <> 0 or v_m <> 1 then
    raise exception '2d: the owner''s counts should be 0 waiting, 1 snoozed and are %, %', v_n, v_m;
  end if;
  select c.snoozed into v_m from custom.inbox_counts(null) c where c.organization_id = v_org;
  if coalesce(v_m, -1) <> 1 then
    raise exception '2e: counting every organization of hers, Cedar Ridge should show 1 snoozed and shows %', v_m;
  end if;

  -- ONE PERSON'S SNOOZE IS INVISIBLE TO THE OTHER.
  perform set_config('request.jwt.claims', c_desk_j, true);
  select count(*), coalesce(max(w.snoozed_count), -1) into v_n, v_m from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_rabies and w.actionable;
  if v_n <> 1 or v_m <> 0 then
    raise exception '2f: the front desk should still see the ask, with nothing of hers snoozed (rows %, snoozed_count %)', v_n, v_m;
  end if;
  select c.waiting, c.snoozed into v_n, v_m from custom.inbox_counts(v_org) c;
  if v_n <> 6 or v_m <> 0 then
    raise exception '2g: the desk''s counts should be 6 waiting, 0 snoozed and are %, %', v_n, v_m;
  end if;

  -- NEVER TOUCHING THE UNDERLYING APPROVAL.
  perform set_config('role', v_owner, true);
  if (select r.version from custom.record r where r.organization_id = v_org and r.id = v_rabies) <> v_ver
     or (select r.updated_at from custom.record r where r.organization_id = v_org and r.id = v_rabies) <> v_upd
     or (select count(*) from history.row_versions h where h.row_id = v_rabies) <> v_hist then
    raise exception '2h: snoozing wrote on the approval itself (version, Last touched or history moved)';
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'PART 2 PASSED — snoozed until Thursday 8 AM for the owner only; the desk still sees it; counts agree; the approval is untouched.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — THURSDAY. At 7:59 it is still away; at 8:00 it is back, at the top.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('custom.inbox_clock', (c_thursday - interval '1 minute')::text, true);
  if exists (select 1 from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_rabies) then
    raise exception '3a: the ask came back before its time';
  end if;
  perform set_config('custom.inbox_clock', c_thursday::text, true);
  select w.item_id, w.snoozed_count into v_first, v_m from custom.work_inbox(v_org, 200, 0, false) w limit 1;
  if v_first is distinct from v_rabies or v_m <> 0 then
    raise exception '3b: at 8:00 Thursday the ask should be first in the owner''s inbox with nothing snoozed (first %, snoozed_count %)', v_first, v_m;
  end if;
  raise notice 'PART 3 PASSED — the snoozed ask returns at Thursday 8:00, at the top.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — THE FRONT DESK CLEARS THREE CALL-BACKS SHE HAS MADE. Reversible; a decision is not.
  -- ════════════════════════════════════════════════════════════════════════════
  -- The records' own clock is the database's (Last touched is now()), so the clears happen an
  -- hour before it: an edit after that is "after she cleared it", as it would be in real time.
  perform set_config('request.jwt.claims', c_desk_j, true);
  v_upd := now() - interval '1 hour';
  perform set_config('custom.inbox_clock', v_upd::text, true);
  begin
    perform custom.inbox_clear(v_org, v_rabies);
    v_caught := null;
  exception when others then v_caught := sqlerrm; v_code := sqlstate; end;
  if v_caught is null or v_code <> '55000' or v_caught not like 'This one needs a decision%' then
    raise exception '4-a: clearing an ask she must decide was not refused by name (got % %)', v_code, v_caught;
  end if;
  for v_n in 1..3 loop
    v_out := custom.inbox_clear(v_org, v_cb[v_n]);
    if v_out ->> 'state' <> 'cleared' then
      raise exception '4a: clearing call-back % answered %', v_n, v_out;
    end if;
  end loop;
  select count(*), max(w.cleared_count) into v_n, v_m from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_rabies or w.item_id = any(v_cb);
  if v_n <> 2 or v_m <> 3 then
    raise exception '4b: after clearing three, her inbox should hold the ask and one call-back with cleared_count 3 (rows %, count %)', v_n, v_m;
  end if;
  select count(*) into v_n from custom.work_inbox(v_org, 200, 0, false, 'done') w where w.item_id = any(v_cb[1:3]) and w.cleared_at = v_upd;
  if v_n <> 3 then
    raise exception '4c: her done view should hold the three cleared call-backs and holds %', v_n;
  end if;
  select c.waiting, c.cleared into v_n, v_m from custom.inbox_counts(v_org) c;
  if v_n <> 3 or v_m <> 3 then
    raise exception '4d: her counts should be 3 waiting (the proposal, the breed request, one call-back), 3 cleared and are %, %', v_n, v_m;
  end if;
  -- the records themselves still say what they said: nothing about a call-back was written.
  perform set_config('role', v_owner, true);
  if exists (select 1 from custom.record r where r.organization_id = v_org and r.id = any(v_cb[1:3])
              and r.updated_at > (select min(x.updated_at) from custom.record x where x.id = any(v_cb)) + interval '1 minute') then
    raise exception '4e: clearing wrote on a call-back record';
  end if;
  perform set_config('role', 'authenticated', true);
  -- REVERSIBLE: she puts the Okafor call-back back.
  v_out := custom.inbox_unclear(v_org, v_cb[3]);
  if not (v_out ->> 'changed')::boolean then
    raise exception '4f: putting a cleared call-back back changed nothing: %', v_out;
  end if;
  if not exists (select 1 from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_cb[3]) then
    raise exception '4g: the call-back she put back is not in her inbox';
  end if;
  v_out := custom.inbox_unsnooze(v_org, v_cb[4]);
  if (v_out ->> 'changed')::boolean then
    raise exception '4h: un-snoozing something that was never snoozed claimed a change';
  end if;
  -- DONE STAYS DONE UNTIL SOMEBODY ELSE TOUCHES IT. Her own note does not bring it back...
  perform custom.record_update(v_org, v_cb[2], jsonb_build_object('note', 'Left a voicemail'), null);
  if exists (select 1 from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_cb[2]) then
    raise exception '4i: her own edit brought a call-back she cleared back into her inbox';
  end if;
  -- ...the owner's does.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.record_update(v_org, v_cb[1], jsonb_build_object('note', 'They called again — estimate is ready'), null);
  begin
    perform custom.inbox_clear(v_org, v_cb[1]);   -- not in the owner's inbox: refused, not a leak
    v_caught := null;
  exception when others then v_caught := sqlerrm; v_code := sqlstate; end;
  if v_caught is null or v_code <> 'P0002' then
    raise exception '4j: the owner cleared the desk''s call-back (got % %)', v_code, v_caught;
  end if;
  perform set_config('request.jwt.claims', c_desk_j, true);
  if not exists (select 1 from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_cb[1]) then
    raise exception '4k: the owner changed a call-back the desk had cleared, and it did not come back to her';
  end if;
  raise notice 'PART 4 PASSED — three cleared, one put back, the ask refused ("needs a decision"), her own edit keeps it done, the owner''s brings it back.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — REMINDERS, exactly as pg_cron runs them (the store's owner, no person).
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_owner, true);
  perform set_config('request.jwt.claims', '', true);
  -- Thursday 8:05. The organization first asks for 30 days: only the snooze's return is said.
  perform set_config('custom.inbox_clock', (c_thursday + interval '5 minutes')::text, true);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','inbox_reminder_after_days','organization', v_org, v_org, '30'::jsonb, 'uichamp_s5b_green');
  v_out := custom.inbox_remind_tick();
  select count(*) into v_n from communication.notification n where n.organization_id = v_org;
  if v_n <> 1 or not exists (select 1 from communication.notification n where n.organization_id = v_org
                              and n.recipient_user_id = c_admin and n.event_key = 'custom.inbox.snooze_ended'
                              and n.target_id = v_rabies and n.channel = 'in_app' and n.deep_link like '/o/' || v_pepper::text || '%') then
    raise exception '5a: at 30 days only the owner''s "back in your inbox" should go out, and % notifications did (%)', v_n,
      (select jsonb_agg(jsonb_build_object('to', n.recipient_user_id, 'event', n.event_key, 'about', n.target_id, 'channel', n.channel, 'link', n.deep_link, 'pepper', v_pepper, 'rabies', v_rabies)) from communication.notification n where n.organization_id = v_org);
  end if;

  -- Now the default, three days. Everything still waiting since Friday gets ONE reminder.
  update platform.knob_override set value = '3'::jsonb
   where feature = 'custom' and key = 'inbox_reminder_after_days' and organization_id = v_org;
  v_out := custom.inbox_remind_tick();
  -- the desk: the proposal, the owner's breed request, and the call-backs still waiting on her (Okafor put back, Tran brought back by
  -- the owner, Alvarez never cleared). Not Delacroix, which she cleared.
  select array_agg(n.target_id order by n.target_id) into v_ids from communication.notification n
   where n.organization_id = v_org and n.recipient_user_id = c_desk and n.event_key = 'custom.inbox.reminder';
  select array_agg(x order by x) into v_ids2 from unnest(array[v_rabies, v_own, v_cb[1], v_cb[3], v_cb[4]]) x;
  if v_ids is distinct from v_ids2 then
    raise exception '5b: the desk''s reminders should be the ask and the three call-backs still waiting (%), and are %', v_ids2, v_ids;
  end if;
  if exists (select 1 from communication.notification n where n.organization_id = v_org
              and n.recipient_user_id = c_admin and n.event_key = 'custom.inbox.reminder') then
    raise exception '5c: the owner got a reminder about the ask on top of being told it was back';
  end if;
  select count(*) into v_n from communication.notification n where n.organization_id = v_org;
  v_out := custom.inbox_remind_tick();
  v_out := custom.inbox_remind_tick();
  if (select count(*) from communication.notification n where n.organization_id = v_org) <> v_n then
    raise exception '5d: running the reminders again sent more — a second reminder for the same item';
  end if;
  -- still nothing written on the approval
  if (select r.version from custom.record r where r.organization_id = v_org and r.id = v_rabies) <> v_ver
     or (select count(*) from history.row_versions h where h.row_id = v_rabies) <> v_hist then
    raise exception '5e: the reminders wrote on the approval itself';
  end if;
  raise notice 'PART 5 PASSED — the snooze''s return said once; at 30 days nothing else; at 3 days one reminder per waiting item, none for what she cleared, none twice.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 6 — AFTER A DECISION. The owner approves; the ask leaves every inbox and every count.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.work_approval_decide(v_org, v_rabies, true, 'Certificate checked against the clinic log');
  begin
    perform custom.inbox_snooze(v_org, v_rabies, c_thursday + interval '1 day');
    v_caught := null;
  exception when others then v_caught := sqlerrm; v_code := sqlstate; end;
  if v_caught is null or v_code <> '55000' then
    raise exception '6a: snoozing a decided ask was not refused (got % %)', v_code, v_caught;
  end if;
  perform set_config('request.jwt.claims', c_desk_j, true);
  if exists (select 1 from custom.work_inbox(v_org, 200, 0, false) w where w.item_id = v_rabies) then
    raise exception '6b: the decided ask is still waiting in the desk''s inbox';
  end if;
  select c.waiting into v_n from custom.inbox_counts(v_org) c;
  if v_n <> 4 then
    raise exception '6c: the desk''s count after the decision should be 4 (the breed request and three call-backs) and is %', v_n;
  end if;
  raise notice 'PART 6 PASSED — decided: gone from the desk''s inbox and count, and a decided ask cannot be snoozed.';

  raise notice 'uichamp_s5b_green.sql: ALL PARTS PASSED';
end
$t$;

rollback;
