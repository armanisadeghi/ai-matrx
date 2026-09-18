-- DD-208 — A DOOR IS NEVER WIDER THAN ITS TABLE: the organization argument on the
-- metering WRITE door was taken on trust.
--
-- ═══ THE FACT ════════════════════════════════════════════════════════════════
-- `billing.entitlement_consume(p_capability, p_quantity, p_check_id, p_org)` — the
-- four-argument overload, SECURITY DEFINER, granted to `authenticated` — writes
--
--     insert into billing.usage_ledger(user_id, organization_id, ...)
--     values (v_user, coalesce(p_org, personal org), ...)
--
-- and then returns `billing.resolve_capability(v_user, p_capability, p_org)`,
-- whose non-NULL `p_org` switches the resolver onto that ORGANIZATION's plan.
-- `p_org` is never checked against the caller.
--
-- Proven live 2026-09-13 on db.matrxserver.com, as `role authenticated` with
-- test@test.com's real JWT claims, in a rolled-back transaction: against
-- organization 7cd12da2-2213-4378-8fba-a9e2dc4ea657 ("Castellano & Reyes, LLP"),
-- an organization that caller cannot even `select` from `iam.organizations` under
-- RLS, the call
--   * WROTE a `billing.usage_ledger` row carrying that organization's id — a
--     stranger's meter, charged from any free account, repeatably; and
--   * ANSWERED with that organization's plan: `"plan": "company-pro"`,
--     `"plan_name": "Pro"`, `"organization_id": "7cd12da2-…"`.
--
-- `pnpm check:door-rows` could not find this: it cannot derive a `p_org`
-- argument for this door, so it reported the overload UNMEASURED BY NAME — which
-- is exactly why UNMEASURED is never read as a pass.
--
-- ═══ THE DECISION ════════════════════════════════════════════════════════════
-- The door's boundedness is "acts only on an organization the caller stands in".
-- There is no product need for anything wider: the only live caller of this door
-- in any repository is `matrx-frontend/features/entitlements/service.ts`, and it
-- calls the THREE-argument overload (no `p_org` at all). Nothing in matrx-frontend,
-- aidream, matrx-local or matrx-extend passes `p_org`. So the door narrows and no
-- table policy moves.
--
-- ═══ THE FIX ═════════════════════════════════════════════════════════════════
-- The organization argument is a CLAIM and is checked before anything is written,
-- through `iam.has_org_access_for` — DD-191's helper of record, the same one
-- DD-192 used for `hr_access_audit_query` and `hr_my_incident_reports`. No new
-- helper is invented. A NULL `p_org` keeps its meaning (the caller's personal
-- organization, db-rules §2) and is untouched. The refusal is a real error with a
-- human sentence, not a silent empty answer.

CREATE OR REPLACE FUNCTION billing.entitlement_consume(p_capability text, p_quantity integer, p_check_id uuid, p_org uuid)
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
  v_ledger_org uuid;
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

  select * into v_cap from billing.capability where capability = p_capability;

  -- NO NULL ORG (db-rules §2): the ROW's org falls back to the caller's personal
  -- org. `p_org` itself is passed to resolve_capability unchanged below, because
  -- a non-NULL org there switches the resolver onto the org's PLAN path.
  v_ledger_org := coalesce(p_org, public.ensure_personal_organization(v_user));

  -- Idempotency: a check + its consume are ONE accounted unit.
  if p_check_id is not null then
    select exists(select 1 from billing.usage_ledger where check_id = p_check_id)
      into v_dup;
  end if;

  if not v_dup then
    -- Serialize this (org|user, capability) so two concurrent spends cannot both
    -- read "one left" and both write.
    perform pg_advisory_xact_lock(
      hashtext(coalesce(p_org::text, v_user::text) || ':' || p_capability));
    insert into billing.usage_ledger(user_id, organization_id, capability, quantity, check_id)
    values (v_user, v_ledger_org, p_capability, greatest(coalesce(p_quantity, 1), 0), p_check_id);
  end if;

  v_res := billing.resolve_capability(v_user, p_capability, p_org);
  return v_res || jsonb_build_object(
    'consumed', not v_dup, 'duplicate', v_dup,
    'enforced', coalesce(v_cap.enforced, false));
end;
$function$;
