-- DD-213c — the OTHER access log records its own people too (`iam.access_audit`).
--
-- THE DEFECT (V-77 §9, re-measured by B-102 on the live bodies 2026-09-14).
-- DD-213/213b closed the class on `hr.access_audit`, whose single insert of record
-- now asks whether the person a denial names has any business being in that
-- organization's log. `iam.access_audit` — a second organization-scoped access log,
-- with its own `organization_id`, its own actor column and its own emergency-door
-- doctrine — had no such test at all.
--
-- Measured live, rolled back, as test@test.com `4060701e-706a-4c76-b3ca-0bbc69fa5a14`,
-- who has no membership, no employment and no capability in Castellano & Reyes
-- `7cd12da2-2213-4378-8fba-a9e2dc4ea657`:
--
--   iam.emergency_door_open('hr_location','527ee26c-7e54-48f7-a0ee-9ab7088dfb40',
--                           'support_investigation', '…')
--     -> {"granted": false, "reason": "not_an_org_admin", "audit_id": "bb2cc1bb-…"}
--     -> iam.access_audit +1 into 7cd12da2-…, action denied, actor 4060701e-…
--
-- Same sentence as DD-213, other log. And worse in one way: `emergency_door_open`
-- writes four more refusal rows ABOVE its admin check (unclassified token, wrong
-- data class, short justification, unregistered purpose), so a stranger can mint a
-- row before the door has decided anything about them at all.
--
-- THE CLASS. `hr.access_audit` had ONE inserter. `iam.access_audit` has FOUR, and
-- three of them bypass the recorder entirely:
--
--   iam._record_access_audit   the recorder of record (the emergency-door family)
--   iam.assert_may_transfer    writes its own 'rewrite_owner' refusal row
--   iam.class_allows           writes its own refusal row
--   iam._notify_door           writes a row when it cannot deliver a notice
--
-- Nine client-callable functions reach them (`iam.emergency_door_open/approve/deny`,
-- `public.hr_break_glass`, `public.access_request_decide`, `public.mbr_add`,
-- `public.create_share_link`, `public.admin_manage_organization_membership`,
-- `public.edu_learn_doc_set_status`). Fixing only the recorder would have closed one
-- of four doors into the same room, so the rule goes on the TABLE, where every
-- writer — including the fifth one somebody adds next month — has to pass it.
--
-- TWO MECHANISMS, TWO JOBS, ONE RULE:
--   * the recorder carries the test in its own body, so the contract is visible to
--     anyone reading the function that is supposed to enforce it, and no work is
--     done for a row that will not be kept;
--   * a BEFORE INSERT trigger on `iam.access_audit` is the class guard: it is what
--     makes the sentence true for the three writers that never call the recorder,
--     and for every future one. It DROPS the row (returns null) rather than raising,
--     because a refusal is still a refusal — the door's own answer is unchanged and
--     the caller still gets its human sentence; only the receipt disappears.
--
-- ONE DEFINITION OF STANDING, NEVER A THIRD. The rule is `hr._has_audit_standing`
-- (DD-213b): real standing in the employer — capability, employment, membership —
-- OR a pending, non-deleted invitation the organization issued. It is called
-- across the schema boundary ON PURPOSE. A private `iam` copy would be a second
-- definition of the same idea and the two would drift; that is the defect this
-- program exists to stop, and it outweighs the layering preference for keeping
-- `iam` free of `hr` references. Both functions are SECURITY DEFINER owned by
-- postgres in the same database, so the call costs nothing but the name.
--
-- WHAT IS STILL RECORDED, unchanged:
--   * every GRANTED row, whoever the actor is — if a door lets a stranger in, this
--     log has to be the thing that says so;
--   * an insider's denial (member, employee, capability holder) — measured;
--   * an invitee's denial (DD-213b) — the organization invited them;
--   * the anonymous / automation lane, where there is no user id to place.

