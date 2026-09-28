-- lane: access-ladder T-31, part a: a dictation's staged audio chunk is its journal row's child.
--
-- Law: common-docs/policies/access-ladder.md ("Children inherit their parent"). Arman approved the
-- dictation log Private on 2026-09-28 (platform.class_approval_by_arman, token
-- studio_recording_chunks). Until then T-11 part n kept an unsent chunk a child of the journal TYPE
-- with no id (its owner's alone), because naming an Organization-class journal row would have opened
-- the audio to that organization's owners and admins. The journal is Private now, so a chunk names
-- its journal row and opens exactly to whoever opens that row (its owner; a share of the row).
--
-- The class fix, one writer: the journal gets the same adoption trigger every HR table and the
-- other Private/Confidential file-pointing table carry (files._adopt_files_named_by_row), so the
-- chunk the recorder uploads first becomes the journal row's child the moment the row lands. The
-- stamp (files._stamp_parent_record) is unchanged: at file insert the journal row does not exist
-- yet, so the chunk is still marked with the journal type and no id, and the trigger fills the id.
-- files._dictation_chunks_join_their_session still moves chunks to their studio session when a
-- recording segment names it.
--
-- Backfill: every chunk still marked with the journal type and no id whose journal row exists (same
-- person). Chunks whose journal row is gone stay type-only: their owner's alone.
--
-- Locks: SHARE ROW EXCLUSIVE on transcripts.studio_recording_chunks for the trigger (milliseconds);
-- row locks on the backfilled files.files rows. lock_timeout 3s.
set local lock_timeout = '3s';

create trigger _adopt_files_named_by_row
  after insert or update of file_id on transcripts.studio_recording_chunks
  for each row execute function files._adopt_files_named_by_row('studio_recording_chunks', 'file_id');

update files.files f
   set parent_record_id = j.id
  from transcripts.studio_recording_chunks j
 where j.file_id = f.id
   and f.parent_record_type = 'studio_recording_chunks'
   and f.parent_record_id is null
   and f.created_by = j.created_by;

comment on function files._stamp_parent_record() is
  'Access ladder T-11: on insert, a variant takes its source''s ultimate parent record, a '
  'coding-session artifact its session (type only until the session exists), an HR artifact its '
  'HR record (type only until the record names it), and a dictation chunk its studio session (else '
  'the chunk journal type; T-31: the journal row''s insert trigger then names the row, and the '
  'Private journal keeps it its owner''s).';
