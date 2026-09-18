-- DD-209 (V-102 F2) — the recipes that were blocked by a false measurement.
--
-- THE DEFECT IN MY OWN WORK. Six doors shipped with a declared `probe_args` note
-- asserting a MEASURED fact — "this table holds no row in any organization the test
-- callers lack standing in" — and for four tables that fact was false. Counted live on
-- 2026-09-14, excluding BOTH callers' organizations and the system organization:
--
--     canvas.canvas_items     872        (declared 0)
--     workbench.udt_datasets  144        (declared 0)
--     seo.starter_pack          7        (declared 0)
--     rag.data_stores           6        (declared 0)
--
-- The count was taken against the VICTIM identity's twelve organizations, not against
-- "every organization the callers have no standing in" — so a table whose rows live in a
-- THIRD tenant read as empty. An UNMEASURED door wearing a declared, measured-sounding
-- excuse that is not true is worse than one wearing no excuse at all, because a reader
-- stops asking. That is the DD-209 failure shape committed by the DD-209 lane.
--
-- The harness half is fixed in `scripts/check-door-rows.ts`: an `other_row:` verb now
-- looks in every organization neither caller belongs to (the victim's own first, the
-- system organization never), because a row in a third tenant is exactly as far across
-- the boundary as one of the victim's. This file is the recipes that unlocks.
--
-- SIX FALSE NOTES CORRECTED, and the rest of their families closed with them — the same
-- four tables block eight more doors that were sitting on "argument(s) not derivable"
-- with no note at all.

create temporary table dd209b_recipe (fn text, args text, recipe jsonb) on commit drop;

insert into dd209b_recipe (fn, args, recipe) values

-- canvas.canvas_items — 872 rows across the boundary.
('public.cx_canvas_save_user_version', 'p_user_id uuid, p_canvas_id uuid, p_title text, p_content jsonb',
 '{"args":{"p_user_id":"victim_user","p_canvas_id":"other_row:canvas.canvas_items"},"note":"Both arguments cross: p_user_id is the DD-192 class 1 identity-swap shape and p_canvas_id names a canvas in an organization the caller has no standing in. The earlier note on this row claimed canvas.canvas_items held no row across the boundary; it holds 872 (corrected 2026-09-14, V-102 F2)."}'),

-- workbench.udt_datasets — 144 rows across the boundary. The whole user-defined-table family.
('public.udt_upsert_row', 'p_table_id uuid, p_row_id uuid, p_data jsonb',
 '{"args":{"p_table_id":"other_row:workbench.udt_datasets","p_row_id":"other_row:workbench.udt_dataset_rows","p_data":"literal:{}"},"note":"Writing a row into another organization user-defined table. The earlier note claimed workbench.udt_datasets held no row across the boundary; it holds 144 (corrected 2026-09-14, V-102 F2)."}'),
('public.udt_bulk_write', 'p_table_id uuid, p_operations jsonb',
 '{"args":{"p_table_id":"other_row:workbench.udt_datasets","p_operations":"literal:[]"},"note":"An empty operation list still reaches the door own standing check on the table, which is the thing being measured. The earlier note claimed workbench.udt_datasets held no row across the boundary; it holds 144 (corrected 2026-09-14, V-102 F2)."}'),
('public.udt_upsert_cell', 'p_table_id uuid, p_row_id uuid, p_field_name text, p_value jsonb',
 '{"args":{"p_table_id":"other_row:workbench.udt_datasets","p_row_id":"other_row:workbench.udt_dataset_rows","p_value":"literal:{}"},"note":"Writing one cell of another organization user-defined table; p_field_name is left to ordinary derivation because the door checks the table before the field."}'),
('public.udt_change_field_type', 'p_table_id uuid, p_field_id uuid, p_new_type field_data_type, p_strategy text',
 '{"args":{"p_table_id":"other_row:workbench.udt_datasets","p_field_id":"other_row:workbench.udt_dataset_fields","p_new_type":"literal:string","p_strategy":"literal:cast"},"note":"Retyping a column of another organization user-defined table is a destructive cross-boundary write; string is a real field_data_type label."}'),
('public.add_data_row_to_user_table', 'p_table_id uuid, p_data jsonb',
 '{"args":{"p_table_id":"other_row:workbench.udt_datasets","p_data":"literal:{}"},"note":"Adding a row to another organization user-defined table."}'),
('public.update_user_table_config', 'p_table_id uuid, p_table_updates jsonb, p_field_updates jsonb',
 '{"args":{"p_table_id":"other_row:workbench.udt_datasets","p_table_updates":"literal:{}","p_field_updates":"literal:[]"},"note":"Reconfiguring another organization user-defined table."}'),
