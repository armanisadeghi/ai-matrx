-- DD-213 — an organization's audit log records its own people, never a stranger's knock.
--
-- THE DEFECT (V-69 §4, re-measured by B-102 on the live bodies 2026-09-14).
-- DD-192 closed the write half of its Class 2 on exactly two doors
-- (`hr_access_audit_query`, `hr_my_incident_reports`): each now asserts standing
-- BEFORE it reaches the recorder. Every other door kept the old shape — refuse,
-- then write the refusal down — and a refusal envelope is not a side effect the
-- `check:door-rows` gate could see, so all of them scored PASS.
--
-- Measured live, rolled back, as test@test.com `4060701e-706a-4c76-b3ca-0bbc69fa5a14`,
-- who has NO membership, NO employment and NO capability in Castellano & Reyes, LLP
-- `7cd12da2-2213-4378-8fba-a9e2dc4ea657` — each call returned a refusal AND wrote one
-- `hr.access_audit` row into that organization, proven by the row's own xid being
-- still in progress:
--
--   hr_my_compensation(1805135d-…)      -> {"reason":"not_self"}        + 1 row (28f18531-…)
--   hr_relations_list(7cd12da2-…)       -> {"reason":"not_reachable"}   + 1 row (7cbf11da-…)
--   hr_ssn_probe_authorize(7cd12da2-…)  -> {"reason":"no_capability"}   + 1 row (839ff191-…)
--   hr_employee_profile(a3852a94-…)     -> {"reason":"not_reachable"}   + 1 row (d0338c84-…)
--   hr_wf_resolve_failure(ef9ecd20-…)   -> {"reason":"not_the_assignee"}+ 1 row (4b92a6e1-…)
--
-- Repeatable, from any free account, with organization ids that are not secrets.
-- An audit log any stranger can fill with rows is an audit log nobody can trust:
-- the noise is unbounded, it is attacker-chosen, and it is indistinguishable from
-- the organization's own record of its own people.
--
-- THE CLASS, NOT THE INSTANCE. B-102's census of the live catalogue found the HR
-- access audit has exactly ONE insert of record — `hr._record_access_audit` (the
-- other two direct inserts, `hr.rpc_calculation_snapshot_get` and `hr.punch_record`,
-- are internal and not client-callable) — and **74 client-callable functions can
-- reach it**. Fixing the five V-69 named would have left 69 unexamined siblings
-- carrying the identical shape. So the check goes where the row is written, once.
--
-- THE RULE. A denial receipt is only written when the person it names has some
-- standing in the organization whose log it lands in. Standing is membership OR
-- employment OR capability — B-98's three lanes, the same authority model the HR
-- doors themselves use — asked through ONE helper of record, `hr._has_any_standing`,
-- and never a fourth definition of the same idea.
--
--   * a pure stranger: refused exactly as before, and NO row. The refusal keeps its
--     own sentence; only the receipt disappears, because there is nothing about a
--     stranger for that organization to keep.
--   * a member, an employee, or a capability holder who is denied: logged exactly as
--     before, byte-identical. An insider's denied attempt is the single most
--     valuable row in an access log and this migration does not touch it.
--   * a GRANTED row is never suppressed, whoever the actor is. If a door ever admits
--     a stranger, that is a leak and the log must be the thing that says so.
--   * an actor with no user id (the anonymous kiosk lane, `p_actor_type` automation)
--     is unchanged: there is no person to place, and those doors validate a session
--     token bound to the organization before they record anything.
--
-- Proven RED then GREEN against the live database in rolled-back transactions, with
-- real identities; the gate that could not see this (`pnpm check:door-rows`) is
-- extended in the same change to measure writes on EVERY outcome, refusals included.

