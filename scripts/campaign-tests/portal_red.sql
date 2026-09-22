-- PORTAL — THE RED TWIN. PRODUCTS row 2: "Let each client sign in and see only their
-- own jobs and invoices."
--
-- It builds the SAME throwaway organization the green suite builds, then PUTS BACK THE REAL
-- PRE-FIX BYTES of one body at a time, inside this rolled-back transaction, and proves the
-- clause the fix exists for goes RED. A guard you cannot show failing is not a guard.
--
-- Each block restores the body verbatim as it stood on the main database before lane PORTAL
-- replaced it — the same bytes the matching file in `migrations/inverse/` restores — so this
-- also proves those inverses are valid SQL that executes.
--
-- The three principals are synthesized identities created once for this lane's proof; they
-- belong to nobody and are members of no organization, which is what makes them external
-- principals (VIS-31).

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'portal_red.sql'
\set requires 'function:custom.organization_kernel_id'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
set local lock_timeout = '10s';
set local statement_timeout = '60s';
do $suite$
declare
  v_boss     text := current_user;
  c_admin  constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_ada    constant uuid := '6ce17b70-0792-44a1-8dca-52ec42fc76dc';
  c_bruno  constant uuid := '3b6cd2e6-bc7e-4ac2-910b-0676cf3a66c9';
  c_cleo   constant uuid := '96bf237b-d268-45cf-8d82-2525e34ae8e3';
  v_org    uuid := gen_random_uuid();
  j_ada      constant text := '{"sub":"6ce17b70-0792-44a1-8dca-52ec42fc76dc","role":"authenticated"}';
  j_bru      constant text := '{"sub":"3b6cd2e6-bc7e-4ac2-910b-0676cf3a66c9","role":"authenticated"}';
  j_admin    constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_home   uuid;
  v_clients uuid; v_jobs uuid; v_invoices uuid;
  v_f_client_job uuid; v_f_client_inv uuid;
  v_ada uuid; v_bru uuid; v_cle uuid;
  v_portal uuid;
  v_p_ada uuid; v_p_bru uuid; v_p_cle uuid;
  v_i integer; v_n integer; v_m bigint; v_doc jsonb; v_txt text;
  v_who uuid; v_name text;
  v_id       uuid;
