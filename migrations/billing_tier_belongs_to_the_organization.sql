-- based-on: billing.resolve_tier(uuid) cdecce7ef85721faf42cd2f0ec4fbc98b2d13151223022d49d162c24584833a9
-- based-on: billing.resolve_effective_tier(uuid, uuid) 55e07fc283a2edc2d1e14a9cd15460725c994769258fe48e94fa6d856fd54fab
-- based-on: billing._resolve_tier_legacy(uuid) f1bd05afe637ceb2408244a6934d3853c50d47467d305b689f86a9e4d4ca6760
-- based-on: billing.tier_no_downgrade() b75a491349b727f1ea021b99562204bc5be696646ef5ff5264db1b088b72ee99
-- based-on: billing.entitlement_check(text) c805f262730d9839f144cf108e5bfef0c4da4139ed501986bfa0cba96f74b034
-- based-on: billing.entitlement_snapshot() dfc5a70a3e2f14bdc1cd94eaf3d4ba903202d0ed7a6e55eb4b3d1ad71c3a6669
-- based-on: billing.org_capability_status(uuid) 750883325884536fbb645d06bec061098fa3ee5d77b3296ffec17188df3c8b51
-- based-on: public.transfer_guest_data_to_user(uuid, uuid, text) c526f57588c568f709a3f668c73c3109359bcc5c64196896e1e73e95cbc474c0
-- chair-step: replaces eight function bodies so no tier is ever read from billing.user_plan and an entitlement question with no organization is HELD (refused by name with the remedy) instead of answered from a personal plan; adds the organization-keyed billing.entitlement_snapshot(p_org) door (declared before its GRANT). The REVOKE/DROP text inside the transfer function is its own existing string literals. Lane B-BILLING; ruling relayed by the coordinator 2026-09-29.
-- billing_tier_belongs_to_the_organization.sql  (lane B-BILLING, 2026-09-29)
--
-- Step 2 of retiring billing.user_plan (DD-047). Step 1 (billing_every_organization_carries_its_plan)
-- gave every organization its plan: after it, every one of the 1,638 active (person, organization)
-- memberships resolves premium from the organization alone (measured before this file).
--
-- After this file:
--   * billing.resolve_effective_tier(person, org) = the organization's tier. No personal floor.
--     With no organization it REFUSES (23502) with the remedy: the request is held, never answered
--     from a personal plan (2026-09-19 amendment: a request without an organization is held).
--   * billing.resolve_tier(person) — "a tier with no organization in scope" — refuses the same way.
--   * billing.entitlement_check(capability) (no organization) refuses the same way; the browser now
--     holds for an organization first (matrx-frontend features/entitlements/service.ts, same commit).
--   * billing.entitlement_snapshot() refuses; billing.entitlement_snapshot(p_org) is the new door
--     (membership-checked exactly like entitlement_check(p_capability, p_org)).
--   * billing.org_capability_status drops `user_tier` (there is no person tier any more; no reader).
--   * billing._resolve_tier_legacy / billing.tier_no_downgrade — the transition's own report —
--     refuse as retired (their proof is recorded in the access-by-person register); dropped in the window.
--   * public.transfer_guest_data_to_user stops naming billing.user_plan (the table leaves billing).
-- Money: no row changes. Tier outcome per (person, organization): 1,638 premium before, 1,638 after.

create or replace function billing.resolve_tier(p_user uuid)
 returns billing.tier
 language plpgsql
 stable
 set search_path to 'billing', 'public'
as $function$
begin
  raise exception using errcode = '23502',
    message = 'A tier belongs to an organization, and this call named none.',
    hint = 'Pass the organization the request is in (billing.resolve_effective_tier(p_user, p_org), billing.entitlement_check(p_capability, p_org), billing.entitlement_snapshot(p_org)). With no organization, hold the request until the person sets one -- never fall back to a personal plan (billing.user_plan retired 2026-09-29, DD-047).';
end;
$function$;

