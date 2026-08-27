-- HR domain L1 — migration 14 (register item HRB-013, lane l1-employees).
--
-- 🚨 `jsonb_set` CANNOT CREATE INTERMEDIATE OBJECTS, AND TWO WRITERS REPORTED SUCCESS ANYWAY.
--
-- Applied live as `hr_l1_14_jsonb_set_cannot_create_parents`. Idempotent.
-- Authority: SPEC-EMPLOYEES §2.4 route 67, §10; SPEC-UI-IA §6; SPEC-WORKFLOW-ENGINE's apply law.
--
-- ===================================================================================
-- WHAT HAPPENED, AND HOW IT WAS FOUND.
--
-- `hr_module_set_enabled` was shipped an hour ago to close G2's F5 — HR could not be switched on
-- for an organization. It returned `{"ok": true, "module_enabled": true}` and **wrote nothing**.
-- Caught by clicking the button: `/hr?org=castellano-reyes` still said *"HR isn't turned on for
-- this organization"*, and `iam.organizations.settings #> '{hr}'` was still NULL.
--
-- The cause is not RLS and not permissions. It is that
--
--     jsonb_set('{}'::jsonb, array['hr','module_enabled'], 'true', true)  →  {}
--
-- **`create_missing` creates only the LAST element of the path.** When any PARENT in the path is
-- absent, `jsonb_set` returns the original document unchanged — no error, no warning, no rows
-- affected difference, because the UPDATE did run and did write a value identical to the old one.
-- Every organization whose `settings` had no `hr` key — i.e. every organization that had never
-- used HR, i.e. exactly the ones this function exists for — was unwritable.
--
-- 🚨 THE SECOND VICTIM IS WORSE, AND NOBODY HAD CLICKED IT YET. `hr_knob_set` writes
-- `array['hr', v_slug, p_key]` the same way. An org that has never overridden anything has no
-- `settings->'hr'`, so **its first knob override silently did nothing while route 67 reported the
-- key as overridden.** The second override on the same slug would have worked, which is the worst
-- possible shape for a bug: it fixes itself after one confusing failure and leaves no trace.
--
-- 🚨 AND THE REAL LESSON IS THE ONE THE WORKFLOW ENGINE ALREADY WROTE DOWN.
-- `hr._wf_apply` refuses to record an effect that did not happen: *"an apply that did not happen
-- is NEVER recorded as happened."* Both functions here violated exactly that — they built a
-- success envelope from their INPUT rather than from the database. Both now **read the value back
-- and refuse if it is not what they were asked to write.** That check, not the `||` operator, is
-- what makes this class of bug impossible rather than merely fixed today: a writer that verifies
-- cannot silently do nothing, whatever the next Postgres subtlety turns out to be.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ the module flag

