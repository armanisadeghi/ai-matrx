-- based-on: workbench.udt_assign_autonumbers() d886ab01353864f8ff944aadfa9fd13b3b85808061360433faa67ea32c06f107
-- ============================================================================
-- udt_computed_columns_are_never_written
-- ============================================================================
-- Closes the last open door on computed columns (handoff item "udt_upsert_cell
-- still accepts a write into a formula column"): every CLIENT path already
-- refuses, but a raw RPC / bulk write / import could still store a value in a
-- column the table fills in itself. Fixed at the one place every door passes:
-- the row trigger.
--
--   INSERT  — formula / created_time / modified_time keys are removed from
--             `data` (those columns store nothing); each autonumber column
--             gets its number (unchanged behaviour).
--   UPDATE  — the same keys are removed; an autonumber column keeps the number
--             it already has (a number, once assigned, never changes). A row
--             that has NO number yet may receive one — that is the backfill.
--
-- Additive: one function body replaced (its own, created 2026-09-21) and one
-- new trigger. Nothing is dropped or revoked.
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
      -- Computed on read; the cell stores nothing, whoever asked.
      new.data := coalesce(new.data, '{}'::jsonb) - f.field_name;
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

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'workbench.udt_dataset_rows'::regclass and tgname = '_udt_computed_on_update'
  ) then
    create trigger _udt_computed_on_update
      before update of data on workbench.udt_dataset_rows
      for each row execute function workbench.udt_assign_autonumbers();
  end if;
end $$;
