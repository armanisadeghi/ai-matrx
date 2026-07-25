-- Honest, per-entity effective-access explanation + a generic title resolver.
--
-- WHY: every list surface labels a row's access from the row's own
-- `visibility` column alone, so a file that is genuinely reachable by a whole
-- org through a scope still renders "Only you". `iam.has_access_for_base`
-- already grants access through `platform.reachability` containers, org
-- visibility, memberships and grants — the UI just had no way to ask WHY.
--
-- This is deliberately a ONE-ENTITY-AT-A-TIME primitive. It is not cheap
-- enough for a list; list surfaces stay on the cheap bulk signals and simply
-- stop asserting the specific claim "only you".
--
-- Idempotent (CREATE OR REPLACE + guarded updates).

-- 1) Generic display-title resolver, driven by platform.entity_types.title_column.
--    Never trust a denormalized association label for display: it goes stale
--    the moment the target is renamed. Resolve live instead.
create or replace function platform.entity_title(p_type text, p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'platform'
as $$
declare
  v_schema text;
  v_table text;
  v_title_col text;
  v_title text;
begin
  if p_type is null or p_id is null then
    return null;
  end if;

  select schema_name, table_name, title_column
    into v_schema, v_table, v_title_col
  from platform.entity_types
  where token = p_type;

  if v_schema is null or v_title_col is null then
    return null;
  end if;

  begin
    execute format('select %I::text from %I.%I where id = $1', v_title_col, v_schema, v_table)
      into v_title
      using p_id;
  exception
    when others then
      return null;
  end;

  return v_title;
end;
$$;

comment on function platform.entity_title(text, uuid) is
  'Display title for any entity token, resolved live from entity_types.title_column. Returns null when the type has no title column or the row is gone.';

-- 2) Access-filtered bulk title lookup for the client. Only ids the caller can
--    actually view come back — an unreadable id is simply absent, never a leak.
create or replace function public.entity_titles(p_type text, p_ids uuid[])
returns table(id uuid, title text)
language plpgsql
stable
security definer
set search_path to 'public', 'platform', 'iam'
as $$
declare
  v_id uuid;
begin
  if p_type is null or p_ids is null then
    return;
  end if;

  foreach v_id in array p_ids loop
    if v_id is not null and iam.has_access(p_type, v_id, 'viewer') then
      id := v_id;
      title := platform.entity_title(p_type, v_id);
      return next;
    end if;
  end loop;
end;
$$;

comment on function public.entity_titles(text, uuid[]) is
  'Display titles for a batch of entity ids of one token. Access-filtered: ids the caller cannot view are omitted.';

