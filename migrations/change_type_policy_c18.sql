-- C-18: change-type policy surface + resolver (Dynamic Agent Graph, S3).
-- Catalogue source of truth: matrx-frontend features/change-policy/catalogue.ts
-- (platform.change_type_default mirrors it so SQL resolves without app code).
-- APPLIED LIVE via Supabase MCP 2026-08-16; this file is the ledger record.

-- 1) Platform defaults, seeded from the code catalogue.
create table if not exists platform.change_type_default (
  change_type_key text primary key,
  row_num integer not null unique check (row_num > 0),
  tier smallint not null check (tier between 1 and 6),
  label text not null,
  description text not null default '',
  default_mode text not null check (default_mode in ('off','automatic','review','review_with_timeout','auto_with_audit')),
  default_timeout_minutes integer not null default 2880 check (default_timeout_minutes > 0),
  default_timeout_expiry text not null check (default_timeout_expiry in ('proceed','hold')),
  floor_human_only boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table platform.change_type_default is
  'C-18: platform default handling per change type. Mirror of the code catalogue (matrx-frontend features/change-policy/catalogue.ts) so platform.resolve_change_handling works in pure SQL. Row 38 (change_own_handling_mode) is additionally floored STRUCTURALLY in the resolver body.';

alter table platform.change_type_default enable row level security;
drop policy if exists ctd_read on platform.change_type_default;
create policy ctd_read on platform.change_type_default
  for select to authenticated using (true);
drop policy if exists ctd_service on platform.change_type_default;
create policy ctd_service on platform.change_type_default
  for all to service_role using (true) with check (true);

drop trigger if exists _touch on platform.change_type_default;
create trigger _touch before update on platform.change_type_default
  for each row execute function platform._touch_row();

-- 2) Org overrides — sibling of platform.org_module_config.
create table if not exists platform.org_change_policy (
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  change_type_key text not null references platform.change_type_default(change_type_key) on update cascade,
  handling_mode text not null check (handling_mode in ('off','automatic','review','review_with_timeout','auto_with_audit')),
  timeout_minutes integer check (timeout_minutes > 0),
  timeout_expiry text check (timeout_expiry in ('proceed','hold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  created_by_tier text,
  created_by_system text,
  updated_by_tier text,
  updated_by_system text,
  primary key (organization_id, change_type_key)
);

comment on table platform.org_change_policy is
  'C-18: an organization''s override of platform.change_type_default. Written ONLY by platform.set_org_change_policy (human-tier, org owner/admin). Absent row = platform default. Rows for floored keys are rejected at write AND ignored by the resolver.';

alter table platform.org_change_policy enable row level security;
drop policy if exists ocp_read on platform.org_change_policy;
create policy ocp_read on platform.org_change_policy
  for select to authenticated
  using (organization_id in (select iam.my_orgs()));
drop policy if exists ocp_service on platform.org_change_policy;
create policy ocp_service on platform.org_change_policy
  for all to service_role using (true) with check (true);
-- Deliberately NO authenticated write policy: the SECURITY DEFINER RPC is the
-- one write path (it enforces the human-tier + floored-key + validation rules).

drop trigger if exists _touch on platform.org_change_policy;
create trigger _touch before update on platform.org_change_policy
  for each row execute function platform._touch_row();
drop trigger if exists _stamp_actor_tier on platform.org_change_policy;
create trigger _stamp_actor_tier before insert or update on platform.org_change_policy
  for each row execute function platform._stamp_actor_tier();

-- 3) THE RESOLVER — C-18 contract: every apply path consults this before acting.
create or replace function platform.resolve_change_handling(p_change_type_key text, p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'platform', 'iam', 'public'
as $$
declare
  d platform.change_type_default%rowtype;
  o platform.org_change_policy%rowtype;
begin
  -- ── THE ROW-38 STRUCTURAL FLOOR (research finding #4) ──────────────────
  -- "Change a change-type's own handling mode" is human-only, ALWAYS.
  -- Hard-coded here, before any table read, so no catalogue edit, seed drift,
  -- or org row can ever lift it. The system may never widen its own permissions.
  if p_change_type_key = 'change_own_handling_mode' then
    return jsonb_build_object(
      'change_type_key', p_change_type_key,
      'handling_mode', 'off',
      'timeout_minutes', null,
      'timeout_expiry', null,
      'tier', 6,
      'floored', true,
      'human_only', true,
      'source', 'structural_floor');
  end if;

  select * into d from platform.change_type_default where change_type_key = p_change_type_key;
  if not found then
    -- Loud-recovery law: an unknown key must never silently resolve to a
    -- permissive default. Register the key in the catalogue and reseed.
    raise exception '[change-policy] unknown change_type_key "%" — not in platform.change_type_default. Register it in CHANGE_TYPE_CATALOGUE (matrx-frontend features/change-policy/catalogue.ts) and apply the generated seed. Refusing to guess a handling mode.', p_change_type_key
      using errcode = 'P0002';
  end if;

  -- Defense in depth: any future floored row resolves like row 38 regardless
  -- of its stored mode or any org override.
  if d.floor_human_only then
    return jsonb_build_object(
      'change_type_key', p_change_type_key,
      'handling_mode', 'off',
      'timeout_minutes', null,
      'timeout_expiry', null,
      'tier', d.tier,
      'floored', true,
      'human_only', true,
      'source', 'structural_floor');
  end if;

  if p_organization_id is not null then
    select * into o from platform.org_change_policy
      where organization_id = p_organization_id and change_type_key = p_change_type_key;
    if found then
      return jsonb_build_object(
        'change_type_key', p_change_type_key,
        'handling_mode', o.handling_mode,
        'timeout_minutes', case when o.handling_mode = 'review_with_timeout'
                                then coalesce(o.timeout_minutes, d.default_timeout_minutes) end,
        'timeout_expiry', case when o.handling_mode = 'review_with_timeout'
                               then coalesce(o.timeout_expiry, d.default_timeout_expiry) end,
        'tier', d.tier,
        'floored', false,
        'human_only', false,
        'source', 'org_override');
    end if;
  end if;

  return jsonb_build_object(
    'change_type_key', p_change_type_key,
    'handling_mode', d.default_mode,
    'timeout_minutes', case when d.default_mode = 'review_with_timeout' then d.default_timeout_minutes end,
    'timeout_expiry', case when d.default_mode = 'review_with_timeout' then d.default_timeout_expiry end,
    'tier', d.tier,
    'floored', false,
    'human_only', false,
    'source', 'platform_default');
end;
$$;

comment on function platform.resolve_change_handling(text, uuid) is
  'C-18 resolver: org override beats platform default; unknown key RAISES (never a silent default); the row-38 floor (change_own_handling_mode -> off/human-only) is hard-coded in the body and cannot be configured away.';

-- 4) THE ONE WRITE PATH — org owner/admin, human tier only.
create or replace function platform.set_org_change_policy(
  p_org_id uuid,
  p_change_type_key text,
  p_handling_mode text default null,
  p_timeout_minutes integer default null,
  p_timeout_expiry text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'platform', 'iam', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_tier text := platform.actor_tier();
  d platform.change_type_default%rowtype;
begin
  if v_uid is null and v_tier <> 'human' then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  -- Row 38 IS this write: changing a change-type's handling mode is itself a
  -- change type, floored at human-only. Any non-human actor tier (C-11
  -- provenance session vars, platform.actor_tier()) is rejected outright.
  if v_tier <> 'human' then
    return jsonb_build_object('success', false, 'error',
      'Change-type policy is human-only (row 38 floor): actor tier "' || v_tier || '" may not modify handling modes.');
  end if;

  if v_uid is null or not exists (
    select 1 from iam.organization_member
    where organization_id = p_org_id and user_id = v_uid and role in ('owner','admin')
  ) then
    return jsonb_build_object('success', false, 'error', 'Only organization owners or admins can change the change policy');
  end if;

  select * into d from platform.change_type_default where change_type_key = p_change_type_key;
  if not found then
    return jsonb_build_object('success', false, 'error',
      'Unknown change type key: ' || p_change_type_key || '. The catalogue (change_type_default) is the row list.');
  end if;

  if d.floor_human_only or p_change_type_key = 'change_own_handling_mode' then
    return jsonb_build_object('success', false, 'error',
      'This change type is floored at human-only and cannot be overridden — the system may never widen its own permissions (row 38).');
  end if;

  if p_handling_mode is null then
    delete from platform.org_change_policy
      where organization_id = p_org_id and change_type_key = p_change_type_key;
    return jsonb_build_object('success', true, 'cleared', true,
      'resolved', platform.resolve_change_handling(p_change_type_key, p_org_id));
  end if;

  if p_handling_mode not in ('off','automatic','review','review_with_timeout','auto_with_audit') then
    return jsonb_build_object('success', false, 'error', 'Invalid handling mode: ' || p_handling_mode);
  end if;
  if p_timeout_expiry is not null and p_timeout_expiry not in ('proceed','hold') then
    return jsonb_build_object('success', false, 'error', 'Invalid timeout expiry: ' || p_timeout_expiry);
  end if;
  if p_handling_mode <> 'review_with_timeout' and (p_timeout_minutes is not null or p_timeout_expiry is not null) then
    return jsonb_build_object('success', false, 'error', 'Timeout settings only apply to review_with_timeout');
  end if;
  if p_timeout_minutes is not null and p_timeout_minutes <= 0 then
    return jsonb_build_object('success', false, 'error', 'Timeout minutes must be positive');
  end if;

  insert into platform.org_change_policy as ocp
    (organization_id, change_type_key, handling_mode, timeout_minutes, timeout_expiry)
  values
    (p_org_id, p_change_type_key, p_handling_mode, p_timeout_minutes, p_timeout_expiry)
  on conflict (organization_id, change_type_key) do update set
    handling_mode = excluded.handling_mode,
    timeout_minutes = excluded.timeout_minutes,
    timeout_expiry = excluded.timeout_expiry,
    updated_at = now();

  return jsonb_build_object('success', true, 'cleared', false,
    'resolved', platform.resolve_change_handling(p_change_type_key, p_org_id));
end;
$$;

comment on function platform.set_org_change_policy(uuid, text, text, integer, text) is
  'C-18 write path: upserts (or clears, mode=null) an org''s change-type override. Gated org owner/admin AND human actor tier; floored keys rejected for everyone.';

-- 5) Admin twin helper: per-org divergence counts (platform admins only).
create or replace function platform.get_change_policy_divergence()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'platform', 'iam', 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from admin.admins where user_id = v_uid) then
    raise exception '[change-policy] platform admin required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'organization_id', g.organization_id,
      'organization_name', o.name,
      'organization_slug', o.slug,
      'override_count', g.override_count,
      'last_updated', g.last_updated) order by g.override_count desc)
    from (
      select organization_id, count(*) as override_count, max(updated_at) as last_updated
      from platform.org_change_policy
      group by organization_id
    ) g
    join iam.organizations o on o.id = g.organization_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function platform.resolve_change_handling(text, uuid) to authenticated, service_role;
grant execute on function platform.set_org_change_policy(uuid, text, text, integer, text) to authenticated, service_role;
grant execute on function platform.get_change_policy_divergence() to authenticated, service_role;
grant select on platform.change_type_default to authenticated, service_role;
grant select on platform.org_change_policy to authenticated, service_role;
