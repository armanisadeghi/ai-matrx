-- chair-step: it removes `record` from platform.child_parent_types('file') (no file may name a store record as its parent again). Refused while any file names one: move or archive those files first.
-- lane: ENTITY-IDS
-- Inverse of migrations/campaign/entityids_b_a_file_may_be_the_child_of_a_store_record.sql.

do $guard$
begin
  if exists (select 1 from files.files where parent_record_type = 'record') then
    raise exception 'entityids_b down: % file(s) name a store record as their parent; the shape check would refuse every update to them.',
      (select count(*) from files.files where parent_record_type = 'record');
  end if;
end $guard$;

CREATE OR REPLACE FUNCTION platform.child_parent_types(p_token text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- Access ladder T-11: THE ONE LIST of record types a row of this token may be the child of
  -- (platform.child_parent_columns names the two columns). Read by the files.files shape check,
  -- iam.accessible_entity_ids (the set-wise parent lane) and the writers. A type added here must
  -- be an active platform.entity_types token.
  select case p_token
           when 'file' then array[
             -- AI chat and coding session (T-11 step 0); `file` = rows written before part n
             'conversation', 'coding_session', 'file',
             -- dictation: the studio session it was recorded into, else the chunk journal
             'studio_session', 'studio_recording_chunks',
             -- every HR record that points at a file (census 2026-09-28: 22 tables)
             'hr_background_check', 'hr_candidate', 'hr_careers_portal', 'hr_checklist_item',
             'hr_corrective_action', 'hr_course_version', 'hr_credential', 'hr_employee',
             'hr_engagement', 'hr_i9', 'hr_i9_document', 'hr_kiosk_session', 'hr_new_hire_report',
             'hr_offer', 'hr_payroll_export', 'hr_provider_event', 'hr_punch', 'hr_records_request',
             'hr_restricted_note', 'hr_tax_withholding', 'hr_transcript_entry',
             'hr_verification_letter_request',
             -- the other Private/Confidential table that points at a file
             'pdf_redaction_key_escrow',
             -- T-13 2.1: direct-message conversation (Private), study session (Confidential),
             -- cloud browser profile (Confidential — its login captures)
             'dm_conversation', 'study_session', 'browser_profile'
           ]
         end
$function$;
