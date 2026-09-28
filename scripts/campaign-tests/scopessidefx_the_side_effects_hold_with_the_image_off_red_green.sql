-- LANE SCOPES-SIDE-EFFECTS — WHAT THE OLD SCOPE TABLES' TRIGGERS DID FOR EVERYONE ELSE STILL HAPPENS
-- WHEN ONLY THE RECORD STORE IS WRITTEN, measured RED then GREEN on the dev clone.
--
-- THE USE CASE. Brightwater Software Studio keeps its client projects as a scope type ("Client
-- projects"), with an "Engagement lead" field and a "Known defects" table every project gets from the
-- platform's dataset template. Today every one of those writes lands in the old context tables too, and
-- the old tables' triggers do four jobs nobody else does: they put the project into the platform
-- search index, wake the suggestion sweep, provision the project's own "Known defects" table, and
-- refuse a project filed under a parent of another type or a value meant for another type's field.
-- The day the old tables stop being written (SCOPES-CUTOVER-PLAN 4.3.3), every one of those jobs
-- would stop without an error. This suite switches the image write off for one transaction — each
-- write goes to the store's own halves exactly as a door without its image would — and asks for all
-- of them.
--
-- The organization, its projects and its values are synthesized and rolled back. Nothing of the
-- owner's is read or written.
--
-- WHAT MAKES IT FAIL (RED before scopessidefx_the_context_side_effects_follow_the_store.sql and
-- scopessidefx_the_store_halves_refuse_what_the_old_triggers_refused.sql, GREEN after):
--   X1  a project made with the image off is in the platform search index (platform.search_item,
--       token 'scope'), titled with its name, its description as the subtitle
--   X2  ... and the suggestion sweep is woken for it (rag.kg_sweep_queue, change_type 'scope')
--   X3  a scope type made with the image off is in the search index (token 'scope_type') and wakes
--       the sweep (change_type 'scope_type')
--   X4  a context field made with the image off wakes the sweep (change_type 'context_item')
--   X5  a project filed under a parent of ANOTHER type is refused with the old sentence; a parent of
--       its own type is accepted
--   X6  a value for another type's field written into a project is refused (the old type check)
--   X7  a field bound to a dataset template that is not a one-table reference is refused
--   X8  a project made with the image off gets its own "Known defects" table (a Table whose
--       scope_binding names the field and the project) and the project's Record points at it
--   X9  renaming the project with the image off re-titles its search row; archiving it takes the row out
--   X10 with the image ON (the scope door as it is today) a project has exactly one search row and
--       exactly one sweep row — the old trigger and its twin never double
--   X11 a record in an ordinary Table (not kept for context) wakes no sweep and enters no scope row

\set ON_ERROR_STOP on
\timing off
\set suite 'scopessidefx_the_side_effects_hold_with_the_image_off_red_green.sql'
\set requires 'relation:custom.io_outbox|relation:platform.search_item|relation:rag.kg_sweep_queue|function:custom._ctx_store_scope|function:custom.scope_table_provision'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '240s';

create temp table sx (k text primary key, v uuid) on commit drop;

do $fixture$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_org uuid := gen_random_uuid();
begin
  perform set_config('app.actor_system', 'campaign-test/scopessidefx', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Brightwater Software Studio ' || substr(v_org::text, 1, 6), 'brightwater-software-' || substr(v_org::text, 1, 8), 'BSS', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into sx values ('org', v_org);
end
$fixture$;

do $t$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_tpl   constant uuid := '3d725e07-7d54-4e6d-9125-9a074729f4c2';   -- the platform's "Known defects" dataset template
  v_org uuid; v_projects uuid; v_streams uuid; v_lead uuid; v_defects uuid; v_stream_owner uuid;
  v_harbor uuid; v_phase2 uuid; v_ledger uuid; v_door uuid; v_plain uuid; v_row uuid;
  v_n int; v_msg text; v_si platform.search_item; v_rec custom.record; v_was text; v_tbl uuid;
  v_red text[] := '{}';
begin
  select v into v_org from sx where k = 'org';
  if custom.context_writer(v_org) <> 'store' then
    raise exception 'fixture: Brightwater, born today, does not write its scopes in the store (writer %)', custom.context_writer(v_org);
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated', 'session_id', 'scopessidefx')::text, true);

  -- ══ The image is written for the fixture's first type and its fields (the doors, as today) ══
  perform set_config('role', 'authenticated', true);
  v_projects := (custom.context_type_write(v_org, null, jsonb_build_object(
                   'label_singular', 'Client project', 'label_plural', 'Client projects', 'icon', 'briefcase',
                   'description', 'Every engagement the studio is delivering')) -> 'row' ->> 'id')::uuid;
  v_lead := (public.create_context_item(v_projects, 'engagement_lead', 'Engagement lead', 'string'::context_value_type,
               'Who runs the engagement day to day', null, 'always'::context_fetch_hint, 'internal'::context_sensitivity,
               '{}'::text[], null, 0::smallint, null, null, null, null)) ->> 'id';
  perform set_config('role', 'none', true);

  -- ══ FROM HERE THE IMAGE IS OFF: every write goes to the store's own halves, as a door without its
  --    image would write it (SCOPES-CUTOVER-PLAN 4.3.3). Nothing below touches context.*. ══
  v_was := custom._ctx_mark('door');

  -- X3: a scope type made with the image off
  v_streams := gen_random_uuid();
  perform custom._ctx_store_type(v_org, v_streams, jsonb_build_object(
    'id', v_streams, 'organization_id', v_org, 'label_singular', 'Workstream', 'label_plural', 'Workstreams',
    'slug', 'workstreams', 'icon', 'git-branch', 'description', 'The parallel tracks inside an engagement', 'created_by', c_admin));
  if not exists (select 1 from custom.record t where t.organization_id = v_org and t.id = v_streams and t.data ->> 'kept_for' = 'context') then
    raise exception 'X3 fixture: the Workstreams Table was not made by the store half';
  end if;
  select * into v_si from platform.search_item s where s.entity_id = v_streams and s.entity_token = 'scope_type';
  if v_si.entity_id is null then
    v_red := v_red || 'X3 RED: the Workstreams scope type, made with the image off, is not in the search index'::text;
  elsif v_si.subtitle is distinct from 'The parallel tracks inside an engagement' or v_si.organization_id <> v_org then
    raise exception 'X3: the Workstreams search row says % / %, not its description in Brightwater', v_si.title, v_si.subtitle;
  end if;
  if not exists (select 1 from rag.kg_sweep_queue q where q.change_type = 'scope_type' and q.entity_id = v_streams and q.organization_id = v_org) then
    v_red := v_red || 'X3 RED: making the Workstreams type with the image off woke no suggestion sweep'::text;
  end if;

  -- X4: a context field made with the image off
  v_stream_owner := gen_random_uuid();
  perform custom._ctx_store_item(v_org, v_streams, v_stream_owner, jsonb_build_object(
    'id', v_stream_owner, 'scope_type_id', v_streams, 'key', 'stream_owner', 'display_name', 'Stream owner',
    'value_type', 'string', 'is_active', true, 'created_by', c_admin));
  if not exists (select 1 from rag.kg_sweep_queue q where q.change_type = 'context_item' and q.entity_id = v_stream_owner
                   and q.scope_type_id = v_streams and q.organization_id = v_org) then
    v_red := v_red || 'X4 RED: adding the Stream owner field with the image off woke no suggestion sweep'::text;
  end if;

  -- X7: a field bound to a dataset template must be a one-table reference
  begin
    perform custom._ctx_store_item(v_org, v_projects, gen_random_uuid(), jsonb_build_object(
      'scope_type_id', v_projects, 'key', 'defect_log', 'display_name', 'Defect log', 'value_type', 'string',
      'is_active', true, 'max_items', 1,
      'reference_source', jsonb_build_object('container_type', 'dataset_template', 'template_id', c_tpl,
                                             'dimension', 'whole', 'provision', 'per_scope')));
    v_red := v_red || 'X7 RED: a text field bound to the Known defects template was accepted with the image off'::text;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'dataset-template context items require%' then
      raise exception 'X7: the refusal said "%", not the old sentence', v_msg;
    end if;
  end;

  -- The Known defects field, the right shape (the store half makes it; X8 needs it)
  v_defects := gen_random_uuid();
  perform custom._ctx_store_item(v_org, v_projects, v_defects, jsonb_build_object(
    'id', v_defects, 'scope_type_id', v_projects, 'key', 'known_defects', 'display_name', 'Known defects',
    'value_type', 'reference', 'allowed_reference_types', jsonb_build_array('table'), 'max_items', 1,
    'is_active', true, 'created_by', c_admin,
    'reference_source', jsonb_build_object('container_type', 'dataset_template', 'template_id', c_tpl,
                                           'dimension', 'whole', 'provision', 'per_scope')));
  -- WHERE THE FIELD SAYS IT IS BOUND TO A TEMPLATE is lane SCOPES-STORE-HOMES' decision (a Field
  -- document key `reference_source`). Until the store half writes it, the fixture writes it there, so
  -- this suite proves the side effects against the home L2 chose and never waits on it silently.
  select * into v_rec from custom.record f where f.organization_id = v_org and f.id = v_defects;
  if v_rec.data -> 'reference_source' is null then
    raise notice 'X8 fixture: the store half does not carry reference_source yet (lane SCOPES-STORE-HOMES); the fixture writes it at that home';
    perform custom._ctx_mark('bridge');
    update custom.record set data = data || jsonb_build_object('reference_source', jsonb_build_object(
             'container_type', 'dataset_template', 'template_id', c_tpl, 'dimension', 'whole', 'provision', 'per_scope'))
     where organization_id = v_org and id = v_defects;
    perform custom._ctx_mark('door');
  end if;

  -- X1, X2, X8: a project made with the image off
  v_harbor := gen_random_uuid();
  perform custom._ctx_store_scope(v_org, v_projects, v_harbor, jsonb_build_object(
    'id', v_harbor, 'organization_id', v_org, 'scope_type_id', v_projects, 'name', 'Harbor Freight Portal Rebuild',
    'description', 'Replatforming the carrier self-service portal', 'created_by', c_admin));
  select * into v_si from platform.search_item s where s.entity_id = v_harbor and s.entity_token = 'scope';
  if v_si.entity_id is null then
    v_red := v_red || 'X1 RED: Harbor Freight Portal Rebuild, made with the image off, is not in the search index'::text;
  elsif v_si.title <> 'Harbor Freight Portal Rebuild' or v_si.subtitle is distinct from 'Replatforming the carrier self-service portal'
        or v_si.organization_id <> v_org or v_si.owner_id is distinct from c_admin then
    raise exception 'X1: the search row says "%" / "%" (owner %), not the project''s name and description', v_si.title, v_si.subtitle, v_si.owner_id;
  end if;
  select count(*) into v_n from rag.kg_sweep_queue q where q.change_type = 'scope' and q.entity_id = v_harbor
     and q.scope_type_id = v_projects and q.organization_id = v_org;
  if v_n = 0 then
    v_red := v_red || 'X2 RED: making Harbor Freight Portal Rebuild with the image off woke no suggestion sweep'::text;
  elsif v_n > 1 then
    raise exception 'X2: the sweep was woken % times for one project', v_n;
  end if;
  select t.id into v_tbl from custom.record t
   where t.organization_id = v_org and t.table_id = custom.table_kernel_id() and t.deleted_at is null
     and t.data -> 'scope_binding' ->> 'context_item_id' = v_defects::text
     and t.data -> 'scope_binding' ->> 'scope_id' = v_harbor::text;
  if v_tbl is null then
    v_red := v_red || 'X8 RED: Harbor Freight Portal Rebuild got no Known defects table of its own with the image off'::text;
  else
    select * into v_rec from custom.record r where r.organization_id = v_org and r.id = v_harbor;
    if coalesce(v_rec.data ->> 'known_defects', '') not like '%' || v_tbl::text || '%' then
      raise exception 'X8: the project''s Known defects value is %, not a pointer to its own table', v_rec.data -> 'known_defects';
    end if;
  end if;

  -- X5: a parent of another type is refused; one of its own type is accepted
  v_ledger := gen_random_uuid();
  perform custom._ctx_store_scope(v_org, v_streams, v_ledger, jsonb_build_object(
    'id', v_ledger, 'organization_id', v_org, 'scope_type_id', v_streams, 'name', 'Carrier billing ledger', 'created_by', c_admin));
  begin
    perform custom._ctx_store_scope(v_org, v_projects, gen_random_uuid(), jsonb_build_object(
      'organization_id', v_org, 'scope_type_id', v_projects, 'name', 'Portal accessibility audit',
      'parent_scope_id', v_ledger, 'created_by', c_admin));
    v_red := v_red || 'X5 RED: a Client project filed under a Workstream was accepted with the image off'::text;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Cross-type nesting is not allowed for this type' then
      raise exception 'X5: the refusal said "%", not the old sentence', v_msg;
    end if;
  end;
  v_phase2 := gen_random_uuid();
  perform custom._ctx_store_scope(v_org, v_projects, v_phase2, jsonb_build_object(
    'id', v_phase2, 'organization_id', v_org, 'scope_type_id', v_projects, 'name', 'Harbor Freight Portal — Phase 2',
    'parent_scope_id', v_harbor, 'created_by', c_admin));
  if not exists (select 1 from custom.record r where r.organization_id = v_org and r.id = v_phase2 and r.data ->> 'parent_id' = v_harbor::text) then
    raise exception 'X5: Phase 2, filed under a project of its own type, was not accepted';
  end if;

  -- X6: a value for another type's field is refused
  begin
    perform custom._ctx_store_value(v_org, jsonb_build_object(
      'context_item_id', v_stream_owner, 'scope_id', v_harbor, 'value_text', 'Priya Raman',
      'source_type', 'manual', 'is_current', true));
    v_red := v_red || 'X6 RED: the Workstreams'' Stream owner value was written into a Client project with the image off'::text;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    -- Before the twin the store refuses it only by accident (the provenance guard finds no such key
    -- in the Table) and says so in words that name neither the field nor the type: RED, named.
    if v_msg not like 'Scope/item type mismatch%' then
      v_red := v_red || format('X6 RED: the value for another type''s field was refused only by accident, saying "%s"', v_msg);
    end if;
  end;

  -- X9: a rename re-titles the search row, an archive takes it out
  perform custom._ctx_store_scope(v_org, v_projects, v_harbor, jsonb_build_object(
    'id', v_harbor, 'organization_id', v_org, 'scope_type_id', v_projects, 'name', 'Harbor Freight Carrier Portal',
    'description', 'Replatforming the carrier self-service portal', 'created_by', c_admin));
  if exists (select 1 from platform.search_item s where s.entity_id = v_harbor and s.entity_token = 'scope') then
    if not exists (select 1 from platform.search_item s where s.entity_id = v_harbor and s.entity_token = 'scope'
                     and s.title = 'Harbor Freight Carrier Portal') then
      raise exception 'X9: renaming the project with the image off did not re-title its search row';
    end if;
  else
    v_red := v_red || 'X9 RED: the renamed project is not in the search index'::text;
  end if;
  perform custom._ctx_store_scope(v_org, v_projects, v_phase2, jsonb_build_object(
    'id', v_phase2, 'organization_id', v_org, 'scope_type_id', v_projects, 'name', 'Harbor Freight Portal — Phase 2',
    'parent_scope_id', v_harbor, 'created_by', c_admin, 'deleted_at', now()));
  if exists (select 1 from platform.search_item s where s.entity_id = v_phase2 and s.entity_token = 'scope') then
    raise exception 'X9: Phase 2, archived with the image off, is still in the search index';
  end if;

  perform custom._ctx_mark(v_was);

  -- ══ X10: THE IMAGE IS ON AGAIN (the scope door as it is today): no double ══
  perform set_config('role', 'authenticated', true);
  v_door := (custom.context_scope_write(v_org, null, v_projects, jsonb_build_object(
               'name', 'Lighthouse Analytics Dashboard', 'description', 'Usage analytics for the harbor operators')) -> 'row' ->> 'id')::uuid;
  perform set_config('role', 'none', true);
  select count(*) into v_n from platform.search_item s where s.entity_id = v_door and s.entity_token = 'scope';
  if v_n <> 1 then
    raise exception 'X10: the door''s project has % search rows, not exactly one', v_n;
  end if;
  select count(*) into v_n from rag.kg_sweep_queue q where q.change_type = 'scope' and q.entity_id = v_door;
  if v_n <> 1 then
    raise exception 'X10: the door''s project woke the sweep % times, not exactly once (the old trigger and its twin doubled)', v_n;
  end if;

  -- ══ X11: an ordinary Table is none of this ══
  v_tbl := custom._ctx_id('organization-home', v_org::text);
  perform set_config('role', 'authenticated', true);
  v_plain := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Release checklist', 'slug', 'release_checklist', 'label_singular', 'Release step', 'label_plural', 'Release steps',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 365,
    'default_sort', '[{"field": "name", "direction": "asc"}]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'title_field', 'name', 'parent_id', v_tbl::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name'))));
  v_row := custom.record_write(v_org, v_plain, jsonb_build_object('name', 'Tag the release candidate'));
  perform set_config('role', 'none', true);
  if exists (select 1 from rag.kg_sweep_queue q where q.entity_id in (v_plain, v_row))
     or exists (select 1 from platform.search_item s where s.entity_id in (v_plain, v_row) and s.entity_token in ('scope', 'scope_type')) then
    raise exception 'X11: a record in an ordinary Table woke the sweep or entered the search index as a scope';
  end if;

  if cardinality(v_red) > 0 then
    raise exception E'%', array_to_string(v_red, E'\n');
  end if;
  raise notice 'GREEN — with the image off, a project, a type and a field are searchable and wake the sweep; a project gets its own Known defects table; a parent of another type, a value for another type''s field and a mis-shaped dataset field are refused; a rename and an archive follow into the index; the door never doubles; an ordinary Table is untouched (X1–X11).';
end
$t$;

rollback;