create or replace function billing.resolve_effective_tier(p_user uuid, p_org uuid)
 returns billing.tier
 language plpgsql
 stable
 set search_path to 'billing', 'public'
as $function$
begin
  if p_org is null then
    raise exception using errcode = '23502',
      message = 'A tier belongs to an organization, and this call named none.',
      hint = 'Pass the organization the request is in (billing.resolve_effective_tier(p_user, p_org), billing.entitlement_check(p_capability, p_org), billing.entitlement_snapshot(p_org)). With no organization, hold the request until the person sets one -- never fall back to a personal plan (billing.user_plan retired 2026-09-29, DD-047).';
  end if;
  -- The organization is the only source of a tier (DD-047): its plan grant or its subscription.
  return coalesce(billing.resolve_org_tier(p_org), 'free'::billing.tier);
end;
$function$;

create or replace function billing._resolve_tier_legacy(p_user uuid)
 returns billing.tier
 language plpgsql
 stable
 set search_path to 'billing', 'public'
as $function$
begin
  raise exception using errcode = '0A000',
    message = 'billing._resolve_tier_legacy is retired with billing.user_plan (2026-09-29): a tier belongs to an organization.',
    hint = 'Call billing.resolve_effective_tier(p_user, p_org).';
end;
$function$;

create or replace function billing.tier_no_downgrade()
 returns table(user_id uuid, legacy_tier billing.tier, organization_tier billing.tier)
 language plpgsql
 stable
 set search_path to 'billing', 'public'
as $function$
begin
  raise exception using errcode = '0A000',
    message = 'billing.tier_no_downgrade is retired: billing.user_plan retired 2026-09-29 after this report returned 0 people once every organization carried its plan (proof: common-docs projects/access-by-person-not-selection REGISTER, Work B billing).';
end;
$function$;

create or replace function billing.entitlement_check(p_capability text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'billing', 'public'
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'limit', 0, 'used', 0,
      'tier', 'free', 'reason', 'not_authenticated', 'period', null, 'check_id', null);
  end if;
  raise exception using errcode = '23502',
    message = 'A tier belongs to an organization, and this call named none.',
    hint = 'Pass the organization the request is in (billing.resolve_effective_tier(p_user, p_org), billing.entitlement_check(p_capability, p_org), billing.entitlement_snapshot(p_org)). With no organization, hold the request until the person sets one -- never fall back to a personal plan (billing.user_plan retired 2026-09-29, DD-047).';
end;
$function$;

create or replace function billing.entitlement_snapshot()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'billing', 'public'
as $function$
begin
  if auth.uid() is null then
    return jsonb_build_object('tier','free','is_subscribed',false,'trial_ends_at',null,'usage','{}'::jsonb);
  end if;
  raise exception using errcode = '23502',
    message = 'A tier belongs to an organization, and this call named none.',
    hint = 'Pass the organization the request is in (billing.resolve_effective_tier(p_user, p_org), billing.entitlement_check(p_capability, p_org), billing.entitlement_snapshot(p_org)). With no organization, hold the request until the person sets one -- never fall back to a personal plan (billing.user_plan retired 2026-09-29, DD-047).';
end;
$function$;

