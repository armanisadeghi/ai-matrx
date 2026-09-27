-- LANE SCOPES-TAILS — A TEMPLATE IS APPLIED THROUGH THE STORE'S SCOPE DOORS, measured RED then GREEN
-- on the dev clone.
--
-- THE USE CASE. Lakeshore Pediatric Dentistry, set up today, applies the "Dental Practice" template
-- during onboarding; a practice-management integration hands Tidewater Orthodontics a template as a
-- definition ("Locations" with "Treatment Rooms" inside them, a room's "Backup Room" pointing at
-- another room). Each type and field goes through custom.context_type_write / context_item_write:
-- in the store first where the store writes the organization's scopes, the old tables its image,
-- and no template path writes context.* by itself. Harbor Point Validation, an older organization,
-- applies the same template the old way round (old tables, a follow row queued).
--
-- Organizations and templates' results are synthesized and rolled back. Nothing of the owner's is read or written.
--
-- WHAT MAKES IT FAIL (RED before scopestails_a_template_is_applied_through_the_store_doors.sql):
--   A1  the template door custom.context_template_define exists and is a declared door
--   A2  no template path writes a context table itself: neither custom.context_template_apply nor
--       public.apply_template_definition calls public.apply_template or inserts into context.*
--   A3  the Dental Practice template, through custom.context_template_apply in a store organization:
--       every type a Table, every field a Field, Reports To a relation to another team member
--   A4  a definition through public.apply_template_definition: the child type is made with its parent,
--       the reference field points at the type its reference_type_key names, all in the store
--   A5  an older organization applies the template through the same door: old tables, follow row, no Table
--   A6  a stranger (test@test.com) is refused in the template door's own name

\set ON_ERROR_STOP on
\timing off
\set suite 'scopestails_templates_through_the_doors_red_green.sql'
\set requires 'relation:custom.io_outbox|function:custom.context_template_apply|function:custom.context_writer'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '240s';

create temp table sf (k text primary key, v uuid) on commit drop;

do $fixture$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_new uuid := gen_random_uuid();
  v_def uuid := gen_random_uuid();
  v_old uuid := gen_random_uuid();
begin
  perform set_config('app.actor_system', 'campaign-test/scopestails', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_new, 'Lakeshore Pediatric Dentistry ' || substr(v_new::text, 1, 6), 'lakeshore-peds-' || substr(v_new::text, 1, 8), 'LPD', c_admin),
    (v_def, 'Tidewater Orthodontics ' || substr(v_def::text, 1, 6), 'tidewater-ortho-' || substr(v_def::text, 1, 8), 'TWO', c_admin),
    (v_old, 'Harbor Point Validation ' || substr(v_old::text, 1, 6), 'harbor-point-val-' || substr(v_old::text, 1, 8), 'HPV', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_new, 'organization', v_new, c_admin, 'owner', 'active'),
    (v_def, 'organization', v_def, c_admin, 'owner', 'active'),
    (v_old, 'organization', v_old, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'scopes_written_in_the_store', 'organization', v_old, v_old, 'false'::jsonb, 'scopestails suite: an organization that existed before the switch');
  insert into sf values ('new', v_new), ('def', v_def), ('old', v_old);
end
$fixture$;

do $t$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_new uuid; v_def uuid; v_old uuid; v_tmpl uuid; v_team uuid; v_loc uuid; v_room uuid;
  v_out jsonb; v_msg text; v_n int; v_red text[] := '{}';
