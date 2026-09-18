-- DD-213b — a person the organization INVITED is not a stranger to its audit log.
--
-- THE RULING (the chair, 2026-09-14, on B-102's own concern). DD-213 stopped an
-- organization's access log from recording a stranger's knock. It keyed the test
-- on standing — membership, employment, capability — and that swept up one person
-- who is not a stranger at all: somebody holding a PENDING invitation. The
-- organization invited them. Their refused attempt is exactly the row an
-- administrator wants to see when an invite goes wrong, and it is the
-- organization's own business to keep. Everyone else without standing is still a
-- stranger's knock and still goes unrecorded.
--
-- Measured before this migration, rolled back, on the live bodies: with a pending
-- `iam.invitations` row for test@test.com in Castellano & Reyes
-- `7cd12da2-2213-4378-8fba-a9e2dc4ea657` — by `invited_user_id` and again by
-- `email` — `public.hr_my_compensation` refused and wrote **0 rows**, because
-- `hr._has_any_standing` is false for an invitee. That is the gap this closes.
--
-- WHY A SIBLING HELPER AND NOT A FOURTH ARM ON THE FIRST ONE. `hr._has_any_standing`
-- answers an AUTHORITY question: may this person do HR things in this employer? An
-- invitation is not authority — an invitee may do nothing at all yet — so folding it
-- in would quietly widen every future caller of the authority helper. The audit
-- question is a different question with a different answer, so it gets its own name:
--
--   hr._has_any_standing(user, org)    — authority. Unchanged, and stays pure.
--   hr._has_audit_standing(user, org)  — "is this organization's log the right place
--                                        to keep a refusal about this person?"
--                                        = standing OR a pending invitation.
--
-- The recorder consults the audit one. Nothing else changes: a pure stranger is
-- still refused with no row, an insider's denial is still logged byte-identically,
-- and a GRANTED row is still never suppressed.
--
-- An EXPIRED pending invitation counts. The organization still issued it, and a
-- refusal against an expired invite is precisely the event an administrator is
-- looking for when they ask why the invite did not work. A `revoked` or `accepted`
-- row does not count: revoked is the organization taking the invitation back, and
-- accepted means the person now has real standing and reaches the first helper.

CREATE OR REPLACE FUNCTION hr._has_audit_standing(p_user uuid, p_organization_id uuid)
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

  -- 1. real standing in the employer: capability, employment, or membership
  if hr._has_any_standing(p_user, p_organization_id) then
    return true;
  end if;

  -- 2. a pending invitation this organization issued — matched on the invited
  --    user id, or on the invited email when the invitation names no user yet
  --    (an invitation sent to an address is the normal shape). Case-insensitive,
  --    because an email address is not case-sensitive and an invite typed in
  --    capitals is the same invite.
  if exists (
    select 1
      from iam.invitations i
      left join auth.users u on u.id = p_user
     where i.organization_id = p_organization_id
       and i.status = 'pending'
       and i.deleted_at is null
       and (i.invited_user_id = p_user
            or (i.email is not null and u.email is not null and lower(i.email) = lower(u.email)))
  ) then
    return true;
  end if;

  return false;
end
$function$;

REVOKE ALL ON FUNCTION hr._has_audit_standing(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr._has_audit_standing(uuid, uuid) FROM anon, authenticated;

COMMENT ON FUNCTION hr._has_audit_standing(uuid, uuid) IS
  'DD-213b: is this organization''s access log the right place to keep a refusal about this person? = hr._has_any_standing OR a pending, non-deleted invitation this organization issued to them. The ONE test the recorder consults before writing a denial receipt; hr._has_any_standing stays the pure authority question.';

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
  -- AND a row in that organization's access log, repeatably, for free.
  --
  -- 🚨 DD-213b: AND A PERSON THE ORGANIZATION INVITED IS NOT A STRANGER. The test
  -- is `hr._has_audit_standing` — real standing OR a pending invitation — because
  -- a refused attempt by an invitee is exactly the row an administrator wants when
  -- an invite goes wrong. A denial about anybody else with no standing here is not
  -- this organization's business to keep; a denial about a member, an employee, a
  -- capability holder or an invitee lands unchanged. A GRANTED row is never
  -- suppressed — if a door lets a stranger in, this log has to say so.
  if coalesce(p_granted, false) = false
     and v_who is not null
     and p_organization_id is not null
     and not hr._has_audit_standing(v_who, p_organization_id) then
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