create or replace function billing.entitlement_snapshot(p_org uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'billing', 'public'
as $function$
declare
  v_user  uuid := auth.uid();
  v_tier  billing.tier;
  v_usage jsonb := '{}'::jsonb;
  v_res   jsonb;
  r       record;
begin
  if v_user is null then
    return jsonb_build_object('tier','free','is_subscribed',false,'trial_ends_at',null,'usage','{}'::jsonb,
      'organization_id', p_org);
  end if;
  if p_org is null then
    raise exception using errcode = '23502',
      message = 'A tier belongs to an organization, and this call named none.',
      hint = 'Pass the organization the request is in (billing.resolve_effective_tier(p_user, p_org), billing.entitlement_check(p_capability, p_org), billing.entitlement_snapshot(p_org)). With no organization, hold the request until the person sets one -- never fall back to a personal plan (billing.user_plan retired 2026-09-29, DD-047).';
  end if;
  -- DD-214: an organization's plan is its members' to see. p_org is a CLAIM.
  if not iam.has_org_access_for(v_user, p_org) and not public.is_platform_admin() then
    raise exception 'An organization''s plan and entitlements are that organization''s confidential business. You are not a member of that organization, so this door will not tell you what it is on.'
      using errcode = '42501';
  end if;
  v_tier := billing.resolve_effective_tier(v_user, p_org);
  for r in select capability, enforced from billing.capability loop
    v_res := billing.resolve_capability(v_user, r.capability, p_org);
    if v_res->'windows' <> '[]'::jsonb then
      v_usage := v_usage || jsonb_build_object(r.capability, jsonb_build_object(
        'used', v_res->'used', 'limit', v_res->'limit', 'period', v_res->'period',
        'resetsAt', v_res->'windows'->0->'resetsAt', 'windows', v_res->'windows',
        'enforced', to_jsonb(r.enforced)));
    end if;
  end loop;
  return jsonb_build_object('tier', v_tier,
    'is_subscribed', v_tier = 'premium' or v_tier = 'trial',
    'trial_ends_at', null, 'usage', v_usage, 'organization_id', p_org);
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers)
values ('billing', 'entitlement_snapshot', 'p_org uuid', array['uuid'::regtype]::oid[],
  'SIGNED-IN door: the caller''s boot entitlement snapshot inside one organization. p_org is checked with iam.has_org_access_for(caller, p_org) (platform admins in the admin lane excepted) and refused 42501 otherwise; NULL p_org is refused 23502 (the request is held until the person sets an organization).',
  'billing_tier_belongs_to_the_organization.sql', true, false)
on conflict do nothing;
grant execute on function billing.entitlement_snapshot(uuid) to authenticated;

