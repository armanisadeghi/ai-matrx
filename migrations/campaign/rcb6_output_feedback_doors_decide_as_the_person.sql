-- chair-step: RC-B6 turns the two output_feedback writers into declared SECURITY DEFINER doors (signed-in grant, as the person, subject must be readable); replaces two existing function bodies, so it is not additive-with-a-knob.
-- lane: RC-B6
-- lock: platform
-- based-on: platform.upsert_output_feedback(text, uuid, text, text, text, text, text, text, text, uuid, uuid) 36acf64907faf8577fe268df1a67ce1540291d4e17f4bb917f50c3fb1e79fdb6
-- based-on: platform.clear_output_feedback(text, uuid) 361b3f17138e2006bd9e9686d2d97439cee8d1996d67cb2d6d263654510db8a7
--
-- THUMBS NEVER SAVED. DOORS-ONLY-2 (doorsonly2_platform_output_feedback_is_never_client_written)
-- refused every client INSERT/UPDATE/DELETE on platform.output_feedback on the premise that
-- "every writer is a SECURITY DEFINER function owned by postgres". It was not: both writers,
-- platform.upsert_output_feedback and platform.clear_output_feedback, were SECURITY INVOKER,
-- so every thumbs-up/down, correction and Masterwork sign-off from a signed-in person has
-- answered 42501 "permission denied for table output_feedback" since (RC-B6 verify, 2026-09-25).
--
-- The table policy stays doors-only. The two writers BECOME the doors: SECURITY DEFINER, declared
-- in platform.client_callable_door, writing AS THE PERSON (created_by = auth.uid(), never an
-- argument) and only on a subject the person can READ (platform._output_feedback_subject_readable,
-- the same ladder the subject's own SELECT policy uses: iam.has_access at viewer; a message is
-- also readable through its conversation; platform admins read everything).
-- Signatures, defaults and return shapes are unchanged, so no caller changes.

create or replace function platform._output_feedback_subject_readable(p_subject_type text, p_subject_id uuid)
returns boolean
language sql
stable
set search_path to 'pg_catalog', 'public'
as $function$
  select coalesce(
    (select is_platform_admin())
    or case p_subject_type
      when 'message' then
        iam.has_access('message', p_subject_id, 'viewer')
        or iam.has_access('conversation',
             (select conversation_id from chat.message where id = p_subject_id), 'viewer')
      when 'artifact' then
        iam.has_access('artifact', p_subject_id, 'viewer')
        or iam.has_access('canvas_item', p_subject_id, 'viewer')
      when 'masterwork_run' then iam.has_access('masterwork_run', p_subject_id, 'viewer')
      when 'workflow_run' then iam.has_access('workflow_run', p_subject_id, 'viewer')
      when 'note' then iam.has_access('note', p_subject_id, 'viewer')
      when 'working_document' then iam.has_access('working_document', p_subject_id, 'viewer')
      else false
    end,
    false)
