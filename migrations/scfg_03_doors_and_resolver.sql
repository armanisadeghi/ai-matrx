-- scfg_03_doors_and_resolver.sql
-- ============================================================================
-- SCOPED CONFIGURATION Phase 1c — the ONE resolver and the ONE write path.
--
--   platform.knob_resolve         SECURITY INVOKER read: the resolution rule.
--   platform.knob_override_set    SECURITY DEFINER write: the only door.
--   platform.knob_index           SECURITY DEFINER read: per-org effective view
--                                 (generalizes public.hr_knob_index, and also
--                                 projects the presentation metadata that RPC
--                                 famously omitted — allowed_values/min/max).
--   platform.knob_override_count  SECURITY DEFINER read: admin surface counts.
--
-- Resolution rule (the whole system in four lines):
--   among this org's override rows whose scope_kind ∈ knob.overridable_by and
--   whose (scope_kind, scope_id) matches the request (org row, user row, or a
--   caller-supplied scope chain), the HIGHEST precedence present wins;
--   else the platform rung coalesce(value, default_value).
--   A MISSING KNOB RAISES (P0001) — no constant fallback, in any repo.
--   An override outside the knob's CURRENT numeric range / enum vocabulary is
--   clamped to it with RAISE WARNING: a platform admin tightening a range
--   beats every standing customer override instantly, without a sweep.
--
-- knob_resolve is SECURITY INVOKER on purpose: client callers read
-- platform.knob_override under its RLS (own orgs only), so the function can
-- never be a cross-tenant oracle; server-side callers (service_role /
-- privileged pool) see everything via svc_all. The three DEFINER doors are
-- registered in platform.client_callable_door below, per the 2026-08-28 rule
-- that unregistered definer grants are stripped.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- platform.knob_resolve
-- p_scopes: caller-supplied sub-org scope chain, e.g.
--   '[{"kind":"pay_group","id":"..."},{"kind":"location","id":"..."}]'
-- Only the call site knows which scopes a request is inside; the resolver
-- never guesses.
-- ----------------------------------------------------------------------------
create or replace function platform.knob_resolve(
  p_feature text,
  p_key text,
  p_organization_id uuid,
  p_user_id uuid default null,
  p_scopes jsonb default null
) returns jsonb
language plpgsql stable
set search_path to 'platform', 'public'
as $$
declare
  k record;
  v jsonb;
  v_num numeric;
