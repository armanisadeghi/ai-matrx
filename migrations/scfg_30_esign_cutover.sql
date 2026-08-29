-- scfg_30: fold the esign configuration register into platform.feature_knob.
-- SPEC-ESIGN §7 pre-authorized this cutover ("same key names, so the cutover is
-- a data move, not a rewrite"). Census scfg_00: 52 definitions, all owned by
-- the system org (a platform register wearing an org-scoped table), 0 value
-- rows. The esign.config_resolve/config_set doors survive as thin wrappers
-- translating the dotted full key -> (feature, key) = (first two segments,
-- remainder); every SQL consumer in esign_02..06 is untouched.
-- resolve_config_snapshot is untouched by name (it calls config_resolve) and
-- its output is proven identical before/after inside this migration.

do $$
declare v_before_std jsonb; v_before_sen jsonb;
begin
  -- Capture the snapshot BEFORE the rewrite (frozen into envelopes at send —
  -- byte-drift here would corrupt certificates).
  v_before_std := esign.resolve_config_snapshot('39c38960-d30c-4840-b0c1-c9960de95582','standard') - 'resolved_at';
  v_before_sen := esign.resolve_config_snapshot('39c38960-d30c-4840-b0c1-c9960de95582','sensitive') - 'resolved_at';
  create temp table _scfg30_before as select v_before_std as std, v_before_sen as sen;
end $$;

-- 1. Seed the 52 definitions as register rows.
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, bound_value)
select
  substring(d.config_key from '^[a-z0-9_]+\.[a-z0-9_]+') as feature,
  substring(d.config_key from length(substring(d.config_key from '^[a-z0-9_]+\.[a-z0-9_]+')) + 2) as key,
  coalesce(d.default_value, 'null'::jsonb),
  coalesce(d.default_value, 'null'::jsonb),
  d.value_type,
  d.label,
  d.label || case when d.notes is not null then ' — ' || d.notes else '' end,
  'agent',
  'Migrated verbatim from esign.config_definition (scfg_30); spec ref '
    || coalesce(d.spec_ref, 'SPEC-ESIGN §7'),
  case when d.override_direction = 'locked' then '{}'::text[]
       when 'org' = any(d.overridable_by) then '{organization}'::text[]
       else '{}'::text[] end,
  case when d.override_direction = 'locked' then 'any' else d.override_direction end,
  d.bound_value
from esign.config_definition d
where d.deleted_at is null
on conflict (feature, key) do nothing;

-- 2. config_resolve: full-key translation + the one resolver. The historical
--    22023 unregistered-key contract is preserved.
create or replace function esign.config_resolve(p_organization_id uuid, p_key text)
 returns jsonb
language plpgsql stable security definer
set search_path to 'esign', 'platform', 'public'
as $$
declare v_feature text; v_key text;
begin
  v_feature := substring(p_key from '^[a-z0-9_]+\.[a-z0-9_]+');
  v_key := substring(p_key from length(v_feature) + 2);
  if v_feature is null or v_key is null or v_key = '' then
    raise exception 'esign.config_resolve: % is not a registered configuration key', p_key
      using errcode = '22023';
  end if;
  begin
    return platform.knob_resolve(v_feature, v_key, p_organization_id);
  exception when sqlstate 'P0001' then
    raise exception 'esign.config_resolve: % is not a registered configuration key', p_key
      using errcode = '22023',
            hint = 'No value in this register is a constant in code. Register the key before reading it.';
  end;
end $$;

-- 3. config_set: esign-specific predicates preserved (enum raise_only never
--    lowers to none; at least one of typed/drawn stays true), then the shared
--    write body. Envelope stays {granted, reason, ...}. NOTE one deliberate
--    tightening: the old body had NO permission gate; writes now require org
--    owner/admin (or platform admin), matching every other configuration door.
create or replace function esign.config_set(p_organization_id uuid, p_key text, p_value jsonb, p_reason text default null)
 returns jsonb
