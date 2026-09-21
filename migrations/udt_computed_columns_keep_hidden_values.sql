-- based-on: workbench.udt_assign_autonumbers() 12a6a07400075e79139ead578d34e2e2cfb6d5b0d39d98c11d988c132f8d97f1
-- ============================================================================
-- udt_computed_columns_keep_hidden_values
-- ============================================================================
-- Corrects udt_computed_columns_are_never_written (applied 40 minutes earlier,
-- same session): it REMOVED a computed column's key on every update. A column
-- that was plain text and later became a formula still holds its old values
-- (hidden by the format); removing them on the next row edit would silently
-- destroy data that switching the format back is promised to reveal. The rule
-- is now: no door may CHANGE a computed cell — insert stores nothing, update
-- keeps exactly what was there. One function body; additive.
-- ============================================================================

create or replace function workbench.udt_assign_autonumbers()
returns trigger
language plpgsql
security definer
set search_path to 'workbench', 'public', 'pg_temp'
as $function$
declare
  f record;
  v_next bigint;
  v_kind text;
begin
  for f in
    select id, field_name, metadata->'format'->>'id' as format_id
    from workbench.udt_dataset_fields
    where table_id = new.table_id
      and deleted_at is null
      and metadata->'format'->>'id' in ('autonumber', 'formula', 'created_time', 'modified_time')
    order by field_order
  loop
    v_kind := f.format_id;

    if v_kind <> 'autonumber' then
      -- Computed on read: no door may WRITE this cell. On insert the key is
      -- simply not stored. On update the cell keeps exactly what it held
      -- before — which matters when a column that used to be plain text was
      -- turned into a formula: its old values are hidden, not gone, and
      -- switching the format back must still reveal them (the promise
      -- `setFieldFormat` makes: changing a format never risks the data).
      if tg_op = 'UPDATE' and old.data ? f.field_name then
        new.data := coalesce(new.data, '{}'::jsonb)
          || jsonb_build_object(f.field_name, old.data->f.field_name);
      else
        new.data := coalesce(new.data, '{}'::jsonb) - f.field_name;
      end if;
      continue;
    end if;

    if tg_op = 'UPDATE' then
      if (old.data->>f.field_name) ~ '^[0-9]{1,18}$' then
        new.data := coalesce(new.data, '{}'::jsonb)
          || jsonb_build_object(f.field_name, old.data->f.field_name);
      end if;
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended('udt_autonumber:' || f.id::text, 0));
    select coalesce(max((r.data->>f.field_name)::bigint), 0) + 1
      into v_next
      from workbench.udt_dataset_rows r
      where r.table_id = new.table_id
        and (r.data->>f.field_name) ~ '^[0-9]{1,18}$';
    new.data := coalesce(new.data, '{}'::jsonb) || jsonb_build_object(f.field_name, v_next);
  end loop;
  return new;
end;
$function$;
