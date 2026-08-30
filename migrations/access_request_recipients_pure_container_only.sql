-- access_request_recipients_pure_container_only.sql
--
-- Corrects two things in access_request_recipients_container_and_component_lanes.sql,
-- both caught by the corpus report that file shipped -- which is the report doing
-- exactly the job it was built for, on its first run.
--
-- 1. THE REGRESSION.  That file suppressed the owner lane for any token that
--    appears as a `container_type` in iam.memberships, so that an organization's
--    authority would come from its CURRENT owner/admin membership and never from
--    iam.organizations.created_by.  The reasoning was right; the test was too
--    wide.  `scope` and `project` are ALSO membership containers -- and unlike an
--    organization they are ordinary owned, shareable resources.  Live: 89 of 89
--    context.scopes carry a created_by, sit in a PERSONAL organization (so the
--    org-admin lane correctly declines), and have zero scope memberships.  Under
--    the wide test their owner was suppressed and lane A found nobody, so a scope
--    resolved to NO recipients -- where before that migration it resolved to its
--    owner.  A fix that takes a working case backwards is a defect, full stop.
--
--    The distinction that is actually meant is PURE container: a container whose
--    access model is membership INSTEAD of ownership.  The registry already draws
--    that line and it is the same line the decide half uses -- a pure container is
--    a membership container that is NOT in platform.shareable_resource_registry.
--    Live, that is exactly one token: `organization`.  You do not own a company,
--    you belong to it; you do own a scope.
--
--    Lanes A and B are therefore no longer exclusive alternatives:
--      A container_admin  runs for ANY membership container (organization, project, scope)
--      B owner            runs unless the token is a PURE container
--    A project or scope now reaches its own admins AND its owner -- strictly more
--    recipients than before either migration, and never fewer.
--
-- 2. A WRONG COMMENT, corrected for the record.  That file claimed the `platform`
--    schema has no default function ACL and so the new report function would never
--    be granted to client roles.  The conclusion held -- it is not client-callable
--    and needs no platform.client_callable_door row -- but the mechanism was wrong:
--    on apply, platform.enforce_definer_client_grants REVOKED a client EXECUTE
--    grant that HAD been issued, and said so in a warning.  The guard produced the
--    right end state; the comment mis-describes why.  db-rules FEATURE.md section
--    6d-4 is the authority, not that comment.
--
-- Idempotent.  Safe to re-run.

begin;

create or replace function iam.access_request_recipients(p_type text, p_id uuid)
returns table(user_id uuid, reason text)
language plpgsql
stable security definer
set search_path to 'public', 'platform', 'iam'
as $function$
declare
  v_cur_type    text := p_type;
  v_cur_id      uuid := p_id;
  v_meta        record;
  v_relid       oid;
  v_owner_col   text;
  v_org_col     text;
  v_owner       uuid;
  v_org         uuid;
  v_exists      boolean;
  v_is_container     boolean;
  v_is_pure_container boolean;
  v_hops        int  := 0;
  v_via         text := '';
  v_ids         uuid[] := '{}';
  v_reasons     text[] := '{}';
  v_lane_ids    uuid[];
  v_parent_type text;
  v_fk          text;
  v_parent_id   uuid;