begin
  select value_type, coalesce(value, default_value) as base,
         min_value, max_value, allowed_values, overridable_by
    into k
    from platform.feature_knob
   where feature = p_feature and key = p_key;
  if not found then
    raise exception 'platform.knob_resolve: knob %.% is not seeded', p_feature, p_key
      using errcode = 'P0001',
            hint = 'A missing knob raises rather than falling back to a hard-coded value. Seed it in the knob register.';
  end if;

  if p_organization_id is not null and k.overridable_by <> '{}'::text[] then
    select o.value into v
      from platform.knob_override o
      join platform.knob_scope_kind s on s.kind = o.scope_kind
     where o.feature = p_feature and o.key = p_key
       and o.organization_id = p_organization_id
       and o.scope_kind = any (k.overridable_by)
       and (   (o.scope_kind = 'organization')
            or (o.scope_kind = 'user' and p_user_id is not null and o.scope_id = p_user_id)
            or (p_scopes is not null and exists (
                  select 1 from jsonb_array_elements(p_scopes) e
                   where e ->> 'kind' = o.scope_kind
                     and (e ->> 'id')::uuid = o.scope_id)))
     order by s.precedence desc
     limit 1;
  end if;

  if v is null then
    return k.base;
  end if;

  -- Clamp an override to the knob's CURRENT constraints, loudly.
  if k.value_type in ('number','integer') and jsonb_typeof(v) = 'number' then
    v_num := (v #>> '{}')::numeric;
    if k.min_value is not null and v_num < k.min_value then
      raise warning 'knob_resolve: %.% override % below current min % — clamped',
        p_feature, p_key, v_num, k.min_value;
      return to_jsonb(k.min_value);
    end if;
    if k.max_value is not null and v_num > k.max_value then
      raise warning 'knob_resolve: %.% override % above current max % — clamped',
        p_feature, p_key, v_num, k.max_value;
      return to_jsonb(k.max_value);
    end if;
  elsif k.value_type in ('enum','string') and k.allowed_values is not null
        and not (k.allowed_values @> jsonb_build_array(v)) then
    raise warning 'knob_resolve: %.% override % no longer in allowed_values — using platform value',
      p_feature, p_key, v;
    return k.base;
  end if;

  return v;
end;
$$;

grant execute on function platform.knob_resolve(text, text, uuid, uuid, jsonb)
  to authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- platform.knob_override_set — THE one write path for every rung.
-- Per-rung permission gate INSIDE (settings-ladder rule 5). NULL value DELETES
-- the row: clearing removes the key, so "inherits" and "set to nothing" can
-- never be confused (settings-ladder rule 8 / HR RECORDED DECISION 21).
-- Structured refusal envelope, reason vocabulary inherited from esign.
-- ----------------------------------------------------------------------------
create or replace function platform.knob_override_set(
  p_feature text,
  p_key text,
  p_scope_kind text,
  p_scope_id uuid,
  p_organization_id uuid,
  p_value jsonb,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'platform', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  k platform.feature_knob%rowtype;
  s platform.knob_scope_kind%rowtype;
  v_owner uuid;
  v_num numeric;
  v_platform jsonb;
  v_effective jsonb;
  v_is_admin boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  v_is_admin := public.is_admin();

  select * into k from platform.feature_knob
   where feature = p_feature and key = p_key;
  if k.feature is null then
    return jsonb_build_object('ok', false, 'reason', 'unregistered_key',
      'feature', p_feature, 'key', p_key,
      'detail', 'That configuration key is not in the register.');
  end if;

  select * into s from platform.knob_scope_kind where kind = p_scope_kind;
  if s.kind is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_scope_kind',
      'scope_kind', p_scope_kind);
  end if;

  if not (p_scope_kind = any (k.overridable_by)) then
    return jsonb_build_object('ok', false, 'reason', 'not_overridable',
      'feature', p_feature, 'key', p_key, 'scope_kind', p_scope_kind,
      'detail', case when k.overridable_by = '{}'::text[]
                     then 'This is a platform-controlled setting.'
                     else 'This setting may be overridden by: '
                          || array_to_string(k.overridable_by, ', ') end);
  end if;

  -- Per-rung permission gate, inside the one write path.
  if p_scope_kind = 'user' then
    if p_scope_id is distinct from v_uid and not v_is_admin then
      return jsonb_build_object('ok', false, 'reason', 'forbidden',
        'detail', 'A user-scope override can only be set for yourself.');
    end if;
    if not exists (select 1 from iam.organization_member m
                    where m.organization_id = p_organization_id
                      and m.user_id = p_scope_id) and not v_is_admin then
      return jsonb_build_object('ok', false, 'reason', 'forbidden',
        'detail', 'Not a member of that organization.');
    end if;
  else
    if not v_is_admin and not exists (
        select 1 from iam.organization_member m
         where m.organization_id = p_organization_id
           and m.user_id = v_uid and m.role in ('owner','admin')) then
      return jsonb_build_object('ok', false, 'reason', 'forbidden',
        'detail', 'Organization configuration is owner/admin only.');
    end if;
  end if;

  -- Scope identity: the org rung is the org itself; a registered sub-org rung
  -- must name a live row that belongs to this organization.
  if p_scope_kind = 'organization' then
    if p_scope_id is distinct from p_organization_id then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'field', 'scope_id',
        'detail', 'An organization-scope override uses the organization id as its scope id.');
    end if;
  elsif s.scope_table is not null then
    if p_scope_id is null then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'field', 'scope_id',
        'detail', format('A %s-scoped override needs the row it applies to.', p_scope_kind));
    end if;
    execute format('select organization_id from %I.%I where id = $1 and deleted_at is null',
                   s.scope_schema, s.scope_table)
      into v_owner using p_scope_id;
    if v_owner is distinct from p_organization_id then
      return jsonb_build_object('ok', false, 'reason', 'scope_not_in_organization',
        'detail', 'That scope row belongs to a different organization.');
    end if;
  end if;

  -- NULL clears: remove the key (never write a null).
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    delete from platform.knob_override
     where feature = p_feature and key = p_key and scope_kind = p_scope_kind
       and scope_id = p_scope_id and organization_id = p_organization_id;
    return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
      'scope_kind', p_scope_kind, 'scope_id', p_scope_id, 'key_removed', true,
      'effective_value', platform.knob_resolve(p_feature, p_key, p_organization_id),
      'origin', 'cleared');
  end if;

  -- Type validation, mirroring platform.feature_knob_set; 'json' accepts any shape.
  if k.value_type in ('number','integer') then
    if jsonb_typeof(p_value) <> 'number' then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'detail', format('%s.%s expects a number, got %s', p_feature, p_key, jsonb_typeof(p_value)));
    end if;
    v_num := (p_value #>> '{}')::numeric;
    if k.value_type = 'integer' and v_num <> trunc(v_num) then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'detail', format('%s.%s expects a whole number', p_feature, p_key));
    end if;
    if k.min_value is not null and v_num < k.min_value then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'detail', format('%s.%s must be >= %s', p_feature, p_key, k.min_value));
    end if;
    if k.max_value is not null and v_num > k.max_value then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'detail', format('%s.%s must be <= %s', p_feature, p_key, k.max_value));
    end if;
    -- Direction and statutory floor, against the LIVE platform rung.
    v_platform := coalesce(k.value, k.default_value);
    if k.override_direction = 'lower_only' and v_num > (v_platform #>> '{}')::numeric then
      return jsonb_build_object('ok', false, 'reason', 'raise_not_permitted',
        'feature', p_feature, 'key', p_key, 'ceiling', v_platform);
    end if;
    if k.override_direction = 'raise_only' and v_num < (v_platform #>> '{}')::numeric then
      return jsonb_build_object('ok', false, 'reason', 'lower_not_permitted',
        'feature', p_feature, 'key', p_key,
        'floor', coalesce(k.bound_value, v_platform));
    end if;
    if k.bound_value is not null and v_num < (k.bound_value #>> '{}')::numeric then
      return jsonb_build_object('ok', false, 'reason', 'below_statutory_floor',
        'feature', p_feature, 'key', p_key, 'floor', k.bound_value);
    end if;
  elsif k.value_type = 'boolean' then
    if jsonb_typeof(p_value) <> 'boolean' then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'detail', format('%s.%s expects a boolean', p_feature, p_key));
    end if;
  elsif k.value_type in ('string','enum') then
    if jsonb_typeof(p_value) <> 'string' then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'detail', format('%s.%s expects a string', p_feature, p_key));
    end if;
    if k.allowed_values is not null
       and not (k.allowed_values @> jsonb_build_array(p_value)) then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'detail', format('%s.%s must be one of %s', p_feature, p_key, k.allowed_values::text));
    end if;
  end if;
  -- Note: enum-ordering directions (raise_only on a factor ladder) are the
  -- owning feature's wrapper's job — a generic register knows no enum order.

  insert into platform.knob_override
    (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values
    (p_feature, p_key, p_scope_kind, p_scope_id, p_organization_id, p_value, p_note, v_uid)
  on conflict (feature, key, scope_kind, scope_id, organization_id)
  do update set value = excluded.value,
                set_note = excluded.set_note,
                updated_by = excluded.updated_by,
                updated_at = now();

  v_effective := platform.knob_resolve(p_feature, p_key, p_organization_id,
    case when p_scope_kind = 'user' then p_scope_id else null end,
    case when p_scope_kind not in ('organization','user')
         then jsonb_build_array(jsonb_build_object('kind', p_scope_kind, 'id', p_scope_id))
         else null end);

  return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
    'scope_kind', p_scope_kind, 'scope_id', p_scope_id,
    'effective_value', v_effective,
    'origin', case p_scope_kind when 'organization' then 'org_override'
                                when 'user' then 'user_override'
                                else p_scope_kind || '_override' end);
