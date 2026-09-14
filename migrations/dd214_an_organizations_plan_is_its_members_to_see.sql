-- DD-214 — AN ORGANIZATION'S PLAN IS ITS MEMBERS' TO SEE, NEVER A STRANGER'S.
--
-- ═══ THE RULING (the chair, 2026-09-14, on B-96 §8 / DD-208b) ════════════════
-- An organization's plan is the ORGANIZATION's confidential data. Its members
-- read it — the entitlement and capability doors need it for every member's own
-- UI, and a person who cannot see what their own organization is paying for
-- cannot be told why a limit stopped them. A non-member reads nothing. Platform
-- admins keep their reach, and the super-admin WRITE doors are untouched.
--
-- ═══ THE FACT ════════════════════════════════════════════════════════════════
-- Measured live on db.matrxserver.com 2026-09-14, in rolled-back transactions,
-- as `role authenticated` carrying test@test.com's real claims
-- (`4060701e-706a-4c76-b3ca-0bbc69fa5a14`), against Castellano & Reyes, LLP
-- `7cd12da2-2213-4378-8fba-a9e2dc4ea657` — an organization that account has NO
-- membership in, and whose row it cannot `select` from `iam.organizations`:
--
--   billing.entitlement_check('ai_tokens', 7cd12da2-…)          -> "plan":"company-pro","plan_name":"Pro"
--   billing.org_capability_status(7cd12da2-…)                   -> "plan":"company-pro" on every capability
--   billing.plan_status(7cd12da2-…)                             -> "plan":{"id":"company-pro","name":"Pro",
--                                                                  "rank":70,"audience":"company","per_seat":true,
--                                                                  "min_seats":3, …} — the whole plan row
--   billing.resolve_capability_effective(self,'ai_tokens',7cd12da2-…) -> "plan":"company-pro"
--
-- and, as the same claims, the table itself:
--
--   select plan_id, tier from billing.org_plan where organization_id = 7cd12da2-…  -> 0 rows
--
-- 🚨 BOTH HALVES ARE DEFECTS, and §6 says so in the same breath: an over-granting
-- policy and an under-granting one are the same kind of bug.
--   * WIDER THAN THE TABLE: four SECURITY DEFINER doors granted to
--     `authenticated` take an organization id on trust and hand back that
--     organization's commercial position — which plan, which tier, seat model,
--     per-dimension limits and how much of them is used — to anybody with a free
--     account and an organization id that is not a secret.
--   * NARROWER THAN THE PRODUCT: `billing.org_plan` is platform-admin-only, so
--     the SAME query as an organization's own OWNER returns 0 rows. Nobody can
--     read their own organization's plan directly. Every org-billing surface has
--     to route around the table through one of the leaking doors, which is
--     exactly how the doors came to be wider than it.
--
-- ═══ THE CENSUS (the class, not the instance) ════════════════════════════════
-- Every client-callable function in the live catalogue (EXECUTE for `anon` or
-- `authenticated`) whose body reaches `billing.org_plan`, `billing.entitlement*`,
-- `billing.usage_ledger`, `billing.account_addon`, `billing.spend_guardrail` or
-- the plan resolvers — 22 functions — classified, with each answer MEASURED as
-- the stranger above rather than read off the source:
--
--   WIDER — fixed here (4). All SECURITY DEFINER, all take an organization and
--   never ask whether the caller stands in it:
--     billing.entitlement_check(text, uuid)
--     billing.org_capability_status(uuid)
--     billing.plan_status(uuid)
--     billing.resolve_capability_effective(uuid, text, uuid)
--
--   ALREADY GATED (6), re-measured, unchanged by this migration:
--     billing.entitlement_consume(text,int,uuid,uuid)  iam.has_org_access_for (DD-208)
--     billing.addon_grant(...)                         super-admin only
--     billing.org_plan_assign(uuid,text,text)          super-admin only
--     billing.org_plan_set(...)                        super-admin only
--     billing.org_plan_list()                          super-admin only
--     billing.usage_admin_summary(ts,ts)               platform-admin only
--
--   NO ORGANIZATION ARGUMENT — the caller's own account, nothing to gate (4):
--     billing.entitlement_check(text) · billing.entitlement_snapshot() ·
--     billing.entitlement_consume(text,int,uuid) · billing.plan_limit_set(...)
--     (the last is super-admin only besides).
--
--   BY DESIGN PUBLIC (1): billing.public_plans(). It reads the PLAN CATALOGUE —
--   `billing.plan` + `billing.plan_limit`, the prices and allowances printed on
--   /pricing — and takes no organization at all. A public pricing page reads
--   PLANS; it never reads an organization's plan. Nothing to gate, nothing to
--   allowlist.
--
--   INVOKER RESOLVERS (6): billing.resolve_plan(uuid), resolve_org_tier(uuid),
--   resolve_effective_tier(uuid,uuid), resolve_limit(uuid,text,period),
--   resolve_capability(uuid,text) and resolve_capability(uuid,text,uuid).
--   Granted to `anon` and `authenticated`, but NOT `SECURITY DEFINER`: called
--   directly they run under the caller's own RLS, so today they see no
--   `billing.org_plan` row for anybody and answer with the default plan —
--   measured as the stranger: `resolve_plan(7cd12da2-…)` -> `free`,
--   `resolve_org_tier(7cd12da2-…)` -> `free`. They are bounded BY THE TABLE, not
--   by a check of their own, which is why the table's policy below has to be the
--   bounded one and not a blanket member read of everything in `billing`. After
--   this migration they answer truthfully for a member and still `free` for a
--   stranger — the table decides, once, and six functions inherit it.
--   (Inside a SECURITY DEFINER door they run with the definer's rights, as
--   before; the door's own gate is what bounds them there.)
--
-- ═══ THE FIX ═════════════════════════════════════════════════════════════════
-- 1. THE TABLE GAINS THE MEMBER READ IT SHOULD ALWAYS HAVE HAD.
--    `billing.org_plan` has NO `platform.entity_types` row, so the generator
--    refuses it by construction — proven, not assumed:
--      `select iam.apply_rls('billing','org_plan','billing_org_plan','system')`
--      -> ERROR: apply_rls: token billing_org_plan is not an active registered entity
--    So this is a BESPOKE policy, and the one legitimate way a bespoke policy
--    exists is DD-172's: it is written down in a migration, which is what this
--    file is. Its name — `org_plan_member_read` — is its policy of record, and
--    `pnpm check:policy-of-record` finds it here.
--    The predicate is SET-WISE (`organization_id in (select iam.my_orgs())`)
--    because db-rules §6d forbids a per-row SECURITY DEFINER call in a `USING`
--    clause: `has_org_access(o)` would be one call per candidate row. The
--    `IS NOT NULL` guard is not optional — it keeps the predicate identical in
--    all three truth values for a NULL organization.
--    The two platform-admin policies are NOT touched: platform admins keep
--    their reach, and every write lane stays exactly where it was.
--
-- 2. THE FOUR DOORS GATE THE ORGANIZATION ARGUMENT, through `iam.has_org_access_for`
--    — DD-191's helper of record, the same one DD-192 and DD-208 used. No new
--    helper is invented and no fourth definition of "member" is created.
--    A NULL `p_org` keeps its meaning (the caller's own personal account lane,
--    db-rules §2) and is untouched. `public.is_platform_admin()` keeps the
--    admin reach the ruling preserves. The refusal is a real error with a human
--    sentence that names the CLASS of the data it is refusing — an
--    organization's plan is that organization's confidential business — so a
--    person reading the message knows what was withheld and why, and nothing
--    fails silently.
--
-- WHY NOT JUST NARROW THE DOORS. Narrowing alone would leave the table
-- unreadable to its own members and every org-billing surface permanently
-- dependent on a definer door to see a row it is entitled to. The ruling is
-- about WHO MAY SEE THE PLAN, so it is expressed once where the rows are — and
-- the doors are brought back in line with it.
--
-- THE SERVER LANE IS UNCHANGED. `aidream/services/billing/ai_points.py` calls
-- `billing.resolve_capability_effective` on a direct connection where
-- `auth.uid()` is NULL; that path is not a signed-in stranger and the gate below
-- only fires for a caller the database can name. None of the four doors is
-- granted to `anon`, so a NULL `auth.uid()` on them is the server, never a
-- browser.
--
-- Proven RED before and GREEN after against the live database with real
-- identities, every probe rolled back; `pnpm check:door-rows --population=signed-in`
-- could not see three of the four (`p_org` is not `p_org_id`, so its argument
-- derivation left them UNMEASURED BY NAME) and scored the fourth a false PASS by
-- handing `plan_status` a `billing.plan` id where an ORGANIZATION was wanted.
-- That derivation is corrected in the same change.

-- ── 1. the table: a bounded member read, as a policy of record ───────────────
DROP POLICY IF EXISTS org_plan_member_read ON billing.org_plan;
CREATE POLICY org_plan_member_read ON billing.org_plan
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs()));