CREATE OR REPLACE FUNCTION iam._audit_records_its_own_people()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'public'
AS $function$
begin
  -- 🚨 DD-213c: an organization's access log records its own people, never a
  -- stranger's knock. A denial naming somebody with no standing and no pending
  -- invitation in this organization is not this organization's business to keep,
  -- and an audit log any stranger can fill with attacker-chosen rows is an audit
  -- log nobody can trust. Grants, insiders, invitees and the anonymous lane all
  -- pass straight through.
  if coalesce(new.granted, false) = false
     and new.actor_user_id is not null
     and new.organization_id is not null
     and not hr._has_audit_standing(new.actor_user_id, new.organization_id) then
    return null;
  end if;
  return new;
end
$function$;

REVOKE ALL ON FUNCTION iam._audit_records_its_own_people() FROM PUBLIC;
REVOKE ALL ON FUNCTION iam._audit_records_its_own_people() FROM anon, authenticated;

COMMENT ON FUNCTION iam._audit_records_its_own_people() IS
  'DD-213c: the class guard on iam.access_audit — a denial row naming somebody with no audit standing in that organization (hr._has_audit_standing) is not written. Grants, insiders, invitees and the anonymous lane are unaffected. It exists because three of the four writers into this table bypass iam._record_access_audit.';

DROP TRIGGER IF EXISTS access_audit_records_its_own_people ON iam.access_audit;
CREATE TRIGGER access_audit_records_its_own_people
  BEFORE INSERT ON iam.access_audit
  FOR EACH ROW EXECUTE FUNCTION iam._audit_records_its_own_people();

-- The recorder carries the same test in its own body: the contract belongs where
-- the reader looks for it, and nothing should be computed for a row that the
-- table is going to drop anyway.
CREATE OR REPLACE FUNCTION iam._record_access_audit(p_organization_id uuid, p_action text, p_target_token text, p_data_class text, p_purpose text, p_basis text, p_granted boolean, p_target_ids uuid[] DEFAULT '{}'::uuid[], p_row_count integer DEFAULT NULL::integer, p_subject_user_id uuid DEFAULT NULL::uuid, p_justification text DEFAULT NULL::text, p_denial_reason text DEFAULT NULL::text, p_request_id uuid DEFAULT NULL::uuid, p_permission_id uuid DEFAULT NULL::uuid, p_grant_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_is_emergency_door boolean DEFAULT true, p_actor_user_id uuid DEFAULT NULL::uuid, p_granted_to_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'public'
AS $function$
declare v_id uuid; v_actor uuid := coalesce(p_actor_user_id, auth.uid());
begin
  -- 🚨 THE TWO-PERSON ACTION MUST SAY WHO THE KEY IS FOR. `approved` is the only action whose
  -- actor and grantee are different people by construction, so the convenience default is a
  -- LIE there and is refused rather than silently taken.
  if p_action = 'approved' and p_granted_to_user_id is null then
    raise exception 'iam._record_access_audit: an `approved` row must name the person the key was minted FOR — the approver is not the reader'
      using errcode = '22023',
            hint = 'Pass p_granted_to_user_id (the requester). Defaulting it to the actor is what told a subject the wrong name on her own access page (V-38, 2026-09-12).';
  end if;

  -- 🚨 DD-213c: THIS ORGANIZATION'S LOG RECORDS ITS OWN PEOPLE. Until 2026-09-14 a
  -- signed-in stranger who named any organization's row got a refusal from the
  -- emergency door AND a row in that organization's access log — repeatably, from
  -- any free account, with ids that are not secrets. The test is DD-213b's one
  -- rule: standing in the employer, or a pending invitation it issued. A granted
  -- row is never suppressed, and the anonymous lane is untouched.
  if coalesce(p_granted, false) = false
     and v_actor is not null
     and p_organization_id is not null
     and not hr._has_audit_standing(v_actor, p_organization_id) then
    return null;
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