end;
$$;

grant execute on function platform.knob_override_set(text, text, text, uuid, uuid, jsonb, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- platform.knob_index — the effective-configuration view for one org.
-- Every row carries the presentation metadata (label/allowed_values/min/max/
-- unit) alongside resolution state, so no consumer needs a second read of
-- platform.feature_knob (the dual-read useHrKnobs was forced into).
-- Membership-gated: any member may SEE the org's configuration; only
-- owners/admins may change it (the setter enforces that).
-- ----------------------------------------------------------------------------
create or replace function platform.knob_index(
  p_organization_id uuid,
  p_feature_prefix text default null,
  p_user_id uuid default null,
  p_overridden_only boolean default false
) returns jsonb
language plpgsql stable
security definer
set search_path to 'platform', 'public'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'platform.knob_index: no authenticated caller' using errcode = '42501';
  end if;
  if not public.is_admin() and not exists (
      select 1 from iam.organization_member m
       where m.organization_id = p_organization_id and m.user_id = v_uid) then
    raise exception 'platform.knob_index: not a member of that organization' using errcode = '42501';
  end if;
  if p_user_id is not null and p_user_id is distinct from v_uid and not public.is_admin() then
    raise exception 'platform.knob_index: user rung is self-only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'keys', coalesce((
      select jsonb_agg(x order by x ->> 'feature', x ->> 'key')
      from (
        select jsonb_build_object(
          'feature', k.feature,
          'key', k.key,
          'full_key', k.feature || '.' || k.key,
          'label', k.label,
          'description', k.description,
          'value_type', k.value_type,
          'unit', k.unit,
          'allowed_values', k.allowed_values,
          'min_value', k.min_value,
          'max_value', k.max_value,
          'basis', k.basis,
          'set_by', k.set_by,
          'review_due', k.review_due,
          'overridable_by', to_jsonb(k.overridable_by),
          'override_direction', k.override_direction,
          'bound_value', k.bound_value,
          'platform_locked', (k.overridable_by = '{}'::text[]),
          'platform_default', coalesce(k.value, k.default_value),
          'shipped_default', k.default_value,
          'org_override', oo.value,
          'user_override', uo.value,
          'effective_value', coalesce(uo.value, oo.value, k.value, k.default_value),
          'origin', case
             when uo.value is not null then 'user_override'
             when oo.value is not null then 'org_override'
             when coalesce(k.value, k.default_value) is not null then 'platform_default'
             else 'missing' end,
          'is_overridden', (oo.value is not null or uo.value is not null),
          'out_of_range', (
            k.value_type in ('number','integer')
            and coalesce(uo.value, oo.value) is not null
            and jsonb_typeof(coalesce(uo.value, oo.value)) = 'number'
            and (   (k.min_value is not null and (coalesce(uo.value, oo.value) #>> '{}')::numeric < k.min_value)
                 or (k.max_value is not null and (coalesce(uo.value, oo.value) #>> '{}')::numeric > k.max_value)))
        ) as x
        from platform.feature_knob k
        left join platform.knob_override oo
          on oo.feature = k.feature and oo.key = k.key
         and oo.organization_id = p_organization_id
         and oo.scope_kind = 'organization'
         and 'organization' = any (k.overridable_by)
        left join platform.knob_override uo
          on p_user_id is not null
         and uo.feature = k.feature and uo.key = k.key
         and uo.organization_id = p_organization_id
         and uo.scope_kind = 'user' and uo.scope_id = p_user_id
         and 'user' = any (k.overridable_by)
        where (p_feature_prefix is null
               or k.feature = p_feature_prefix
               or k.feature like p_feature_prefix || '.%')
          and (p_feature_prefix is not null or k.overridable_by <> '{}'::text[])
      ) rows
      where not p_overridden_only or (x ->> 'is_overridden')::boolean
    ), '[]'::jsonb));
end;
$$;

grant execute on function platform.knob_index(uuid, text, uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- platform.knob_override_count — the admin surface's per-knob override counts.
-- ----------------------------------------------------------------------------
create or replace function platform.knob_override_count(
  p_feature_prefix text default null
) returns jsonb
language plpgsql stable
security definer
set search_path to 'platform', 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'platform.knob_override_count: admin only' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'feature', feature, 'key', key,
             'org_count', org_count, 'total_count', total_count)
           order by feature, key)
      from (
        select o.feature, o.key,
               count(*) filter (where o.scope_kind = 'organization') as org_count,
               count(*) as total_count
          from platform.knob_override o
         where p_feature_prefix is null
            or o.feature = p_feature_prefix
            or o.feature like p_feature_prefix || '.%'
         group by o.feature, o.key
      ) c
  ), '[]'::jsonb);
end;
$$;

grant execute on function platform.knob_override_count(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Register the definer doors (2026-08-28 rule: unregistered definer grants are
-- stripped by platform.enforce_definer_client_grants).
-- ----------------------------------------------------------------------------
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
select v.schema_name, v.function_name, v.identity_args, v.declared_by, v.reason
from (values
  ('platform', 'knob_override_set',
   'p_feature text, p_key text, p_scope_kind text, p_scope_id uuid, p_organization_id uuid, p_value jsonb, p_note text',
   'scfg_03',
   'The one write path for scoped configuration overrides (org/sub-org/user rungs); per-rung permission gate inside.'),
  ('platform', 'knob_index',
   'p_organization_id uuid, p_feature_prefix text, p_user_id uuid, p_overridden_only boolean',
   'scfg_03',
   'Effective-configuration view for an organization; membership-gated read for the org config and user settings surfaces.'),
  ('platform', 'knob_override_count',
   'p_feature_prefix text',
   'scfg_03',
   'Per-knob override counts for the platform admin Limits & Knobs surface; platform-admin gated.')
) as v(schema_name, function_name, identity_args, declared_by, reason)
where not exists (
  select 1 from platform.client_callable_door d
   where d.schema_name = v.schema_name
     and d.function_name = v.function_name
     and d.identity_args = v.identity_args);
