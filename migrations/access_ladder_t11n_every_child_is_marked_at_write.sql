-- lane: access-ladder T-11 leak fixes, part n: every file that belongs to a record is marked its
-- child when it is written, and a variant follows its source.
--
-- Law: common-docs/policies/access-ladder.md ("Children inherit their parent"). The independent
-- verifier of T-11 found three kinds of file still open to coworkers while their record is locked:
--   1. image variants of coding-session artifacts (the stamp only looked one level up, at insert,
--      and nothing re-marked a variant when its source became a child later);
--   2. files an HR record points at (verification letter, payroll export CSV, employee photo);
--   3. dictation audio chunks in `.matrx-tmp/transcripts`.
-- The class fix, one writer per way a file becomes a record's:
--   * files.ultimate_parent_record — a variant's parent is its source's ULTIMATE parent record
--     (a thumbnail of a chat attachment is the chat's), so the kernel never walks file chains.
--   * files._stamp_parent_record (insert) — variants take it; dictation chunks are marked.
--   * files._variants_follow_their_source (update) — when a file's parent changes (a chat adopts
--     it, a coding session arrives), every variant that followed it follows again, recursively.
--   * files._adopt_files_named_by_row — ONE trigger function on every HR table (and the one other
--     Private/Confidential table) with a file column: the file becomes that row's child. Only a
--     file made by the row's creator or held by the row's organization moves, so pointing a record
--     at somebody else's file can never hand it to the record's readers.
--   * transcripts.studio_recording_segments — when a recording's segment lands, its journaled
--     chunks become the studio session's children (the record the audio was dictated into).
-- A dictation chunk with no studio session is the person's own unsent input: a child of the chunk
-- journal type with no id, which keeps it its owner's alone. The journal row is NOT named as the
-- parent: the journal (transcripts.studio_recording_chunks) is Organization-class and its
-- organization owners/admins can read it, so naming it would open the audio to them. Making the
-- journal Private needs Arman's approval (reported, not done).
--
-- Locks: SHARE ROW EXCLUSIVE for trigger creation on files.files, transcripts.studio_recording_segments
-- and the 23 referencing tables below, each for milliseconds; lock_timeout 2s.
set local lock_timeout = '2s';
-- based-on: files._stamp_parent_record() 275b53a7d73b296c5d17dfba047ab2db61615b648808454cf7b0028bee3a0ce0
-- based-on: files._adopt_chat_attachment_ids(uuid, uuid[]) d6894d7571c098fea0f83cf07c80f48ad0bc346bae1dd009be751fe76ae5f1ac

-- ── A file's ultimate parent record ────────────────────────────────────────────────────────────
create or replace function files.ultimate_parent_record(p_file_id uuid, out parent_type text, out parent_id uuid)
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_id uuid := p_file_id;
  v_type text; v_pid uuid; v_source uuid;
  v_steps integer := 0;
begin
  -- Up the chain: a file's own parent record when it names one (other than a legacy `file`
  -- pointer), else its source file's. Bounded: a cycle or a 16-deep chain answers nothing.
  while v_id is not null and v_steps < 16 loop
    v_steps := v_steps + 1;
    select f.parent_record_type, f.parent_record_id, f.parent_file_id
      into v_type, v_pid, v_source
      from files.files f where f.id = v_id;
    if not found then
      return;
    end if;
    if v_type is not null and v_type <> 'file' then
      parent_type := v_type; parent_id := v_pid;
      return;
    end if;
    v_id := case when v_type = 'file' then v_pid else v_source end;
  end loop;
end;
$function$;

comment on function files.ultimate_parent_record(uuid) is
  'Access ladder T-11: the record a file ultimately belongs to — its own parent record, else its '
  'source file''s (variants of variants), up to 16 steps. NULLs when none. Runs as its caller, so '
  'a person asking reads only files they can open; the stamp calls it as the table owner.';

