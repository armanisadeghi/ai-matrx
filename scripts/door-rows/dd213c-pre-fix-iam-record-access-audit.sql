-- THE PRE-DD-213c `iam._record_access_audit`, VERBATIM — the shipped bytes, kept so
-- the harness's own RED proof for the SECOND access log is reproducible.
--
-- `pnpm check:door-rows:self-test` neutralises the DD-213c guard and restores this body
-- inside ONE transaction it always rolls back, probes the REAL door
-- `iam.emergency_door_open` as a real stranger, and asserts this harness calls it a
-- FAIL. Before DD-213c that exact call returned
-- `{"granted": false, "reason": "not_an_org_admin", "audit_id": "bb2cc1bb-…"}` AND
-- wrote a row into Castellano & Reyes' `iam.access_audit` — and the door was not
-- even in the population this gate probes.
--
-- 🚨 This file is a FIXTURE. It is never applied by `pnpm db:apply` and must never
-- be edited to match a new live body: its whole value is that it is the defect.

CREATE OR REPLACE FUNCTION iam._record_access_audit(p_organization_id uuid, p_action text, p_target_token text, p_data_class text, p_purpose text, p_basis text, p_granted boolean, p_target_ids uuid[] DEFAULT '{}'::uuid[], p_row_count integer DEFAULT NULL::integer, p_subject_user_id uuid DEFAULT NULL::uuid, p_justification text DEFAULT NULL::text, p_denial_reason text DEFAULT NULL::text, p_request_id uuid DEFAULT NULL::uuid, p_permission_id uuid DEFAULT NULL::uuid, p_grant_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_is_emergency_door boolean DEFAULT true, p_actor_user_id uuid DEFAULT NULL::uuid, p_granted_to_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'public'
AS $function$
declare v_id uuid; v_actor uuid := coalesce(p_actor_user_id, auth.uid());
begin
  if p_action = 'approved' and p_granted_to_user_id is null then
    raise exception 'iam._record_access_audit: an `approved` row must name the person the key was minted FOR — the approver is not the reader'
      using errcode = '22023',
            hint = 'Pass p_granted_to_user_id (the requester). Defaulting it to the actor is what told a subject the wrong name on her own access page (V-38, 2026-09-12).';
  end if;

  insert into iam.access_audit
    (organization_id, action, target_token, target_ids, row_count, subject_user_id, data_class,
     purpose, basis, justification, is_emergency_door, granted, denial_reason, request_id,
     permission_id, grant_expires_at, actor_user_id, granted_to_user_id, created_by, visibility)
  values
    (p_organization_id, p_action, p_target_token, coalesce(p_target_ids, '{}'::uuid[]), p_row_count,
     p_subject_user_id, p_data_class, p_purpose, p_basis, p_justification, p_is_emergency_door,
     p_granted, p_denial_reason, p_request_id, p_permission_id, p_grant_expires_at, v_actor,
     coalesce(p_granted_to_user_id, v_actor),
     v_actor, 'personal'::platform.visibility)
  returning id into v_id;
  return v_id;
end $function$;

-- The trigger is NOT dropped: `DROP TRIGGER` takes an ACCESS EXCLUSIVE lock on a
-- busy audit table and the self-test died on `canceling statement due to lock
-- timeout` the first time it tried (measured 2026-09-14). A gate that fails when
-- the database is busy is a gate nobody can trust. Replacing the trigger's
-- FUNCTION locks one `pg_proc` row and nothing else, and reproduces the pre-fix
-- world exactly: the trigger still fires, and it lets everything through.
CREATE OR REPLACE FUNCTION iam._audit_records_its_own_people()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'public'
AS $function$
begin
  -- the pre-DD-213c world: every row is written, whoever knocked
  return new;
end
$function$;
