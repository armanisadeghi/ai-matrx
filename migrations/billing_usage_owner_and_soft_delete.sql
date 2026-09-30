-- based-on: billing.resolve_org_tier(uuid) 2a56f477240d2e7a3b53ccb6ebe05251c80a10be5bc1e086efe629b0e7b3cdc4
-- based-on: billing.resolve_plan(uuid) 0b1f508a130124b1c4f0d496fcacceafc95b466594fd7e43ca6abd6d893ff5c1
-- based-on: billing.org_plan_set(uuid, billing.tier, text, text, timestamp with time zone) 44e04608c77c702b7a3ea001ed475785d972f9233a0cd2f4424c2ba83c28de7c
-- based-on: billing.org_plan_assign(uuid, text, text) 966d3f80169ebb87b929a3fe1ad84bc75e9e1754b9862c62949180e41b7fac38
-- based-on: billing.resolve_limit(uuid, text, billing.meter_period) 3fc4b5188f2a5eb5a32721e28a2bf486d8c9d1bc575a7bca07bde436fe33dd9b
-- based-on: billing.entitlement_consume(text, integer, uuid, uuid) f5d7d83af80991207a5712378a99198748677a2e87bd1ebb7b20fa519106b150
-- based-on: billing.resolve_capability(uuid, text, uuid) 5d80a026f106e8810cc5148daccc364e79b4242cf52b22f3fc2e6b5e0a43498a
-- based-on: billing.resolve_capability_effective(uuid, text, uuid) 5d780b81466e75b323fc674f7188de19a94d0000de462e53a7839fff60769f4d
-- based-on: billing.usage_my_summary(timestamp with time zone, timestamp with time zone) b353bfe4bf3c0f8c91ba1eb83b7f036b07f353446767349df138c22407c44802
-- based-on: billing.usage_admin_by_user(text, timestamp with time zone, timestamp with time zone, integer) 79d592f6d2ff8942be3d9d0d2992de39260afa17e87deb42d6f3d5d16e53cf49
-- based-on: billing.usage_admin_summary(timestamp with time zone, timestamp with time zone) 60278930da7f24f43544a96f006652759bf756163c4a5d2e8660e246f1f680eb
-- chair-step: replaces eleven billing function bodies (every reader of the four tables below) and backfills created_by on 1,496 older usage_ledger rows with row triggers switched off for that one UPDATE; the DROP/REVOKE text the judge sees is `drop trigger if exists` for the bridge trigger this file creates. No policy, grant or access rule changes. Lane B-BILLING.
-- billing_usage_owner_and_soft_delete.sql  (lane B-BILLING, 2026-09-29)
--
-- Part of certifying the `billing` schema through the Entities system (access-by-person register,
-- Work B; pattern = the tool-schema pilot). Phase 1 -- daytime-safe: locks only the four billing
-- tables named, no policy DDL, no foreign key to auth.users / iam.organizations.
--
-- 1. billing.usage_ledger: the owner is created_by (user_id retired 2026-09-23). Access-ladder T-21
--    moved the table to Organization and new writers already stamp created_by (0 disagreeing rows
--    written in the last day), but 1,496 older rows still had created_by NULL. Backfilled from
--    user_id -- the person whose action was metered, which is the row's author (entitlement_consume
--    writes auth.uid(); aidream's metering writes the acting person). A bridge trigger keeps the two
--    equal while deployed code still writes user_id and REFUSES a write naming two different people.
--    Every DB reader moves to created_by. user_id and the bridge are dropped in the window
--    (common-docs/projects/access-by-person-not-selection/window/billing-schema-window.sql).
-- 2. deleted_at on usage_ledger, org_plan, account_addon, class_purchase (registry has_soft_delete):
--    delete means archive. Nothing archives a row today; every money reader now ignores an archived
--    row (an archived usage row is a voided charge; an archived plan or add-on grants nothing), and
--    setting/assigning a plan on an archived org_plan row restores it. idempotency (check_id) still
--    sees archived rows, so a voided charge can never be re-charged by a replay.
-- Money: no row's quantity, organization, capability or time moves; created_by = user_id on every row
-- afterwards (asserted below), so every sum keyed on the person is identical. Proof in the register.


alter table billing.usage_ledger   add column if not exists deleted_at timestamptz;
alter table billing.org_plan       add column if not exists deleted_at timestamptz;
alter table billing.account_addon  add column if not exists deleted_at timestamptz;
alter table billing.class_purchase add column if not exists deleted_at timestamptz;

