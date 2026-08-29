-- scfg_12: rewrite the HR knob machinery over the scoped-configuration
-- primitive, signatures and return envelopes preserved. The org jsonb blob is
-- NOT touched here (scfg_13 strips it after this migration's parity block).
--
-- Also introduces platform._knob_override_write — the ONE gate-free
-- validation+write body. Doors keep their own permission gates
-- (knob_override_set: org owner/admin membership; hr_knob_set/clear: the HR
-- capability gate hr._l1_settings_gate) and delegate the write to it, so
-- "one write path with per-rung gates inside" holds without forcing HR
-- admins to also be org owners.

-- ---------------------------------------------------------------------------
-- 1. The shared write body (NOT client-callable; no grant, definer, internal).
-- ---------------------------------------------------------------------------
create or replace function platform._knob_override_write(
  p_feature text,
  p_key text,
  p_scope_kind text,
  p_scope_id uuid,
  p_organization_id uuid,
  p_value jsonb,
  p_note text,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'platform', 'public'
as $$
declare
  k platform.feature_knob%rowtype;
  s platform.knob_scope_kind%rowtype;
  v_owner uuid;
  v_num numeric;
  v_platform jsonb;
begin
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

  if p_value is null or jsonb_typeof(p_value) = 'null' then
    delete from platform.knob_override
     where feature = p_feature and key = p_key and scope_kind = p_scope_kind
       and scope_id = p_scope_id and organization_id = p_organization_id;
    return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
      'scope_kind', p_scope_kind, 'scope_id', p_scope_id, 'key_removed', true,
      'effective_value', platform.knob_resolve(p_feature, p_key, p_organization_id),
      'origin', 'cleared');
  end if;

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

  insert into platform.knob_override
    (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values
    (p_feature, p_key, p_scope_kind, p_scope_id, p_organization_id, p_value, p_note, p_actor)
  on conflict (feature, key, scope_kind, scope_id, organization_id)
  do update set value = excluded.value,
                set_note = excluded.set_note,
                updated_by = excluded.updated_by,
                updated_at = now();

  return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
    'scope_kind', p_scope_kind, 'scope_id', p_scope_id,
    'effective_value', platform.knob_resolve(p_feature, p_key, p_organization_id,
      case when p_scope_kind = 'user' then p_scope_id else null end,
      case when p_scope_kind not in ('organization','user')
           then jsonb_build_array(jsonb_build_object('kind', p_scope_kind, 'id', p_scope_id))
           else null end),
    'origin', case p_scope_kind when 'organization' then 'org_override'
                                when 'user' then 'user_override'
                                else p_scope_kind || '_override' end);
end;
$$;

revoke all on function platform._knob_override_write(text, text, text, uuid, uuid, jsonb, text, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. knob_override_set becomes gate + delegate.
-- ---------------------------------------------------------------------------
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
  v_is_admin boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  v_is_admin := public.is_admin();

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

  return platform._knob_override_write(
    p_feature, p_key, p_scope_kind, p_scope_id, p_organization_id,
    p_value, p_note, v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The HR reader family delegates to the one resolver.
--    Rung 4 (caller default) is GONE: every key the engine reads is seeded
--    (census scfg_00 + scfg_10), so an unseeded key is now the P0001 refusal
--    the knob doctrine requires, not a silent code default. p_default stays in
--    the signature so ~40 call sites keep compiling; it is intentionally unused.
-- ---------------------------------------------------------------------------
create or replace function hr._hr_knob(
  p_feature text, p_key text, p_organization_id uuid, p_default jsonb
) returns jsonb
language sql stable security definer
set search_path to 'hr', 'platform', 'public'
as $$
  select platform.knob_resolve(p_feature, p_key, p_organization_id);
$$;

create or replace function hr._knob(p_feature text, p_key text)
 returns jsonb
language sql stable security definer
set search_path to 'hr', 'platform', 'public'
as $$
  select platform.knob_resolve(p_feature, p_key, null);
$$;

-- (_punch_knob / _clock_knob already delegate to _hr_knob; unchanged.)

-- ---------------------------------------------------------------------------
-- 4. hr_knob_set / hr_knob_clear: HR gate + audit preserved, write delegated.
--    Envelope reasons preserved: unknown_knob, validation, scope_not_in_employer.
-- ---------------------------------------------------------------------------
create or replace function public.hr_knob_set(
  p_organization_id uuid, p_feature text, p_key text, p_value jsonb,
  p_scope_kind text default 'organization'::text, p_scope_id uuid default null::uuid
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'hr', 'platform'
as $$
declare v_gate jsonb; v_scope_id uuid; v_result jsonb; v_reason text;
begin
  v_gate := hr._l1_settings_gate(p_organization_id, 'hr_knob', 'update');
  if v_gate is not null then return v_gate; end if;

  if p_scope_kind not in ('organization','employer_profile','pay_group','location') then
    raise exception 'hr_knob_set: % is not a scope rung', p_scope_kind using errcode = '22023';
  end if;
  v_scope_id := case when p_scope_kind = 'organization' then p_organization_id else p_scope_id end;

  v_result := platform._knob_override_write(
    p_feature, p_key, p_scope_kind, v_scope_id, p_organization_id,
    p_value, 'set via hr_knob_set', auth.uid());

  if not (v_result ->> 'ok')::boolean then
    v_reason := v_result ->> 'reason';
    if v_reason = 'unregistered_key' then
      return jsonb_build_object('ok', false, 'reason', 'unknown_knob',
        'feature', p_feature, 'key', p_key,
        'detail', 'That configuration key is not in the register.');
    elsif v_reason = 'scope_not_in_organization' then
      return jsonb_build_object('ok', false, 'reason', 'scope_not_in_employer',
        'detail', 'That scope row belongs to a different employer.');
    end if;
    return v_result;
  end if;

  return v_result || jsonb_build_object(
    'audit_id', hr._l1_write_audit(p_organization_id, 'hr_knob', 'update',
      case when p_scope_kind = 'organization' then null else ARRAY[v_scope_id] end,
      null, 'settings'));
end;
$$;

create or replace function public.hr_knob_clear(
  p_organization_id uuid, p_feature text, p_key text,
  p_scope_kind text default 'organization'::text, p_scope_id uuid default null::uuid
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'hr', 'platform'
as $$
declare v_gate jsonb; v_scope_id uuid; v_result jsonb;
begin
  v_gate := hr._l1_settings_gate(p_organization_id, 'hr_knob', 'update');
  if v_gate is not null then return v_gate; end if;

  if p_scope_kind not in ('organization','employer_profile','pay_group','location') then
    raise exception 'hr_knob_clear: % is not a scope rung', p_scope_kind using errcode = '22023';
  end if;
  v_scope_id := case when p_scope_kind = 'organization' then p_organization_id else p_scope_id end;

  -- RECORDED DECISION 21 semantics live in the shared body: null REMOVES the key.
  v_result := platform._knob_override_write(
    p_feature, p_key, p_scope_kind, v_scope_id, p_organization_id,
    null, null, auth.uid());
  if not (v_result ->> 'ok')::boolean then
    if (v_result ->> 'reason') = 'scope_not_in_organization' then
      return jsonb_build_object('ok', false, 'reason', 'scope_not_in_employer');
    end if;
    return v_result;
  end if;

  return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
    'scope_kind', p_scope_kind, 'scope_id', p_scope_id,
    'effective_value', v_result -> 'effective_value',
    'origin', 'platform_default', 'key_removed', true,
    'audit_id', hr._l1_write_audit(p_organization_id, 'hr_knob', 'clear', null, null, 'settings'));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. hr_knob_index: same signature, same gate, same key set — but reading
--    platform.knob_override, and platform_locked is finally a REAL boolean
--    (Decision 27b's owed column landed as overridable_by in scfg_01).
--    platform_locked_unknown_reason is dropped: verified unread in features/hr.
-- ---------------------------------------------------------------------------
create or replace function public.hr_knob_index(
  p_organization_id uuid, p_overridden_only boolean default false
) returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'hr', 'platform'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'hr_knob_index: no authenticated caller' using errcode = '42501';
  end if;
  if not (hr.capability(v_uid, 'identity.write', null, current_date, p_organization_id)
          or hr._l1_org_role(v_uid, p_organization_id) in ('owner','admin')) then
    raise exception 'hr_knob_index: settings are HR-admin only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'keys', (select coalesce(jsonb_agg(x order by x ->> 'feature', x ->> 'key'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'feature', k.feature,
          'slug', split_part(k.feature, '.', 2),
          'key', k.key,
          'full_key', k.feature || '.' || k.key,
          'label', k.label,
          'description', k.description,
          'value_type', k.value_type,
          'allowed_values', k.allowed_values,
          'min_value', k.min_value,
          'max_value', k.max_value,
          'unit', k.unit,
          'review_due', k.review_due,
          'set_by', k.set_by,
          'platform_default', coalesce(k.value, k.default_value),
          'shipped_default', k.default_value,
          'org_override', o.value,
          'effective_value', coalesce(o.value, k.value, k.default_value),
          'origin', case
             when o.value is not null then 'org_override'
             when coalesce(k.value, k.default_value) is not null then 'platform_default'
             else 'missing' end,
          'basis', k.basis,
          'is_overridden', o.value is not null,
          'platform_locked', (k.overridable_by = '{}'::text[])
        ) as x
        from platform.feature_knob k
        left join platform.knob_override o
          on o.feature = k.feature and o.key = k.key
         and o.organization_id = p_organization_id
         and o.scope_kind = 'organization'
         and 'organization' = any (k.overridable_by)
        where k.feature like 'hr.%'
      ) s
      where not p_overridden_only or (x ->> 'is_overridden')::boolean));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Parity block against the scfg_00 baseline. Raises (aborting the whole
--    migration) on any disagreement.
-- ---------------------------------------------------------------------------
do $$
declare v jsonb;
begin
  v := hr._hr_knob('hr.time_and_attendance','kiosk_enabled','2643e470-b275-47f3-95f3-ae275ad3ca47',null);
  if v is distinct from 'true'::jsonb then
    raise exception 'scfg_12 parity: override org expected true, got %', v;
  end if;
  v := hr._hr_knob('hr.time_and_attendance','kiosk_enabled','f9cb3e35-2a65-4f2a-8525-088d6551071c',null);
  if v is distinct from 'false'::jsonb then
    raise exception 'scfg_12 parity: plain org expected false, got %', v;
  end if;
  v := hr._knob('hr.workflow','inbox_bulk_max');
  if v is null then
    raise exception 'scfg_12 parity: hr._knob returned null for a seeded key';
  end if;
  v := hr._punch_knob('kiosk_pin_length', '4'::jsonb, '2643e470-b275-47f3-95f3-ae275ad3ca47');
  if v is null then
    raise exception 'scfg_12 parity: _punch_knob returned null for a seeded key';
  end if;
  begin
    perform hr._hr_knob('hr.time_and_attendance','never_seeded_key','2643e470-b275-47f3-95f3-ae275ad3ca47','"fallback"'::jsonb);
    raise exception 'scfg_12 parity: rung 4 still silently defaulting';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'scfg_12 parity: all legs green';
end $$;