('public.update_user_table_default_sort', 'p_table_id uuid, p_sort_field text, p_sort_direction text',
 '{"args":{"p_table_id":"other_row:workbench.udt_datasets","p_sort_direction":"literal:asc"},"note":"Changing another organization user-defined table default sort."}'),
('public.update_user_table_metadata', 'p_table_id uuid, p_table_name text, p_description text, p_is_public boolean, p_authenticated_read boolean',
 '{"args":{"p_table_id":"other_row:workbench.udt_datasets"},"note":"Renaming another organization user-defined table, or flipping it public — the visibility arguments make this the most dangerous door of the family."}'),

-- rag.data_stores — 6 rows across the boundary.
('rag.fn_get_user_data_store', 'p_store_id uuid, p_member_limit integer',
 '{"args":{"p_store_id":"other_row:rag.data_stores"},"note":"Reading another organization data store, its members and its documents. The earlier note claimed rag.data_stores held no row across the boundary; it holds 6 (corrected 2026-09-14, V-102 F2)."}'),
('rag.fn_data_store_members_rich', 'p_store_id uuid',
 '{"args":{"p_store_id":"other_row:rag.data_stores"},"note":"The member roster of another organization data store — names and emails. The earlier note claimed rag.data_stores held no row across the boundary; it holds 6 (corrected 2026-09-14, V-102 F2)."}'),
('rag.library_subscribe', 'p_store_id uuid, p_organization_id uuid, p_actor uuid',
 '{"args":{"p_store_id":"other_row:rag.data_stores","p_organization_id":"other_org","p_actor":"victim_user"},"note":"Subscribing an organization the caller has no standing in to a library they cannot open."}'),
('rag.library_unsubscribe', 'p_store_id uuid, p_organization_id uuid, p_actor uuid',
 '{"args":{"p_store_id":"other_row:rag.data_stores","p_organization_id":"other_org","p_actor":"victim_user"},"note":"Unsubscribing an organization the caller has no standing in from a library they cannot open."}'),
('rag.library_grant_publish', 'p_store_id uuid, p_audience text, p_industry_id uuid, p_organization_id uuid, p_actor uuid',
 '{"args":{"p_store_id":"other_row:rag.data_stores","p_audience":"literal:organization","p_organization_id":"other_org","p_actor":"victim_user"},"note":"Publishing another organization library to an audience. p_industry_id is left to derivation: iam.industries still holds no row across the boundary."}'),

-- seo.starter_pack — 7 rows across the boundary.
('seo.starter_pack_detail', 'p_pack_id uuid',
 '{"args":{"p_pack_id":"other_row:seo.starter_pack"},"note":"The contents of another organization starter pack. The earlier note claimed seo.starter_pack held no row across the boundary; it holds 7 (corrected 2026-09-14, V-102 F2)."}'),
('seo.starter_pack_preview', 'p_site_id uuid, p_pack_id uuid, p_start date, p_end date, p_item_ids uuid[], p_sample integer',
 '{"args":{"p_pack_id":"other_row:seo.starter_pack","p_item_ids":"other_row:seo.starter_pack_item"},"note":"Previewing another organization starter pack against a site; p_site_id is left to ordinary derivation, which already finds a live web.site across the boundary."}');

update platform.client_callable_door d
   set probe_args = r.recipe
  from dd209b_recipe r
 where d.schema_name || '.' || d.function_name = r.fn
   and d.identity_args = r.args;

do $$
declare v_missed text;
begin
  select string_agg(format('%s(%s)', r.fn, r.args), E'\n  ') into v_missed
    from dd209b_recipe r
   where not exists (
     select 1 from platform.client_callable_door d
      where d.schema_name || '.' || d.function_name = r.fn and d.identity_args = r.args);
  if v_missed is not null then
    raise exception E'DD-209: these recipes name no live declared door, so they would never be read:\n  %', v_missed;
  end if;
end $$;

-- And the assertion the last file could not make: no shipped note may claim a table is
-- empty across the boundary when it is not. This is a one-off check of the four tables
-- V-102 disproved, so the corrected rows cannot silently regress in this migration.
do $$
declare v_bad text;
begin
  select string_agg(format('%s.%s(%s)', d.schema_name, d.function_name, d.identity_args), E'\n  ')
    into v_bad
    from platform.client_callable_door d
   where d.probe_args->>'note' ~ '(canvas\.canvas_items|workbench\.udt_datasets|seo\.starter_pack|rag\.data_stores) (holds|is)'
     and d.probe_args->>'note' ~ 'no row'
     and d.probe_args->>'note' !~ 'corrected 2026-09-14';
  if v_bad is not null then
    raise exception E'DD-209: a door row still declares one of the four disproved tables empty across the boundary:\n  %', v_bad;
  end if;
end $$;