CREATE OR REPLACE FUNCTION billing.org_capability_status(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_caps jsonb := '{}'::jsonb;
  r      record;
begin
  if v_user is null then
    return jsonb_build_object('tier','free','org_tier','free',
      'organization_id', p_org, 'capabilities','{}'::jsonb);
  end if;

  -- 🚨 DD-214: an organization's plan is its members' to see. `p_org` is a CLAIM.
  if p_org is not null
     and not iam.has_org_access_for(v_user, p_org)
     and not public.is_platform_admin() then
    raise exception 'An organization''s plan and entitlements are that organization''s confidential business. You are not a member of that organization, so this door will not tell you what it is on.'
      using errcode = '42501';
  end if;

  for r in select capability from billing.capability loop
    v_caps := v_caps || jsonb_build_object(
      r.capability, billing.resolve_capability(v_user, r.capability, p_org));
  end loop;
  return jsonb_build_object(
    'organization_id', p_org,
    'tier',      billing.resolve_effective_tier(v_user, p_org),
    'org_tier',  coalesce(billing.resolve_org_tier(p_org), 'free'),
    'capabilities', v_caps);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_guest_data_to_user(p_anon_user_id uuid, p_new_user_id uuid, p_fingerprint text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_anon_is_anonymous boolean;
  v_new_is_anonymous boolean;
  v_target_org uuid;
  v_source_org record;
  v_col record;
  v_count bigint;
  v_total bigint := 0;
  v_transferred jsonb := '{}'::jsonb;
  v_skipped jsonb := '{}'::jsonb;
  v_deferred jsonb := '[]'::jsonb;
  v_key text;
  v_hit boolean;
  v_guest_row_id uuid;
begin
  if p_anon_user_id is null or p_new_user_id is null then
    return jsonb_build_object('status', 'error', 'message', 'both user ids are required');
  end if;
  if p_anon_user_id = p_new_user_id then
    return jsonb_build_object('status', 'noop', 'message', 'source and target are the same user');
  end if;

  select is_anonymous into v_anon_is_anonymous from auth.users where id = p_anon_user_id;
  if v_anon_is_anonymous is null then
    return jsonb_build_object('status', 'error', 'message', 'anon user not found');
  end if;
  if v_anon_is_anonymous is not true then
    return jsonb_build_object('status', 'error', 'message', 'source user is not anonymous');
  end if;
  select is_anonymous into v_new_is_anonymous from auth.users where id = p_new_user_id;
  if v_new_is_anonymous is null then
    return jsonb_build_object('status', 'error', 'message', 'target user not found');
  end if;
  if v_new_is_anonymous is true then
    return jsonb_build_object('status', 'error', 'message', 'target user is anonymous');
  end if;

  select id into v_guest_row_id from users.guest_executions
  where auth_user_id = p_anon_user_id for update;

  -- THE CONVERTED ACCOUNT'S OWN PROFILE ROW ANSWERS. Rows in the guest's own organization
  -- (one the guest created and is the ONLY member of — a fact about membership, not an
  -- organization type) move to the organization the permanent account already carries; that
  -- guest organization and its membership stay with the guest. Every other organization the
  -- guest created, and every other membership, passes to the converted account.
  select organization_id into v_target_org
  from users.profiles where id = p_new_user_id;
  if v_target_org is null then
    return jsonb_build_object('status', 'error', 'message',
      'the target account has no profile row, so there is no organization to move the guest rows into');
  end if;

  -- SPEED (2026-09-28): every link column is probed before it is rewritten, and a column that can only be
  -- searched by a full scan of a large table is DEFERRED to users.guest_conversion_sweep() (pg_cron, every
  -- 30 s) instead of being scanned inside this request. PostgREST cuts statements at 8 s; scanning ~650
  -- unindexed updated_by columns (5 GB) took 16-18 s cold. The deferred list rides on the audit row.
  for v_source_org in
    select o.id from iam.organizations o
    where o.created_by = p_anon_user_id
      and not exists (select 1 from iam.memberships m
                       where m.container_type = 'organization' and m.container_id = o.id
                         and m.user_id <> p_anon_user_id and m.deleted_at is null)
    order by o.created_at
  loop
    for v_col in
      select c.sch, c.tbl, c.col, c.deferred
      from users.guest_transfer_link_columns('organization') c
      where not (c.sch = 'iam' and c.tbl = 'memberships')
    loop
      v_key := format('guest_org.%s.%s.%s', v_col.sch, v_col.tbl, v_col.col);
      if v_col.deferred then
        v_deferred := v_deferred || jsonb_build_array(jsonb_build_object(
          'k', v_key, 's', v_col.sch, 't', v_col.tbl, 'c', v_col.col,
          'from', v_source_org.id, 'to', v_target_org));
        continue;
      end if;
      begin
        execute format('select exists (select 1 from %I.%I where %I = $1)',
                       v_col.sch, v_col.tbl, v_col.col)
          into v_hit using v_source_org.id;
        if v_hit then
          execute format(
            'update %I.%I set %I = $1 where %I = $2',
            v_col.sch, v_col.tbl, v_col.col, v_col.col
          ) using v_target_org, v_source_org.id;
          get diagnostics v_count = row_count;
          if v_count > 0 then
            v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
            v_total := v_total + v_count;
          end if;
        end if;
      exception when others then
        v_skipped := v_skipped || jsonb_build_object(v_key, sqlerrm);
      end;
    end loop;

    begin
      update platform.associations set source_id = v_target_org
      where source_type = 'organization' and source_id = v_source_org.id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_key := 'guest_org.platform.associations.source_id';
        v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
        v_total := v_total + v_count;
      end if;
      update platform.associations set target_id = v_target_org
      where target_type = 'organization' and target_id = v_source_org.id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_key := 'guest_org.platform.associations.target_id';
        v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
        v_total := v_total + v_count;
      end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object(
        'guest_org.platform.associations', sqlerrm
      );
    end;
  end loop;

  -- Transfer every ordinary person FK (into auth.users or iam.users; each column once; the person
  -- row iam.users.id stays with the guest), but never the guest's own organization's
  -- ownership or its owner membership.
  for v_col in
    select c.sch, c.tbl, c.col, c.deferred
    from users.guest_transfer_link_columns('person') c
    where not (c.sch = 'public' and c.tbl = 'users.guest_executions')        -- kept verbatim from the previous
      and not (c.sch = 'public' and c.tbl = 'users.guest_conversion_audit')  -- body: these never match (see log)
      and not (c.sch = 'users' and c.tbl = 'profiles' and c.col = 'id')
      and not (c.sch = 'iam' and c.tbl = 'organizations' and c.col = 'created_by')
      and not (c.sch = 'iam' and c.tbl = 'memberships' and c.col = 'user_id')
      and not (c.sch = 'iam' and c.tbl = 'users' and c.col = 'id')
  loop
    v_key := format('%s.%s.%s', v_col.sch, v_col.tbl, v_col.col);
    if v_col.deferred then
      v_deferred := v_deferred || jsonb_build_array(jsonb_build_object(
        'k', v_key, 's', v_col.sch, 't', v_col.tbl, 'c', v_col.col,
        'from', p_anon_user_id, 'to', p_new_user_id));
      continue;
    end if;
    begin
      execute format('select exists (select 1 from %I.%I where %I = $1)',
                     v_col.sch, v_col.tbl, v_col.col)
        into v_hit using p_anon_user_id;
      if v_hit then
        execute format(
          'update %I.%I set %I = $1 where %I = $2',
          v_col.sch, v_col.tbl, v_col.col, v_col.col
        ) using p_new_user_id, p_anon_user_id;
        get diagnostics v_count = row_count;
        if v_count > 0 then
          v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
          v_total := v_total + v_count;
        end if;
      end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object(v_key, sqlerrm);
    end;
  end loop;

  -- Every other organization the guest created, and every other membership, belongs to the
  -- converted account.
  update iam.organizations o set created_by = p_new_user_id
  where o.created_by = p_anon_user_id
    and exists (select 1 from iam.memberships m
                 where m.container_type = 'organization' and m.container_id = o.id
                   and m.user_id <> p_anon_user_id and m.deleted_at is null);
  get diagnostics v_count = row_count;
  if v_count > 0 then
    v_transferred := v_transferred || jsonb_build_object(
      'iam.organizations.created_by.shared', v_count
    );
    v_total := v_total + v_count;
  end if;

  update iam.memberships as membership set user_id = p_new_user_id
  where membership.user_id = p_anon_user_id
    and not exists (
      select 1 from iam.organizations as organization
      where organization.id = membership.organization_id
        and organization.created_by = p_anon_user_id
        and not exists (select 1 from iam.memberships other
                         where other.container_type = 'organization'
                           and other.container_id = organization.id
                           and other.user_id <> p_anon_user_id and other.deleted_at is null)
    );
  get diagnostics v_count = row_count;
  if v_count > 0 then
    v_transferred := v_transferred || jsonb_build_object(
      'iam.memberships.user_id.shared', v_count
    );
    v_total := v_total + v_count;
  end if;

  if v_guest_row_id is not null then
    update users.guest_executions
    set converted_to_user_id = p_new_user_id, converted_at = now(), auth_user_id = null
    where id = v_guest_row_id;
  end if;
  insert into users.guest_conversion_audit
    (anon_user_id, new_user_id, fingerprint, transferred, skipped, total_rows, organization_id, metadata)
  values
    (p_anon_user_id, p_new_user_id, p_fingerprint,
     v_transferred, v_skipped, v_total::integer, v_target_org,
     case when jsonb_array_length(v_deferred) > 0
          then jsonb_build_object('deferred', v_deferred, 'deferred_queued_at', now())
          else '{}'::jsonb end);
  return jsonb_build_object(
    'status', 'transferred', 'total_rows', v_total,
    'transferred', v_transferred, 'skipped', v_skipped,
    'deferred_columns', jsonb_array_length(v_deferred)
  );
end;
$function$
;