-- 3) The honest summary. Every reason an entity is reachable, in one shape.
--    Requires viewer on the entity. Grantee IDENTITIES are only included for
--    callers with admin (mirroring iam.fn_list_resource_permissions); everyone
--    else still gets the counts, so the UI can be truthful without leaking who.
create or replace function public.entity_access_summary(p_type text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'platform', 'iam'
as $$
declare
  v_uid uuid := auth.uid();
  v_schema text;
  v_table text;
  v_vis platform.visibility;
  v_owner uuid;
  v_org uuid;
  v_found boolean;
  v_can_manage boolean;
  v_grant_count int := 0;
  v_grants jsonb := '[]'::jsonb;
  v_containers jsonb := '[]'::jsonb;
  v_member_count int := 0;
begin
  if v_uid is null then
    raise exception 'entity_access_summary: not authenticated';
  end if;
  if not iam.has_access(p_type, p_id, 'viewer') then
    raise exception 'entity_access_summary: no access to % %', p_type, p_id;
  end if;

  select schema_name, table_name into v_schema, v_table
  from platform.entity_types
  where token = p_type;

  if v_schema is null then
    raise exception 'entity_access_summary: unknown entity type %', p_type;
  end if;

  select * into v_vis, v_owner, v_org, v_found
  from platform.entity_row_access_attrs(v_schema, v_table, p_id);

  if not coalesce(v_found, false) then
    raise exception 'entity_access_summary: % % not found', p_type, p_id;
  end if;

  v_can_manage := iam.has_access(p_type, p_id, 'admin');

  select count(*)::int into v_grant_count
  from iam.permissions pm
  where pm.resource_type = p_type
    and pm.resource_id = p_id
    and pm.status = 'active'
    and coalesce(pm.is_public, false) = false
    and (pm.expires_at is null or pm.expires_at > now());

  if v_can_manage then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'grantee_type', case when pm.granted_to_organization_id is not null
                               then 'organization' else 'user' end,
          'grantee_id', coalesce(pm.granted_to_organization_id, pm.granted_to_user_id),
          'grantee_label', case when pm.granted_to_organization_id is not null
                                then platform.entity_title('organization', pm.granted_to_organization_id)
                                else null end,
          'level', pm.permission_level::text,
          'expires_at', pm.expires_at
        )
        order by pm.created_at
      ),
      '[]'::jsonb
    )
    into v_grants
    from iam.permissions pm
    where pm.resource_type = p_type
      and pm.resource_id = p_id
      and pm.status = 'active'
      and coalesce(pm.is_public, false) = false
      and (pm.expires_at is null or pm.expires_at > now());
  end if;

  -- Containers this entity is reachable THROUGH. Filtered to containers the
  -- caller can themselves view, so a container name is never leaked.
  select coalesce(
    jsonb_agg(c.entry order by c.depth, c.container_type),
    '[]'::jsonb
  )
  into v_containers
  from (
    select
      r.depth,
      r.container_type,
      jsonb_build_object(
        'container_type', r.container_type,
        'container_id', r.container_id,
        'container_type_label', et.label,
        'label', platform.entity_title(r.container_type, r.container_id),
        'level', r.max_level::text,
        'depth', r.depth,
        'visibility', ca.o_vis::text,
        'organization_id', ca.o_org,
        'organization_name', platform.entity_title('organization', ca.o_org),
        'org_readable', (ca.o_vis >= 'internal'::platform.visibility and ca.o_org is not null),
        'member_count', (
          select count(distinct m.user_id)::int
          from iam.memberships m
          where m.container_type = r.container_type
            and m.container_id = r.container_id
            and m.deleted_at is null
        )
      ) as entry
    from platform.reachability r
    join platform.entity_types et on et.token = r.container_type
    cross join lateral platform.entity_row_access_attrs(et.schema_name, et.table_name, r.container_id) ca
    where r.item_type = p_type
      and r.item_id = p_id
      and ca.o_found
      and iam.has_access(r.container_type, r.container_id, 'viewer')
  ) c;

  select count(distinct m.user_id)::int into v_member_count
  from iam.memberships m
  where m.container_type = p_type
    and m.container_id = p_id
    and m.deleted_at is null;

  return jsonb_build_object(
    'entity_type', p_type,
    'entity_id', p_id,
    'visibility', v_vis::text,
    'owner_id', v_owner,
    'viewer_is_owner', (v_owner = v_uid),
    'organization_id', v_org,
    'organization_name', platform.entity_title('organization', v_org),
    'can_manage', v_can_manage,
    'is_public', (v_vis = 'public'::platform.visibility),
    'org_readable', (v_vis >= 'internal'::platform.visibility and v_org is not null),
    'direct_grant_count', v_grant_count,
    'direct_grants', v_grants,
    'member_count', v_member_count,
    'containers', v_containers,
    'container_count', jsonb_array_length(v_containers)
  );
end;
$$;

comment on function public.entity_access_summary(text, uuid) is
  'Every reason one entity is reachable - owner, visibility, org, direct grants, memberships, and reachability containers. One entity at a time; not for list surfaces.';

revoke all on function public.entity_titles(text, uuid[]) from public, anon;
revoke all on function public.entity_access_summary(text, uuid) from public, anon;
grant execute on function public.entity_titles(text, uuid[]) to authenticated;
grant execute on function public.entity_access_summary(text, uuid) to authenticated;

-- 4) Backfill the two live entity types missing a title_column. Without it
--    platform.entity_title (and the association pickers) cannot name the row.
update platform.entity_types set title_column = 'name'
where token = 'scope' and title_column is null;

update platform.entity_types set title_column = 'name'
where token = 'data_store' and title_column is null;

notify pgrst, 'reload schema';
