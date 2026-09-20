-- INVERSE of migrations/campaign/orgdel_the_clear_goes_through_the_purge.sql (lane ORG-DELETE).
-- It puts the raw DELETE back in the destroying arm, which the store refuses on its own
-- trigger, so custom.organization_clear(..., true) dies with 42501 the moment it is called.
CREATE OR REPLACE FUNCTION custom.organization_clear(p_organization_id uuid, p_confirm text, p_and_destroy boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := custom.query_principal();
  v_boss     boolean := custom.query_is_store_owner();
  v_name     text;
  v_table    uuid;
  v_logs     uuid[] := '{}';
  v_retired  integer := 0;
  v_left     uuid;
  v_floor    integer;
  v_holder   record;
  v_gone     bigint;
  v_destroyed jsonb := '[]'::jsonb;
  v_total    bigint := 0;
  v_out      jsonb;
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

  -- ARM ONE, ALWAYS RUN: RETIRE, THROUGH THE STORE'S OWN DOOR. custom.migrate_delete takes a
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

  -- Anything live that no Table owned — a stranded row, a kernel row of this organization —
  -- goes the same way, through the same door, one entry each.
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
        'Everything in %s is retired. Nothing was destroyed — you can put all of it back until %s. Removing the organization itself ends that, and cannot be undone.',
        v_name, to_char(now() + make_interval(days => v_floor), 'FMDD FMMonth YYYY')),
      'at', now());
  end if;

  -- ARM TWO: THE ORGANIZATION IS GOING. Retention exists so a delete can be UNDONE, and an
  -- undo is performed by a person from a seat INSIDE the organization. Removing the
  -- organization removes every such seat, so the window has nothing left to protect and it
  -- ends here — deliberately, by the owner, who typed the name and is told so in the answer.
  -- Only rows of THIS organization, only in `custom` and `history`, asked of the catalog so
  -- a foreign key added after this file is written is cleared too. Ordered so a table that
  -- points at another goes first: `custom.record` and `history.migration_log` last.
  for v_holder in
    select q.s, q.t from (
      select distinct rn.nspname as s, rc.relname as t,
             case when rn.nspname || '.' || rc.relname in ('custom.record', 'history.migration_log')
                  then 1 else 0 end as goes_last
        from pg_constraint con
        join pg_class rc on rc.oid = con.conrelid
        join pg_namespace rn on rn.oid = rc.relnamespace
       where con.contype = 'f'
         and con.confrelid = 'iam.organizations'::regclass
         and rn.nspname in ('custom', 'history')
         and rc.relkind in ('r', 'p')
         and rc.relispartition = false) q
     order by q.goes_last, q.s, q.t
  loop
    execute format('delete from %I.%I where organization_id = $1', v_holder.s, v_holder.t)
      using p_organization_id;
    get diagnostics v_gone = row_count;
    if v_gone > 0 then
      v_destroyed := v_destroyed || jsonb_build_object('where', v_holder.s || '.' || v_holder.t, 'rows', v_gone);
      v_total := v_total + v_gone;
    end if;
  end loop;

  return jsonb_build_object(
    'function', 'custom.organization_clear',
    'organization_id', p_organization_id, 'name', v_name,
    'destroyed', true,
    'retired_operations', v_retired,
    'migrations', to_jsonb(v_logs),
    'rows_destroyed', v_total,
    'destroyed_from', v_destroyed,
    'sentence', format(
      '%s rows were removed from %s. The organization can now be deleted, and none of this can be put back — removing an organization ends the %s-day window its retired rows had.',
      v_total, v_name, v_floor),
    'at', now());
end;
$function$

;
