-- INVERSE of migrations/campaign/orgdel_the_undo_is_not_swept_away_with_the_logs.sql (lane ORG-DELETE).
-- It puts history.migration_log back into the work-log sweep, so the door destroys the undo
-- entries in the same call that promised them.
CREATE OR REPLACE FUNCTION custom.organization_clear(p_organization_id uuid, p_confirm text, p_and_destroy boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me        uuid := custom.query_principal();
  v_boss      boolean := custom.query_is_store_owner();
  v_name      text;
  v_table     uuid;
  v_logs      uuid[] := '{}';
  v_retired   integer := 0;
  v_left      uuid;
  v_floor     integer;
  v_holder    record;
  v_gone      bigint;
  v_destroyed jsonb := '[]'::jsonb;
  v_total     bigint := 0;
  v_purged    bigint := 0;
  v_waiting   bigint := 0;
  v_free_on   timestamptz;
  v_res       jsonb;
  v_out       jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.organization_clear');
  -- THE SWITCH. While `custom/system_enabled` resolves false this store belongs to the
  -- campaign that owns it, and nothing outside that campaign empties an organization in it.
  perform custom.assert_store_door(p_organization_id, 'custom.organization_clear');

  if p_organization_id is null then
    raise exception 'custom.organization_clear: which organization?'
      using errcode = '22004',
            hint = 'A null organization would empty the whole store.';
  end if;

  select o.name into v_name from iam.organizations o where o.id = p_organization_id;
  if v_name is null then
    raise exception 'There is no organization % here.', p_organization_id
      using errcode = '02000';
  end if;

  -- OWNER ONLY, the same person iam.organizations.org_delete_policy lets delete it. Being
  -- able to edit this organization's records is not the same permission as emptying it.
  if not v_boss and not (v_me is not null and iam.is_org_owner(p_organization_id, v_me)) then
    raise exception 'Only the owner of % can empty it.', v_name
      using errcode = '42501',
            hint = 'This removes every table and record the organization holds. Ask an owner of this organization to do it, or have an owner transfer ownership to you first. An admin of the organization is not enough.';
  end if;

  -- THE CONFIRMATION, character for character — the same one the Danger Zone asks for, asked
  -- again HERE, so a caller that never drew a dialog cannot empty an organization by accident.
  if p_confirm is distinct from v_name then
    raise exception 'Nothing was removed: the confirmation did not match this organization''s name.'
      using errcode = '22023',
            hint = format('Type the organization''s name exactly — %s — to confirm.', v_name);
  end if;

  v_floor := history.retention_floor_days(p_organization_id);

  -- STEP ONE, ALWAYS RUN: RETIRE, THROUGH THE STORE'S OWN DOOR. custom.migrate_delete takes a
  -- Table's records, saved views, Rules and Fields with it as ONE history.migration_log entry,
  -- and custom.migrate_undo puts the whole set back. Nothing here is hard-deleted.
  for v_table in
    select r.id from custom.record r
     where r.organization_id = p_organization_id
       and r.data_class = 'table'
       and r.deleted_at is null
     order by r.created_at
  loop
    -- A Table may already have gone with an earlier one in this loop (a Table that lives in
    -- another Table's Home). Asking the store again is cheaper than guessing the order.
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = v_table and r.deleted_at is null) then
      v_out := custom.migrate_delete(p_organization_id, v_table,
                 format('retired while emptying organization %s', v_name));
      v_logs := v_logs || (v_out ->> 'migration_id')::uuid;
      v_retired := v_retired + 1;
    end if;
  end loop;

  -- Anything live that no Table owned — a stranded row, this organization's Home — goes the
  -- same way, through the same door, one entry each.
  for v_left in
    select r.id from custom.record r
     where r.organization_id = p_organization_id and r.deleted_at is null
     order by r.created_at
  loop
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = v_left and r.deleted_at is null) then
      v_out := custom.migrate_delete(p_organization_id, v_left,
                 format('retired while emptying organization %s', v_name));
      v_logs := v_logs || (v_out ->> 'migration_id')::uuid;
      v_retired := v_retired + 1;
    end if;
  end loop;

  if not p_and_destroy then
    return jsonb_build_object(
      'function', 'custom.organization_clear',
      'organization_id', p_organization_id, 'name', v_name,
      'destroyed', false,
      'retired_operations', v_retired,
      'migrations', to_jsonb(v_logs),
      'recoverable_until', now() + make_interval(days => v_floor),
      'sentence', format(
        'Everything in %s is retired. Nothing was destroyed — you can put all of it back until %s.',
        v_name, to_char(now() + make_interval(days => v_floor), 'FMDD FMMonth YYYY')),
      'at', now());
  end if;

  -- STEP TWO: DESTROY WHAT REC-23 NO LONGER PROTECTS, AND NOTHING ELSE. custom.migrate_purge
  -- is the one thing in this store allowed to end a record, it reads the Table's own retention
  -- window, and it never touches a row still inside it. This door does not second-guess it and
  -- issues no DELETE of its own against custom.record.
  v_res := custom.migrate_purge(p_organization_id, null, false);
  v_purged := coalesce((v_res ->> 'rows_purged')::bigint, 0);
  if v_purged > 0 then
    v_destroyed := v_destroyed || jsonb_build_object('where', 'custom.record', 'rows', v_purged);
    v_total := v_total + v_purged;
  end if;

  -- The rest of what an organization holds in this store is WORK LOG, not records under a
  -- retention window: the outbox, imports, comments, document renders and signatures, the
  -- anonymous lane's tokens and hits, the merge provenance. Asked of the catalog rather than
  -- named, so a foreign key added after this file is written is cleared too; custom.record and
  -- history.migration_log are left to the purge and to the organization's own delete.
  for v_holder in
    select q.s, q.t from (
      select distinct rn.nspname as s, rc.relname as t
        from pg_constraint con
        join pg_class rc on rc.oid = con.conrelid
        join pg_namespace rn on rn.oid = rc.relnamespace
       where con.contype = 'f'
         and con.confrelid = 'iam.organizations'::regclass
         and rn.nspname in ('custom', 'history')
         and rc.relkind in ('r', 'p')
         and rc.relispartition = false
         and rn.nspname || '.' || rc.relname <> 'custom.record') q
     order by q.s, q.t
  loop
    execute format('delete from %I.%I where organization_id = $1', v_holder.s, v_holder.t)
      using p_organization_id;
    get diagnostics v_gone = row_count;
    if v_gone > 0 then
      v_destroyed := v_destroyed || jsonb_build_object('where', v_holder.s || '.' || v_holder.t, 'rows', v_gone);
      v_total := v_total + v_gone;
    end if;
  end loop;

  -- STEP THREE: SAY WHAT IS LEFT, AND WHEN. A retired record inside its window is not a
  -- failure and it is not a foreign key — it is the undo somebody was promised, and the only
  -- honest answer is the DATE.
  select count(*), min(r.deleted_at + make_interval(days => greatest(history.retention_days(p_organization_id, r.table_id), v_floor)))
    into v_waiting, v_free_on
    from custom.record r
   where r.organization_id = p_organization_id;

  return jsonb_build_object(
    'function', 'custom.organization_clear',
    'organization_id', p_organization_id, 'name', v_name,
    'destroyed', true,
    'retired_operations', v_retired,
    'migrations', to_jsonb(v_logs),
    'rows_destroyed', v_total,
    'destroyed_from', v_destroyed,
    'rows_waiting', v_waiting,
    'removable_on', v_free_on,
    'is_empty', v_waiting = 0,
    'sentence', case
      when v_waiting = 0 then
        format('%s is empty — %s row(s) were removed, and the organization can now be deleted.',
               v_name, v_total)
      else
        format('%s row(s) in %s are retired and can still be put back until %s, so the organization cannot be removed until then. Nothing is lost in the meantime, and %s row(s) that were past that point have been removed.',
               v_waiting, v_name, to_char(v_free_on, 'FMDD FMMonth YYYY'), v_total)
      end,
    'at', now());
end;
$function$

;
