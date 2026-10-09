-- lane: ENTITY-IDS (Unified Data program)
-- based-on: platform.child_parent_types(text) 0bbb383b5f1c34c466623985aa23b01967d2d1467bedbbba203962e6f52341f2
--
-- ENTITY-IDS (2026-10-08): A FILE MAY BE THE CHILD OF A STORE RECORD. `record` joins platform.child_parent_types('file'),
-- so a 360 review's meeting recording can be written with parent_record_type = 'record' and parent_record_id = the
-- Confidential notes row: the file then opens to exactly the people the kernel lets read that row (its owners, its
-- shares, its reader fields), never to the organization at large.
--
-- Safe only after entityids_a: the files read policy asks about the record ids the files name instead of listing every
-- record a person reaches. Measured 2026-10-08 (rolled back, one file under the Confidential track 9caa99b2… of the
-- Workspace organization): admin@admin.com, a named reader who is not the file's owner, reads it; test@test.com, a member
-- who is not a reader, does not; its owner does; every other file each seat reads is unchanged (same md5). Newest-50 file
-- page with the old listing forced: > 60 s for both admin@admin.com and test@test.com (statement timeout); with
-- entityids_a: 0.4–0.9 s, the same as without the record parent type.
--
-- Inverse: migrations/inverse/entityids_b_a_file_may_be_the_child_of_a_store_record_down.sql (refused while any file names a record parent).

do $pre$
begin
  if iam.entity_read_kernel_fingerprint() is distinct from '33d13ee5c2f25e1462af8d56d0bcea94' then
    raise exception 'entityids_b: the access kernel is % — entityids_a (33d13ee5c2f25e1462af8d56d0bcea94) must be live first', iam.entity_read_kernel_fingerprint();
  end if;
  if not coalesce((platform.knob_resolve('access', 'child_parent_asks_ids', null) -> 'types') ? 'record', false) then
    raise exception 'entityids_b: the knob access/child_parent_asks_ids does not list record; file reads would list every record a person reaches';
  end if;
end $pre$;

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
             'dm_conversation', 'study_session', 'browser_profile',
             -- ENTITY-IDS (2026-10-08): a store record (a meeting recording under a Confidential 360 note)
             'record'
           ]
         end
$function$;