begin
  select v into v_new from sf where k = 'new'; select v into v_def from sf where k = 'def'; select v into v_old from sf where k = 'old';
  select t.id into v_tmpl from context.templates t where t.name = 'Dental Practice' and t.is_active;
  if v_tmpl is null then raise exception 'FIXTURE: the Dental Practice template is not on this database'; end if;
  if custom.context_writer(v_new) <> 'store' or custom.context_writer(v_old) <> 'old' then
    raise exception 'FIXTURE: Lakeshore writes in %, Harbor Point in %', custom.context_writer(v_new), custom.context_writer(v_old);
  end if;

  -- ══ A1 ══
  if to_regprocedure('custom.context_template_define(uuid, jsonb)') is null
     or not exists (select 1 from platform.client_callable_door d where d.schema_name = 'custom' and d.function_name = 'context_template_define') then
    v_red := v_red || 'A1 RED: there is no declared template door custom.context_template_define'::text;
  end if;
  -- ══ A2 ══
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname || '.' || p.proname in ('custom.context_template_apply', 'public.apply_template_definition')
     and (p.prosrc ~* 'apply_template\s*\(' or p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(context\.)?(scope_types|scopes|context_items|context_item_values)\M');
  if v_n > 0 then
    v_red := v_red || format('A2 RED: %s template path(s) still write context.* themselves (public.apply_template or a direct insert)', v_n);
  end if;
  if array_length(v_red, 1) > 0 then
    raise exception '%', array_to_string(v_red, E'\n');
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated', 'session_id', 'scopestails')::text, true);
  perform set_config('role', 'authenticated', true);

  -- ══ A3: Dental Practice, store organization ══
  v_out := custom.context_template_apply(v_new, v_tmpl);
  perform set_config('role', 'none', true);
  if v_out ->> 'writer' <> 'store' or (v_out ->> 'template_id')::uuid <> v_tmpl or jsonb_array_length(v_out -> 'scope_types_created') = 0 then
    raise exception 'A3: the template door answered %', v_out;
  end if;
  select count(*) into v_n from context.scope_types t
   where t.organization_id = v_new and t.deleted_at is null
     and not exists (select 1 from custom.record r where r.organization_id = v_new and r.id = t.id and r.data_class = 'table' and r.deleted_at is null);
  if v_n <> 0 then raise exception 'A3: % of the template''s types are not Tables in the store', v_n; end if;
  select count(*) into v_n from context.context_items i join context.scope_types t on t.id = i.scope_type_id
   where t.organization_id = v_new
     and not exists (select 1 from custom.record r where r.organization_id = v_new and r.id = i.id and r.data_class = 'field');
  if v_n <> 0 then raise exception 'A3: % of the template''s fields are not Fields in the store', v_n; end if;
  if (v_out ->> 'context_items_count')::int <> (select count(*) from context.context_items i join context.scope_types t on t.id = i.scope_type_id where t.organization_id = v_new) then
    raise exception 'A3: the door counted % fields but % landed', v_out ->> 'context_items_count',
      (select count(*) from context.context_items i join context.scope_types t on t.id = i.scope_type_id where t.organization_id = v_new);
  end if;
  select t.id into v_team from context.scope_types t where t.organization_id = v_new and t.label_plural = 'Team Members';
  if not exists (select 1 from custom.record f where f.organization_id = v_new and f.data_class = 'field'
                   and f.data ->> 'entity_definition_id' = v_team::text and f.data ->> 'key' = 'reports_to'
                   and f.data ->> 'type' = 'relation' and f.data ->> 'relation_target' = v_team::text) then
    raise exception 'A3: Team Members'' "Reports To" is not a relation to another team member in the store';
  end if;
  if exists (select 1 from custom.io_outbox x where x.organization_id = v_new and x.event_key = 'context.follow' and x.consumed_at is null) then
    raise exception 'A3: a store organization''s template queued a follow row (the store is written first, nothing waits)';
  end if;

  -- ══ A4: a definition, through public.apply_template_definition (no client grant: the server's own
  -- connection, acting for the signed-in owner) ══
  perform set_config('role', 'none', true);
  v_out := public.apply_template_definition(v_def, jsonb_build_object('scope_types', jsonb_build_array(
    jsonb_build_object('key', 'room', 'singular', 'Treatment Room', 'plural', 'Treatment Rooms', 'parent_key', 'location', 'icon', 'door-open',
      'fields', jsonb_build_array(
        jsonb_build_object('key', 'chair_model', 'display_name', 'Chair model'),
        jsonb_build_object('key', 'backup_room', 'display_name', 'Backup Room', 'value_type', 'reference', 'reference_type_key', 'room'))),
    jsonb_build_object('key', 'location', 'singular', 'Location', 'plural', 'Locations', 'description', 'Each office the practice runs',
      'fields', jsonb_build_array(jsonb_build_object('key', 'street_address', 'display_name', 'Street address'))))));
  perform set_config('role', 'none', true);
  select t.id into v_loc from context.scope_types t where t.organization_id = v_def and t.label_plural = 'Locations';
  select t.id into v_room from context.scope_types t where t.organization_id = v_def and t.label_plural = 'Treatment Rooms';
  if v_loc is null or v_room is null or (select parent_type_id from context.scope_types where id = v_room) is distinct from v_loc then
    raise exception 'A4: the definition answered %; Treatment Rooms is not inside Locations', v_out;
  end if;
  if v_out ? 'writer' or (v_out ->> 'context_items_count')::int <> 3 then
    raise exception 'A4: public.apply_template_definition kept its old answer shape? %', v_out;
  end if;
  if not exists (select 1 from custom.record f where f.organization_id = v_def and f.data_class = 'field'
                   and f.data ->> 'key' = 'backup_room' and f.data ->> 'type' = 'relation' and f.data ->> 'relation_target' = v_room::text)
     or not exists (select 1 from custom.record r where r.organization_id = v_def and r.id = v_loc and r.data_class = 'table') then
    raise exception 'A4: the definition''s types and its Backup Room relation are not in the store';
  end if;

  -- ══ A5: an older organization, the same door ══
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated', 'session_id', 'scopestails')::text, true);
  perform set_config('role', 'authenticated', true);
  v_out := custom.context_template_apply(v_old, v_tmpl);
  perform set_config('role', 'none', true);
  if v_out ->> 'writer' <> 'old'
     or not exists (select 1 from context.scope_types t where t.organization_id = v_old and t.label_plural = 'Team Members')
     or exists (select 1 from custom.record r join context.scope_types t on t.id = r.id where t.organization_id = v_old and r.organization_id = v_old)
     or not exists (select 1 from custom.io_outbox x where x.organization_id = v_old and x.event_key = 'context.follow' and x.consumed_at is null) then
    raise exception 'A5: the older organization''s template did not land the old way round (%)', v_out;
  end if;

  -- ══ A6: a stranger, refused in the door's own name ══
  perform set_config('request.jwt.claims', json_build_object('sub', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'role', 'authenticated', 'session_id', 'scopestails')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform custom.context_template_define(v_new, '{"scope_types": [{"singular": "Insurer", "plural": "Insurers"}]}'::jsonb);
    perform set_config('role', 'none', true);
    raise exception 'A6 RED: a stranger applied a template to Lakeshore';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    perform set_config('role', 'none', true);
    if v_msg not like '%custom.context_template_define%' then
      raise exception 'A6: the stranger was refused, but not in the template door''s name: %', v_msg;
    end if;
  end;
  perform set_config('role', 'none', true);

  raise notice 'GREEN A1–A6: a template is applied through the store''s scope doors — the catalogue''s Dental Practice and a definition with a parent and a reference land as Tables and Fields first where the store writes, the old way round in an older organization, and no template path writes context.* by itself.';
end
$t$;

rollback;
