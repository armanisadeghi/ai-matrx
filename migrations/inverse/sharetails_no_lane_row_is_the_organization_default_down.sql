-- INVERSE of migrations/campaign/sharetails_no_lane_row_is_the_organization_default.sql: restores the three bodies verbatim.
-- lane: SHARE-TAILS
set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION iam.lane_of(p_resource_type text, p_resource_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((select c.lane from iam.content_lane c
                    where c.resource_type = p_resource_type and c.resource_id = p_resource_id),
                  'mine');
$function$

;

CREATE OR REPLACE FUNCTION public.store_door_lane(p_resource_type text, p_resource_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org  uuid;
  v_lane record;
  v_pub  boolean;
begin
  select r.organization_id into v_org from custom.record r where r.id = p_resource_id;
  if v_org is null then
    return jsonb_build_object('found', false);
  end if;
  -- The one ladder, at the rung that opens the thing. Nobody learns where a record is
  -- published from a record they cannot open.
  perform custom.assert_client_may_open(v_org, p_resource_id, 'store_door_lane',
                                        'viewer'::public.permission_level, 'record');

  select c.lane, c.discoverable, c.unlisted into v_lane
    from iam.content_lane c
   where c.resource_type = 'record' and c.resource_id = p_resource_id;

  select exists (select 1 from iam.permissions p
                  where p.resource_type = 'record' and p.resource_id = p_resource_id
                    and p.is_public and p.status <> 'rejected'
                    and (p.expires_at is null or p.expires_at > now()))
    into v_pub;

  return jsonb_build_object(
    'found', true,
    'lane', coalesce(v_lane.lane, 'mine'),
    'discoverable', coalesce(v_lane.discoverable, false),
    'is_public', coalesce(v_lane.lane, 'mine') = 'world' or coalesce(v_pub, false),
    -- The four CHOICES over the three lanes, so a screen names what a person picked rather than
    -- the storage word underneath it (VIS-N-4 + VIS-N-6).
    'choice', case when coalesce(v_lane.lane, 'mine') <> 'world' then coalesce(v_lane.lane, 'mine')
                   when coalesce(v_lane.discoverable, false) then 'world'
                   else 'community' end);
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.share_access(p_organization_id uuid, p_subject_id uuid)
 RETURNS TABLE(principal_kind text, principal_id uuid, principal_label text, level permission_level, reason text, reason_detail text, via_type text, via_id uuid, revocable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := custom.query_principal();
  v_row      custom.record;
  v_manage   boolean;
  v_default  public.permission_level;
  v_lane     text;
  v_org_name text;
begin
  -- Seeing the list needs only the level that opens the thing; CHANGING it needs admin, and
  -- that is what `revocable` says per row rather than emptying the list (which is what the
  -- platform's generic RPC does today, and why an admin saw nothing at all).
  perform custom.assert_client_may_open(p_organization_id, p_subject_id, 'share_access', 'viewer', 'record');

  select r.* into v_row
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id;
  if not found then
    raise exception 'That record is not in this organization, so there is nobody to list.'
      using errcode = '02000';
  end if;

  v_manage := v_me is not null
              and custom.has_visibility(v_me, 'record', p_subject_id, 'admin'::public.permission_level);
  select o.name into v_org_name from iam.organizations o where o.id = p_organization_id;

  -- ── 1. THE OWNER. VIS-25: the top rung, held as `created_by` and not as a grant row, so it
  -- is never revocable here — ownership transfers, it is not taken away in a share dialog.
  if v_row.created_by is not null then
    return query
    select 'person'::text,
           v_row.created_by,
           coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                    nullif(u.raw_user_meta_data ->> 'full_name', ''),
                    u.email::text, v_row.created_by::text),
           iam.top_content_level(),
           'owner'::text,
           'Created it. The Owner rung sits above Admin and is held on the record itself, so it '
             || 'is transferred rather than revoked.',
           null::text, null::uuid, false
      from auth.users u where u.id = v_row.created_by;
  end if;

  -- ── 2. DIRECT GRANTS on this very thing — the rows this dialog writes and takes back.
  return query
  select case when p.is_public then 'everyone'
              when p.granted_to_organization_id is not null then 'organization'
              else 'person' end::text,
         coalesce(p.granted_to_organization_id, p.granted_to_user_id),
         case when p.is_public then 'Anyone with access to the link'
              when p.granted_to_organization_id is not null
                then coalesce(o.name, p.granted_to_organization_id::text)
              else coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                            nullif(u.raw_user_meta_data ->> 'full_name', ''),
                            u.email::text, p.granted_to_user_id::text) end::text,
         p.permission_level,
         'direct'::text,
         case when p.granted_to_organization_id is not null and p.granted_to_organization_id <> p_organization_id
                then 'Shared with another organization (VIS-23: a cross-organization share is a grant whose principal is that organization).'
              when p.granted_to_organization_id is not null
                then 'Shared with everyone in ' || coalesce(o.name, 'this organization') || '.'
              when p.is_public then 'Open to anyone who reaches it.'
              else 'Shared with this person directly.' end
           || case when p.expires_at is not null then ' Expires ' || to_char(p.expires_at, 'YYYY-MM-DD') || '.' else '' end,
         null::text, null::uuid,
         v_manage
    from iam.permissions p
    left join auth.users        u on u.id = p.granted_to_user_id
    left join iam.organizations o on o.id = p.granted_to_organization_id
   where p.resource_type = 'record'
     and p.resource_id   = p_subject_id
     and p.status <> 'rejected'
     and (p.expires_at is null or p.expires_at > now())
   order by p.created_at;

  -- ── 3. THE ORGANIZATION'S OWN MEMBER DEFAULT (VIS-19 / VIS-33). Not a grant row and not
  -- revocable from here: it is the organization's setting, and the remedy is the setting.
  -- SHARE-TAILS (2026-09-25): said only when membership really reaches it. A thing on the "mine"
  -- lane is `personal` (and a row inside a "mine" Table is bounded by that Table), and the
  -- member lane confers nothing on it (iam.member_lane_confers), so this row would be a lie.
  if iam.member_lane_open(p_organization_id)
     and v_row.visibility >= 'internal'::platform.visibility
     and not exists (select 1 from custom.record t
                      where t.organization_id = p_organization_id and t.id = v_row.table_id
                        and t.id <> custom.table_kernel_id()
                        and t.visibility < 'internal'::platform.visibility) then
    v_default := iam.member_default_level(p_organization_id, v_row.table_id);
    if v_default is not null then
      return query
      select 'organization'::text, p_organization_id,
             coalesce(v_org_name, 'this organization'),
             v_default,
             'organization default'::text,
             'Every member of ' || coalesce(v_org_name, 'this organization') || ' reaches this without '
               || 'anybody sharing it, because the organization''s member default says so. Change it in '
               || 'the organization''s settings (custom/member_default_visibility, custom/member_default_level) '
               || '— there is no grant here to revoke.',
             null::text, null::uuid, false;
    end if;
  end if;

  -- ── 4. CONTAINMENT (VIS-1 / VIS-5 / VIS-3): whatever carries this thing carries access to it,
  -- at no more than the carrying link conveys. The remedy is on the container, so each row names
  -- the container and is not revocable here.
  return query
  select 'via'::text,
         a.container_id,
         custom.share_subject_name(p_organization_id, a.container_type, a.container_id),
         a.max_level,
         'containment'::text,
         'Anyone who reaches ' || custom.share_subject_name(p_organization_id, a.container_type, a.container_id)
           || ' reaches this too, at up to ' || lower(iam.level_label('record', a.max_level))
           || '. Take it out of there, or change what that link conveys — there is no grant here to revoke.',
         a.container_type, a.container_id, false
    from custom.visibility_ancestors('record', p_subject_id) a
   order by a.depth, 3;

  -- ── 5. THE LANE (VIS-N-4). Only said out loud when it is not the closed default.
  v_lane := iam.lane_of('record', p_subject_id);
  if v_lane is distinct from 'mine' then
    return query
    select 'everyone'::text, null::uuid,
           case when c.discoverable then 'Anyone, and listed' else 'Anyone with the link' end,
           'viewer'::public.permission_level,
           'world lane'::text,
           case when c.discoverable
                then 'Published to the world and discoverable: it may be listed and searched.'
                else 'Published to the world but unlisted: reachable by its link and by nothing else.' end,
           null::text, null::uuid, v_manage
      from iam.content_lane c
     where c.resource_type = 'record' and c.resource_id = p_subject_id;
  end if;
end;
$function$

;
