-- chair-step: the one DROP here is files_parent_record_shape, dropped and re-added in the same transaction WIDER (NOT VALID, validated in part l): every row the old check admitted the new one admits; nothing is removed.
-- lane: access-ladder T-11 leak fixes, part k: the one list of record types a file may be the
-- child of, and the shape check reads it.
--
-- Law: common-docs/policies/access-ladder.md ("Children inherit their parent"). T-11 made a file a
-- child only of an AI chat, a coding session or another file. The independent verifier found files
-- that belong to other records and still open to coworkers: the letter of an HR verification letter
-- request, a payroll export's CSV, employee photos (every file an HR record points at), and the
-- audio chunks of a dictation. This file only DECLARES the types; the kernel (part m) gives a
-- child to whoever can open its parent, and the writers and backfill (parts n, o) mark the files.
--
-- `file` stays accepted for rows written before part n; writers now name a variant's ultimate
-- parent record instead (a variant of a chat attachment is the chat's), so the kernel never has
-- to walk a chain of files.
--
-- One table locked: files.files (drop + add NOT VALID check, catalog-only). Part l validates.
set local lock_timeout = '2s';

create or replace function platform.child_parent_types(p_token text)
returns text[]
language sql
immutable
as $function$
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
             'pdf_redaction_key_escrow'
           ]
         end
$function$;

comment on function platform.child_parent_types(text) is
  'Access ladder T-11: the record types a row of this token may be the child of. One list: the '
  'files.files shape check, the kernel''s set-wise parent lane and the writers read it.';

alter table files.files drop constraint files_parent_record_shape;

alter table files.files
  add constraint files_parent_record_shape
  check (
    (parent_record_type is null and parent_record_id is null)
    or parent_record_type = any (platform.child_parent_types('file'))
  ) not valid;

comment on column files.files.parent_record_type is
  'Access ladder T-11: the kind of record this file belongs to (a platform.entity_types token from '
  'platform.child_parent_types(''file'') — an AI chat, a coding session, a studio session or the '
  'dictation chunk journal, an HR record). Set = this file is a CHILD: it has no organization lane '
  'of its own and opens to its owner, its own shares, and whoever can open the parent record. '
  'A child whose parent record does not exist (yet, or any more) carries the type with a NULL id '
  'and stays its owner''s. Written by triggers, never by clients.';
