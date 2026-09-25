-- RC-A3 (verification common-docs/projects/rich-content-unification/evidence/verify-RC-A1-A3.md F1, F2):
--
--   F1 — an anchor is checked against its TARGET, in the write path. For a `document` target:
--        the captured content_version exists (a version row, or the document's current version
--        for a type whose capture is off), the code-point range lies inside that version's text,
--        the quote IS the text at that range, and prefix/suffix (when sent) are the text right
--        before/after it. platform.text_anchor_target_problem is the one check; the edge trigger
--        runs it now, and the comment trigger (rca3_anchor_triggers_cover_sets_and_comments, in
--        the 1-4 AM window: it is trigger DDL) will run the same function.
--   F2 — associations are unique on (source, target, role), so one annotation has ONE edge per
--        target. A single text_anchor sent onto an edge that already holds a different passage is
--        ADDED (the edge becomes a text_anchor_set), never a silent replacement; resending a
--        passage that is already there adds nothing (idempotent retry). Sending a whole
--        text_anchor_set is the explicit way to replace or remove passages.
--
-- Function bodies only: no table, trigger or policy DDL, so no lock on platform.associations.
-- based-on: platform._associations_validate_text_anchor() 1c6682674133b25430d5f04873f40676de9b7f6f8fa6e794353d8f8d245743b7

set local lock_timeout = '5s';

create or replace function platform.text_anchor_target_problem(p_target_type text, p_target_id uuid, p jsonb)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_cv     integer := (p ->> 'content_version')::integer;
  v_start  integer := (p ->> 'start')::integer;
  v_end    integer := (p ->> 'end')::integer;
  v_body   text;
  v_found  boolean := false;
  v_doc_cv integer;
  v_len    integer;
begin
  if p_target_type is distinct from 'document' then
    return null;   -- no versioned canonical text to check against (structure is still enforced)
  end if;
  select coalesce(v.body, (select b.body from content.document_version b
                            where b.document_id = v.document_id and b.content_version = v.body_content_version)),
         true
    into v_body, v_found
    from content.document_version v
   where v.document_id = p_target_id and v.content_version = v_cv;
  if not coalesce(v_found, false) then
    select d.content_version, d.body into v_doc_cv, v_body from content.document d where d.id = p_target_id;
    if v_doc_cv is null then
      return 'the target document does not exist';
    end if;
    if v_doc_cv <> v_cv then
      return format('content_version %s does not exist for this document (it is at %s)', v_cv, v_doc_cv);
    end if;
  end if;
  if v_body is null then
    return format('version %s of this document holds no text to anchor to', v_cv);
  end if;
  v_len := char_length(v_body);
  if v_end > v_len then
    return format('the range ends at %s but version %s is %s code points long', v_end, v_cv, v_len);
  end if;
  if substr(v_body, v_start + 1, v_end - v_start) is distinct from p ->> 'exact' then
    return format('the quote is not the text at %s-%s of version %s', v_start, v_end, v_cv);
  end if;
  if coalesce(p ->> 'prefix', '') <> ''
     and right(substr(v_body, 1, v_start), char_length(p ->> 'prefix')) is distinct from p ->> 'prefix' then
    return 'prefix is not the text immediately before the passage';
  end if;
  if coalesce(p ->> 'suffix', '') <> ''
     and left(substr(v_body, v_end + 1), char_length(p ->> 'suffix')) is distinct from p ->> 'suffix' then
    return 'suffix is not the text immediately after the passage';
  end if;
  return null;
end;
$fn$;
comment on function platform.text_anchor_target_problem(text, uuid, jsonb) is
  'RC-A3: is this (structurally valid) text_anchor TRUE of its target? For a document: the version exists, the code-point range is inside its text, the quote is the text at that range, prefix/suffix are the text around it. NULL = true; otherwise the sentence. Other target types have no versioned text and return NULL. Called by the edge and comment triggers as their owner; a direct call reads through the caller''s RLS.';

