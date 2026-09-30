-- based-on: billing.public_plans() 00501af90c942a737256846272441dc77d4359ab6d6a0bf053a4228685a53fcd
-- based-on: billing.plan_status(uuid) d87aa99f068ddf32eefd62d3ede657d528d2618f1ed5befb55fd7cf3879c14e6
-- chair-step: RENAMES one live column (billing.plan.is_public -> listed_on_pricing, 9 rows) and replaces its only two readers in the same transaction, so no reader ever sees a missing column. Census 2026-09-29: no other function, and no code in matrx-frontend, aidream (its generated Plan model is regenerated) or the @ai-matrx packages reads the column or the `is_public` key of plan_status's payload. Lane B-BILLING.
-- billing_plan_listed_on_pricing.sql  (lane B-BILLING, 2026-09-29)
--
-- `billing.plan.is_public` is not access: D232 dispositioned it as "a merchandising flag (shows on
-- /pricing)". Since DD-173 gave billing.plan a real `visibility` (and T-13 its published_to_web),
-- the column's name makes the grader read it as the retired access flag (legacy_is_public WARN,
-- the one thing keeping billing_plan uncertified) and gives a reader two "public" words that mean
-- different things. The table is brought to an honest shape: the column is named for what it does.
-- Values unchanged (all 9 true). Access unchanged: no policy, grant or lane reads it; the anon
-- column grant follows the rename.

alter table billing.plan rename column is_public to listed_on_pricing;

comment on column billing.plan.listed_on_pricing is 'Merchandising: the plan is listed on the pricing page and offered as an upgrade. Not access -- who may read a plan is the row''s level (billing_plan is Public).';

CREATE OR REPLACE FUNCTION billing.public_plans()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
    select coalesce(jsonb_agg(x order by x.rank), '[]'::jsonb) from (
      select p.plan_key as id, p.name, p.audience, p.tagline, p.rank, p.monthly_cents,
             p.annual_cents, p.per_seat, p.min_seats, p.badge, p.is_default,
             (select coalesce(jsonb_agg(jsonb_build_object(
                'capability', pl.capability, 'period', pl.period,
                'limit', pl.limit_value, 'note', pl.note) order by pl.capability), '[]'::jsonb)
              from billing.plan_limit pl where pl.plan_id = p.plan_key) as limits
      from billing.plan p
      where p.active and p.listed_on_pricing
    ) x;
  $function$
;

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
  -- This door returns the organization's whole plan row — key, name, rank, seat
  -- model, price band — plus its per-dimension usage. It is the single widest
  -- disclosure in the family, and it was open to any signed-in caller.
  if p_org is not null
     and not iam.has_org_access_for(v_user, p_org)
     -- ACCESS LADDER T-33: an archived organization is closed to its members, but its OWNER keeps
     -- the plan view (what they would be restoring, and what it costs). is_org_owner ignores archiving.
     and not iam.is_org_owner(p_org, v_user)
     and not public.is_platform_admin() then
    raise exception 'An organization''s plan and entitlements are that organization''s confidential business. You are not a member of that organization, so this door will not tell you what it is on.'
      using errcode = '42501';
  end if;

  v_plan := billing.resolve_plan(p_org);
  select * into v_row from billing.plan where plan_key = v_plan;
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
    where active and listed_on_pricing and rank > coalesce(v_row.rank, 0)
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
        where pl2.plan_id = v_next.plan_key and pl2.capability = r.capability
          and pl2.period is not distinct from r.period)
    ));
  end loop;

  -- 🚨 `to_jsonb(v_row)` / `to_jsonb(v_next)` are GONE — DD-173. The object below is
  --    THE EXACT KEY SET THE WHOLE-ROW SPREAD PRODUCED BEFORE THAT FILE: all seventeen
  --    columns billing.plan had, with `id` carrying the plan_key. Nothing is added and
  --    nothing is dropped — a whole-row spread would have started publishing
  --    organization_id, created_by, updated_by, version and visibility to every
  --    signed-in browser the moment the retrofit added them, and nothing would have
  --    raised.
  return jsonb_build_object(
    'signed_in', true,
    'organization_id', p_org,
    'plan', case when v_row.plan_key is null then null else jsonb_build_object(
      'id', v_row.plan_key, 'name', v_row.name, 'audience', v_row.audience,
      'tagline', v_row.tagline, 'rank', v_row.rank, 'tier', v_row.tier,
      'monthly_cents', v_row.monthly_cents, 'annual_cents', v_row.annual_cents,
      'per_seat', v_row.per_seat, 'min_seats', v_row.min_seats,
      'badge', v_row.badge, 'listed_on_pricing', v_row.listed_on_pricing,
      'is_default', v_row.is_default, 'active', v_row.active,
      'metadata', v_row.metadata, 'created_at', v_row.created_at,
      'updated_at', v_row.updated_at) end,
    'next_plan', case when v_next.plan_key is null then null else jsonb_build_object(
      'id', v_next.plan_key, 'name', v_next.name, 'audience', v_next.audience,
      'tagline', v_next.tagline, 'rank', v_next.rank, 'tier', v_next.tier,
      'monthly_cents', v_next.monthly_cents, 'annual_cents', v_next.annual_cents,
      'per_seat', v_next.per_seat, 'min_seats', v_next.min_seats,
      'badge', v_next.badge, 'listed_on_pricing', v_next.listed_on_pricing,
      'is_default', v_next.is_default, 'active', v_next.active,
      'metadata', v_next.metadata, 'created_at', v_next.created_at,
      'updated_at', v_next.updated_at) end,
    'tier', billing.resolve_effective_tier(v_user, p_org),
    'dimensions', v_dims);
end;
$function$
;
