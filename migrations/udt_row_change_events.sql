-- ============================================================================
-- udt_row_change_events — every change to a user data table row is an EVENT
-- ============================================================================
-- Airtable's "When a record is created / updated" automation trigger. The
-- platform already has ONE event spine (platform.activity_log) with a live
-- outbound-webhook transport (files.webhook_dispatch, matched by
-- webhooks.resource_types / event_types) and a Realtime transport to come, and
-- the scheduler declares an "event" trigger type with nothing producing events.
-- This is the producer: one AFTER trigger on workbench.udt_dataset_rows writes
-- one spine row per row change, through the spine's own writer
-- (platform.log_activity), so every transport lights up at once and nothing
-- inside data-tables ever runs an automation itself (Arman: automations go
-- through the platform's scheduling/workflow primitives, never inside the
-- table feature).
--
--   entity_type  'user_table_row'
--   entity_id    the row id
--   action       'row.created' | 'row.updated' | 'row.archived' | 'row.restored' | 'row.deleted'
--   actor_id     auth.uid() when a person did it; NULL for service / cron writes
--   metadata     { table_id, table_name, changed_fields: [machine names], version }
--
-- Only a change to the row's CONTENT is an event: an UPDATE that touches
-- neither data nor deleted_at (a version bump alone, a metadata stamp) writes
-- nothing, so a consumer never fires on nothing. Archive (deleted_at set) and
-- restore (deleted_at cleared) are named for what they are rather than as a
-- generic update. Additive: a new function and a new trigger, nothing replaced.
--
-- A bulk write of N rows is N events — the same shape the row-version log
-- already keeps, and what a consumer that wants "each row that changed" needs.
-- A transaction that must stay quiet (a large import that will announce itself
-- once) sets the transaction-local flag  SET LOCAL matrx.udt_row_events = 'off'.
-- ============================================================================

create or replace function workbench.udt_row_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_action text;
  v_changed text[] := '{}';
  v_row workbench.udt_dataset_rows%rowtype;
  v_table_name text;
  v_key text;
begin
  if nullif(current_setting('matrx.udt_row_events', true), '') = 'off' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_row := new;
    v_action := 'row.created';
    select array_agg(k order by k) into v_changed from jsonb_object_keys(coalesce(new.data, '{}'::jsonb)) k;
  elsif tg_op = 'DELETE' then
    v_row := old;
    v_action := 'row.deleted';
  else
    v_row := new;
    if old.deleted_at is null and new.deleted_at is not null then
      v_action := 'row.archived';
    elsif old.deleted_at is not null and new.deleted_at is null then
      v_action := 'row.restored';
    elsif new.data is distinct from old.data then
      v_action := 'row.updated';
      for v_key in
        select k from (
          select jsonb_object_keys(coalesce(old.data, '{}'::jsonb)) k
          union
          select jsonb_object_keys(coalesce(new.data, '{}'::jsonb)) k
        ) keys
        where coalesce(old.data, '{}'::jsonb) -> k is distinct from coalesce(new.data, '{}'::jsonb) -> k
        order by k
      loop
        v_changed := v_changed || v_key;
      end loop;
    else
      -- Nothing a consumer could act on changed.
      return null;
    end if;
  end if;

  select table_name into v_table_name from workbench.udt_datasets where id = v_row.table_id;

  perform platform.log_activity(
    v_row.organization_id,
    v_action,
    'user_table_row',
    v_row.id,
    jsonb_build_object(
      'table_id', v_row.table_id,
      'table_name', v_table_name,
      'changed_fields', to_jsonb(coalesce(v_changed, '{}'::text[])),
      'version', v_row.version
    ),
    auth.uid()
  );
  return null;
end;
$function$;

comment on function workbench.udt_row_activity() is
  'AFTER trigger on workbench.udt_dataset_rows: one platform.activity_log event per row change (row.created / row.updated / row.archived / row.restored / row.deleted, entity_type user_table_row). Quiet when SET LOCAL matrx.udt_row_events = ''off''.';

create trigger udt_dataset_rows_activity
  after insert or update or delete on workbench.udt_dataset_rows
  for each row execute function workbench.udt_row_activity();