-- ── Is this file a dictation chunk? One predicate, used by the stamp and the backfill ──────────
create or replace function files.is_dictation_chunk(p_file_path text, p_file_name text, p_metadata jsonb)
returns boolean
language sql
immutable
as $function$
  -- The recorder's staging uploads (features/audio: audioChunkJournal, audioFallbackUpload) under
  -- the hidden `.matrx-tmp/transcripts` folder.
  select coalesce(p_file_path like '.matrx-tmp/transcripts/%', false)
     and (coalesce(p_metadata ->> 'origin', '') in ('audio-chunk-journal', 'audio-fallback')
          or coalesce(p_file_name, '') like 'chunk\_%'
          or coalesce(p_file_path, '') like '.matrx-tmp/transcripts/chunk\_%')
$function$;

comment on function files.is_dictation_chunk(text, text, jsonb) is
  'Access ladder T-11: a dictation''s staged audio (a recorder chunk or its full-audio fallback) '
  'in .matrx-tmp/transcripts. Such a file is the child of the studio session it was recorded into, '
  'else of the chunk journal type with no id (its owner''s alone).';

-- ── Insert: variants take their source's parent; coding artifacts their session; dictation ─────
create or replace function files._stamp_parent_record()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_session uuid;
  v_type text;
  v_id uuid;
begin
  if new.parent_record_type is not null then
    return new;
  end if;
  -- A variant (a resized image, a thumbnail, a converted page) shows exactly what its source
  -- shows: it belongs to the record its source ultimately belongs to.
  if new.parent_file_id is not null then
    select u.parent_type, u.parent_id into v_type, v_id
      from files.ultimate_parent_record(new.parent_file_id) u;
    if v_type is not null then
      new.parent_record_type := v_type;
      new.parent_record_id := v_id;
      return new;
    end if;
  end if;
  -- A coding session's raw artifact (commands, environment values, tool output) is the session's.
  -- When the session record is not there yet the type alone is set: the file is a child with no
  -- readable parent, which keeps it its owner's; chat.coding_session's insert trigger fills the id.
  if new.artifact_kind = 'coding_session_artifact' then
    select c.id into v_session
      from chat.coding_session c
     where c.created_by = new.created_by
       and c.provider = coalesce(new.metadata ->> 'provider', 'claude_code')
       and c.provider_session_id = new.provider_session_id
       and c.deleted_at is null
     limit 1;
    new.parent_record_type := 'coding_session';
    new.parent_record_id := v_session;
    return new;
  end if;
  -- An HR artifact the server writes (aidream services/hr: the verification letter, the payroll
  -- export) is its HR record's from the first byte, before the record row names it: a letter's
  -- file name is its request's id; a payroll export's record names it moments later
  -- (files._adopt_files_named_by_row fills the id). Until then it is its owner's alone.
  if new.file_path like 'hr/verification-letters/%' then
    select v.id into v_id
      from hr.verification_letter_request v
     where v.id::text = substring(new.file_path from '^hr/verification-letters/([0-9a-f-]{36})')
       and v.organization_id is not distinct from new.organization_id;
    new.parent_record_type := 'hr_verification_letter_request';
    new.parent_record_id := v_id;
    return new;
  end if;
  if new.file_path like 'hr/payroll-exports/%' then
    new.parent_record_type := 'hr_payroll_export';
    new.parent_record_id := null;
    return new;
  end if;
  -- A dictation's staged audio is the record it was dictated into: the studio session whose
  -- segment carries the recorder's safety id; until one exists, the person's own unsent input.
  if files.is_dictation_chunk(new.file_path, new.file_name, new.metadata) then
    select s.session_id into v_id
      from transcripts.studio_recording_segments s
     where s.safety_id = new.metadata ->> 'safety_id'
       and s.created_by = new.created_by
       and s.deleted_at is null
     limit 1;
    if v_id is not null then
      new.parent_record_type := 'studio_session';
      new.parent_record_id := v_id;
    else
      new.parent_record_type := 'studio_recording_chunks';
      new.parent_record_id := null;
    end if;
  end if;
  return new;