$function$;
-- A helper, never a door: only the two doors below call it.
revoke all on function platform._output_feedback_subject_readable(text, uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION platform.upsert_output_feedback(p_subject_type text, p_subject_id uuid, p_verdict text DEFAULT NULL::text, p_prose text DEFAULT NULL::text, p_request_id text DEFAULT NULL::text, p_surface_name text DEFAULT NULL::text, p_original_content text DEFAULT NULL::text, p_corrected_content text DEFAULT NULL::text, p_corrected_ref_type text DEFAULT NULL::text, p_corrected_ref_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS platform.output_feedback
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_row platform.output_feedback;
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_verdict is not null and p_verdict not in ('positive','negative','mixed') then
    raise exception 'invalid verdict %', p_verdict using errcode = '22023';
  end if;
  -- THE DOOR: feedback is written only on an output the person can read.
  if not platform._output_feedback_subject_readable(p_subject_type, p_subject_id) then
    raise exception 'not_readable: you cannot read % %, so you cannot rate it',
      p_subject_type, p_subject_id using errcode = '42501';
  end if;

  -- The rated output's organization wins. An explicit org is accepted only
  -- when the subject has none we can read; a disagreeing one is refused.
  v_org := platform._output_feedback_subject_org(p_subject_type, p_subject_id);
  if v_org is not null and p_organization_id is not null and p_organization_id <> v_org then
    raise exception 'organization_conflict: % % belongs to organization %, not %',
      p_subject_type, p_subject_id, v_org, p_organization_id using errcode = '22023';
  end if;
  v_org := coalesce(v_org, p_organization_id);
  if v_org is null then
    raise exception 'organization_required: no organization for % % — pass p_organization_id',
      p_subject_type, p_subject_id using errcode = '23502';
  end if;

  insert into platform.output_feedback as f (
    subject_type, subject_id, verdict, prose, request_id, surface_name,
    original_content, corrected_content, corrected_ref_type, corrected_ref_id,
    corrected_at, organization_id, created_by
  ) values (
    p_subject_type, p_subject_id,
    coalesce(p_verdict, 'mixed'), p_prose, p_request_id, p_surface_name,
    p_original_content, p_corrected_content, p_corrected_ref_type, p_corrected_ref_id,
    case when p_corrected_content is not null then now() end,
    v_org, v_uid
  )
  on conflict (subject_type, subject_id, created_by) do update set
    verdict           = coalesce(p_verdict, f.verdict),
    prose             = coalesce(p_prose, f.prose),
    request_id        = coalesce(p_request_id, f.request_id),
    surface_name      = coalesce(p_surface_name, f.surface_name),
    -- The ORIGINAL is written once and never overwritten: the first capture is
    -- the model's actual output. Later edits only move `corrected_content`.
    original_content  = coalesce(f.original_content, p_original_content),
    corrected_content = coalesce(p_corrected_content, f.corrected_content),
    corrected_ref_type= coalesce(p_corrected_ref_type, f.corrected_ref_type),
    corrected_ref_id  = coalesce(p_corrected_ref_id, f.corrected_ref_id),
    corrected_at      = case when p_corrected_content is not null then now()
                             else f.corrected_at end,
    organization_id   = v_org,
    deleted_at        = null
  returning * into v_row;

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.clear_output_feedback(p_subject_type text, p_subject_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- Only the caller's OWN row (created_by = auth.uid()); a NULL session matches nothing.
  delete from platform.output_feedback
   where subject_type = p_subject_type
     and subject_id = p_subject_id
     and created_by = (select auth.uid())
  returning true;
$function$;


insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'platform', 'upsert_output_feedback', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/rcb6_output_feedback_doors_decide_as_the_person.sql (lane RC-B6)',
       'Writes one output_feedback row AS THE CALLER (created_by = auth.uid(), never an argument; NULL session refused 42501). p_subject_id must be readable by the caller (platform._output_feedback_subject_readable: iam.has_access viewer on the subject token, a message also through its conversation; platform admins read all) or it is refused 42501; unknown subject types are refused. The organization is the subject''s own (a disagreeing p_organization_id is refused). Upsert key is (subject_type, subject_id, created_by), so it only ever touches the caller''s own row.',
       true
  from pg_proc p where p.oid = 'platform.upsert_output_feedback(text, uuid, text, text, text, text, text, text, text, uuid, uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'platform', 'clear_output_feedback', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/rcb6_output_feedback_doors_decide_as_the_person.sql (lane RC-B6)',
       'Deletes only the caller''s OWN feedback row on the subject (created_by = auth.uid()); a NULL session or another person''s row matches nothing. No entity id beyond the subject key, which it never reads.',
       true
  from pg_proc p where p.oid = 'platform.clear_output_feedback(text, uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;
-- Declared first, then granted: the DDL guard takes back a client grant on an undeclared definer.
grant execute on function platform.upsert_output_feedback(text, uuid, text, text, text, text, text, text, text, uuid, uuid) to authenticated;
grant execute on function platform.clear_output_feedback(text, uuid) to authenticated;
