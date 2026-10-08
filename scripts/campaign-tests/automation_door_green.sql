-- LANE AUTOMATION-DOOR — THE GREEN SUITE. A table declares what happens when a row changes, and the
-- store does it, with a run history.
--
-- THE USE CASE. Priya Raman runs the editorial desk of a trade magazine. Her Content table holds the
-- stories; a story whose Status is set to "Ready" must land in the Approvals table as a Pending
-- item, and she is told. She also keeps a rule that publishing a story approves its item, and a
-- chain that would loop forever if nothing stopped it. The suite takes the seat of admin@admin.com
-- (the editor of the table); a stranger and another organization's id are the foreign callers.
--
-- WHAT MAKES IT FAIL — one production change per part:
--   1  automation_declare storing a schedule trigger, a property that is not on the table, no actions,
--      a non-https webhook — each must come back as `_errors`, not as a stored automation.
--   2  the run path not firing at all (a Ready edit adds no Approvals row), firing on the wrong
--      edit (Status set to something else), or firing when the automation is off or archived.
--   3  a failing step taking the person's own edit down with it, or not being named in the run.
--   4  a loop that does not stop at three rounds.
--   5  automation_runs not answering status, steps and the store's own sentence.
--   6  a stranger declaring on, or an invented id answering differently from a foreign one.
--
-- FAILING-THEN-PASSING: before automation_door_a_table_declares_what_happens_when_a_row_changes.sql is
-- applied this fails at part 1 (`function custom.automation_declare(...) does not exist`).
--
-- Run: the whole file in one transaction, rolled back at the end (nothing is kept).

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  v_org uuid := gen_random_uuid();
  v_org2 uuid := gen_random_uuid();
  v_home uuid; v_content uuid; v_appr uuid;
  f_title uuid; f_status uuid; f_owner uuid; f_step uuid; f_item uuid; f_state uuid;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid;
  a_ready uuid; a_pub uuid; a_loop1 uuid; a_loop2 uuid; a_fail uuid; a_added uuid;
  v_res jsonb; v_n integer; v_txt text; v_runs jsonb; v_row jsonb;
  f_done uuid; f_when uuid; v_zone text; v_want text; v_got text; v_utc text; v_expr jsonb;
