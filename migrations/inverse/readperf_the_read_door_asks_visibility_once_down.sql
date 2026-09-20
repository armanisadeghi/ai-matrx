-- READ-PERF, the inverse: the four new functions dropped and the two doors put back to the
-- per-row bodies they carried before this lane. Run it and the read door is slow again.

-- A DOOR FOLLOWS ITS FUNCTION: the declarations go in the same transaction as the drops.
delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by like '%readperf_the_read_door_asks_visibility_once%';

drop function if exists custom.read_door_parity(uuid, uuid, uuid, public.permission_level);
drop function if exists custom.read_door_parity(uuid, uuid, uuid, public.permission_level, integer);
drop function if exists custom.visible_set(uuid, uuid, uuid, public.permission_level);
drop function if exists custom.read_door_carried_ids(uuid, uuid, uuid, public.permission_level);
drop function if exists custom.read_door_granted_ids(uuid, uuid);
drop function if exists custom.carrying_edges_in(uuid);
drop function if exists custom.read_door_ladder_ceiling();

CREATE OR REPLACE FUNCTION custom.read_records(p_organization_id uuid, p_table_id uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records');
  if p_limit is null or p_limit < 1 or p_limit > 1000 then p_limit := 200; end if;

  -- STEP 2, once per table per request: which fields this caller may see, at which level.
  -- The level used for the field question is the caller's level on the TABLE, so a page of
  -- a hundred records asks the field question once, not a hundred times (DOOR-10's shape).
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, p_table_id, v_level, 'read') f;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb),
         coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_notices, v_key_ids, v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;

  -- Only the fields that are actually hidden get a notice.
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_notices
    from jsonb_each(v_notices) e
   where not (e.key = any (v_visible));

  -- STEP 1, per row: Visibility. `custom.visible_record_ids` is the set-based answer, and
  -- the door reads it rather than asking per row (VIS-N-1).
  for v_rec in
    select r.id, custom.record_values(r.organization_id, r.id) as doc
      from custom.record r
     where custom.has_visibility(v_me, 'record', r.id, 'viewer')
       and r.organization_id = p_organization_id
       and r.table_id = p_table_id
       and r.deleted_at is null
     order by r.created_at desc
     limit p_limit offset p_offset
  loop
    id := v_rec.id;
    document := custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared);
    level := v_level;
    return next;
  end loop;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.query_visible_ids(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_required text DEFAULT 'viewer'::text)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user uuid := custom.query_principal();
begin
  -- The organization wall, before any row is fetched, because this is now a door a
  -- signed-in person may execute directly.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_visible_ids');

  return query
    select r.id
      from custom.record r
     where r.organization_id = p_organization_id
       and (p_table_id is null or r.table_id = p_table_id)
       and r.deleted_at is null
       -- DOOR-17: a quarantined submission is invisible to every read until a Rule clears it.
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       -- THE ONE LADDER, per row. `custom.has_visibility` is what `custom.read_record`
       -- asks; asking anything else here is what let the same person be refused a
       -- record by the read door and handed it by a query in the same breath. A
       -- connection with no principal at all is the campaign's own maintenance and is
       -- judged by the role instead, exactly as `custom.query_access_ids` judged it.
       and ((v_user is null and custom.query_is_store_owner())
            or custom.has_visibility(v_user, 'record', r.id, p_required::public.permission_level));
end;
$function$

;
