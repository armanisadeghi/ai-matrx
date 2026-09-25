-- INVERSE of migrations/campaign/sharelane_the_lane_door_names_the_organization.sql: restores public.store_door_lane verbatim.
-- lane: SHARE-LANE-CONTROL
set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION public.store_door_lane(p_resource_type text, p_resource_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- THE LANE, READ THROUGH A DOOR (lane SHARE, 2026-09-19), and since SHARE-TAILS (2026-09-25) read
-- through iam.lane_of — so a thing with no lane row answers "organization", never "mine" — and
-- carrying `organization_default` whenever membership alone really reaches it: the level, and the
-- organization's name, which is what the Share dialog says under Current Access. It is said only
-- when true: the member lane is open, the thing is at least `internal`, its Table is not below
-- `internal`, and the member default names a level (the same test custom.share_access runs).
declare
  v_row  record;
  v_lane text;
  v_disc boolean;
  v_pub  boolean;
  v_default public.permission_level;
  v_org_name text;
begin
  select r.organization_id, r.table_id, r.visibility into v_row
    from custom.record r where r.id = p_resource_id;
  if v_row.organization_id is null then
    return jsonb_build_object('found', false);
  end if;
  perform custom.assert_client_may_open(v_row.organization_id, p_resource_id, 'store_door_lane',
                                        'viewer'::public.permission_level, 'record');

  v_lane := iam.lane_of('record', p_resource_id);
  select coalesce(c.discoverable, false) into v_disc
    from iam.content_lane c
   where c.resource_type = 'record' and c.resource_id = p_resource_id;
  v_disc := coalesce(v_disc, false);

  select exists (select 1 from iam.permissions p
                  where p.resource_type = 'record' and p.resource_id = p_resource_id
                    and p.is_public and p.status <> 'rejected'
                    and (p.expires_at is null or p.expires_at > now()))
    into v_pub;

  if iam.member_lane_open(v_row.organization_id)
     and v_row.visibility >= 'internal'::platform.visibility
     and not exists (select 1 from custom.record t
                      where t.organization_id = v_row.organization_id and t.id = v_row.table_id
                        and t.id <> custom.table_kernel_id()
                        and t.visibility < 'internal'::platform.visibility) then
    v_default := iam.member_default_level(v_row.organization_id, v_row.table_id);
  end if;
  select o.name into v_org_name from iam.organizations o where o.id = v_row.organization_id;

  return jsonb_build_object(
    'found', true,
    'lane', v_lane,
    'discoverable', v_disc,
    'is_public', v_lane = 'world' or coalesce(v_pub, false),
    'choice', case when v_lane <> 'world' then v_lane
                   when v_disc then 'world'
                   else 'community' end,
    'organization_default',
      case when v_default is null then null
           else jsonb_build_object('level', v_default::text,
                                   'organization_id', v_row.organization_id,
                                   'organization_name', coalesce(v_org_name, 'this organization')) end);
end;
$function$

;