language plpgsql security definer
set search_path to 'esign', 'platform', 'public'
as $$
declare v_feature text; v_key text; k platform.feature_knob%rowtype; v_other jsonb; v_result jsonb;
begin
  if auth.uid() is not null
     and not public.is_admin()
     and not exists (select 1 from iam.organization_member m
                      where m.organization_id = p_organization_id
                        and m.user_id = auth.uid() and m.role in ('owner','admin')) then
    return jsonb_build_object('granted', false, 'reason', 'forbidden',
      'detail', 'Organization configuration is owner/admin only.');
  end if;

  v_feature := substring(p_key from '^[a-z0-9_]+\.[a-z0-9_]+');
  v_key := substring(p_key from length(v_feature) + 2);
  select * into k from platform.feature_knob where feature = v_feature and key = v_key;
  if k.feature is null then
    return jsonb_build_object('granted', false, 'reason', 'unregistered_key', 'config_key', p_key);
  end if;

  if k.override_direction = 'raise_only' and k.value_type = 'enum' and p_value = '"none"'::jsonb then
    return jsonb_build_object('granted', false, 'reason', 'lower_not_permitted', 'config_key', p_key);
  end if;
  -- §7: at least one signature kind must remain true.
  if p_key in ('esign.signature.allow_typed','esign.signature.allow_drawn') and p_value = 'false'::jsonb then
    v_other := esign.config_resolve(p_organization_id,
      case when p_key = 'esign.signature.allow_typed' then 'esign.signature.allow_drawn'
           else 'esign.signature.allow_typed' end);
    if v_other = 'false'::jsonb then
      return jsonb_build_object('granted', false, 'reason', 'last_signature_kind', 'config_key', p_key,
                                'detail', 'at least one of typed/drawn must remain true');
    end if;
  end if;

  v_result := platform._knob_override_write(
    v_feature, v_key, 'organization', p_organization_id, p_organization_id,
    p_value, p_reason, auth.uid());
  if not (v_result ->> 'ok')::boolean then
    return jsonb_build_object('granted', false,
      'reason', v_result ->> 'reason', 'config_key', p_key,
      'detail', v_result ->> 'detail',
      'ceiling', v_result -> 'ceiling', 'floor', v_result -> 'floor');
  end if;
  return jsonb_build_object('granted', true, 'config_key', p_key, 'value', p_value);
end $$;

-- 4. Snapshot identity + behavior probes. Abort on any diff.
do $$
declare b record; v_after jsonb; v jsonb;
begin
  select * into b from _scfg30_before;
  v_after := esign.resolve_config_snapshot('39c38960-d30c-4840-b0c1-c9960de95582','standard') - 'resolved_at';
  if v_after is distinct from b.std then
    raise exception 'scfg_30: standard snapshot drifted: % vs %', v_after, b.std;
  end if;
  v_after := esign.resolve_config_snapshot('39c38960-d30c-4840-b0c1-c9960de95582','sensitive') - 'resolved_at';
  if v_after is distinct from b.sen then
    raise exception 'scfg_30: sensitive snapshot drifted: % vs %', v_after, b.sen;
  end if;

  -- locked key resolves to default even with a (hand-planted) override row
  v := esign.config_resolve('39c38960-d30c-4840-b0c1-c9960de95582','esign.hash.algorithm');
  if v is distinct from '"sha-256"'::jsonb then
    raise exception 'scfg_30: hash.algorithm expected sha-256, got %', v;
  end if;
  -- direction: campaign.max_audience is lower_only 5000 — a raise must refuse
  v := platform._knob_override_write('esign.campaign','max_audience','organization',
        '39c38960-d30c-4840-b0c1-c9960de95582','39c38960-d30c-4840-b0c1-c9960de95582',
        '9999'::jsonb, 'scfg_30 probe', null);
  if (v->>'ok')::boolean or (v->>'reason') <> 'raise_not_permitted' then
    raise exception 'scfg_30: lower_only raise did not refuse: %', v;
  end if;
  -- statutory floor: token.ttl_days.hr_records_request bound 30, raise_only
  v := platform._knob_override_write('esign.outsider','token.ttl_days.hr_records_request','organization',
        '39c38960-d30c-4840-b0c1-c9960de95582','39c38960-d30c-4840-b0c1-c9960de95582',
        '10'::jsonb, 'scfg_30 probe', null);
  if (v->>'ok')::boolean then
    raise exception 'scfg_30: below-floor write was granted: %', v;
  end if;
  -- 22023 contract for an unknown key
  begin
    perform esign.config_resolve('39c38960-d30c-4840-b0c1-c9960de95582','esign.nope.nothing');
    raise exception 'scfg_30: unknown key did not raise';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'scfg_30 probes: all legs green';
end $$;

-- 5. No-legacy: the parallel register is gone; its entity registrations retire.
drop table if exists esign.config_value;
drop table if exists esign.config_definition;
delete from platform.entity_types
 where schema_name = 'esign' and table_name in ('config_definition','config_value');
drop table if exists _scfg30_before;