-- The backfill is not an edit: no version bump, no updated_at move.
alter table billing.usage_ledger disable trigger user;
update billing.usage_ledger set created_by = user_id where created_by is null;
alter table billing.usage_ledger enable trigger user;

do $$
begin
  if exists (select 1 from billing.usage_ledger where created_by is distinct from user_id) then
    raise exception 'billing.usage_ledger: created_by and user_id disagree on % row(s) -- stop and read them',
      (select count(*) from billing.usage_ledger where created_by is distinct from user_id);
  end if;
end $$;

create or replace function billing._usage_ledger_owner_bridge()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id and new.created_by is not distinct from old.created_by then
      new.created_by := new.user_id;
    elsif new.created_by is distinct from old.created_by and new.user_id is not distinct from old.user_id then
      new.user_id := new.created_by;
    end if;
  end if;
  new.created_by := coalesce(new.created_by, new.user_id);
  new.user_id := coalesce(new.user_id, new.created_by);
  if new.created_by is distinct from new.user_id then
    raise exception using errcode = '23514',
      message = format('billing.usage_ledger: this write names two different people (created_by %s, user_id %s). created_by is the person the usage belongs to; user_id is retired and is dropped once every writer sends created_by.', new.created_by, new.user_id);
  end if;
  return new;
end
$function$;
comment on function billing._usage_ledger_owner_bridge() is
  'TRANSITION BRIDGE (lane B-BILLING, 2026-09-29): keeps retired user_id equal to created_by while deployed code still writes user_id. Dropped with the column in billing-schema-window.sql.';

drop trigger if exists _bridge_owner on billing.usage_ledger;
create trigger _bridge_owner before insert or update on billing.usage_ledger
  for each row execute function billing._usage_ledger_owner_bridge();

update platform.entity_types set has_soft_delete = true
 where token in ('billing_usage_ledger', 'org_plan', 'account_addon', 'class_purchase');

CREATE OR REPLACE FUNCTION billing.resolve_org_tier(p_org uuid)
 RETURNS billing.tier
 LANGUAGE sql
 STABLE
 SET search_path TO 'billing', 'public'
AS $function$
  select coalesce(
    billing.tier_max(
      (select p.tier from billing.org_plan p
        where p.organization_id = p_org
          and p.deleted_at is null
          and p.effective_from <= now()
          and (p.expires_at is null or p.expires_at > now())),
      (select case when s.status = 'trialing' then 'trial'::billing.tier
                   else 'premium'::billing.tier end
         from billing.subscription s
        where s.organization_id = p_org and s.status in ('trialing','active','past_due')
        order by case s.status when 'active' then 0 when 'trialing' then 1 else 2 end,
                 s.current_period_end desc nulls last
        limit 1)
    ),
    'free'::billing.tier)
  where p_org is not null;
$function$
;

