-- INVERSE of migrations/campaign/rcb6_output_feedback_doors_decide_as_the_person.sql (lane RC-B6).
-- lane: RC-B6
-- lock: platform
-- based-on: platform.upsert_output_feedback(text, uuid, text, text, text, text, text, text, text, uuid, uuid) 39c4ab4818ff8772422f9035c82238f9265336e01e2cdddd546911af93f80d49
-- based-on: platform.clear_output_feedback(text, uuid) 60d519f0e9ed63d829caa52a57a803942d3457dcd48f4d29fca11dde606407c1
-- Restores both writers to SECURITY INVOKER with their exact prior bodies, drops the two door
-- rows and the readability helper. (This re-breaks client feedback writes under the doors-only
-- policy — that is the state before the file.)

CREATE OR REPLACE FUNCTION platform.upsert_output_feedback(p_subject_type text, p_subject_id uuid, p_verdict text DEFAULT NULL::text, p_prose text DEFAULT NULL::text, p_request_id text DEFAULT NULL::text, p_surface_name text DEFAULT NULL::text, p_original_content text DEFAULT NULL::text, p_corrected_content text DEFAULT NULL::text, p_corrected_ref_type text DEFAULT NULL::text, p_corrected_ref_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS platform.output_feedback
 LANGUAGE plpgsql
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
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  delete from platform.output_feedback
   where subject_type = p_subject_type
     and subject_id = p_subject_id
     and created_by = (select auth.uid())
  returning true;
$function$;

delete from platform.client_callable_door
 where schema_name = 'platform'
   and function_name in ('upsert_output_feedback', 'clear_output_feedback')
   and declared_by like 'migrations/campaign/rcb6_output_feedback_doors_decide_as_the_person.sql%';

drop function if exists platform._output_feedback_subject_readable(text, uuid);