-- ── the helper of record ─────────────────────────────────────────────────────
-- Capability is asked first (DD-206): in HR a capability outranks a role, and the
-- arms are separate statements rather than one `or`, so the order is a language
-- guarantee and not the planner's cost estimate. Nothing refuses in between — this
-- helper only ever answers.
CREATE OR REPLACE FUNCTION hr._has_any_standing(p_user uuid, p_organization_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
begin
  if p_user is null or p_organization_id is null then
    return false;
  end if;

  -- 1. a capability in this employer (hr.capability's own engine)
  if cardinality(hr._l1_capabilities(p_user, p_organization_id, current_date)) > 0 then
    return true;
  end if;

  -- 2. an employment in this employer
  if exists (select 1 from hr.employment em
              where em.id = any(hr.employments_of(p_user))
                and em.organization_id = p_organization_id) then
    return true;
  end if;

  -- 3. a membership of this organization (the ONE helper, DD-191/DD-192)
  if iam.has_org_access_for(p_user, p_organization_id) then
    return true;
  end if;

  return false;
end
$function$;

-- An `hr.` internal helper is not a client door (db-rules §6d-4).
REVOKE ALL ON FUNCTION hr._has_any_standing(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr._has_any_standing(uuid, uuid) FROM anon, authenticated;

COMMENT ON FUNCTION hr._has_any_standing(uuid, uuid) IS
  'DD-213: the ONE answer to "does this person have any standing in this organization" for HR — capability (asked first, DD-206) OR employment OR membership. Consulted before a denial receipt is written into an organization''s access log. Never a fourth definition of the same idea.';

-- ── the recorder consults it before it writes a denial ───────────────────────
CREATE OR REPLACE FUNCTION hr._record_access_audit(p_organization_id uuid, p_action text, p_target_token text, p_purpose text, p_basis text, p_granted boolean, p_target_ids uuid[] DEFAULT '{}'::uuid[], p_row_count integer DEFAULT NULL::integer, p_subject_employment_id uuid DEFAULT NULL::uuid, p_record_class_key text DEFAULT NULL::text, p_sensitivity_tier text DEFAULT 'confidential'::text, p_field_key text DEFAULT NULL::text, p_is_self_access boolean DEFAULT false, p_request_context jsonb DEFAULT '{}'::jsonb, p_justification text DEFAULT NULL::text, p_is_break_glass boolean DEFAULT false, p_denial_reason text DEFAULT NULL::text, p_access_role_key text DEFAULT NULL::text, p_request_ref text DEFAULT NULL::text, p_actor_type text DEFAULT NULL::text, p_actor_employment_id uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_id    uuid;
  v_uid   uuid := auth.uid();
  v_actor text;
  v_who   uuid;
begin
  v_actor := coalesce(p_actor_type, case when v_uid is null then 'automation' else 'hr_admin' end);
  v_who   := coalesce(p_actor_user_id, v_uid);

  -- 🚨 DD-213: AN ORGANIZATION'S AUDIT LOG RECORDS ITS OWN PEOPLE, NEVER A
  -- STRANGER'S KNOCK. Until 2026-09-14 every denial arriving here was written
  -- down, whoever knocked: a signed-in stranger who passed any organization's id
  -- to any of the 74 client-callable doors that reach this recorder got a refusal
  -- AND a row in that organization's access log, repeatably, for free. The
  -- standing test is the one helper of record and it is asked BEFORE the write.
  -- A denial about somebody with no standing here is not this organization's
  -- business to keep; a denial about a member, an employee, or a capability
  -- holder still lands, unchanged, because that is exactly what an access log
  -- is for. A GRANTED row is never suppressed — if a door lets a stranger in,
  -- this log is the thing that has to say so.
  if coalesce(p_granted, false) = false
     and v_who is not null
     and p_organization_id is not null
     and not hr._has_any_standing(v_who, p_organization_id) then
    return null;
  end if;

  -- the writer is the privileged path by construction (SPEC-ACCESS law 2)
  perform hr.arm_write();

  insert into hr.access_audit (
    organization_id, action, target_token, target_ids, row_count, subject_employment_id,
    record_class_key, sensitivity_tier, field_key, purpose, basis, is_self_access,
    request_context, justification, is_break_glass, granted, denial_reason, access_role_key,
    request_ref, actor_type, actor_employment_id, actor_user_id)
  values (
    p_organization_id, p_action, p_target_token, coalesce(p_target_ids,'{}'), p_row_count,
    p_subject_employment_id, p_record_class_key, p_sensitivity_tier, p_field_key, p_purpose,
    p_basis, p_is_self_access, coalesce(p_request_context,'{}'::jsonb), p_justification,
    p_is_break_glass, p_granted, p_denial_reason, p_access_role_key, p_request_ref,
    v_actor, p_actor_employment_id, v_who)
  returning id into v_id;

  return v_id;
end
$function$;