COMMENT ON TABLE billing.org_plan IS
  'An organization''s plan. DD-214 (2026-09-14): readable by the members of that organization (policy org_plan_member_read) and by platform admins; written only through the super-admin doors billing.org_plan_assign / billing.org_plan_set. Bespoke policies of record — this table has no platform.entity_types row, so iam.apply_rls refuses it by construction.';

-- ── 2a. entitlement_check(capability, organization) ──────────────────────────
CREATE OR REPLACE FUNCTION billing.entitlement_check(p_capability text, p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
declare v_user uuid := auth.uid(); v_res jsonb;
begin
  if v_user is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'limit', 0, 'used', 0,
      'tier', 'free', 'reason', 'not_authenticated', 'period', null, 'check_id', null,
      'required_tier', null, 'organization_id', p_org);
  end if;

  -- 🚨 DD-214: an organization's plan is its members' to see. `p_org` is a CLAIM.
  if p_org is not null
     and not iam.has_org_access_for(v_user, p_org)
     and not public.is_platform_admin() then
    raise exception 'An organization''s plan and entitlements are that organization''s confidential business. You are not a member of that organization, so this door will not tell you what it is on.'
      using errcode = '42501';
  end if;

  v_res := billing.resolve_capability(v_user, p_capability, p_org);
  return v_res || jsonb_build_object('check_id', gen_random_uuid());
