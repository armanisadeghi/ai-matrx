-- chair-step: the only non-additive statements are REVOKE EXECUTE on the two functions THIS FILE CREATES (removing the default PUBLIC execute before the explicit grant, per db-rules 6d-4); no existing object loses a privilege and nothing is dropped
-- ============================================================================
-- udt_autonumber_column — Autonumber columns for user data tables
-- ============================================================================
-- A column whose display format is `autonumber` (udt_dataset_fields.metadata
-- ->'format'->>'id') gets a number assigned BY THE DATABASE at insert, so it
-- is identical no matter which door made the row (grid, row form, paste,
-- bulk write, import, agent, API) and never depends on a client counter.
--
--   * Trigger `_udt_autonumber` (BEFORE INSERT on workbench.udt_dataset_rows)
--     writes next = 1 + the highest number ever stored in that column for the
--     table — soft-deleted rows INCLUDED, so deleting a row never frees its
--     number. A caller-supplied value for the column is overwritten: it is
--     never typed. Per-field advisory lock, so two concurrent inserts cannot
--     draw the same number. Rows already processed by the same multi-row
--     statement are visible to a BEFORE ROW trigger, so a bulk insert numbers
--     consecutively.
--     Documented limit: HARD-deleting the highest-numbered row frees that one
--     number (there is no separate high-water mark — that would need a write
--     to the field row on every insert, which fires its version triggers).
--   * Door `public.udt_backfill_autonumber(table, field)` numbers the rows
--     that existed before the column did, oldest first, continuing after the
--     current highest. Editor access required. Idempotent.
--
-- The trigger costs one indexed lookup on a table with no autonumber column.
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
begin
  for f in
    select id, field_name
    from workbench.udt_dataset_fields
    where table_id = new.table_id
      and deleted_at is null
      and metadata->'format'->>'id' = 'autonumber'
    order by field_order
  loop
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

revoke execute on function workbench.udt_assign_autonumbers() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'workbench.udt_dataset_rows'::regclass and tgname = '_udt_autonumber'
  ) then
    create trigger _udt_autonumber
      before insert on workbench.udt_dataset_rows
      for each row execute function workbench.udt_assign_autonumbers();
  end if;
end $$;

create or replace function public.udt_backfill_autonumber(
  p_table_id uuid,
  p_field_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_field_name text;
  v_start bigint;
  v_numbered integer;
begin
  if auth.uid() is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  select field_name into v_field_name
  from workbench.udt_dataset_fields
  where id = p_field_id
    and table_id = p_table_id
    and deleted_at is null
    and metadata->'format'->>'id' = 'autonumber';
  if v_field_name is null then
    return jsonb_build_object('success', false, 'error', 'That column is not an Autonumber column of this table.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('udt_autonumber:' || p_field_id::text, 0));

  select coalesce(max((r.data->>v_field_name)::bigint), 0)
    into v_start
    from workbench.udt_dataset_rows r
    where r.table_id = p_table_id
      and (r.data->>v_field_name) ~ '^[0-9]{1,18}$';

  with todo as (
    select r.id, row_number() over (order by r.created_at, r.id) as n
    from workbench.udt_dataset_rows r
    where r.table_id = p_table_id
      and r.deleted_at is null
      and not coalesce((r.data->>v_field_name) ~ '^[0-9]{1,18}$', false)
  ),
  done as (
    update workbench.udt_dataset_rows r
       set data = coalesce(r.data, '{}'::jsonb) || jsonb_build_object(v_field_name, v_start + todo.n)
      from todo
     where r.id = todo.id
    returning 1
  )
  select count(*) into v_numbered from done;

  return jsonb_build_object('success', true, 'numbered', v_numbered, 'highest', v_start + v_numbered);
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, anonymous_callers, anonymous_purpose)
values
  ('public', 'udt_backfill_autonumber', 'p_table_id uuid, p_field_id uuid',
   'data-tables autonumber (2026-09-21)',
   'SIGNED-IN door (authenticated only). Numbers the existing rows of a user data table''s Autonumber column; the caller is resolved by auth.uid() and the body refuses anyone without editor access via workbench.udt_dataset_access.',
   false, null)
on conflict do nothing;

revoke execute on function public.udt_backfill_autonumber(uuid, uuid) from public, anon;
grant execute on function public.udt_backfill_autonumber(uuid, uuid) to authenticated, service_role;

-- Proof inside the same transaction: the trigger is attached and enabled.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'workbench.udt_dataset_rows'::regclass
      and tgname = '_udt_autonumber' and tgenabled = 'O'
  ) then
    raise exception 'udt_autonumber: trigger _udt_autonumber is not attached';
  end if;
end $$;