begin
  if p_type is null or p_id is null then
    return;
  end if;

  <<walk>>
  while v_hops <= 6 loop
    select et.schema_name, et.table_name into v_meta
    from platform.entity_types et
    where et.token = v_cur_type and coalesce(et.is_active, true)
    limit 1;
    exit walk when v_meta.schema_name is null;

    begin
      v_relid := format('%I.%I', v_meta.schema_name, v_meta.table_name)::regclass;
    exception when others then
      exit walk;
    end;

    begin
      execute format('select true from %I.%I where id = $1',
                     v_meta.schema_name, v_meta.table_name)
        into v_exists using v_cur_id;
    exception when others then
      v_exists := null;
    end;
    exit walk when not coalesce(v_exists, false);

    -- Resolve the shape from the catalog rather than guessing a fixed tuple.
    select case when bool_or(a.attname = 'created_by') then 'created_by'
                when bool_or(a.attname = 'owner_id')   then 'owner_id' end,
           case when bool_or(a.attname = 'organization_id') then 'organization_id' end
      into v_owner_col, v_org_col
    from pg_attribute a
    where a.attrelid = v_relid and a.attnum > 0 and not a.attisdropped;

    v_owner := null;
    v_org   := null;
    if v_owner_col is not null or v_org_col is not null then
      begin
        execute format('select %s, %s from %I.%I where id = $1',
                       coalesce(v_owner_col, 'null::uuid'),
                       coalesce(v_org_col,   'null::uuid'),
                       v_meta.schema_name, v_meta.table_name)
          into v_owner, v_org using v_cur_id;
      exception when others then
        v_owner := null; v_org := null;
      end;
    end if;

    -- A membership container: the same question iam.has_access_for_base's
    -- membership lane asks, so the ask lands on the people access already admits.
    v_is_container := exists (
      select 1 from iam.memberships m
      where m.container_type = v_cur_type and m.deleted_at is null
    );

    -- A PURE container is one whose access model is membership INSTEAD of
    -- ownership -- a container that is not a shareable resource. Live: only
    -- `organization`. Its created_by is not authority (transfer_organization_
    -- ownership moves the membership and never touches that column), so the owner
    -- lane is suppressed for it and ONLY for it.
    v_is_pure_container := v_is_container and not exists (
      select 1 from platform.shareable_resource_registry sr
      where sr.resource_type = v_cur_type
    );

    -- Lane A -- container admins.
    if v_is_container then
      select array_agg(distinct m.user_id) into v_lane_ids
      from iam.memberships m
      join iam.membership_grant g
        on g.member_role = m.role and g.container_type in (v_cur_type, '*')
      where m.container_type = v_cur_type
        and m.container_id   = v_cur_id
        and m.deleted_at is null
        and coalesce(m.status, 'active') = 'active'
        and g.confers >= 'admin'::public.permission_level;
      if v_lane_ids is not null then
        v_ids     := v_ids     || v_lane_ids;
        v_reasons := v_reasons || array_fill(v_via || 'container_admin',
                                             array[cardinality(v_lane_ids)]);
      end if;
    end if;

    -- Lane B -- the row's own owner (every token except a pure container).
    if not v_is_pure_container and v_owner is not null then
      v_ids     := v_ids     || array[v_owner];
      v_reasons := v_reasons || array[v_via || 'owner'];
    end if;

    -- Lane C -- the owning organization's admins.
    if v_org is not null then
      select array_agg(distinct om.user_id) into v_lane_ids
      from iam.organization_member om
      join iam.organizations o on o.id = om.organization_id
      where om.organization_id = v_org
        and om.role in ('owner', 'admin')
        and coalesce(o.is_personal, false) = false;
      if v_lane_ids is not null then
        v_ids     := v_ids     || v_lane_ids;
        v_reasons := v_reasons || array_fill(v_via || 'org_admin',
                                             array[cardinality(v_lane_ids)]);
      end if;
    end if;

    -- Lane D -- explicit admin-level grantees (they can already decide).
    select array_agg(distinct u) into v_lane_ids
    from (
      select p.granted_to_user_id as u
      from iam.permissions p
      where p.resource_type = v_cur_type and p.resource_id = v_cur_id
        and p.permission_level = 'admin'::public.permission_level
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
        and p.granted_to_user_id is not null
      union
      select om.user_id
      from iam.permissions p
      join iam.organization_member om on om.organization_id = p.granted_to_organization_id
      join iam.organizations o on o.id = om.organization_id
      where p.resource_type = v_cur_type and p.resource_id = v_cur_id
        and p.permission_level = 'admin'::public.permission_level
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
        and p.granted_to_organization_id is not null
        and om.role in ('owner', 'admin')
        and coalesce(o.is_personal, false) = false
    ) s;
    if v_lane_ids is not null then
      v_ids     := v_ids     || v_lane_ids;
      v_reasons := v_reasons || array_fill(v_via || 'admin_grant',
                                           array[cardinality(v_lane_ids)]);
    end if;

    exit walk when cardinality(v_ids) > 0;

    -- Lane E -- nobody on this row. Delegate to the composition parent.
    select er.parent_type, er.fk_column into v_parent_type, v_fk
    from platform.entity_relationships er
    where er.child_type = v_cur_type
      and er.kind in ('composition', 'containment')
    order by (er.kind = 'composition') desc, er.parent_type
    limit 1;
    exit walk when v_parent_type is null or v_fk is null;

    begin
      execute format('select %I from %I.%I where id = $1',
                     v_fk, v_meta.schema_name, v_meta.table_name)
        into v_parent_id using v_cur_id;
    exception when others then
      v_parent_id := null;
    end;
    exit walk when v_parent_id is null;
    exit walk when (v_parent_type, v_parent_id) is not distinct from (v_cur_type, v_cur_id);

    v_via      := 'via_' || v_parent_type || ':';
    v_cur_type := v_parent_type;
    v_cur_id   := v_parent_id;
    v_hops     := v_hops + 1;
  end loop;

  return query
  select t.uid, min(t.rsn)
  from unnest(v_ids, v_reasons) as t(uid, rsn)
  where t.uid is not null
  group by t.uid;
end;
$function$;

commit;