end;
$function$;

-- ── 2b. org_capability_status(organization) ──────────────────────────────────
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
    return jsonb_build_object('tier','free','org_tier','free','user_tier','free',
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
    'user_tier', billing.resolve_tier(v_user),
    'org_tier',  coalesce(billing.resolve_org_tier(p_org), 'free'),
    'capabilities', v_caps);
end;
$function$;

-- ── 2c. plan_status(organization) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION billing.plan_status(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
declare
  v_user  uuid := auth.uid();
  v_plan  text;
  v_row   billing.plan%rowtype;
  v_next  billing.plan%rowtype;
  v_dims  jsonb := '[]'::jsonb;
  r       record;
  v_res   jsonb;
begin
  if v_user is null then
    return jsonb_build_object('signed_in', false, 'plan', null, 'dimensions', '[]'::jsonb);
  end if;

  -- 🚨 DD-214: an organization's plan is its members' to see. `p_org` is a CLAIM.
  -- This door returns the organization's whole plan row — id, name, rank, seat
  -- model, price band — plus its per-dimension usage. It is the single widest
  -- disclosure in the family, and it was open to any signed-in caller.
  if p_org is not null
     and not iam.has_org_access_for(v_user, p_org)
     and not public.is_platform_admin() then
    raise exception 'An organization''s plan and entitlements are that organization''s confidential business. You are not a member of that organization, so this door will not tell you what it is on.'
      using errcode = '42501';
  end if;

  v_plan := billing.resolve_plan(p_org);
  select * into v_row from billing.plan where id = v_plan;
  -- The next plan up WITHIN THE SAME AUDIENCE — what "upgrade" means here.
  --
  -- Audience matters: ranking personal and company plans on one line makes the
  -- plan after Max ($199, 1.4M points) come out as Team ($39/seat, 260k) — an
  -- "upgrade" that gives less on every dimension. A personal account upgrades
  -- along the personal ladder; moving to a company plan is a different decision
  -- and belongs on the pricing page, not in an inline nudge. Free sits outside
  -- both ladders, so it points at the entry-level personal plan.
  -- NULL next_plan is a real answer: they are on the top plan, and the surface
  -- says so instead of inventing somewhere to send them.
  select * into v_next from billing.plan
    where active and is_public and rank > coalesce(v_row.rank, 0)
      and audience = case when coalesce(v_row.audience,'free') = 'free'
                          then 'personal' else v_row.audience end
    order by rank limit 1;

  for r in
    select c.capability, c.period, c.enforced
    from billing.capability c
    join billing.plan_limit pl on pl.capability = c.capability
    where pl.plan_id = v_plan
    order by c.capability
  loop
    v_res := billing.resolve_capability(v_user, r.capability, p_org);
    v_dims := v_dims || jsonb_build_array(jsonb_build_object(
      'capability', r.capability,
      'period',     r.period,
      'enforced',   r.enforced,
      'used',       v_res->'used',
      'limit',      v_res->'limit',
      'remaining',  v_res->'remaining',
      'unlimited',  (v_res->'limit') = 'null'::jsonb,
      'from_addon', coalesce(v_res->'from_addon', 'false'::jsonb),
      'resets_at',  v_res->'windows'->0->'resetsAt',
      'next_plan_limit', (
        select pl2.limit_value from billing.plan_limit pl2
        where pl2.plan_id = v_next.id and pl2.capability = r.capability
          and pl2.period is not distinct from r.period)
    ));
  end loop;

  return jsonb_build_object(
    'signed_in', true,
    'organization_id', p_org,
    'plan', to_jsonb(v_row),
    'next_plan', to_jsonb(v_next),
    'tier', billing.resolve_effective_tier(v_user, p_org),
    'dimensions', v_dims);
end;
$function$;

-- ── 2d. resolve_capability_effective(user, capability, organization) ─────────
-- NOTE the shape of the caller test here. This door is ALSO the server's door
-- (`aidream/services/billing/ai_points.py`, on a direct connection where
-- `auth.uid()` is NULL), and it is granted to `authenticated` only — never
-- `anon`. So the gate asks about a caller the database can actually name, in
-- exactly the way the pre-existing `p_user <> v_caller` guard directly above it
-- already does. A NULL caller here is the server, not a browser.
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
      and ul.user_id = p_user
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
$function$;

COMMENT ON FUNCTION billing.entitlement_check(text, uuid) IS
  'DD-214: the organization argument is a claim, checked against iam.has_org_access_for before any plan or entitlement is disclosed. Platform admins keep their reach.';
COMMENT ON FUNCTION billing.org_capability_status(uuid) IS
  'DD-214: the organization argument is a claim, checked against iam.has_org_access_for before any plan or entitlement is disclosed. Platform admins keep their reach.';
COMMENT ON FUNCTION billing.plan_status(uuid) IS
  'DD-214: the organization argument is a claim, checked against iam.has_org_access_for before the organization''s plan row is disclosed. Platform admins keep their reach.';
COMMENT ON FUNCTION billing.resolve_capability_effective(uuid, text, uuid) IS
  'DD-214: the organization argument is a claim, checked against iam.has_org_access_for for any caller the database can name. A NULL auth.uid() is the server''s own direct connection (aidream ai_points), never a browser: this door is granted to authenticated only.';

-- ── 3. the gate row: these doors now state their gate ────────────────────────
UPDATE platform.client_callable_door d
   SET gate_predicate = 'iam.has_org_access_for(auth.uid(), p_org) or public.is_platform_admin() (DD-214)'
 WHERE d.schema_name = 'billing'
   AND (   (d.function_name = 'entitlement_check'            AND d.identity_args = 'p_capability text, p_org uuid')
        OR (d.function_name = 'org_capability_status'        AND d.identity_args = 'p_org uuid')
        OR (d.function_name = 'plan_status'                  AND d.identity_args = 'p_org uuid')
        OR (d.function_name = 'resolve_capability_effective' AND d.identity_args = 'p_user uuid, p_capability text, p_org uuid'));