begin
  perform set_config('app.actor_system', 'campaign-test/automation-door', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── fixture, built through the same doors a person uses (as the role that owns the store) ──
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Light Trade Media ' || substr(v_org::text, 1, 8), 'harbor-light-trade-' || substr(v_org::text, 1, 8), 'HLT', c_admin),
         (v_org2, 'Quarry Row Press ' || substr(v_org2::text, 1, 8), 'quarry-row-press-' || substr(v_org2::text, 1, 8), 'QRP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner', 'active'),
    (v_org2, 'organization', v_org2, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'automation fixture'),
    ('custom', 'system_enabled', 'organization', v_org2, v_org2, 'true'::jsonb, 'automation fixture');
  insert into custom.record (organization_id, table_id, data) values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  v_content := custom.table_declare(v_org, jsonb_build_object('name', 'Content', 'slug', 'content', 'type', 'entity',
    'label_singular', 'Story', 'label_plural', 'Stories', 'title_field', 'title', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'title', 'direction', 'asc')),
    'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'title'))));
  v_appr := custom.table_declare(v_org, jsonb_build_object('name', 'Approvals', 'slug', 'approvals', 'type', 'entity',
    'label_singular', 'Approval', 'label_plural', 'Approvals', 'title_field', 'item', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'item', 'direction', 'asc')),
    'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'item'))));
  f_title  := custom.field_declare(v_org, v_content, jsonb_build_object('key', 'title', 'label', 'Title', 'type', 'text', 'sort', 10));
  f_status := custom.field_declare(v_org, v_content, jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'select', 'sort', 20,
                 'options', jsonb_build_array('Draft', 'Ready', 'Published')));
  f_owner  := custom.field_declare(v_org, v_content, jsonb_build_object('key', 'owner_id', 'label', 'Owner', 'type', 'text', 'sort', 30));
  f_step   := custom.field_declare(v_org, v_content, jsonb_build_object('key', 'step', 'label', 'Step', 'type', 'text', 'sort', 40));
  f_item   := custom.field_declare(v_org, v_appr, jsonb_build_object('key', 'item', 'label', 'Item', 'type', 'text', 'sort', 10));
  f_state  := custom.field_declare(v_org, v_appr, jsonb_build_object('key', 'state', 'label', 'State', 'type', 'select', 'sort', 20,
                 'options', jsonb_build_array('Pending', 'Approved')));
  r1 := custom.record_write(v_org, v_content, jsonb_build_object('title', 'Harbor pilots vote to keep night transits', 'status', 'Draft'));
  r2 := custom.record_write(v_org, v_content, jsonb_build_object('title', 'Dredging contract goes to a second bidder', 'status', 'Draft'));
  r3 := custom.record_write(v_org, v_content, jsonb_build_object('status', 'Draft'));

  perform set_config('role', 'authenticated', true);
  if current_user is distinct from 'authenticated' then raise exception '0: not seated'; end if;
  raise notice '0 PASS — seated as the editor of the Content table.';

  -- ══ PART 1 — THE SPEC, JUDGED WHOLE ═══════════════════════════════════════════════════
  v_res := custom.automation_declare(v_org, v_content, jsonb_build_object('name', 'Daily digest',
    'trigger', jsonb_build_object('on', 'schedule'), 'actions', jsonb_build_array(jsonb_build_object('do', 'agent', 'prompt', 'x'))));
  if (v_res ->> 'ok')::boolean or v_res -> '_errors' -> 'trigger' is null or v_res ->> 'automation_id' is not null
     or (v_res -> '_errors' ->> 'trigger') not like '%schedule%' then
    raise exception '1a: a schedule trigger was not refused by name: %', v_res; end if;
  v_res := custom.automation_declare(v_org, v_content, jsonb_build_object('name', 'Bad field',
    'trigger', jsonb_build_object('on', 'property_edited', 'field', gen_random_uuid()),
    'actions', jsonb_build_array(jsonb_build_object('do', 'set', 'values', jsonb_build_object(gen_random_uuid(), 'x')))));
  if (v_res ->> 'ok')::boolean or v_res -> '_errors' -> 'trigger.field' is null or v_res -> '_errors' -> 'actions.0.values' is null
     and not exists (select 1 from jsonb_object_keys(v_res -> '_errors') k where k like 'actions.0.values.%') then
    raise exception '1b: a property that is not on the table was stored: %', v_res; end if;
  v_res := custom.automation_declare(v_org, v_content, jsonb_build_object('name', 'Nothing', 'trigger', jsonb_build_object('on', 'row_added'), 'actions', '[]'::jsonb));
  if (v_res ->> 'ok')::boolean or v_res -> '_errors' -> 'actions' is null then raise exception '1c: an automation with no actions was stored: %', v_res; end if;
  v_res := custom.automation_declare(v_org, v_content, jsonb_build_object('name', 'Ping', 'trigger', jsonb_build_object('on', 'row_added'),
    'actions', jsonb_build_array(jsonb_build_object('do', 'webhook', 'url', 'http://localhost/hook'))));
  if (v_res ->> 'ok')::boolean or v_res -> '_errors' -> 'actions.0.url' is null then raise exception '1d: a non-https webhook was stored: %', v_res; end if;
  if jsonb_array_length(custom.automations(v_content, v_org) -> 'automations') <> 0 then raise exception '1e: a refused spec left an automation behind'; end if;
  raise notice '1 PASS — a schedule, a missing property, no actions and a non-https webhook each come back as _errors; nothing was stored.';

  -- ══ PART 2 — "WHEN STATUS BECOMES READY, ADD AN APPROVAL AND TELL ME" ═══════════════════
  v_res := custom.automation_declare(v_org, v_content, jsonb_build_object('name', 'Ready stories go to Approvals',
    'trigger', jsonb_build_object('on', 'property_edited', 'field', f_status, 'to', 'Ready'),
    'condition', jsonb_build_object('op', 'present', 'args', jsonb_build_array(jsonb_build_object('field', f_title))),
    'actions', jsonb_build_array(
      jsonb_build_object('do', 'add_row', 'table_id', v_appr, 'values', jsonb_build_object(f_item, jsonb_build_object('from', f_title), f_state, 'Pending')),
      jsonb_build_object('do', 'notify', 'to', jsonb_build_object('author', true), 'text', '{{' || f_title::text || '}} is ready for approval.'))));
  if not (v_res ->> 'ok')::boolean then raise exception '2a: a good automation was refused: %', v_res; end if;
  a_ready := (v_res ->> 'automation_id')::uuid;
  v_res := custom.automations(v_content, v_org);
  if jsonb_array_length(v_res -> 'automations') <> 1 or v_res -> 'automations' -> 0 ->> 'name' <> 'Ready stories go to Approvals'
     or not (v_res -> 'automations' -> 0 ->> 'enabled')::boolean then raise exception '2b: the list does not show it, on: %', v_res; end if;

  perform custom.record_update(v_org, r1, jsonb_build_object('status', 'Ready'));
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from custom.record a where a.organization_id = v_org and a.table_id = v_appr and a.data_class = 'record'
     and a.data ->> 'item' = 'Harbor pilots vote to keep night transits' and lower(a.data ->> 'state') = 'pending';
  if v_n <> 1 then raise exception '2c: Status set to Ready added % Approvals rows (want 1)', v_n; end if;
  select count(*) into v_n from communication.notification n where n.organization_id = v_org and n.recipient_user_id = c_admin
     and n.event_key = 'records.changed' and n.payload -> 'notice' ->> 'body' = 'Harbor pilots vote to keep night transits is ready for approval.';
  if v_n < 1 then raise exception '2d: the author was not told (% notices)', v_n; end if;
  perform set_config('role', 'authenticated', true);

  v_runs := custom.automation_runs(a_ready, 50, null, v_org);
  if jsonb_array_length(v_runs -> 'runs') <> 1 or v_runs -> 'runs' -> 0 ->> 'status' <> 'ran'
     or jsonb_array_length(v_runs -> 'runs' -> 0 -> 'steps') <> 2
     or v_runs -> 'runs' -> 0 -> 'steps' -> 0 ->> 'status' <> 'done' then raise exception '2e: run history wrong: %', v_runs; end if;

  -- another edit that is NOT "to Ready" must not fire; a Ready edit with no Title is skipped by its condition.
  perform custom.record_update(v_org, r2, jsonb_build_object('status', 'Published'));
  perform custom.record_update(v_org, r3, jsonb_build_object('status', 'Ready'));
  v_runs := custom.automation_runs(a_ready, 50, null, v_org);
  if jsonb_array_length(v_runs -> 'runs') <> 1 then raise exception '2f: fired on the wrong edit or ignored its condition: %', jsonb_array_length(v_runs -> 'runs'); end if;
  raise notice '2 PASS — Status to Ready added the Approvals row and told the author; run history shows 2 steps; a different value and an empty-title row did not fire it.';

  -- ══ PART 3 — OFF, ARCHIVED, RESTORED ═══════════════════════════════════════════════════
  v_res := custom.automation_set_enabled(v_org, a_ready, false);
  if (v_res ->> 'enabled')::boolean then raise exception '3a: still on'; end if;
  perform custom.record_update(v_org, r2, jsonb_build_object('status', 'Draft'));
  perform custom.record_update(v_org, r2, jsonb_build_object('status', 'Ready'));
  if jsonb_array_length(custom.automation_runs(a_ready, 50, null, v_org) -> 'runs') <> 1 then raise exception '3b: an automation that is off ran'; end if;
  v_res := custom.automation_archive(v_org, a_ready);
  if v_res -> 'archived_at' is null then raise exception '3c: archive did not stamp archived_at: %', v_res; end if;
  if jsonb_array_length(custom.automations(v_content, v_org) -> 'automations') <> 0 then raise exception '3d: archived one still listed'; end if;
  if jsonb_array_length(custom.automations(v_content, v_org, true) -> 'automations') <> 1 then raise exception '3e: archived one lost, not archived'; end if;
  v_res := custom.automation_restore(v_org, a_ready);
  if v_res -> 'archived_at' is not null and v_res ->> 'archived_at' <> 'null' then raise exception '3f: restore left archived_at: %', v_res; end if;
  if jsonb_array_length(custom.automations(v_content, v_org) -> 'automations') <> 1 then raise exception '3g: restored one not listed'; end if;
  if (custom.automations(v_content, v_org) -> 'automations' -> 0 ->> 'enabled')::boolean then raise exception '3h: restored one came back on by itself'; end if;
  perform custom.automation_set_enabled(v_org, a_ready, true);
  raise notice '3 PASS — off does not fire, archive hides it (and keeps it), restore brings it back off, set_enabled switches it on.';

  -- ══ PART 4 — A FAILING STEP IS NAMED AND NEVER TAKES THE EDIT WITH IT ═════════════════
  v_res := custom.automation_declare(v_org, v_content, jsonb_build_object('name', 'Tell the owner',
    'trigger', jsonb_build_object('on', 'property_edited', 'field', f_status, 'to', 'Published'),
    'actions', jsonb_build_array(
      jsonb_build_object('do', 'set', 'values', jsonb_build_object(f_step, 'told')),
      jsonb_build_object('do', 'notify', 'to', jsonb_build_object('field', f_owner), 'text', 'Published.'))));
  a_fail := (v_res ->> 'automation_id')::uuid;
  perform custom.record_update(v_org, r1, jsonb_build_object('status', 'Published'));
  v_runs := custom.automation_runs(a_fail, 50, null, v_org);
  if v_runs -> 'runs' -> 0 ->> 'status' <> 'failed' or v_runs -> 'runs' -> 0 -> 'steps' -> 1 ->> 'status' <> 'failed'
     or coalesce(v_runs -> 'runs' -> 0 -> 'steps' -> 1 ->> 'says', '') = ''
     or v_runs -> 'runs' -> 0 -> 'steps' -> 0 ->> 'status' <> 'done' then raise exception '4a: failed run not named: %', v_runs; end if;
  perform set_config('role', 'postgres', true);
  select jsonb_build_object('status', x.data ->> 'status', 'step', x.data ->> 'step') into v_row from custom.record x where x.id = r1;
  perform set_config('role', 'authenticated', true);
  if lower(v_row ->> 'status') <> 'published' or v_row ->> 'step' <> 'told' then raise exception '4b: the person''s edit or the first step was lost: %', v_row; end if;
  raise notice '4 PASS — the second step failed in the store''s own words ("%"), the first step and the person''s own edit stayed.', left(v_runs -> 'runs' -> 0 -> 'steps' -> 1 ->> 'says', 80);

  -- ══ PART 5 — A LOOP STOPS AT THREE ROUNDS ══════════════════════════════════════════════
  v_res := custom.automation_declare(v_org, v_content, jsonb_build_object('name', 'Flip to two',
    'trigger', jsonb_build_object('on', 'property_edited', 'field', f_owner, 'to', 'one'),
    'actions', jsonb_build_array(jsonb_build_object('do', 'set', 'values', jsonb_build_object(f_owner, 'two')))));
  a_loop1 := (v_res ->> 'automation_id')::uuid;
  v_res := custom.automation_declare(v_org, v_content, jsonb_build_object('name', 'Flip to one',
    'trigger', jsonb_build_object('on', 'property_edited', 'field', f_owner, 'to', 'two'),
    'actions', jsonb_build_array(jsonb_build_object('do', 'set', 'values', jsonb_build_object(f_owner, 'one')))));
  a_loop2 := (v_res ->> 'automation_id')::uuid;
  perform custom.record_update(v_org, r2, jsonb_build_object('owner_id', 'one'));
  v_n := jsonb_array_length(custom.automation_runs(a_loop1, 50, null, v_org) -> 'runs') + jsonb_array_length(custom.automation_runs(a_loop2, 50, null, v_org) -> 'runs');
  if v_n <> 4 then raise exception '5a: the loop ran % times (want 3 runs and 1 stop = 4)', v_n; end if;
  if not exists (select 1 from jsonb_array_elements((custom.automation_runs(a_loop1, 50, null, v_org) -> 'runs') || (custom.automation_runs(a_loop2, 50, null, v_org) -> 'runs')) x
                  where x ->> 'status' = 'stopped' and x ->> 'says' like '%keeps changing the record that starts it%') then
    raise exception '5b: the loop stopped without saying so'; end if;
  raise notice '5 PASS — the loop ran 3 rounds, then stopped and said so.';

  -- ══ PART 6 — row_added, edit_rows with the triggering row's value, run history paging ══
  v_res := custom.automation_declare(v_org, v_content, jsonb_build_object('name', 'New stories start as drafts',
    'trigger', jsonb_build_object('on', 'row_added'),
    'actions', jsonb_build_array(jsonb_build_object('do', 'set', 'values', jsonb_build_object(f_status, 'Draft')))));
  a_added := (v_res ->> 'automation_id')::uuid;
  r4 := custom.record_write(v_org, v_content, jsonb_build_object('title', 'Ferry timetable changes at Pier 9', 'status', 'Published'));
  if jsonb_array_length(custom.automation_runs(a_added, 50, null, v_org) -> 'runs') <> 1 then raise exception '6a: row_added did not fire'; end if;
  perform set_config('role', 'postgres', true);
  select x.data ->> 'status' into v_txt from custom.record x where x.id = r4;
  perform set_config('role', 'authenticated', true);
  if lower(v_txt) <> 'draft' then raise exception '6b: row_added set did not land (status %)', v_txt; end if;

  v_res := custom.automation_declare(v_org, v_content, jsonb_build_object('name', 'Published stories approve their item',
    'trigger', jsonb_build_object('on', 'property_edited', 'field', f_status, 'to', 'Published'),
    'actions', jsonb_build_array(jsonb_build_object('do', 'edit_rows', 'table_id', v_appr,
      'where', jsonb_build_object('op', 'eq', 'args', jsonb_build_array(jsonb_build_object('field', f_item), jsonb_build_object('trigger', f_title))),
      'values', jsonb_build_object(f_state, 'Approved')))));
  perform custom.record_update(v_org, r1, jsonb_build_object('status', 'Draft'));
  perform custom.record_update(v_org, r1, jsonb_build_object('status', 'Published'));
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from custom.record a where a.organization_id = v_org and a.table_id = v_appr and a.data_class = 'record'
     and a.data ->> 'item' = 'Harbor pilots vote to keep night transits' and lower(a.data ->> 'state') = 'approved';
  perform set_config('role', 'authenticated', true);
  if v_n <> 1 then raise exception '6c: edit_rows approved % items (want 1)', v_n; end if;
  v_runs := custom.automation_runs(a_ready, 1, null, v_org);
  if jsonb_array_length(v_runs -> 'runs') <> 1 or v_runs ->> 'next_cursor' is null then raise exception '6d: paging gave no cursor: %', v_runs; end if;
  raise notice '6 PASS — row_added fired, edit_rows found the one item by the triggering row''s title, run history pages with a cursor.';

  -- ══ PART 7 — FOREIGN CALLERS ═══════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform custom.automation_declare(v_org, v_content, jsonb_build_object('name', 'Sneak', 'trigger', jsonb_build_object('on', 'row_added'),
      'actions', jsonb_build_array(jsonb_build_object('do', 'set', 'values', jsonb_build_object(f_status, 'Ready')))));
    raise exception '7a: a stranger declared an automation';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.automation_archive(v_org, a_ready);
    raise exception '7b: a stranger archived an automation';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', c_admin_j, true);
  begin
    perform custom.automation_archive(v_org2, a_ready);
    raise exception '7c: another organization reached it';
  exception when foreign_key_violation then v_txt := sqlstate;
  end;
  begin
    perform custom.automation_archive(v_org, gen_random_uuid());
    raise exception '7d: an invented id answered';
  exception when foreign_key_violation then
    if v_txt <> sqlstate then raise exception '7e: foreign and invented answer differently'; end if;
  end;
  raise notice '7 PASS — a stranger is refused (42501); another organization''s id and an invented id answer the same 23503.';


  -- ══ PART 8 — A DAY IS THE PERSON'S DAY ═════════════════════════════════════════════════
  -- The clock cannot be set, so the zone is chosen so its day DIFFERS from the UTC day right now:
  -- +14 when it is noon UTC or later, -12 before. A date column written with {now:true} must hold that day.
  perform set_config('role', 'postgres', true);
  f_done := custom.field_declare(v_org, v_content, jsonb_build_object('key', 'completed_on', 'label', 'Completed', 'type', 'range', 'config', jsonb_build_object('kind', 'date'), 'sort', 50));
  f_when := custom.field_declare(v_org, v_content, jsonb_build_object('key', 'completed_at', 'label', 'Completed at', 'type', 'datetime', 'sort', 60));
  v_zone := case when extract(hour from now() at time zone 'UTC') >= 12 then 'Pacific/Kiritimati' else 'Etc/GMT+12' end;
  v_utc  := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  v_want := to_char(now() at time zone v_zone, 'YYYY-MM-DD');
  if v_utc = v_want then raise exception '8-: the chosen zone shares the UTC day'; end if;
  perform set_config('role', 'authenticated', true);
  v_res := custom.automation_declare(v_org, v_content, jsonb_build_object('name', 'Stamp the day it was published',
    'trigger', jsonb_build_object('on', 'property_edited', 'field', f_step, 'to', 'stamp'),
    'actions', jsonb_build_array(jsonb_build_object('do', 'set', 'values',
      jsonb_build_object(f_done, jsonb_build_object('now', true), f_when, jsonb_build_object('now', true))))));
  if not (v_res ->> 'ok')::boolean then raise exception '8a: %', v_res; end if;
  a_added := (v_res ->> 'automation_id')::uuid;

  -- (i) no zone declared anywhere: the UTC day, exactly as before.
  perform custom.record_update(v_org, r3, jsonb_build_object('step', 'stamp'));
  perform set_config('role', 'postgres', true);
  select x.data ->> 'completed_on' into v_got from custom.record x where x.id = r3;
  perform set_config('role', 'authenticated', true);
  if v_got is distinct from v_utc then raise exception '8b: with no zone the day should be UTC (%), got %', v_utc, v_got; end if;

  -- (ii) the connection declares the person's zone: the date column holds HER day, the datetime keeps the instant.
  perform set_config('custom.time_zone', v_zone, true);
  perform custom.record_update(v_org, r3, jsonb_build_object('step', 'again'));
  perform custom.record_update(v_org, r3, jsonb_build_object('step', 'stamp'));
  perform set_config('role', 'postgres', true);
  select x.data ->> 'completed_on', x.data ->> 'completed_at' into v_got, v_txt from custom.record x where x.id = r3;
  perform set_config('role', 'authenticated', true);
  if v_got is distinct from v_want then raise exception '8c: a run in % should write her day %, wrote %', v_zone, v_want, v_got; end if;
  if v_txt is null or v_txt not like '%T%' then raise exception '8d: the datetime lost its instant: %', v_txt; end if;
  if (v_txt::timestamptz) < now() - interval '1 minute' then raise exception '8e: the datetime is not now: %', v_txt; end if;

  -- (iii) the same resolver serves a row action's TODAY() and the stored coercion of an instant.
  perform set_config('role', 'postgres', true);
  v_expr := custom.formula_eval(v_org, jsonb_build_object('op', 'fx.today', 'args', '[]'::jsonb), '{}'::jsonb, '{}'::jsonb);
  if v_expr #>> '{}' is distinct from v_want then raise exception '8f: TODAY() read % (want %)', v_expr, v_want; end if;
  v_got := custom._action_coerce(jsonb_build_object('type', 'range', 'config', jsonb_build_object('kind', 'date')),
             to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), v_org) #>> '{}';
  if v_got is distinct from v_want then raise exception '8g: an instant written to a date column gave % (want %)', v_got, v_want; end if;
  perform set_config('custom.time_zone', '', true);
  perform set_config('role', 'authenticated', true);
  raise notice '8 PASS — in % (day %, UTC day %): the automation''s date column, TODAY() and an instant coerced to a date all hold her day; the datetime keeps the instant; with no zone declared it stays UTC.', v_zone, v_want, v_utc;

  raise notice 'AUTOMATION-DOOR GREEN — all parts pass.';
end
$t$;

rollback;