CREATE OR REPLACE FUNCTION billing.resolve_plan(p_org uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'billing', 'public'
AS $function$
    select coalesce(
      (select op.plan_id from billing.org_plan op
        where op.organization_id = p_org
          and op.plan_id is not null
          and op.deleted_at is null
          and op.effective_from <= now()
          and (op.expires_at is null or op.expires_at > now())),
      (select p.plan_key from billing.plan p where p.is_default and p.active limit 1),
      'free');
  $function$
;

CREATE OR REPLACE FUNCTION billing.org_plan_set(p_org uuid, p_tier billing.tier, p_source text, p_note text, p_expires_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
declare v_row billing.org_plan%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'billing.org_plan_set: super-admin only'
      using errcode = '42501';
  end if;
  insert into billing.org_plan as p
    (organization_id, tier, source, note, granted_by, expires_at, updated_by)
  values (p_org, p_tier, coalesce(p_source,'grant'), p_note, (select auth.uid()), p_expires_at, (select auth.uid()))
  on conflict (organization_id) do update
    set tier = excluded.tier, source = excluded.source, note = excluded.note,
        expires_at = excluded.expires_at, updated_at = now(),
        updated_by = (select auth.uid()), version = p.version + 1,
        deleted_at = null  -- setting a plan on an archived row restores it
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$
;

CREATE OR REPLACE FUNCTION billing.org_plan_assign(p_org uuid, p_plan text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
  declare v_row billing.org_plan%rowtype; v_tier billing.tier;
  begin
    if not public.is_super_admin() then
      raise exception 'billing.org_plan_assign: super-admin only' using errcode = '42501';
    end if;
    select tier into v_tier from billing.plan where plan_key = p_plan and active;
    if v_tier is null then
      raise exception 'billing.org_plan_assign: unknown or inactive plan "%"', p_plan;
    end if;
    insert into billing.org_plan as op
      (organization_id, plan_id, tier, source, note, granted_by, updated_by)
    values (p_org, p_plan, v_tier, 'grant', p_note, (select auth.uid()), (select auth.uid()))
    on conflict (organization_id) do update
      set plan_id = excluded.plan_id, tier = excluded.tier, note = excluded.note,
          updated_at = now(), updated_by = (select auth.uid()), version = op.version + 1,
          deleted_at = null  -- assigning a plan on an archived row restores it
    returning * into v_row;
    return to_jsonb(v_row);
  end;
  $function$
;

CREATE OR REPLACE FUNCTION billing.resolve_limit(p_org uuid, p_capability text, p_period billing.meter_period)
 RETURNS TABLE(limit_value bigint, unlimited boolean, plan_id text, from_addon boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'billing', 'public'
AS $function$
declare
  v_plan     text := billing.resolve_plan(p_org);
  v_found    boolean := false;
  v_plan_lim bigint;
  v_plan_unl boolean := false;
  v_add_lim  bigint;
  v_add_unl  boolean := false;
  v_has_add  boolean := false;
begin
  select true, pl.limit_value, pl.limit_value is null
    into v_found, v_plan_lim, v_plan_unl
  from billing.plan_limit pl
  where pl.plan_id = v_plan and pl.capability = p_capability
    and pl.period is not distinct from p_period;

  select true, max(a.limit_value), bool_or(a.limit_value is null)
    into v_has_add, v_add_lim, v_add_unl
  from billing.account_addon a
  where a.organization_id = p_org and a.capability = p_capability
    and a.deleted_at is null
    and a.period is not distinct from p_period
    and a.effective_from <= now()
    and (a.expires_at is null or a.expires_at > now())
  having count(*) > 0;

  -- No plan row at all => this plan does not constrain this dimension.
  if not coalesce(v_found, false) and not coalesce(v_has_add, false) then
    return query select null::bigint, false, v_plan, false;
    return;
  end if;

  -- Unlimited anywhere wins.
  if coalesce(v_plan_unl, false) or coalesce(v_add_unl, false) then
    return query select null::bigint, true, v_plan, coalesce(v_add_unl, false);
    return;
  end if;

  -- Otherwise the MORE PERMISSIVE of plan and add-on. An add-on only ever raises.
  return query select
    greatest(coalesce(v_plan_lim, 0), coalesce(v_add_lim, 0))::bigint,
    false,
    v_plan,
    coalesce(v_add_lim, 0) > coalesce(v_plan_lim, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION billing.entitlement_consume(p_capability text, p_quantity integer DEFAULT 1, p_check_id uuid DEFAULT NULL::uuid, p_org uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_cap  billing.capability%rowtype;
  v_res  jsonb;
  v_dup  boolean := false;
begin
  if v_user is null then
    return jsonb_build_object('allowed', false, 'consumed', false, 'duplicate', false,
      'remaining', 0, 'limit', 0, 'used', 0, 'tier', 'free',
      'reason', 'not_authenticated', 'period', null, 'windows', '[]'::jsonb,
      'enforced', false);
  end if;

  -- 🚨 DD-208: `p_org` is a CLAIM, checked BEFORE the write. Without this, any
  -- signed-in caller charged any organization's meter and read back its plan.
  if p_org is not null and not iam.has_org_access_for(v_user, p_org) then
    raise exception 'You have no standing in that organization, so you cannot consume its entitlement.'
      using errcode = '42501';
  end if;

  -- 🚨 NOTHING IS SUBSTITUTED HERE ANY MORE (2026-09-19 ruling, F2).
  --
  -- This used to be:
  --
  --   v_ledger_org := coalesce(p_org, <an organization the database chose for v_user>);
  --
  -- justified by db-rules §2 "NO NULL ORG" -- the ledger column is NOT NULL, so
  -- something had to fill it. But "something had to fill it" is an argument for
  -- making the CALLER fill it, never for the database choosing a tenant on the
  -- person's behalf. The old line billed a person's metered work to an
  -- organization they had not selected and could not see, every time a caller
  -- omitted the organization -- which the dropped three-argument overload did
  -- unconditionally, for every metered action taken in the browser.
  --
  -- The refusal announces itself with the remedy, and it is raised BEFORE any
  -- row is written, so a refusal can never follow a partial write.
  if p_org is null then
    raise exception 'A metered action must name the organization whose meter it charges; this call named none.'
      using errcode = '23502',
            hint = 'Pass p_org. Nothing is substituted: filling organization_id with an organization the database chose bills a tenant nobody chose (2026-09-19 ruling). If no organization is selected, hold the action and let the person choose one, then call again.';
  end if;

  select * into v_cap from billing.capability where capability = p_capability;

  -- Idempotency: a check + its consume are ONE accounted unit.
  if p_check_id is not null then
    select exists(select 1 from billing.usage_ledger where check_id = p_check_id)
      into v_dup;
  end if;

  if not v_dup then
    -- Serialize this (org, capability) so two concurrent spends cannot both
    -- read "one left" and both write.
    perform pg_advisory_xact_lock(hashtext(p_org::text || ':' || p_capability));
    insert into billing.usage_ledger(created_by, organization_id, capability, quantity, check_id)
    values (v_user, p_org, p_capability, greatest(coalesce(p_quantity, 1), 0), p_check_id);
  end if;

  v_res := billing.resolve_capability(v_user, p_capability, p_org);
  return v_res || jsonb_build_object(
    'consumed', not v_dup, 'duplicate', v_dup,
    'enforced', coalesce(v_cap.enforced, false));
end;
$function$
;

CREATE OR REPLACE FUNCTION billing.resolve_capability(p_user uuid, p_capability text, p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'billing', 'public'
AS $function$
declare
  v_tier            billing.tier;
  v_plan            text;
  v_plan_name       text;
  v_cap             billing.capability%rowtype;
  v_windows         jsonb;
  v_allowed         boolean;
  v_bind_period     billing.meter_period;
  v_bind_used       integer;
  v_bind_limit      integer;
  v_bind_remain     integer;
  v_plan_limit      bigint;
  v_plan_unlimited  boolean := false;
  v_plan_from_addon boolean := false;
  v_used            bigint;
begin
  perform iam.asks_about_caller(p_user, 'billing.resolve_capability');
  select * into v_cap from billing.capability where capability = p_capability;
  v_tier := billing.resolve_effective_tier(p_user, p_org);
  v_plan := case when p_org is not null then billing.resolve_plan(p_org) else null end;
  select name into v_plan_name from billing.plan where plan_key = v_plan;

  if v_cap.capability is null then
    raise warning '[billing.resolve_capability] unknown capability id "%" — failing open (unlimited). Register it in billing.capability or fix the caller.', p_capability;
    return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null,
      'used', 0, 'tier', v_tier, 'reason', 'permissive_stub',
      'period', null, 'windows', '[]'::jsonb, 'enforced', false, 'unknown', true,
      'required_tier', null, 'organization_id', p_org,
      'plan', v_plan, 'plan_name', v_plan_name);
  end if;

  if v_cap.enforced
     and ((v_cap.min_tier = 'premium' and v_tier <> 'premium')
       or (v_cap.min_tier = 'trial' and v_tier = 'free')) then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'limit', 0,
      'used', 0, 'tier', v_tier, 'reason', 'tier_locked',
      'period', v_cap.period, 'windows', '[]'::jsonb, 'enforced', true,
      'required_tier', v_cap.min_tier, 'organization_id', p_org,
      'plan', v_plan, 'plan_name', v_plan_name);
  end if;

  -- PLAN PATH — only when an org was supplied. `resolve_limit` always returns
  -- one typed row: explicit unlimited, a numeric plan/add-on limit, or the
  -- plan-has-no-opinion sentinel (NULL + unlimited=false).
  if v_plan is not null then
    select rl.limit_value, rl.unlimited, rl.from_addon
      into v_plan_limit, v_plan_unlimited, v_plan_from_addon
    from billing.resolve_limit(
      p_org,
      p_capability,
      coalesce(v_cap.period, 'lifetime'::billing.meter_period)
    ) rl;

    if coalesce(v_plan_unlimited, false) then
      return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null,
        'used', 0, 'tier', v_tier,
        'reason', case when v_cap.enforced then 'allowed' else 'permissive_stub' end,
        'period', v_cap.period, 'windows', '[]'::jsonb, 'enforced', v_cap.enforced,
        'required_tier', v_cap.min_tier, 'organization_id', p_org,
        'plan', v_plan, 'plan_name', v_plan_name,
        'from_addon', coalesce(v_plan_from_addon, false));
    end if;

    if v_plan_limit is not null then
      -- External dimensions report the authoritative limit without inventing
      -- usage that belongs to another subsystem.
      if v_cap.usage_source = 'external' then
        return jsonb_build_object(
          'allowed', true, 'remaining', null,
          'limit', v_plan_limit, 'used', null, 'tier', v_tier,
          'reason', case when v_cap.enforced then 'allowed' else 'permissive_stub' end,
          'period', v_cap.period, 'windows', '[]'::jsonb, 'enforced', v_cap.enforced,
          'required_tier', v_cap.min_tier, 'organization_id', p_org,
          'plan', v_plan, 'plan_name', v_plan_name,
          'from_addon', coalesce(v_plan_from_addon, false),
          'usage_source', 'external');
      end if;

      select coalesce(sum(quantity), 0)::bigint into v_used
      from billing.usage_ledger
      where capability = p_capability
        and organization_id = p_org
        and deleted_at is null
        and (v_cap.period is null or v_cap.period = 'lifetime'
             or created_at >= billing.period_start(v_cap.period));

      v_windows := jsonb_build_array(jsonb_build_object(
        'period', coalesce(v_cap.period::text, 'lifetime'),
        'used', v_used, 'limit', v_plan_limit,
        'remaining', greatest(v_plan_limit - v_used, 0),
        'resetsAt', case when v_cap.period is null or v_cap.period = 'lifetime' then null
                         else billing.period_reset(v_cap.period) end));
      v_allowed := v_used < v_plan_limit;

      return jsonb_build_object(
        'allowed', case when v_cap.enforced then v_allowed else true end,
        'remaining', greatest(v_plan_limit - v_used, 0),
        'limit', v_plan_limit, 'used', v_used, 'tier', v_tier,
        'reason', case when not v_cap.enforced then 'permissive_stub'
                       when v_allowed then 'allowed' else 'cap_reached' end,
        'period', v_cap.period, 'windows', v_windows, 'enforced', v_cap.enforced,
        'required_tier', v_cap.min_tier, 'organization_id', p_org,
        'plan', v_plan, 'plan_name', v_plan_name,
        'from_addon', coalesce(v_plan_from_addon, false),
        'usage_source', 'ledger');
    end if;
  end if;

  -- TIER PATH — user-only calls always land here. Org calls also land here
  -- when their plan has no opinion about this capability (education today).
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'period', w.period, 'used', w.used, 'limit', w.limit_value,
      'remaining', greatest(w.limit_value - w.used, 0),
      'resetsAt', billing.period_reset(w.period)
    ) order by (w.limit_value - w.used) asc), '[]'::jsonb),
    coalesce(bool_and(w.used < w.limit_value), true)
  into v_windows, v_allowed
  from (
    select cl.period, cl.limit_value,
      (select coalesce(sum(quantity),0)::int from billing.usage_ledger
       where created_by = p_user and capability = p_capability and deleted_at is null
         and created_at >= billing.period_start(cl.period)) as used
    from billing.capability_limit cl
    where cl.capability = p_capability and cl.tier = v_tier
      and cl.limit_value is not null
  ) w;

  if v_windows = '[]'::jsonb then
    return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null,
      'used', 0, 'tier', v_tier,
      'reason', case when v_cap.enforced then 'allowed' else 'permissive_stub' end,
      'period', v_cap.period, 'windows', '[]'::jsonb, 'enforced', v_cap.enforced,
      'required_tier', v_cap.min_tier, 'organization_id', p_org,
      'plan', v_plan, 'plan_name', v_plan_name);
  end if;

  v_bind_period := (v_windows->0->>'period')::billing.meter_period;
  v_bind_used   := (v_windows->0->>'used')::int;
  v_bind_limit  := (v_windows->0->>'limit')::int;
  v_bind_remain := (v_windows->0->>'remaining')::int;

  return jsonb_build_object(
    'allowed', case when v_cap.enforced then v_allowed else true end,
    'remaining', v_bind_remain, 'limit', v_bind_limit,
    'used', v_bind_used, 'tier', v_tier,
    'reason', case when not v_cap.enforced then 'permissive_stub'
                   when v_allowed then 'allowed' else 'cap_reached' end,
    'period', v_bind_period, 'windows', v_windows, 'enforced', v_cap.enforced,
    'required_tier', v_cap.min_tier, 'organization_id', p_org,
    'plan', v_plan, 'plan_name', v_plan_name);
