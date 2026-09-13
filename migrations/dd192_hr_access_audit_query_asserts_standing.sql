-- DD-192 — hr_access_audit_query asserts standing BEFORE it writes an audit row.
--
-- Found by the new row-boundedness harness `pnpm check:door-rows` (DD-192), not
-- by reading the body: the door returns `{"granted": true, "row_count": 0}` to a
-- non-member, which reads as correctly bounded, while the call has already
-- INSERTED a row into `hr.access_audit` for an organization the caller has no
-- standing in. The harness measures the transaction's writes, so it saw it.
--
-- Proven RED then GREEN against the live database with two real callers
-- (test@test.com, a plain member of two unrelated organizations; a signed-in
-- user who is a member of none) naming Castellano & Reyes
-- `7cd12da2-2213-4378-8fba-a9e2dc4ea657`, in rolled-back transactions.
--
-- The fix is DD-191's pattern, not a new one: the organization argument is a
-- claim, asserted through the ONE helper `iam.has_org_access_for`.

CREATE OR REPLACE FUNCTION public.hr_access_audit_query(p_from timestamp with time zone DEFAULT (now() - '30 days'::interval), p_to timestamp with time zone DEFAULT now(), p_target_token text DEFAULT NULL::text, p_include_self boolean DEFAULT false, p_limit integer DEFAULT 100, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_org uuid := p_organization_id; v_rows jsonb; v_n int;
  v_audit uuid; v_can_audit boolean; v_mine uuid[]; v_own_ok boolean;
begin
  if v_uid is null then
    raise exception 'hr_access_audit_query: no authenticated caller' using errcode = '42501';
  end if;
  v_mine := hr.employments_of(v_uid);
  if v_org is null then
    select em.organization_id into v_org from hr.employment em where em.id = any(v_mine) limit 1;
  end if;
  if v_org is null then
    raise exception 'hr_access_audit_query: pass p_organization_id' using errcode = '22023';
  end if;

  -- 🚨 DD-192: THE ORGANISATION ARGUMENT IS A CLAIM, AND IT IS CHECKED FIRST.
  -- Until 2026-09-13 this function took `p_organization_id` on trust: a signed-in
  -- stranger who passed any organization's id reached `hr._record_access_audit`
  -- and WROTE A ROW into that organization's access log — granted, row_count 0 —
  -- before anything had established that they had any standing there at all.
  -- Repeatable, from any free account, with an id that is not a secret: an
  -- audit log anyone can write into is an audit log nobody can trust. Found by
  -- `pnpm check:door-rows`, which measures what a door WRITES as well as what it
  -- returns. The standing test is the same one DD-191 settled on — the ONE
  -- helper `iam.has_org_access_for` — widened by an employment in the same
  -- organization, because an employee is exactly who the own-log knob is for.
  if not iam.has_org_access_for(v_uid, v_org)
     and not exists (select 1 from hr.employment em
                      where em.id = any(v_mine) and em.organization_id = v_org) then
    raise exception 'You have no standing in that organization, so you cannot read its HR access log. Switch to an organization you belong to.'
      using errcode = '42501';
  end if;

  v_can_audit := hr.capability(v_uid, 'audit.read', null, current_date, v_org);
  v_own_ok := (hr._knob('hr.access','employee_can_see_own_access_log') #>> '{}')::boolean;

  if not v_can_audit and not v_own_ok then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => 'hr_access_audit',
      p_purpose => 'audit', p_basis => 'refused', p_granted => false,
      p_sensitivity_tier => 'restricted', p_row_count => 0,
      p_denial_reason => 'the caller holds no audit.read capability and the own-log knob is off');
    return jsonb_build_object('granted', false, 'reason', 'no_capability', 'audit_id', v_audit);
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) - 'request_context'), '[]'::jsonb), count(*)
    into v_rows, v_n
  from (
    select * from hr.access_audit a
     where a.organization_id = v_org
       and a.occurred_at between p_from and p_to
       and (p_target_token is null or a.target_token = p_target_token)
       and (p_include_self or not a.is_self_access)
       -- 🚨 an audit.read holder sees the org's log; everyone else sees ONLY the rows ABOUT them
       and (v_can_audit or a.subject_employment_id = any(v_mine))
     order by a.occurred_at desc
     limit least(greatest(coalesce(p_limit,100),1), 500)) a;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'list', p_target_token => 'hr_access_audit',
    p_purpose => 'audit', p_basis => case when v_can_audit then 'role' else 'self' end,
    p_granted => true, p_row_count => v_n, p_sensitivity_tier => 'restricted',
    p_is_self_access => not v_can_audit);

  return jsonb_build_object('granted', true, 'rows', v_rows, 'row_count', v_n, 'audit_id', v_audit);
end
$function$
;
