-- INVERSE of migrations/campaign/laddercap_the_organization_default_steps_aside_for_every_specific_rung.sql
--
-- Puts VIS-19 back to "a grant addressed to this person and THIS ROW", so the organization's
-- role default once again overrules a grant somebody addressed to her on the TABLE or on a HOME,
-- and puts custom.addressed_cap back to the body that resolved the rungs inline. Running this
-- makes laddercap_green.sql PART 1 red on the "table" and "home" rungs, which is what the red
-- twin executes it to prove.

create or replace function iam.member_lane_confers(p_user_id uuid, p_organization_id uuid, p_type text DEFAULT 'record'::text, p_id uuid DEFAULT NULL::uuid, p_table_id uuid DEFAULT NULL::uuid)
 returns permission_level
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_table    uuid := p_table_id;
  v_store_on boolean;
begin
  if p_user_id is null or p_organization_id is null then
    return null;
  end if;

  if not exists (select 1 from iam.organization_member om
                  where om.user_id = p_user_id and om.organization_id = p_organization_id) then
    return null;
  end if;

  begin
    v_store_on := coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean,
                           false);
  exception when others then
    v_store_on := false;
  end;
  if not v_store_on then
    return null;
  end if;

  if not iam.member_lane_open(p_organization_id) then
    return null;
  end if;

  -- VIS-19, THE OVERRIDE, as it was written: about THIS ROW only.
  if p_id is not null
     and iam.grant_addressed_level(p_user_id, p_type, p_id) is not null then
    return null;
  end if;

  if v_table is null and p_type = 'record' and p_id is not null
     and to_regclass('custom.record') is not null then
    select r.table_id into v_table
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id;
  end if;

  return iam.member_default_level(p_organization_id, v_table);
end;
$function$;

create or replace function custom.addressed_cap(p_user_id uuid, p_type text, p_id uuid,
                                     p_organization_id uuid default null,
                                     p_table_id uuid default null)
 returns permission_level
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_lvl public.permission_level;
  a     record;
begin
  if p_user_id is null or p_id is null then return null; end if;

  -- RUNG 1 — THE ROW ITSELF. Ownership is the strongest address there is (VIS-25).
  if iam.owner_of(p_type, p_id) = p_user_id then return iam.top_content_level(); end if;
  v_lvl := iam.grant_addressed_level(p_user_id, p_type, p_id);
  if v_lvl is not null then return v_lvl; end if;

  -- RUNG 2 — THE TABLE THE ROW LIVES IN. A Table is a record (REC-25), so it is asked exactly
  -- as rung 1 is. This is the rung the defect walked THROUGH without ever asking.
  if p_table_id is not null and p_table_id is distinct from p_id then
    if iam.owner_of('record', p_table_id) = p_user_id then return iam.top_content_level(); end if;
    v_lvl := iam.grant_addressed_level(p_user_id, 'record', p_table_id);
    if v_lvl is not null then return v_lvl; end if;
  end if;

  -- RUNG 3 — THE HOMES, SHALLOWEST FIRST, because a nearer container is the more specific word.
  -- An ancestor can never address more than it conveys, so `conveys_max` bounds it here exactly
  -- as it bounds the carry in arm 3.
  for a in
    select c.container_type, c.container_id, c.max_level, c.depth
      from custom.visibility_ancestors(p_type, p_id) c
     where c.container_id is distinct from p_table_id
     order by c.depth
  loop
    if iam.owner_of(a.container_type, a.container_id) = p_user_id then
      return least(a.max_level, iam.top_content_level());
    end if;
    v_lvl := iam.grant_addressed_level(p_user_id, a.container_type, a.container_id);
    if v_lvl is not null then return least(a.max_level, v_lvl); end if;
  end loop;

  -- RUNG 4 — CONTAINMENT CARRY. Nothing here is addressed to her, so it sets no level.

  -- RUNG 5 — THE ORGANIZATION'S OWN WORD FOR WHAT MEMBERSHIP CONFERS.
  return iam.member_lane_confers(p_user_id, p_organization_id, p_type, p_id, p_table_id);
end;
$function$;

drop function if exists custom.addressed_cap_specific(uuid, text, uuid, uuid, uuid);
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'addressed_cap_specific';