create or replace function platform._associations_validate_text_anchor()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_old     jsonb;
  v_anchors jsonb;
  v_problem text;
  a         jsonb;
begin
  -- F2: a single passage onto an edge that already holds a different one is ADDED, never replaced.
  if tg_op = 'UPDATE' and new.payload_kind = 'text_anchor'
     and old.deleted_at is null and new.deleted_at is null
     and old.payload_kind in ('text_anchor', 'text_anchor_set')
     and new.payload is distinct from old.payload then
    v_old := case when old.payload_kind = 'text_anchor' then jsonb_build_array(old.payload)
                  else old.payload -> 'anchors' end;
    if exists (select 1 from jsonb_array_elements(v_old) e where e.value = new.payload) then
      new.payload := old.payload;              -- a retry of a passage already there adds nothing
      new.payload_kind := old.payload_kind;
    else
      new.payload := jsonb_build_object('__kind', 'text_anchor_set', 'anchors', v_old || jsonb_build_array(new.payload));
      new.payload_kind := 'text_anchor_set';
    end if;
  end if;

  if new.payload_kind = 'text_anchor' then
    v_anchors := jsonb_build_array(new.payload);
  elsif new.payload_kind = 'text_anchor_set' then
    if jsonb_typeof(new.payload) is distinct from 'object'
       or new.payload ->> '__kind' is distinct from 'text_anchor_set'
       or jsonb_typeof(new.payload -> 'anchors') is distinct from 'array'
       or jsonb_array_length(new.payload -> 'anchors') = 0 then
      raise exception 'platform.associations: this % -> % edge carries an invalid text_anchor_set: it needs a non-empty "anchors" array', new.source_type, new.target_type
        using errcode = '23514',
              hint = 'Send {"__kind": "text_anchor_set", "anchors": [<text_anchor>, ...]}; to remove the last passage, detach the edge.';
    end if;
    v_anchors := new.payload -> 'anchors';
  else
    return new;
  end if;

  for a in select value from jsonb_array_elements(v_anchors) loop
    v_problem := coalesce(platform.text_anchor_problem(a),
                          platform.text_anchor_target_problem(new.target_type, new.target_id, a));
    if v_problem is not null then
      raise exception 'platform.associations: this % -> % edge carries an invalid text_anchor: %', new.source_type, new.target_type, v_problem
        using errcode = '23514',
              hint = 'Build the anchor from the target''s canonical body at one content_version: Unicode code-point start/end, the exact quote, up to 64 code points of prefix and suffix taken from the text around it. A whole-document link carries no payload.';
    end if;
  end loop;
  return new;
end;
$fn$;

-- The comment trigger's body, created now and attached in the window file (trigger DDL).
create or replace function platform._comments_validate_text_anchor()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_problem text;
begin
  v_problem := coalesce(platform.text_anchor_problem(new.anchor),
                        platform.text_anchor_target_problem(new.entity_type, new.entity_id, new.anchor));
  if v_problem is not null then
    raise exception 'platform.comments: this comment''s text_anchor is invalid: %', v_problem
      using errcode = '23514',
            hint = 'Anchor a comment to the exact text of one version of the document (Unicode code points); a comment on the whole document carries no anchor.';
  end if;
  return new;
end;
$fn$;

do $$
begin
  if platform.text_anchor_target_problem('note', gen_random_uuid(),
       '{"__kind":"text_anchor","content_version":1,"start":0,"end":1,"exact":"x"}'::jsonb) is not null then
    raise exception 'text_anchor_target_problem must leave non-document targets to the structural check';
  end if;
  if platform.text_anchor_target_problem('document', gen_random_uuid(),
       '{"__kind":"text_anchor","content_version":1,"start":0,"end":1,"exact":"x"}'::jsonb) is distinct from 'the target document does not exist' then
    raise exception 'text_anchor_target_problem does not refuse a missing document';
  end if;
end $$;
