-- iam_org_member_governance.sql
-- Org-admin user management: a governance OVERLAY on top of public.organization_members.
--
-- Why an overlay (not a column-add on organization_members / a migration to iam.memberships):
--   The DB is mid-transition; org membership still lives on public.organization_members while
--   iam.memberships holds only projects. This migration is purely ADDITIVE (new iam tables +
--   new public RPCs), so it can land safely without repointing the live membership path.
--   It is keyed by (organization_id, user_id), so it survives a future membership migration.
--
-- Model:
--   * iam.org_member_controls  -- per (org,user): suspend status + admin controls (budget, storage
--                                  cap, tier override, member level, notes). NOT PostgREST-exposed.
--   * iam.org_admin_audit      -- every org-admin governance action. NOT PostgREST-exposed.
--   * public.org_admin_*       -- SECURITY DEFINER RPCs, the ONLY access path. Each starts with the
--                                  org-admin gate public.is_org_admin(p_org_id) (owner|admin role).
--
-- Authorization: reuses public.is_org_admin(uuid) (auth.uid() must be owner/admin of the org).
-- This is the org-level analogue of the protected-resources pattern (RLS deny + DEFINER RPC + audit),
-- gated by org-admin instead of is_super_admin().
--
-- Idempotent: safe to re-apply (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS).

create schema if not exists iam;

-- ---------------------------------------------------------------------------
-- 1. Governance tables (iam schema; not exposed to PostgREST — RPC access only)
-- ---------------------------------------------------------------------------
create table if not exists iam.org_member_controls (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null,
  user_id               uuid not null,
  status                text not null default 'active' check (status in ('active','suspended')),
  suspended_at          timestamptz,
  suspended_by          uuid,
  suspend_reason        text,
  member_level          text,          -- org-defined label e.g. 'standard' | 'premium' | 'enterprise'
  tier_override         text,          -- files.account_tiers.id override (advisory in v1)
  storage_cap_bytes     bigint,        -- per-member storage cap override (advisory in v1)
  monthly_budget_mcents bigint,        -- spend budget in milli-cents (advisory in v1)
  notes                 text,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  updated_by            uuid,
  version               int not null default 1,
  unique (organization_id, user_id)
);
create index if not exists org_member_controls_org_idx        on iam.org_member_controls(organization_id);
create index if not exists org_member_controls_org_status_idx on iam.org_member_controls(organization_id, status);