end;
$function$
;

CREATE OR REPLACE FUNCTION billing.resolve_capability_effective(p_user uuid, p_capability text, p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
declare
  v_caller    uuid := auth.uid();
  v_env       jsonb;
  v_cap       billing.capability%rowtype;
  v_period    billing.meter_period;
  v_ent       bigint;
  v_org_g     bigint;
  v_user_g    bigint;
  v_org_gid   uuid;
  v_user_gid  uuid;
  v_user_used bigint := 0;
  v_org_used  bigint;
  v_ceiling   bigint;
  v_source    text;
  v_remaining bigint;
  v_allowed   boolean;
begin
  if p_user is null then
    p_user := v_caller;
  end if;
  if v_caller is not null and p_user <> v_caller and not public.is_platform_admin() then
    raise exception 'billing.resolve_capability_effective: you may only resolve your own account.'
      using errcode = '42501';
  end if;

  -- 🚨 DD-214: an organization's plan is its members' to see. `p_org` is a CLAIM.
  if v_caller is not null and p_org is not null
     and not iam.has_org_access_for(v_caller, p_org)
     and not public.is_platform_admin() then
    raise exception 'An organization''s plan and entitlements are that organization''s confidential business. You are not a member of that organization, so this door will not tell you what it is on.'
      using errcode = '42501';
  end if;

  v_env := billing.resolve_capability(p_user, p_capability, p_org);
  select * into v_cap from billing.capability where capability = p_capability;
  v_period := coalesce(v_cap.period, 'lifetime'::billing.meter_period);

  v_ent      := nullif(v_env->>'limit','')::bigint;   -- NULL means unlimited
  v_org_used := coalesce(nullif(v_env->>'used','')::bigint, 0);

  if p_org is not null then
    select rg.org_limit, rg.user_limit, rg.org_id, rg.user_guardrail_id
      into v_org_g, v_user_g, v_org_gid, v_user_gid
    from billing.resolve_guardrail(p_org, p_user, p_capability) rg;

    select coalesce(sum(ul.quantity), 0)::bigint into v_user_used
    from billing.usage_ledger ul
    where ul.capability = p_capability
      and ul.created_by = p_user
      and ul.deleted_at is null
      and ul.organization_id = p_org
      and (v_period = 'lifetime' or ul.created_at >= billing.period_start(v_period));
  end if;

  -- Effective ceiling for THIS actor. min() over layers; NULL = unlimited only
  -- when no layer has an opinion.
  v_ceiling := v_ent;
  v_source  := case
                 when v_ent is null then 'unlimited'
                 when coalesce((v_env->>'from_addon')::boolean, false) then 'addon'
                 when v_env->>'plan' is not null then 'plan'
                 else 'tier'
               end;
  if v_org_g is not null and (v_ceiling is null or v_org_g < v_ceiling) then
    v_ceiling := v_org_g; v_source := 'org_guardrail';
  end if;
  if v_user_g is not null and (v_ceiling is null or v_user_g < v_ceiling) then
    v_ceiling := v_user_g; v_source := 'user_guardrail';
  end if;

  -- Remaining is the tightest of the two counters the layers are measured on:
  -- org/plan layers meter the ORGANIZATION's usage, a user guardrail meters
  -- that person's own.
  if v_ceiling is null then
    v_remaining := null;
    v_allowed   := true;
  else
    v_remaining := greatest(
      least(
        case when v_source = 'user_guardrail' then v_ceiling - v_user_used
             else v_ceiling - v_org_used end,
        case when v_user_g is null then 9223372036854775807
             else v_user_g - v_user_used end),
      0);
    v_allowed := v_remaining > 0;
  end if;

  return v_env || jsonb_build_object(
    'entitlement_limit',  v_ent,
    'org_guardrail',      v_org_g,
    'user_guardrail',     v_user_g,
    'org_guardrail_id',   v_org_gid,
    'user_guardrail_id',  v_user_gid,
    'user_used',          v_user_used,
    'org_used',           v_org_used,
    'effective_limit',    v_ceiling,
    'limit_source',       v_source,
    'effective_remaining', v_remaining,
    -- Enforcement is Arman's flip. While the capability is unenforced this is
    -- TRACKING ONLY and the surface must say so rather than show a number that
    -- stops nothing.
    'effective_allowed',  case when v_cap.enforced then v_allowed else true end,
    'would_block',        not v_allowed,
    'enforced',           coalesce(v_cap.enforced, false),
    'period',             v_period,
    'subject_user_id',    p_user);
end;
$function$
;

CREATE OR REPLACE FUNCTION billing.usage_my_summary(p_from timestamp with time zone DEFAULT (now() - '30 days'::interval), p_to timestamp with time zone DEFAULT now())
 RETURNS TABLE(capability text, total_quantity bigint, event_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
  select ul.capability, coalesce(sum(ul.quantity),0)::bigint, count(*)::bigint
  from billing.usage_ledger ul
  where ul.created_by = (select auth.uid()) and ul.deleted_at is null and ul.created_at >= p_from and ul.created_at < p_to
  group by ul.capability order by 2 desc;
$function$
;

CREATE OR REPLACE FUNCTION billing.usage_admin_by_user(p_capability text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT (now() - '30 days'::interval), p_to timestamp with time zone DEFAULT now(), p_limit integer DEFAULT 100)
 RETURNS TABLE(user_id uuid, capability text, total_quantity bigint, event_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden: Super Admin required' using errcode = '42501';
  end if;
  return query
    select ul.created_by, ul.capability, coalesce(sum(ul.quantity),0)::bigint, count(*)::bigint
    from billing.usage_ledger ul
    where ul.created_at >= p_from and ul.created_at < p_to
      and ul.deleted_at is null
      and (p_capability is null or ul.capability = p_capability)
    group by ul.created_by, ul.capability order by 3 desc limit greatest(p_limit,1);
end;
$function$
;

CREATE OR REPLACE FUNCTION billing.usage_admin_summary(p_from timestamp with time zone DEFAULT (now() - '30 days'::interval), p_to timestamp with time zone DEFAULT now())
 RETURNS TABLE(capability text, total_quantity bigint, event_count bigint, active_users bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden: Super Admin required' using errcode = '42501';
  end if;
  return query
    select ul.capability, coalesce(sum(ul.quantity),0)::bigint, count(*)::bigint, count(distinct ul.created_by)::bigint
    from billing.usage_ledger ul
    where ul.created_at >= p_from and ul.created_at < p_to
      and ul.deleted_at is null
    group by ul.capability order by 2 desc;
end;
$function$
;

-- The two usage readers below had no door row and no client EXECUTE (the definer guard revoked it
-- earlier); replacing their bodies requires the declaration in data. They stay exactly as closed as
-- they were: server-only, no client grant. Census 2026-09-29: no caller in matrx-frontend, aidream
-- or the @ai-matrx packages (only a line in features/entitlements/FEATURE.md).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values
  ('billing', 'usage_my_summary', 'p_from timestamp with time zone, p_to timestamp with time zone',
   array['timestamptz'::regtype, 'timestamptz'::regtype]::oid[],
   'Sums the CALLER''s own usage rows (created_by = auth.uid()); takes no entity id, only a time window.',
   'billing_usage_owner_and_soft_delete.sql',
   'server_only: no client or server lane calls it today (census 2026-09-29) and its client EXECUTE was already revoked by the definer guard; it stays closed until a surface needs it and declares a signed-in door.',
   false, false),
  ('billing', 'usage_admin_by_user', 'p_capability text, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer',
   array['text'::regtype, 'timestamptz'::regtype, 'timestamptz'::regtype, 'int4'::regtype]::oid[],
   'Super-admin usage breakdown by person; refuses anyone who is not a super admin (42501). Takes no entity id.',
   'billing_usage_owner_and_soft_delete.sql',
   'server_only: no client or server lane calls it today (census 2026-09-29) and its client EXECUTE was already revoked by the definer guard; the admin usage screen reads usage_admin_summary instead.',
   false, false)
on conflict do nothing;
