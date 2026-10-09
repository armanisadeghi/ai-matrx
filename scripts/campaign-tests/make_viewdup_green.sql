-- LANE MAKE-VIEWS-DEDUPE — THE GREEN SUITE. Declaring the same thing twice stores it once.
--
-- THE USE CASE. A content team installs the same /make template into the same Posts table a second
-- and a third time. Before, each install stacked another identical "Approval board" and another
-- reminder on the table. The door now answers the one already there.
--
-- WHAT MAKES IT FAIL — one production change per part:
--   1  custom.automation_declare with the same spec twice storing two automations (make_autodup_a
--      reverted); a DIFFERENT spec must still be stored as its own.
--   2  custom.view_declare with the same name + definition twice storing two saved views
--      (make_viewdup_a reverted); a different name or a different definition must still be stored.
--   3  a view that is the table's default (definition.is_default true) no longer matching its
--      identical re-declare; an archived view being reused instead of a fresh one stored.
--   4  custom.agg_calendar refused for a signed-in member (the door row / grant missing).
--
-- FAILING-THEN-PASSING: before make_viewdup_a_declaring_the_same_view_again_reuses_it.sql this fails at
-- 2a (two views); before make_viewdup_b_the_calendar_door_is_declared.sql it fails at part 4
-- (`permission denied for function agg_calendar`).
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
  v_spec jsonb; v_vspec jsonb; a1 uuid; v1 uuid; v2 uuid; v3 uuid; v4 uuid; v5 uuid; v6 uuid;
  v_res jsonb; v_n integer; v_txt text; v_runs jsonb; v_row jsonb;
  f_done uuid; f_when uuid; v_zone text; v_want text; v_got text; v_utc text; v_expr jsonb;
begin
  perform set_config('app.actor_system', 'campaign-test/make-viewdup', true);
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

  f_when := custom.field_declare(v_org, v_content, jsonb_build_object('key', 'post_at', 'label', 'Post at', 'type', 'datetime', 'sort', 50));
  perform set_config('role', 'authenticated', true);
  if current_user is distinct from 'authenticated' then raise exception '0: not seated'; end if;

  -- ══ PART 1 — THE SAME AUTOMATION TWICE IS ONE ════════════════════════════════════════════
  v_spec := jsonb_build_object('name', 'Tell me when a story is ready',
    'trigger', jsonb_build_object('on', 'property_edited', 'field', f_status, 'to', 'Ready'),
    'actions', jsonb_build_array(jsonb_build_object('do', 'notify', 'to', jsonb_build_object('author', true), 'text', 'A story is ready.')));
  v_res := custom.automation_declare(v_org, v_content, v_spec);
  if not (v_res ->> 'ok')::boolean then raise exception '1a: a good automation was refused: %', v_res; end if;
  a1 := (v_res ->> 'automation_id')::uuid;
  v_res := custom.automation_declare(v_org, v_content, v_spec);
  if not (v_res ->> 'ok')::boolean or (v_res ->> 'automation_id')::uuid <> a1 then
    raise exception '1b: declaring the same automation again did not answer the first (%)', v_res; end if;
  v_n := jsonb_array_length(custom.automations(v_content, v_org) -> 'automations');
  if v_n <> 1 then raise exception '1c: the same automation declared twice left % automations (want 1)', v_n; end if;
  v_res := custom.automation_declare(v_org, v_content, jsonb_set(v_spec, '{name}', '"A different reminder"'));
  if (v_res ->> 'automation_id')::uuid = a1 then raise exception '1d: a different spec was folded into the first'; end if;
  v_n := jsonb_array_length(custom.automations(v_content, v_org) -> 'automations');
  if v_n <> 2 then raise exception '1e: a different automation was not stored (% automations, want 2)', v_n; end if;
  raise notice '1 PASS — the same automation declared twice is one; a different one is stored.';

  -- ══ PART 2 — THE SAME VIEW TWICE IS ONE ═══════════════════════════════════════════════════
  v_vspec := jsonb_build_object('name', 'Approval board',
    'definition', jsonb_build_object('layout', 'kanban', 'group_field', 'status'));
  v1 := custom.view_declare(v_org, v_content, v_vspec);
  v2 := custom.view_declare(v_org, v_content, v_vspec);
  v3 := custom.view_declare(v_org, v_content, v_vspec);
  if v1 is null or v2 <> v1 or v3 <> v1 then raise exception '2a: the same view declared three times gave % / % / %', v1, v2, v3; end if;
  select count(*) into v_n from platform.saved_view
   where organization_id = v_org and subject_id = v_content and surface_key = 'custom/records' and deleted_at is null;
  if v_n <> 1 then raise exception '2b: the same view declared three times left % saved views (want 1)', v_n; end if;
  v4 := custom.view_declare(v_org, v_content, jsonb_set(v_vspec, '{name}', '"Another board"'));
  v5 := custom.view_declare(v_org, v_content, jsonb_build_object('name', 'Approval board',
          'definition', jsonb_build_object('layout', 'calendar', 'date_field', 'post_at')));
  if v4 = v1 or v5 = v1 or v4 = v5 then raise exception '2c: a different name or definition was folded into the first view'; end if;
  select count(*) into v_n from platform.saved_view
   where organization_id = v_org and subject_id = v_content and surface_key = 'custom/records' and deleted_at is null;
  if v_n <> 3 then raise exception '2d: % saved views (want 3)', v_n; end if;
  raise notice '2 PASS — the same view declared three times is one; a different name or definition is its own.';

  -- ══ PART 3 — A DEFAULT STILL MATCHES; AN ARCHIVED VIEW IS NOT REUSED ══════════════════════
  perform set_config('role', 'postgres', true);
  update platform.saved_view set definition = definition || '{"is_default": true}'::jsonb where id = v1;
  perform set_config('role', 'authenticated', true);
  if custom.view_declare(v_org, v_content, v_vspec) <> v1 then raise exception '3a: the default view no longer matches its identical re-declare'; end if;
  perform set_config('role', 'postgres', true);
  update platform.saved_view set deleted_at = now() where id = v4;
  perform set_config('role', 'authenticated', true);
  v6 := custom.view_declare(v_org, v_content, jsonb_set(v_vspec, '{name}', '"Another board"'));
  if v6 = v4 then raise exception '3b: an archived view was reused'; end if;
  raise notice '3 PASS — a default view still matches; an archived view is never reused.';

  -- ══ PART 4 — A SIGNED-IN MEMBER CAN ASK THE CALENDAR ══════════════════════════════════════
  v_res := custom.agg_calendar(v_org);
  if v_res ->> 'week_start' is null or v_res ->> 'time_zone' is null then raise exception '4a: agg_calendar answered %', v_res; end if;
  raise notice '4 PASS — agg_calendar answers a signed-in member: %', v_res;

  raise notice 'MAKE-VIEWS-DEDUPE GREEN — all parts pass.';
end
$t$;

rollback;