create table if not exists iam.org_admin_audit (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  actor_user_id   uuid,
  target_user_id  uuid,
  action          text not null,
  detail          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists org_admin_audit_org_idx on iam.org_admin_audit(organization_id, created_at desc);

-- RLS: deny all direct access. Every read/write goes through a public.org_admin_* DEFINER RPC.
alter table iam.org_member_controls enable row level security;
alter table iam.org_admin_audit     enable row level security;
-- (No policies created => default-deny for non-owner roles. SECURITY DEFINER RPCs bypass RLS.)

-- ---------------------------------------------------------------------------
-- 2. Internal helpers (iam schema)
-- ---------------------------------------------------------------------------

-- Resolve the actual owner column for a resource table, tolerant of registry drift.
create or replace function iam._resolve_owner_column(p_schema text, p_table text, p_pref text)
returns text language sql stable set search_path = public, pg_temp as $$
  select c.column_name
  from information_schema.columns c
  where c.table_schema = p_schema
    and c.table_name   = p_table
    and c.column_name  = any (array[p_pref, 'created_by', 'user_id', 'owner_id', 'owner_user_id'])
  order by array_position(array[p_pref, 'created_by', 'user_id', 'owner_id', 'owner_user_id'], c.column_name)
  limit 1;
$$;

create or replace function iam._org_audit(p_org uuid, p_target uuid, p_action text, p_detail jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into iam.org_admin_audit(organization_id, actor_user_id, target_user_id, action, detail)
  values (p_org, auth.uid(), p_target, p_action, coalesce(p_detail, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- 3. Public RPCs (the only access path; each gated by public.is_org_admin)
-- ---------------------------------------------------------------------------

-- 3a. Roster with per-member, ORG-SCOPED metrics + global usage context.
create or replace function public.org_admin_list_members(p_org_id uuid)
returns table(
  user_id               uuid,
  email                 text,
  display_name          text,
  avatar_url            text,
  role                  text,
  joined_at             timestamptz,
  status                text,
  member_level          text,
  tier_override         text,
  storage_cap_bytes     bigint,
  monthly_budget_mcents bigint,
  org_files_count       bigint,
  org_bytes_used        bigint,
  account_bytes_used    bigint,
  account_files_count   integer,
  last_org_activity_at  timestamptz,
  last_request_at       timestamptz,
  cost_24h_mcents       bigint,
  requests_24h          integer,
  requests_6h           integer
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;

  return query
  select om.user_id,
         au.email::text,
         coalesce(p.display_name, au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name')::text,
         coalesce(p.avatar_url, au.raw_user_meta_data->>'avatar_url')::text,
         om.role::text,
         om.joined_at,
         coalesce(c.status, 'active'),
         c.member_level,
         c.tier_override,
         c.storage_cap_bytes,
         c.monthly_budget_mcents,
         coalesce(f.org_files_count, 0),
         coalesce(f.org_bytes_used, 0),
         coalesce(su.bytes_used, 0),
         coalesce(su.files_count, 0),
         conv.last_org_activity_at,
         uus.last_request_at,
         coalesce(uus.cost_24h_mcents, 0),
         coalesce(uus.requests_24h, 0),
         coalesce(uus.requests_6h, 0)
  from public.organization_members om
  left join auth.users au               on au.id = om.user_id
  left join public.profiles p           on p.id  = om.user_id
  left join iam.org_member_controls c    on c.organization_id = om.organization_id and c.user_id = om.user_id
  left join lateral (
    select count(*) as org_files_count, coalesce(sum(ff.size_bytes), 0) as org_bytes_used
    from files.files ff
    where ff.organization_id = om.organization_id and ff.created_by = om.user_id and ff.deleted_at is null
  ) f on true
  left join files.user_storage_usage su  on su.user_id = om.user_id
  left join chat.user_usage_summary uus  on uus.user_id = om.user_id
  left join lateral (
    select max(cv.updated_at) as last_org_activity_at
    from chat.conversation cv
    where cv.organization_id = om.organization_id and cv.created_by = om.user_id and cv.deleted_at is null
  ) conv on true
  where om.organization_id = p_org_id
  order by om.joined_at asc;
end;
$$;

-- 3b. Org-wide aggregate overview.
create or replace function public.org_admin_overview(p_org_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_members',   count(*),
    'admins',          count(*) filter (where role in ('owner','admin')),
    'suspended',       count(*) filter (where status = 'suspended'),
    'active_7d',       count(*) filter (where last_org_activity_at >= now() - interval '7 days'),
    'active_30d',      count(*) filter (where last_org_activity_at >= now() - interval '30 days'),
    'never_active',    count(*) filter (where last_org_activity_at is null),
    'org_bytes_used',  coalesce(sum(org_bytes_used), 0),
    'org_files_count', coalesce(sum(org_files_count), 0),
    'cost_24h_mcents', coalesce(sum(cost_24h_mcents), 0),
    'requests_24h',    coalesce(sum(requests_24h), 0)
  ) into v
  from public.org_admin_list_members(p_org_id);

  return v;
end;
$$;

-- 3c. Count a member's ORG-SCOPED resources per registered type (registry-driven).
create or replace function public.org_admin_list_member_resources(p_org_id uuid, p_user_id uuid)
returns table(resource_type text, display_label text, schema_name text, table_name text, count bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_owner text; v_has_deleted boolean; v_sql text; v_count bigint;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;

  for r in
    select reg.resource_type,
           coalesce(reg.display_label, reg.resource_type) as display_label,
           coalesce(reg.schema_name, 'public')            as schema_name,
           reg.table_name,
           reg.owner_column
    from public.shareable_resource_registry reg
    where coalesce(reg.is_active, true)
  loop
    -- must physically exist and carry organization_id (org-scoped resources only)
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = r.schema_name and c.table_name = r.table_name and c.column_name = 'organization_id'
    ) then
      continue;
    end if;

    v_owner := iam._resolve_owner_column(r.schema_name, r.table_name, r.owner_column);
    if v_owner is null then continue; end if;

    v_has_deleted := exists (
      select 1 from information_schema.columns c
      where c.table_schema = r.schema_name and c.table_name = r.table_name and c.column_name = 'deleted_at'
    );

    v_sql := format('select count(*) from %I.%I where organization_id = $1 and %I = $2',
                    r.schema_name, r.table_name, v_owner);
    if v_has_deleted then v_sql := v_sql || ' and deleted_at is null'; end if;

    execute v_sql into v_count using p_org_id, p_user_id;

    if v_count > 0 then
      resource_type := r.resource_type;
      display_label := r.display_label;
      schema_name   := r.schema_name;
      table_name    := r.table_name;
      count         := v_count;
      return next;
    end if;
  end loop;
end;
$$;

-- 3d. Reassign a member's ORG-SCOPED resources to another member (registry-driven).
--     Only rows where organization_id = p_org_id move; personal-org resources are never touched.
create or replace function public.org_admin_reassign_member_resources(
  p_org_id uuid, p_from_user uuid, p_to_user uuid, p_resource_types text[] default null
)
returns table(resource_type text, reassigned bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_owner text; v_sql text; v_n bigint; v_total bigint := 0;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;
  if p_from_user = p_to_user then
    raise exception 'Source and target users must differ' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = p_org_id and om.user_id = p_to_user
  ) then
    raise exception 'Target user is not a member of this organization' using errcode = '23503';
  end if;

  for r in
    select reg.resource_type,
           coalesce(reg.schema_name, 'public') as schema_name,
           reg.table_name,
           reg.owner_column
    from public.shareable_resource_registry reg
    where coalesce(reg.is_active, true)
      and (p_resource_types is null or reg.resource_type = any (p_resource_types))
  loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = r.schema_name and c.table_name = r.table_name and c.column_name = 'organization_id'
    ) then
      continue;
    end if;

    v_owner := iam._resolve_owner_column(r.schema_name, r.table_name, r.owner_column);
    if v_owner is null then continue; end if;

    v_sql := format('update %I.%I set %I = $1 where organization_id = $2 and %I = $3',
                    r.schema_name, r.table_name, v_owner, v_owner);
    execute v_sql using p_to_user, p_org_id, p_from_user;
    get diagnostics v_n = row_count;

    if v_n > 0 then
      resource_type := r.resource_type;
      reassigned    := v_n;
      v_total       := v_total + v_n;
      return next;
    end if;
  end loop;

  perform iam._org_audit(p_org_id, p_from_user, 'resources.reassign',
                         jsonb_build_object('to_user', p_to_user, 'types', p_resource_types, 'total', v_total));
end;
$$;

-- 3e. Upsert per-member admin controls (full desired value set; null clears a field).
create or replace function public.org_admin_set_member_controls(
  p_org_id uuid,
  p_user_id uuid,
  p_member_level text default null,
  p_tier_override text default null,
  p_storage_cap_bytes bigint default null,
  p_monthly_budget_mcents bigint default null,
  p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row iam.org_member_controls;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = p_org_id and om.user_id = p_user_id
  ) then
    raise exception 'User is not a member of this organization' using errcode = '23503';
  end if;

  insert into iam.org_member_controls(
    organization_id, user_id, member_level, tier_override, storage_cap_bytes, monthly_budget_mcents, notes,
    created_by, updated_by
  ) values (
    p_org_id, p_user_id, p_member_level, p_tier_override, p_storage_cap_bytes, p_monthly_budget_mcents, p_notes,
    auth.uid(), auth.uid()
  )
  on conflict (organization_id, user_id) do update
    set member_level          = excluded.member_level,
        tier_override         = excluded.tier_override,
        storage_cap_bytes     = excluded.storage_cap_bytes,
        monthly_budget_mcents = excluded.monthly_budget_mcents,
        notes                 = excluded.notes,
        updated_at            = now(),
        updated_by            = auth.uid(),
        version               = iam.org_member_controls.version + 1
  returning * into v_row;

  perform iam._org_audit(p_org_id, p_user_id, 'controls.update', jsonb_build_object(
    'member_level', p_member_level, 'tier_override', p_tier_override,
    'storage_cap_bytes', p_storage_cap_bytes, 'monthly_budget_mcents', p_monthly_budget_mcents));

  return to_jsonb(v_row);
end;
$$;

-- 3f. Suspend / reactivate a member.
create or replace function public.org_admin_set_member_status(
  p_org_id uuid, p_user_id uuid, p_status text, p_reason text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row iam.org_member_controls; v_role text;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;
  if p_status not in ('active','suspended') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own status' using errcode = '42501';
  end if;

  select om.role::text into v_role
  from public.organization_members om
  where om.organization_id = p_org_id and om.user_id = p_user_id;
  if v_role is null then
    raise exception 'User is not a member of this organization' using errcode = '23503';
  end if;
  if v_role = 'owner' and p_status = 'suspended' then
    raise exception 'Owners cannot be suspended' using errcode = '42501';
  end if;

  insert into iam.org_member_controls(
    organization_id, user_id, status, suspended_at, suspended_by, suspend_reason, created_by, updated_by
  ) values (
    p_org_id, p_user_id, p_status,
    case when p_status = 'suspended' then now() end,
    case when p_status = 'suspended' then auth.uid() end,
    case when p_status = 'suspended' then p_reason end,
    auth.uid(), auth.uid()
  )
  on conflict (organization_id, user_id) do update
    set status         = excluded.status,
        suspended_at   = case when excluded.status = 'suspended' then now()       else null end,
        suspended_by   = case when excluded.status = 'suspended' then auth.uid()  else null end,
        suspend_reason = case when excluded.status = 'suspended' then p_reason    else null end,
        updated_at     = now(),
        updated_by     = auth.uid(),
        version        = iam.org_member_controls.version + 1
  returning * into v_row;

  perform iam._org_audit(p_org_id, p_user_id,
    case when p_status = 'suspended' then 'member.suspend' else 'member.reactivate' end,
    jsonb_build_object('reason', p_reason));

  return to_jsonb(v_row);
end;
$$;

-- 3g. Remove a member, optionally reassigning their org-scoped resources first.
create or replace function public.org_admin_remove_member(
  p_org_id uuid, p_user_id uuid, p_reassign_to uuid default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text; v_owner_count int; v_reassigned jsonb := '[]'::jsonb;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Use leave organization to remove yourself' using errcode = '42501';
  end if;

  select om.role::text into v_role
  from public.organization_members om
  where om.organization_id = p_org_id and om.user_id = p_user_id;
  if v_role is null then
    raise exception 'User is not a member of this organization' using errcode = '23503';
  end if;
  if v_role = 'owner' then
    select count(*) into v_owner_count
    from public.organization_members
    where organization_id = p_org_id and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'Cannot remove the last owner' using errcode = '42501';
    end if;
  end if;

  if p_reassign_to is not null then
    select coalesce(jsonb_agg(jsonb_build_object('resource_type', resource_type, 'reassigned', reassigned)), '[]'::jsonb)
      into v_reassigned
      from public.org_admin_reassign_member_resources(p_org_id, p_user_id, p_reassign_to, null);
  end if;

  delete from public.organization_members where organization_id = p_org_id and user_id = p_user_id;
  delete from iam.org_member_controls     where organization_id = p_org_id and user_id = p_user_id;

  perform iam._org_audit(p_org_id, p_user_id, 'member.remove',
                         jsonb_build_object('reassigned_to', p_reassign_to, 'reassigned', v_reassigned));

  return jsonb_build_object('removed', true, 'reassigned', v_reassigned);
end;
$$;

-- 3h. Single member detail (roster row + resource breakdown).
create or replace function public.org_admin_get_member(p_org_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_member jsonb; v_res jsonb;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;

  select to_jsonb(m) into v_member
  from public.org_admin_list_members(p_org_id) m
  where m.user_id = p_user_id;
  if v_member is null then
    raise exception 'User is not a member of this organization' using errcode = '23503';
  end if;

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_res
  from public.org_admin_list_member_resources(p_org_id, p_user_id) r;

  return v_member || jsonb_build_object('resources', v_res);
end;
$$;

-- 3i. Governance audit log for the org.
create or replace function public.org_admin_list_audit(p_org_id uuid, p_limit int default 100)
returns table(
  id uuid, actor_user_id uuid, actor_email text, target_user_id uuid, target_email text,
  action text, detail jsonb, created_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;

  return query
  select a.id, a.actor_user_id, aa.email::text, a.target_user_id, ta.email::text, a.action, a.detail, a.created_at
  from iam.org_admin_audit a
  left join auth.users aa on aa.id = a.actor_user_id
  left join auth.users ta on ta.id = a.target_user_id
  where a.organization_id = p_org_id
  order by a.created_at desc
  limit greatest(1, least(p_limit, 500));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants — only the public RPCs are callable by authenticated users.
-- ---------------------------------------------------------------------------
grant execute on function public.org_admin_list_members(uuid)                              to authenticated;
grant execute on function public.org_admin_overview(uuid)                                  to authenticated;
grant execute on function public.org_admin_list_member_resources(uuid, uuid)               to authenticated;
grant execute on function public.org_admin_reassign_member_resources(uuid, uuid, uuid, text[]) to authenticated;
grant execute on function public.org_admin_set_member_controls(uuid, uuid, text, text, bigint, bigint, text) to authenticated;
grant execute on function public.org_admin_set_member_status(uuid, uuid, text, text)       to authenticated;
grant execute on function public.org_admin_remove_member(uuid, uuid, uuid)                 to authenticated;
grant execute on function public.org_admin_get_member(uuid, uuid)                          to authenticated;
grant execute on function public.org_admin_list_audit(uuid, int)                           to authenticated;
