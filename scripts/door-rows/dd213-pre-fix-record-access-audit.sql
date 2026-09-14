-- THE PRE-DD-213 `hr._record_access_audit`, VERBATIM — the shipped bytes, kept so
-- the harness's own RED proof is reproducible and not a story.
--
-- `pnpm check:door-rows:self-test` restores this body inside ONE transaction it
-- always rolls back, probes the REAL door `public.hr_my_compensation` as a real
-- stranger, and asserts this harness calls it a FAIL. Before DD-213 that exact
-- call returned a refusal envelope AND wrote a row into Castellano & Reyes'
-- `hr.access_audit`, and the harness scored it PASS — because it only looked at
-- writes when a door ANSWERED with rows. If the self-test ever comes back PASS
-- here, the write arm has stopped measuring refusals and DD-213 can walk back in.
--
-- 🚨 This file is a FIXTURE. It is never applied by `pnpm db:apply` and must never
-- be edited to match a new live body: its whole value is that it is the defect.

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
begin
  v_actor := coalesce(p_actor_type, case when v_uid is null then 'automation' else 'hr_admin' end);

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
    v_actor, p_actor_employment_id, coalesce(p_actor_user_id, v_uid))
  returning id into v_id;

  return v_id;
end
$function$;
