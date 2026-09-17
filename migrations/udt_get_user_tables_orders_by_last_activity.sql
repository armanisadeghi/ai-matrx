-- get_user_tables: the Data page (and every table picker) lists the tables you
-- touched most recently FIRST.
--
-- Arman, 2026-09-17: "fix the initial page to automatically sort tables by the
-- most recently updated as the default. right now, it might be using the
-- creation date instead." It was: `order by ut.created_at desc`.
--
-- Ordering by `udt_datasets.updated_at` alone would still be wrong: that stamp
-- moves only when the DATASET row changes (rename, description, settings).
-- Editing a cell, adding a row or changing a column touches
-- `udt_dataset_rows` / `udt_dataset_fields` and leaves it where it was — so the
-- table someone worked in all morning would sit under one they renamed last
-- month. "Recently updated" is therefore the newest of the three stamps, and it
-- is RETURNED as `last_activity_at` so the card can say the same date the
-- order was decided by (a list sorted by one date and labelled with another is
-- a screen that lies).
--
-- Same cost class as before: the function already runs a per-table count(*)
-- over rows and over fields; the max() rides the same table_id lookups.
-- Shape is additive — every existing key is unchanged, one key is added.

-- based-on: public.get_user_tables() 6ce80255532a3baa3d9c0d2ca7512d036c05360b1de5466a6ff955fc19cab094

create or replace function public.get_user_tables()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_result jsonb;
begin
    select jsonb_agg(jsonb_build_object(
        'id', t.id, 'table_name', t.table_name, 'description', t.description, 'version', t.version,
        'user_id', t.user_id, 'is_public', t.is_public, 'row_ordering_config', t.row_ordering_config,
        'visibility', t.visibility::text,
        'organization_id', t.organization_id,
        'created_at', t.created_at, 'updated_at', t.updated_at,
        'last_activity_at', t.last_activity_at,
        'row_count', t.row_count,
        'field_count', t.field_count
    ) order by t.last_activity_at desc, t.created_at desc) into v_result
    from (
        select ut.*,
               (select count(*) from workbench.udt_dataset_rows where table_id = ut.id) as row_count,
               (select count(*) from workbench.udt_dataset_fields where table_id = ut.id) as field_count,
               greatest(
                   ut.updated_at,
                   ut.created_at,
                   (select max(r.updated_at) from workbench.udt_dataset_rows r where r.table_id = ut.id),
                   (select max(f.updated_at) from workbench.udt_dataset_fields f where f.table_id = ut.id)
               ) as last_activity_at
        from workbench.udt_datasets ut
        where ut.user_id = (select auth.uid())
          and ut.deleted_at is null
    ) t;
    return jsonb_build_object('success', true, 'tables', coalesce(v_result, '[]'::jsonb));
end;
$function$;