create or replace function public.hr_module_set_enabled(
  p_organization_id uuid, p_enabled boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_role text; v_after boolean;
begin
  if v_uid is null then
    raise exception 'hr_module_set_enabled: no authenticated caller' using errcode = '42501';
  end if;
  v_role := hr._l1_org_role(v_uid, p_organization_id);
  if v_role not in ('owner','admin') then
    return jsonb_build_object('ok', false, 'reason', 'not_org_owner_or_admin',
      'detail', 'Only an owner or an administrator of this organization can switch HR on or off.');
  end if;

  -- `||` merges and CREATES the parent; `jsonb_set` would not (see the header).
  update iam.organizations
     set settings = coalesce(settings, '{}'::jsonb)
                    || jsonb_build_object('hr',
                         coalesce(settings -> 'hr', '{}'::jsonb)
                         || jsonb_build_object('module_enabled', p_enabled))
   where id = p_organization_id;

  -- 🚨 READ IT BACK. The previous version built its envelope from its INPUT and reported success
  -- on a write that never landed. A writer that does not verify can silently do nothing.
  select (o.settings #>> '{hr,module_enabled}')::boolean into v_after
    from iam.organizations o where o.id = p_organization_id;

  if v_after is distinct from p_enabled then
    return jsonb_build_object('ok', false, 'reason', 'write_did_not_land',
      'detail', 'The change was not saved. Nothing has been altered — please try again.',
      'requested', p_enabled, 'observed', v_after);
  end if;

  return jsonb_build_object('ok', true,
    'organization_id', p_organization_id,
    'module_enabled', v_after,
    'is_activated', exists (select 1 from hr.employer_profile ep
                             where ep.organization_id = p_organization_id
                               and ep.deleted_at is null),
    -- §1.3's absent-not-disabled applies to modules: switching off retains every record.
    'records_retained', true,
    'next', case when v_after then 'activation_wizard' else 'module_off' end);
end
$fn$;

-- ============================================================ the knob override

create or replace function public.hr_knob_set(
  p_organization_id uuid, p_feature text, p_key text, p_value jsonb,
  p_scope_kind text default 'organization', p_scope_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, hr
as $fn$
declare v_gate jsonb; v_slug text; v_knob record; v_tbl text; v_owner uuid; v_after jsonb;
begin
  v_gate := hr._l1_settings_gate(p_organization_id, 'hr_knob', 'update');
  if v_gate is not null then return v_gate; end if;

  select * into v_knob from platform.feature_knob k where k.feature = p_feature and k.key = p_key;
  if v_knob.feature is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_knob',
      'feature', p_feature, 'key', p_key,
      'detail', 'That configuration key is not in the register.');
  end if;

  v_slug := split_part(p_feature, '.', 2);

  if p_scope_kind = 'organization' then
    -- `||` all the way down: an org that has never overridden anything has no `settings->'hr'`,
    -- and `jsonb_set` would have returned the document unchanged while this function reported the
    -- key as overridden (see the header).
    update iam.organizations
       set settings = coalesce(settings, '{}'::jsonb)
                      || jsonb_build_object('hr',
                           coalesce(settings -> 'hr', '{}'::jsonb)
                           || jsonb_build_object(v_slug,
                                coalesce(settings #> array['hr', v_slug], '{}'::jsonb)
                                || jsonb_build_object(p_key, p_value)))
     where id = p_organization_id;

    select o.settings #> array['hr', v_slug, p_key] into v_after
      from iam.organizations o where o.id = p_organization_id;

    if v_after is distinct from p_value then
      return jsonb_build_object('ok', false, 'reason', 'write_did_not_land',
        'feature', p_feature, 'key', p_key,
        'detail', 'That setting was not saved. Nothing has been changed — please try again.',
        'requested', p_value, 'observed', v_after);
    end if;

    return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
      'scope_kind', 'organization', 'effective_value', v_after, 'origin', 'org_override',
      'audit_id', hr._l1_write_audit(p_organization_id, 'hr_knob', 'update', null, null, 'settings'));
  end if;

  v_tbl := case p_scope_kind
             when 'employer_profile' then 'employer_profile'
             when 'pay_group'        then 'pay_group'
             when 'location'         then 'location'
             else null end;
  if v_tbl is null then
    raise exception 'hr_knob_set: % is not a scope rung', p_scope_kind using errcode = '22023';
  end if;
  if p_scope_id is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'scope_id',
      'detail', format('A %s-scoped override needs the row it applies to.', p_scope_kind));
  end if;

  execute format('select organization_id from hr.%I where id = $1 and deleted_at is null', v_tbl)
    into v_owner using p_scope_id;
  if v_owner is distinct from p_organization_id then
    return jsonb_build_object('ok', false, 'reason', 'scope_not_in_employer',
      'detail', 'That scope row belongs to a different employer.');
  end if;

  perform hr.arm_write();
  -- the scope tables' `settings` has no `hr` wrapper — the slug IS the top level here
  execute format($q$
    update hr.%I
       set settings = coalesce(settings, '{}'::jsonb)
                      || jsonb_build_object($2,
                           coalesce(settings -> $2, '{}'::jsonb) || jsonb_build_object($3, $4))
     where id = $1 $q$, v_tbl)
    using p_scope_id, v_slug, p_key, p_value;

  execute format('select settings #> array[$2, $3] from hr.%I where id = $1', v_tbl)
    into v_after using p_scope_id, v_slug, p_key;

  if v_after is distinct from p_value then
    return jsonb_build_object('ok', false, 'reason', 'write_did_not_land',
      'feature', p_feature, 'key', p_key, 'scope_kind', p_scope_kind,
      'detail', 'That setting was not saved. Nothing has been changed — please try again.',
      'requested', p_value, 'observed', v_after);
  end if;

  return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
    'scope_kind', p_scope_kind, 'scope_id', p_scope_id,
    'effective_value', v_after, 'origin', 'scope_override',
    'audit_id', hr._l1_write_audit(p_organization_id, 'hr_knob', 'update', ARRAY[p_scope_id],
                                   null, 'settings'));
end
$fn$;

-- ============================================================ assertions

do $$
declare v_org uuid; v_before jsonb; v_res jsonb; v_after jsonb; v_bad int;
begin
  -- 🚨 A PLANTED KNOWN-BAD CASE: prove the fix on an org whose settings have NO `hr` key at all,
  -- which is the exact condition the old code silently failed on. Rolled back at the end so this
  -- migration leaves no data behind.
  select id, settings into v_org, v_before from iam.organizations
   where settings #> '{hr}' is null limit 1;

  if v_org is null then
    raise notice 'hr_l1_14: no org without an hr settings key to plant against; skipping the '
                 'live round-trip and asserting the operator only';
  else
    update iam.organizations
       set settings = coalesce(settings, '{}'::jsonb)
                      || jsonb_build_object('hr',
                           coalesce(settings -> 'hr', '{}'::jsonb)
                           || jsonb_build_object('module_enabled', true))
     where id = v_org;

    select o.settings #> '{hr,module_enabled}' into v_after
      from iam.organizations o where o.id = v_org;

    if v_after is distinct from 'true'::jsonb then
      raise exception 'hr_l1_14: the || form did not create the parent either (got %)', v_after;
    end if;

    -- put it back exactly as it was
    update iam.organizations set settings = v_before where id = v_org;
    if (select settings from iam.organizations where id = v_org) is distinct from v_before then
      raise exception 'hr_l1_14: failed to restore the probed org''s settings';
    end if;
  end if;

  -- neither writer may build its envelope from its input any more
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hr_module_set_enabled','hr_knob_set')
     and p.prosrc not like '%write_did_not_land%';
  if v_bad > 0 then
    raise exception 'hr_l1_14: % writer(s) still report success without reading the value back', v_bad;
  end if;

  -- and neither may use the operator that cannot create a parent
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hr_module_set_enabled','hr_knob_set')
     and p.prosrc like '%jsonb_set(%';
  if v_bad > 0 then
    raise exception 'hr_l1_14: % writer(s) still call jsonb_set, which cannot create a missing '
                    'parent and returns the document unchanged', v_bad;
  end if;

  -- F1's class stays closed
  select count(*) into v_bad from hr.stable_doors_that_write();
  if v_bad > 0 then
    raise exception 'hr_l1_14: % non-volatile door(s) can reach a writer', v_bad;
  end if;
end $$;