begin
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Ridgeline Physical Therapy - safe to delete',
          'ridgeline-pt-' || left(v_org::text, 8), 'RPT', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'PORTAL lane proof', c_admin)
  on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = 'true'::jsonb;

  perform set_config('app.actor_system', 'campaign/PORTAL/fixture', true);

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Ridgeline Physical Therapy', 'description', 'the proof''s home', '_actor', 'user'));

  -- ── the three Tables ────────────────────────────────────────────────────────────
  v_clients := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Clients', 'slug', 'clients', 'description', 'the people the portal is for',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'row_order', 'sorted', 'agent_writable', true, 'retention_days', 365,
      'label_singular', 'Client', 'label_plural', 'Clients', 'title_field', 'name', 'default_sort', jsonb_build_array(jsonb_build_object('field','name','direction','asc')),
      'fields', jsonb_build_array(jsonb_build_object('name', 'name')),
      'parent_id', v_home));
  perform custom.field_declare(v_org, v_clients, jsonb_build_object('label', 'Name', 'key', 'name', 'type', 'text', 'required', true));
  perform custom.field_declare(v_org, v_clients, jsonb_build_object('label', 'Contact email', 'key', 'contact_email', 'type', 'text'));

  v_jobs := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Jobs', 'slug', 'jobs', 'description', 'collections we run for a client',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'row_order', 'sorted', 'agent_writable', true, 'retention_days', 365,
      'label_singular', 'Job', 'label_plural', 'Jobs', 'title_field', 'title', 'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
      'fields', jsonb_build_array(jsonb_build_object('name', 'title')),
      'parent_id', v_home));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Job', 'key', 'title', 'type', 'text', 'required', true));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Stage', 'key', 'stage', 'type', 'text'));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Scheduled for', 'key', 'scheduled_for', 'type', 'text'));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Notes for us', 'key', 'client_notes', 'type', 'text'));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Internal margin', 'key', 'internal_margin', 'type', 'text'));
  v_f_client_job := custom.field_declare(v_org, v_jobs, jsonb_build_object(
      'label', 'Client', 'key', 'client', 'type', 'relation',
      'relation_target', v_clients));

  v_invoices := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Invoices', 'slug', 'invoices', 'description', 'what a client owes',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'row_order', 'sorted', 'agent_writable', true, 'retention_days', 365,
      'label_singular', 'Invoice', 'label_plural', 'Invoices', 'title_field', 'number', 'default_sort', jsonb_build_array(jsonb_build_object('field','number','direction','asc')),
      'fields', jsonb_build_array(jsonb_build_object('name', 'number')),
      'parent_id', v_home));
  perform custom.field_declare(v_org, v_invoices, jsonb_build_object('label', 'Invoice', 'key', 'number', 'type', 'text', 'required', true));
  perform custom.field_declare(v_org, v_invoices, jsonb_build_object('label', 'Total', 'key', 'total', 'type', 'text'));
  perform custom.field_declare(v_org, v_invoices, jsonb_build_object('label', 'Status', 'key', 'status', 'type', 'text'));
  perform custom.field_declare(v_org, v_invoices, jsonb_build_object('label', 'Internal cost', 'key', 'internal_cost', 'type', 'text'));
  v_f_client_inv := custom.field_declare(v_org, v_invoices, jsonb_build_object(
      'label', 'Client', 'key', 'client', 'type', 'relation',
      'relation_target', v_clients));

  -- ── three clients ───────────────────────────────────────────────────────────────
  v_ada := custom.record_write(v_org, v_clients, jsonb_build_object('name', 'Ada Brook Cafes', 'contact_email', 'ada.client@ridgelinept.test', '_actor', 'user'));
  v_bru := custom.record_write(v_org, v_clients, jsonb_build_object('name', 'Bruno Vance Builders', 'contact_email', 'bruno.client@ridgelinept.test', '_actor', 'user'));
  v_cle := custom.record_write(v_org, v_clients, jsonb_build_object('name', 'Cleo Marsh Clinics', 'contact_email', 'cleo.client@ridgelinept.test', '_actor', 'user'));

  -- ── 30 jobs, ten each; 9 invoices, three each ───────────────────────────────────
  for v_i in 1..30 loop
    if v_i <= 10 then v_who := v_ada; v_name := 'Ada';
    elsif v_i <= 20 then v_who := v_bru; v_name := 'Bruno';
    else v_who := v_cle; v_name := 'Cleo'; end if;
    perform custom.record_write(v_org, v_jobs, jsonb_build_object(
      'title', format('%s collection #%s', v_name, v_i),
      'stage', (array['Scheduled','On site','Weighed','Invoiced'])[1 + (v_i % 4)],
      'scheduled_for', to_char(now() + (v_i || ' days')::interval, 'Mon DD'),
      'client_notes', '',
      'internal_margin', format('%s%%', 18 + (v_i % 7)),
      'client', v_who::text, '_actor', 'user'));
  end loop;
  for v_i in 1..9 loop
    if v_i <= 3 then v_who := v_ada; v_name := 'ADA';
    elsif v_i <= 6 then v_who := v_bru; v_name := 'BRU';
    else v_who := v_cle; v_name := 'CLE'; end if;
    perform custom.record_write(v_org, v_invoices, jsonb_build_object(
      'number', format('%s-2026-%s', v_name, lpad(v_i::text, 4, '0')),
      'total', format('$%s.00', 400 + v_i * 37),
      'status', (array['Sent','Paid','Overdue'])[1 + (v_i % 3)],
      'internal_cost', format('$%s.00', 200 + v_i * 11),
      'client', v_who::text, '_actor', 'user'));
  end loop;

  -- ── the portal ──────────────────────────────────────────────────────────────────
  v_portal := custom.portal_declare(v_org, 'Ridgeline Physical Therapy client portal', v_clients,
    jsonb_build_array(
      jsonb_build_object('table_id', v_jobs, 'names_via', 'client',
        'visible_fields', jsonb_build_array('title','stage','scheduled_for','client_notes'),
        'editable_fields', jsonb_build_array('client_notes'),
        'comments', true),
      jsonb_build_object('table_id', v_invoices, 'names_via', 'client',
        'visible_fields', jsonb_build_array('number','total','status'),
        'editable_fields', '[]'::jsonb, 'comments', false)));

  v_p_ada := (custom.portal_invite(v_org, v_portal, v_ada, 'ada.client@ridgelinept.test', c_ada) ->> 'principal_id')::uuid;
  v_p_bru := (custom.portal_invite(v_org, v_portal, v_bru, 'bruno.client@ridgelinept.test', c_bruno) ->> 'principal_id')::uuid;
  v_p_cle := (custom.portal_invite(v_org, v_portal, v_cle, 'cleo.client@ridgelinept.test', c_cleo) ->> 'principal_id')::uuid;

  
  perform set_config('app.actor_system', 'campaign/PORTAL/seatproof', true);

  perform set_config('app.actor_system', 'campaign/PORTAL/red', true);
  perform set_config('request.jwt.claims', j_ada, true);

  -- ══ RED 1 — WITHOUT THE ARM THAT CARRIES, SHE SEES NOTHING ═══════════════════════
  -- The pre-fix `custom.carrying_edges_of`: arms 1a, 1b, 2a, 2b and 3, and no arm 4. The
  -- association naming her client is there, unread, so nothing reaches her.
  execute $red1$
    create or replace function custom.carrying_edges_of(p_item_type text, p_item_id uuid)
    returns table(container_type text, container_id uuid, conveys_max permission_level)
    language sql stable security definer set search_path to ''
    as $body$
      select a.source_type, a.source_id, r.conveys_max
        from platform.associations a
        join platform.association_types r on r.source_type = a.source_type and r.target_type = a.target_type
         and (r.label is null or r.label = a.label)
       where a.deleted_at is null and r.is_active and r.container_side = 'source'
         and a.target_type = p_item_type and a.target_id = p_item_id
      union
      select a.target_type, a.target_id, r.conveys_max
        from platform.associations a
        join platform.association_types r on r.source_type = a.source_type and r.target_type = a.target_type
         and (r.label is null or r.label = a.label)
       where a.deleted_at is null and r.is_active and r.container_side = 'target'
         and a.source_type = p_item_type and a.source_id = p_item_id
      union
      select a.source_type, a.source_id, cr.conveys_max
        from platform.associations a join custom.carrying_rule cr on cr.role = a.role and cr.is_active
       where a.deleted_at is null and cr.container_side = 'source'
         and a.target_type = p_item_type and a.target_id = p_item_id
      union
      select a.target_type, a.target_id, cr.conveys_max
        from platform.associations a join custom.carrying_rule cr on cr.role = a.role and cr.is_active
       where a.deleted_at is null and cr.container_side = 'target'
         and a.source_type = p_item_type and a.source_id = p_item_id
      union
      select 'record'::text, r.table_id, 'admin'::public.permission_level
        from custom.record r
        join custom.record t on t.id = r.table_id and t.organization_id = r.organization_id and t.deleted_at is null
       where p_item_type = 'record' and r.id = p_item_id and r.table_id is not null
         and r.table_id <> r.id and r.deleted_at is null
         and r.visibility >= 'internal'::platform.visibility;
    $body$;
  $red1$;
  -- THE TWO DOORS ASK DIFFERENT FUNCTIONS, WHICH IS THE WHOLE OF CENSUS 13. The LIST doors
  -- go through `custom.carrying_edges_in`; the RECORD door goes through
  -- `custom.carrying_edges_of`. Teaching one and not the other is not "half fixed" — it is
  -- the exact disagreement LEAK-T10 built census 13 to name, with the sides swapped: the
  -- lists still hand her ten jobs and the record door refuses every one of them.
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from custom.read_records(v_org, v_jobs, true, 200, 0);
  if v_n <> 10 then
    raise exception 'RED 1 setup: the lists should still answer 10 here, got %', v_n;
  end if;
  select id into v_id from custom.read_records(v_org, v_jobs, true, 1, 0);
  v_txt := null;
  begin
    perform custom.read_record(v_org, v_id, true);
  exception when insufficient_privilege or no_data_found then v_txt := 'refused';
  end;
  if v_txt is distinct from 'refused' then
    raise exception 'RED 1 IS NOT RED: without arm 4 the record door still opened a job';
  end if;
  perform set_config('role', v_boss, true);
  select count(*) into v_m from custom.list_door_disagreements(null, v_org, null);
  if v_m = 0 then
    raise exception 'RED 1 IS NOT RED: census 13 found no disagreement although the record door refuses what the lists hand out';
  end if;
  raise notice 'RED 1 — teach the lists and not the record door and census 13 names % disagreements; the lists hand Ada 10 jobs and custom.read_record refuses every one', v_m;

  -- put the real body back before the next block, so each RED is one change at a time
  execute $undo1$
    create or replace function custom.carrying_edges_of(p_item_type text, p_item_id uuid)
    returns table(container_type text, container_id uuid, conveys_max permission_level)
    language sql stable security definer set search_path to ''
    as $body$
      select a.source_type, a.source_id, r.conveys_max
        from platform.associations a
        join platform.association_types r on r.source_type = a.source_type and r.target_type = a.target_type
         and (r.label is null or r.label = a.label)
       where a.deleted_at is null and r.is_active and r.container_side = 'source'
         and a.target_type = p_item_type and a.target_id = p_item_id
      union
      select a.target_type, a.target_id, r.conveys_max
        from platform.associations a
        join platform.association_types r on r.source_type = a.source_type and r.target_type = a.target_type
         and (r.label is null or r.label = a.label)
       where a.deleted_at is null and r.is_active and r.container_side = 'target'
         and a.source_type = p_item_type and a.source_id = p_item_id
      union
      select a.source_type, a.source_id, cr.conveys_max
        from platform.associations a join custom.carrying_rule cr on cr.role = a.role and cr.is_active
       where a.deleted_at is null and cr.container_side = 'source'
         and a.target_type = p_item_type and a.target_id = p_item_id
      union
      select a.target_type, a.target_id, cr.conveys_max
        from platform.associations a join custom.carrying_rule cr on cr.role = a.role and cr.is_active
       where a.deleted_at is null and cr.container_side = 'target'
         and a.source_type = p_item_type and a.source_id = p_item_id
      union
      select 'record'::text, r.table_id, 'admin'::public.permission_level
        from custom.record r
        join custom.record t on t.id = r.table_id and t.organization_id = r.organization_id and t.deleted_at is null
       where p_item_type = 'record' and r.id = p_item_id and r.table_id is not null
         and r.table_id <> r.id and r.deleted_at is null
         and r.visibility >= 'internal'::platform.visibility
      union
      select 'record'::text, a.target_id, pt.conveys_max
        from platform.associations a
        join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
        join custom.portal p on p.id = pt.portal_id and p.is_active
       where a.deleted_at is null and p_item_type = 'record'
         and a.source_type = 'record' and a.source_id = p_item_id and a.target_type = 'record';
    $body$;
  $undo1$;

  -- ══ RED 2 — WITHOUT THE DOOR IN THE WALL, SHE IS REFUSED BEFORE THE LADDER ═══════
  execute $red2$
    create or replace function custom.assert_client_may_reach(p_organization_id uuid, p_door text)
    returns void language plpgsql stable set search_path to 'pg_catalog'
    as $body$
    declare v_owner oid; v_who name := custom.caller_role();
    begin
      select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
      if pg_has_role(v_who, v_owner, 'member') then return; end if;
      if p_organization_id is null then
        raise exception 'custom: % was called without an organization.', p_door using errcode = '22004';
      end if;
      if iam.has_org_access(p_organization_id) then return; end if;
      raise exception 'You are not a member of that organization, so % has nothing to do there.', p_door
        using errcode = '42501';
    end $body$;
  $red2$;
  perform set_config('role', 'authenticated', true);
  v_txt := null;
  begin
    perform count(*) from custom.read_records(v_org, v_jobs, true, 200, 0);
  exception when insufficient_privilege then v_txt := 'refused';
  end;
  if v_txt is distinct from 'refused' then
    raise exception 'RED 2 IS NOT RED: without the portal arm the wall still let Ada through';
  end if;
  raise notice 'RED 2 — without the portal arm in the wall, Ada is refused 42501 before the ladder is asked';
  perform set_config('role', v_boss, true);
  execute $undo2$
    create or replace function custom.assert_client_may_reach(p_organization_id uuid, p_door text)
    returns void language plpgsql stable set search_path to 'pg_catalog'
    as $body$
    declare v_owner oid; v_who name := custom.caller_role();
    begin
      select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
      if pg_has_role(v_who, v_owner, 'member') then return; end if;
      if p_organization_id is null then
        raise exception 'custom: % was called without an organization, and the store is keyed (organization_id, id).',
          coalesce(nullif(btrim(p_door), ''), 'that door') using errcode = '22004';
      end if;
      if iam.has_org_access(p_organization_id) then return; end if;
      if coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false)
         and custom.portal_admits(p_organization_id) then
        return;
      end if;
      raise exception 'You are not a member of that organization, so % has nothing to do there.',
        coalesce(nullif(btrim(p_door), ''), 'that door') using errcode = '42501';
    end $body$;
  $undo2$;

  -- ══ RED 3 — WITHOUT THE NARROWING, THE PORTAL'S OWN FIELD LIST MEANS NOTHING ═════
  execute $red3$
    create or replace function iam.may_touch_field(p_user_id uuid, p_field_id uuid, p_organization_id uuid, p_level_on_record permission_level, p_action text default 'read'::text)
    returns boolean language plpgsql stable security definer set search_path to ''
    as $body$
    declare v_sensitivity text; v_required public.permission_level; v_granted public.permission_level;
    begin
      if p_field_id is null then return true; end if;
      select f.data ->> 'sensitivity' into v_sensitivity
        from custom.record f
       where f.organization_id = p_organization_id and f.id = p_field_id
         and f.table_id = custom.field_kernel_id() and f.deleted_at is null;
      if not found then return false; end if;
      v_required := iam.field_sensitivity_level(v_sensitivity, p_action, p_organization_id);
      v_granted := iam.granted_level(p_user_id, 'record', p_field_id);
      if v_granted is not null and v_granted >= v_required then return true; end if;
      return p_level_on_record is not null and p_level_on_record >= v_required;
    end $body$;
  $red3$;
  perform set_config('role', 'authenticated', true);
  select id into v_id from custom.read_records(v_org, v_jobs, true, 1, 0);
  v_doc := custom.read_record(v_org, v_id, true);
  if not (v_doc ? 'internal_margin') then
    raise exception 'RED 3 IS NOT RED: without the narrowing the door still withheld internal_margin — %', v_doc;
  end if;
  raise notice 'RED 3 — without the narrowing, Ada reads internal_margin (%), which her portal never showed her',
    v_doc ->> 'internal_margin';
  perform set_config('role', v_boss, true);

  raise notice '3 of 3 blocks are RED';
  raise exception 'ROLLBACK VERIFIED — the red twin plants real pre-fix bytes and leaves nothing';
end $suite$;
