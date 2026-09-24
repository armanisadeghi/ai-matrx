-- target: branch,production
-- additive: yes
--   It ADDS one function, `custom.table_list_everywhere`, and its `platform.client_callable_door`
--   row. Nothing existing is replaced, dropped or revoked; no table, column, trigger, policy or
--   grant is touched; nothing is written by the door. The inverse is
--   `migrations/inverse/gridprim_every_picker_lists_both_stores_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
--
-- LANE GRID-PRIMITIVES, G9 (CUTOVER-PLAN.md row F1) — EVERY TABLE PICKER LISTS BOTH STORES.
--
-- `features/data-tables/service.ts listUserTables` → `public.get_user_tables()` is the list behind
-- every table picker on the platform (the scheduler's event form, agent resources, the zip-code
-- heatmap, Append to table, Save table). It reads the OLDER store only, so the moment an
-- organization's table moves into the record store it vanishes from every one of them.
--
-- `custom.table_list_everywhere(org)` answers the SAME shape `get_user_tables` answers —
-- `{success, tables: [{id, table_name, description, version, user_id, organization_id,
-- created_at, updated_at, last_activity_at, row_count, field_count, …}]}` — so a picker swaps one
-- call and keeps its code, with one key more: `store` = `older` | `records`, which is what
-- `features/data-tables/data-source/table-home.ts` needs to open it. The older half is exactly the
-- older list (the caller's own live datasets), narrowed to this organization; a moved table is
-- archived there, so it appears once, from the store. The store half is every Table of the
-- organization this person may open (custom.query_visible_ids), never one they may not.
--
-- LOCKS. create function / insert / comment on only. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create function custom.table_list_everywhere(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me     uuid := custom.query_principal();
  v_tables jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_list_everywhere');

  with visible as (
    select v as id from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v
  ),
  store as (
    select jsonb_build_object(
             'id', t.id,
             'table_name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'),
             'description', t.data ->> 'description',
             'version', t.version,
             'user_id', t.created_by,
             'is_public', false,
             'visibility', t.visibility::text,
             'organization_id', t.organization_id,
             'created_at', t.created_at,
             'updated_at', t.updated_at,
             'last_activity_at', greatest(t.updated_at,
                                   (select max(r.updated_at) from custom.record r
                                     where r.organization_id = t.organization_id and r.table_id = t.id)),
             'row_count', (select count(*) from custom.record r
                            where r.organization_id = t.organization_id and r.table_id = t.id
                              and r.data_class = 'record' and r.deleted_at is null),
             'field_count', (select count(*) from custom.record f
                              where f.organization_id = t.organization_id and f.table_id = custom.field_kernel_id()
                                and f.data_class = 'field' and f.deleted_at is null
                                and f.data ->> 'entity_definition_id' = t.id::text),
             'store', 'records') as doc
      from custom.record t
      join visible v on v.id = t.id
     where t.organization_id = p_organization_id
       and t.table_id = custom.table_kernel_id()
       and t.data_class = 'table'
       and t.deleted_at is null
  ),
  older as (
    select jsonb_build_object(
             'id', ut.id, 'table_name', ut.table_name, 'description', ut.description,
             'version', ut.version, 'user_id', ut.user_id, 'is_public', ut.is_public,
             'row_ordering_config', ut.row_ordering_config, 'visibility', ut.visibility::text,
             'organization_id', ut.organization_id, 'created_at', ut.created_at,
             'updated_at', ut.updated_at,
             'last_activity_at', greatest(ut.updated_at, ut.created_at,
                                   (select max(r.updated_at) from workbench.udt_dataset_rows r where r.table_id = ut.id),
                                   (select max(f.updated_at) from workbench.udt_dataset_fields f where f.table_id = ut.id)),
             'row_count', (select count(*) from workbench.udt_dataset_rows where table_id = ut.id),
             'field_count', (select count(*) from workbench.udt_dataset_fields where table_id = ut.id),
             'store', 'older') as doc
      from workbench.udt_datasets ut
     where ut.user_id = v_me
       and ut.organization_id = p_organization_id
       and ut.deleted_at is null
  )
  select coalesce(jsonb_agg(x.doc order by (x.doc ->> 'last_activity_at') desc nulls last,
                                           (x.doc ->> 'created_at') desc), '[]'::jsonb)
    into v_tables
    from (select doc from store union all select doc from older) x;

  return jsonb_build_object('success', true, 'tables', v_tables);
end
$fn$;

comment on function custom.table_list_everywhere(uuid) is
  'GRID-PRIMITIVES G9: every table a picker may offer in this organization, from BOTH stores, in get_user_tables'' own shape plus `store` (older | records): the caller''s own live older datasets of this organization, and every record-store Table they may open. A moved table appears once, from the store.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'table_list_everywhere', 'p_organization_id uuid', array['uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach before anything is read. The store half is narrowed to custom.query_visible_ids(org, table kernel), so it never names a Table the caller could not open; the older half is the caller''s OWN datasets (user_id = the signed-in person) of this organization, exactly what public.get_user_tables already hands them. It returns table names and counts, never a row, and writes nothing.',
        'gridprim_every_picker_lists_both_stores.sql', null, true, false,
        jsonb_build_object('version', 1, 'declared_by', 'gridprim_every_picker_lists_both_stores.sql',
          'declared_at', '2026-09-23 lane GRID-PRIMITIVES',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
              'check', 'this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-23 lane GRID-PRIMITIVES — written with this body'))))
on conflict do nothing;
