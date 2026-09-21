-- INVERSE of migrations/campaign/orgdel_a_deletion_event_asks_nobody_for_permission.sql
-- (lane ORG-DELETE). It puts the unconditional reader call back, so the retention purge dies on
-- custom.assert_may_know_table for every record whose Table was retired first.
--
-- 🚨 RE-POINTED TO THE LIVE BODY (lane RED-SUITES-3, 2026-09-21). This file restored
-- `custom.io_record_changed()` — the ROW-level trigger function — and
-- `writeperf2_the_after_triggers_fire_once_per_statement.sql` replaced it with the
-- STATEMENT-level trio `custom.io_record_changed_stmt_delete` / `_stmt_insert` / `_stmt_update`
-- over `io_record_changed_s_d` / `_s_i` / `_s_u`. NO trigger calls the row-level body any more,
-- so this file restored a defect into a function nothing runs: `custom.migrate_purge` succeeded,
-- and `orgdel_red.sql` RED 5 reported "RED 5 IS GREEN — the purge cleared a retired Table's
-- records with the inverse applied" about a defect it had not managed to restore.
--
-- The row-level body is still rewritten below, because a database that still carries the older
-- shape must invert the same way. What actually bites now is the block after it, which puts the
-- reader call back into the DELETE path that is live — derived from that body's own bytes, and
-- refusing by name if the sentence it replaces is not there.

create or replace function custom.io_record_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org       uuid := coalesce(new.organization_id, old.organization_id);
  v_id        uuid := coalesce(new.id, old.id);
  v_table     uuid := coalesce(new.table_id, old.table_id);
  v_version   integer := coalesce(new.version, old.version, 0);
  v_operation text;
  v_keys      text[];
  v_changed   jsonb;
begin
  -- THE ONE DOOR PREDICATE, and it IS the guard this file is headed with:
  -- `custom.assert_store_door` resolves `custom/system_enabled` through
  -- `custom.store_is_open`, so while that knob is false this trigger — like every other door
  -- in the store — takes writes only from the role that owns `custom.record`.
  perform custom.assert_store_door(v_org, 'custom.io_record_changed');

  if tg_op = 'INSERT' then
    v_operation := 'created';
    v_keys      := custom.io_changed_keys('{}'::jsonb, new.data);
  elsif tg_op = 'DELETE' then
    v_operation := 'deleted';
    v_keys      := array[]::text[];
  elsif new.deleted_at is not null and old.deleted_at is null then
    -- A soft delete is a DELETE to everyone downstream. An automation that fired "updated"
    -- when a record disappeared would be lying in the one case people notice.
    v_operation := 'deleted';
    v_keys      := array[]::text[];
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_operation := 'created';
    v_keys      := custom.io_changed_keys('{}'::jsonb, new.data);
  else
    v_operation := 'updated';
    v_keys      := custom.io_changed_keys(old.data, new.data);
    -- NO VALUE MOVED, so there is no event. Asked of the KEYS, never of the resolved Field
    -- ids: a Table whose fields are declared on the Table rather than as Field records
    -- resolves zero ids on every write, and used to raise nothing at all.
    if coalesce(array_length(v_keys, 1), 0) = 0
       and old.deleted_at is not distinct from new.deleted_at then
      return null;
    end if;
  end if;

  v_changed := custom.io_changed_field_ids(v_org, v_table,
                                           case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end,
                                           coalesce(new.data, '{}'::jsonb));

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key)
  values (v_org, 'records.changed', v_id, v_table, v_operation, v_changed,
          jsonb_build_object(
            'user_id',   custom.query_principal(),
            'role',      custom.caller_role()::text,
            'tier',      coalesce(platform.declared_actor_tier(), platform.actor_tier()),
            'declared',  coalesce(new.data, old.data) ->> '_actor'),
          v_org::text || ':' || v_id::text || ':' || v_version::text || ':' || v_operation)
  on conflict do nothing;

  return null;
end;
$function$;


-- ── THE LIVE DELETE PATH: the reader call, back where the purge will hit it ────────────────
do $orgdel_down$
declare
  v_def  text;
  v_fixed constant text :=
    '         -- On a delete `v_keys` is empty by construction, so the answer is `[]` whatever the' || E'\n' ||
    '         -- join would have done — and asking anyway made a deletion event depend on the caller' || E'\n' ||
    '         -- still being allowed to READ the Table.' || E'\n' ||
    '         ''[]''::jsonb,';
  v_broken constant text :=
    '         -- RESTORED BY THE INVERSE: the deletion event asks the reader''s question again.' || E'\n' ||
    '         custom.io_changed_field_ids(o.organization_id, o.table_id, ''{}''::jsonb, ''{}''::jsonb),';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname = 'io_record_changed_stmt_delete';
  if v_def is null then
    raise exception 'orgdel inverse: custom.io_record_changed_stmt_delete does not exist, so the live delete path cannot be taken back';
  end if;
  if position(v_fixed in v_def) = 0 then
    raise exception 'orgdel inverse: the live custom.io_record_changed_stmt_delete no longer carries the sentence ORG-DELETE put there, so this inverse would restore nothing. Re-derive it from the live body.';
  end if;
  execute replace(v_def, v_fixed, v_broken);
end
$orgdel_down$;
