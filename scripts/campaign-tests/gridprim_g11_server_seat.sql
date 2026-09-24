-- LANE GRID-PRIMITIVES, G11 — A SCOPE MADE BY THE SERVER PROVISIONS ITS TABLE IN THE STORE.
--
-- THE USE CASE: admin's Workspace (admin@admin.com's own organization, moved into the record
-- store by OLD-TABLES-4 — `data_tables/older_tables_moved` is on and it has its Home) keeps a
-- "Service van" scope per van, and each van gets a "Van inspection" table from the
-- organization's template. Vans are added three ways:
--   ORM       aidream's Matrx ORM — a connection that authenticated as the store's owner, no
--             JWT (what `aidream` does for every server write);
--   SERVICE   the service-role key (PostgREST `service_role`, the frontend's admin client), no
--             person signed in — REFUSED BY DESIGN (ruling 2026-09-24): the store's standing rule
--             is that the server writes as the store owner or as the person, so this insert must
--             be refused with the organization wall's named sentence and keep nothing;
--   MEMBER    admin@admin.com from the browser (the member's own seat).
-- WHAT MAKES IT FAIL: an ORM or MEMBER insert that is rolled back, or whose van gets an older
-- dataset or no store Table; a SERVICE insert that is KEPT, or refused with any other sentence
-- (a silent pass-through would mean the wall was widened).

\set ON_ERROR_STOP on
\timing off
\set suite 'gridprim_g11_server_seat.sql'
\set requires 'function:custom.scope_table_provision|relation:workbench.udt_dataset_templates'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid; v_type uuid; v_tpl uuid; v_item uuid; v_scope uuid; v_tbl uuid; v_n integer;
  v_seat text; v_fail text := '';
begin
  -- The moved organization this lane proves against: admin's own Workspace, found by fact.
  select o.scope_id into v_org from platform.knob_override o
   join iam.memberships m on m.organization_id = o.scope_id and m.container_type = 'organization' and m.user_id = c_admin and m.role::text = 'owner'
   where o.feature = 'data_tables' and o.key = 'older_tables_moved' and o.scope_kind = 'organization'
     and o.value = 'true'::jsonb
   limit 1;
  if v_org is null then
    raise notice 'SKIP — no organization owned by admin@admin.com has moved into the record store here.';
    return;
  end if;

  insert into context.scope_types (organization_id, label_singular, label_plural, slug)
  values (v_org, 'Service van', 'Service vans', 'service-van-' || substr(md5(clock_timestamp()::text), 1, 8)) returning id into v_type;
  insert into workbench.udt_dataset_templates (organization_id, name, description, created_by)
  values (v_org, 'Van inspection', 'The weekly walk-around of a service van', c_admin) returning id into v_tpl;
  insert into workbench.udt_dataset_template_fields (template_id, field_name, display_name, data_type, field_order, is_required) values
    (v_tpl, 'inspected_on', 'Inspected on', 'date', 0, true),
    (v_tpl, 'odometer', 'Odometer (mi)', 'integer', 1, false),
    (v_tpl, 'tires_ok', 'Tires OK', 'boolean', 2, false),
    (v_tpl, 'notes', 'Notes', 'string', 3, false);
  insert into context.context_items (key, display_name, scope_type_id, slug, value_type, allowed_reference_types, max_items, reference_source)
  values ('van_inspection', 'Van inspection', v_type, 'van-inspection-' || substr(v_type::text, 1, 8),
          'reference', array['table'], 1, jsonb_build_object('container_type', 'dataset_template', 'template_id', v_tpl))
  returning id into v_item;

  foreach v_seat in array array['ORM', 'SERVICE', 'MEMBER'] loop
    begin
      perform set_config('role', 'none', true);
      perform set_config('request.jwt.claims', '', true);
      if v_seat = 'SERVICE' then
        perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
        perform set_config('role', 'service_role', true);
      elsif v_seat = 'MEMBER' then
        perform set_config('request.jwt.claims', c_admin_j, true);
        perform set_config('role', 'authenticated', true);
      end if;
      insert into context.scopes (organization_id, scope_type_id, name, slug)
      values (v_org, v_type, 'Van ' || v_seat || ' — Ford Transit 250',
              'van-' || lower(v_seat) || '-' || substr(v_type::text, 1, 8))
      returning id into v_scope;
      perform set_config('role', 'none', true);
      select count(*) into v_n from context.scope_dataset_instances i where i.context_item_id = v_item and i.scope_id = v_scope;
      select t.id into v_tbl from custom.record t where t.organization_id = v_org and t.table_id = custom.table_kernel_id()
         and t.deleted_at is null and t.data -> 'scope_binding' ->> 'scope_id' = v_scope::text;
      if v_seat = 'SERVICE' then
        v_fail := v_fail || ' SERVICE: the service-role insert was KEPT — the organization wall was widened;';
      elsif v_tbl is null or v_n <> 0 then
        v_fail := v_fail || format(' %s: store Table %s, older datasets %s;', v_seat, coalesce(v_tbl::text, 'none'), v_n);
      else
        raise notice '% PASS — the van was kept and its "Van inspection" table is in the store (%).', v_seat, v_tbl;
      end if;
    exception when others then
      perform set_config('role', 'none', true);
      if v_seat = 'SERVICE' and sqlstate = '42501'
         and sqlerrm = 'You are not a member of that organization, so custom.scope_table_provision has nothing to do there.' then
        raise notice 'SERVICE PASS (refused by design) — %', sqlerrm;
      else
        v_fail := v_fail || format(' %s: the insert was ROLLED BACK — %s (%s);', v_seat, sqlerrm, sqlstate);
      end if;
    end;
  end loop;
  perform set_config('role', 'none', true);
  if v_fail <> '' then raise exception 'G11-SERVER:%', v_fail; end if;
  raise notice 'GRIDPRIM G11 SERVER SEAT GREEN — ORM and member keep the van and land its table in the store; the service-role key is refused with the wall''s sentence and keeps nothing.';
end $t$;
rollback;