end;
$function$;

comment on function files._stamp_parent_record() is
  'Access ladder T-11: on insert, a variant takes its source''s ultimate parent record, a '
  'coding-session artifact its session (type only until the session exists), an HR artifact its '
  'HR record (type only until the record names it), and a dictation '
  'chunk its studio session (else the chunk journal type with no id: its owner''s alone).';

-- ── Update: variants follow their source ───────────────────────────────────────────────────────
create or replace function files._variants_follow_their_source()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  -- Every variant that followed the old parent (or none, or a legacy `file` pointer) follows the
  -- new one. Its own update fires this trigger again, so variants of variants follow too.
  update files.files v
     set parent_record_type = new.parent_record_type,
         parent_record_id = new.parent_record_id
   where v.parent_file_id = new.id
     and (v.parent_record_type is null
          or v.parent_record_type = 'file'
          or (v.parent_record_type is not distinct from old.parent_record_type
              and v.parent_record_id is not distinct from old.parent_record_id))
     and (v.parent_record_type is distinct from new.parent_record_type
          or v.parent_record_id is distinct from new.parent_record_id);
  return null;
end;
$function$;

comment on function files._variants_follow_their_source() is
  'Access ladder T-11: when a file''s parent record changes, the variants that followed it follow '
  'again (recursively, through their own update).';

create trigger _variants_follow_their_source
  after update of parent_record_type, parent_record_id on files.files
  for each row
  when (old.parent_record_type is distinct from new.parent_record_type
        or old.parent_record_id is distinct from new.parent_record_id)
  execute function files._variants_follow_their_source();

-- ── Chat adoption: variants now follow through the trigger above ───────────────────────────────
create or replace function files._adopt_chat_attachment_ids(p_conversation_id uuid, p_file_ids uuid[])
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_owner uuid;
  v_n integer;
begin
  if p_conversation_id is null or coalesce(cardinality(p_file_ids), 0) = 0 then
    return 0;
  end if;
  select c.created_by into v_owner from chat.conversation c where c.id = p_conversation_id;
  if v_owner is null then
    return 0;
  end if;
  -- Its variants follow (files._variants_follow_their_source).
  update files.files f
     set parent_record_type = 'conversation',
         parent_record_id = p_conversation_id
   where f.id = any(p_file_ids)
     and f.created_by = v_owner
     and f.visibility = 'personal'
     and f.parent_record_type is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- ── Every HR record (and the other Private/Confidential table) that points at a file ───────────
create or replace function files._adopt_files_named_by_row()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_row jsonb := to_jsonb(new);
  v_ids uuid[] := '{}';
  i integer;
begin
  -- TG_ARGV[0] = the row's platform.entity_types token; TG_ARGV[1..] = its file columns.
  for i in 1 .. tg_nargs - 1 loop
    if v_row ->> tg_argv[i] is not null then
      v_ids := v_ids || (v_row ->> tg_argv[i])::uuid;
    end if;
  end loop;
  if cardinality(v_ids) = 0 then
    return null;
  end if;
  -- Only a file this row's creator made, or that this row's organization holds, moves: pointing a
  -- record at somebody else's file never hands that file to the record's readers. A file already
  -- somebody's child stays where it is, except one marked with this record's type and no id yet
  -- (an HR artifact stamped at upload); its variants follow through their own trigger.
  update files.files f
     set parent_record_type = tg_argv[0],
         parent_record_id = (v_row ->> 'id')::uuid
   where f.id = any(v_ids)
     and (f.parent_record_type is null
          or (f.parent_record_type = tg_argv[0] and f.parent_record_id is null))
     and (f.created_by::text = v_row ->> 'created_by'
          or f.organization_id::text = v_row ->> 'organization_id');
  return null;
end;
$function$;

comment on function files._adopt_files_named_by_row() is
  'Access ladder T-11: the file columns of a record make those files its children (TG_ARGV[0] = '
  'the record''s token, the rest = its file columns). Only files its creator made or its '
  'organization holds, and only files nobody has adopted yet.';

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('hr', 'background_check',            'hr_background_check',            array['disclosure_document_file_id', 'inbound_result_file_id']),
      ('hr', 'candidate',                   'hr_candidate',                   array['resume_file_id']),
      ('hr', 'careers_portal',              'hr_careers_portal',              array['hero_file_id', 'logo_file_id']),
      ('hr', 'checklist_item',              'hr_checklist_item',              array['document_file_id']),
      ('hr', 'corrective_action',           'hr_corrective_action',           array['policy_document_file_id']),
      ('hr', 'course_version',              'hr_course_version',              array['content_file_id']),
      ('hr', 'credential',                  'hr_credential',                  array['document_file_id']),
      ('hr', 'employee',                    'hr_employee',                    array['photo_file_id']),
      ('hr', 'engagement',                  'hr_engagement',                  array['w9_file_id', 'sow_file_id', 'agreement_file_id']),
      ('hr', 'i9',                          'hr_i9',                          array['form_file_id']),
      ('hr', 'i9_document',                 'hr_i9_document',                 array['image_file_id']),
      ('hr', 'kiosk_session',               'hr_kiosk_session',               array['photo_file_id']),
      ('hr', 'new_hire_report',             'hr_new_hire_report',             array['artifact_file_id']),
      ('hr', 'offer',                       'hr_offer',                       array['offer_letter_file_id']),
      ('hr', 'payroll_export',              'hr_payroll_export',              array['artifact_file_id']),
      ('hr', 'provider_event',              'hr_provider_event',              array['artifact_file_id']),
      ('hr', 'punch',                       'hr_punch',                       array['photo_file_id']),
      ('hr', 'records_request',             'hr_records_request',             array['delivered_file_id']),
      ('hr', 'restricted_note',             'hr_restricted_note',             array['body_file_id']),
      ('hr', 'tax_withholding',             'hr_tax_withholding',             array['signed_document_file_id']),
      ('hr', 'transcript_entry',            'hr_transcript_entry',            array['certificate_file_id']),
      ('hr', 'verification_letter_request', 'hr_verification_letter_request', array['letter_file_id']),
      ('pdf', 'pdf_redaction_key_escrow',   'pdf_redaction_key_escrow',       array['file_id'])
    ) v(sch, tbl, token, cols)
  loop
    if not (r.token = any (platform.child_parent_types('file'))) then
      raise exception 'T-11n: % is not in platform.child_parent_types(''file'')', r.token;
    end if;
    execute format(
      'create trigger _adopt_files_named_by_row after insert or update of %s on %I.%I '
      'for each row execute function files._adopt_files_named_by_row(%L, %s)',
      (select string_agg(format('%I', c), ', ') from unnest(r.cols) c),
      r.sch, r.tbl, r.token,
      (select string_agg(format('%L', c), ', ') from unnest(r.cols) c));
  end loop;
end
$$;

-- ── A recording's segment makes its journaled chunks the studio session's ───────────────────────
create or replace function files._dictation_chunks_join_their_session()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  if new.safety_id is null or new.session_id is null or new.deleted_at is not null then
    return null;
  end if;
  update files.files f
     set parent_record_type = 'studio_session',
         parent_record_id = new.session_id
    from transcripts.studio_recording_chunks j
   where j.safety_id = new.safety_id
     and f.id = j.file_id
     and f.created_by = new.created_by
     and f.parent_record_type = 'studio_recording_chunks';
  return null;
end;
$function$;

comment on function files._dictation_chunks_join_their_session() is
  'Access ladder T-11: when a recording segment names its studio session, the dictation chunks the '
  'journal holds for that recording (same safety id, same person) become the session''s children.';

create trigger _dictation_chunks_join_their_session
  after insert or update of safety_id, session_id on transcripts.studio_recording_segments
  for each row execute function files._dictation_chunks_join_their_session();
