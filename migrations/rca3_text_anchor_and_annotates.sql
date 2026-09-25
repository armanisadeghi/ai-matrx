-- RC-A3 (common-docs/projects/rich-content-unification/STORE-DESIGN.md §3.7, §3.19; the
-- annotations storage brief, common-docs/operations/for-arman/2026-09-23/content-annotations-storage-brief.md):
-- the precise-passage contract and the edges that carry it.
--
--   1. platform.text_anchor_problem(jsonb) — THE ONE server-side validator of a `text_anchor`
--      payload (NULL = valid, otherwise the sentence that says what is wrong): __kind, a
--      content_version, a non-empty Unicode CODE-POINT range whose length equals the code-point
--      length of `exact`, bounded prefix/suffix context, an optional {index, hash} block hint,
--      and no undeclared key. The kind itself is registered in content_ir.kind_definition by
--      aidream/kinds/content_anchors.py (published 2026-09-25); its JSON Schema is copied here
--      into platform.edge_payload_kind so validate_edge_payload checks the shape, and this
--      function checks what a JSON Schema cannot (end - start = length(exact)).
--   2. platform.edge_payload_kind `text_anchor` — any source/target pair (the passage identity
--      rides annotates, anchored_to and passage links alike).
--   3. A validation-only trigger on platform.associations that runs the validator whenever an
--      edge carries payload_kind = 'text_anchor' (WHEN clause: every other write pays nothing).
--   4. platform.comments.anchor: a text_anchor there must pass the same validator (the column
--      and its kind check landed with RC-A2; this is the validator it deferred).
--   5. association types (non-conveying, container_side none — an annotation or a flashcard link
--      conveys nothing to anybody):
--        document -> document   roles annotates | part_of | derived_from | rendered_from
--        fc_card  -> document   role anchored_to (a card linked to the phrase it teaches)
--      One statement, because association_types carries a statement-level reachability rebuild.
--
-- window-class: CREATE TRIGGER on platform.associations and ADD CONSTRAINT on platform.comments freeze the 23-relation supautils set for this short transaction; applied in the 1-4 AM PT window.

set local lock_timeout = '5s';

create or replace function platform.text_anchor_problem(p jsonb)
returns text
language plpgsql
immutable
parallel safe
set search_path to 'pg_catalog'
as $fn$
declare
  v_key text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return 'a text_anchor must be a JSON object';
  end if;
  if p ->> '__kind' is distinct from 'text_anchor' then
    return 'a text_anchor carries "__kind": "text_anchor"';
  end if;
  for v_key in select jsonb_object_keys(p) loop
    if v_key not in ('__kind', 'content_version', 'start', 'end', 'exact', 'prefix', 'suffix', 'block') then
      return format('a text_anchor has no field "%s"', v_key);
    end if;
  end loop;
  if jsonb_typeof(p -> 'content_version') is distinct from 'number'
     or (p ->> 'content_version') !~ '^[0-9]+$' or (p ->> 'content_version')::bigint < 1 then
    return 'content_version must be the whole-number content version (>= 1) the offsets were captured against';
  end if;
  if jsonb_typeof(p -> 'start') is distinct from 'number' or (p ->> 'start') !~ '^[0-9]+$'
     or jsonb_typeof(p -> 'end') is distinct from 'number' or (p ->> 'end') !~ '^[0-9]+$' then
    return 'start and end must be whole-number Unicode code-point offsets';
  end if;
  if (p ->> 'end')::bigint <= (p ->> 'start')::bigint then
    return 'end must be greater than start (a whole-document link carries no anchor)';
  end if;
  if jsonb_typeof(p -> 'exact') is distinct from 'string' or p ->> 'exact' = '' then
    return 'exact must be the selected text';
  end if;
  if char_length(p ->> 'exact') <> (p ->> 'end')::bigint - (p ->> 'start')::bigint then
    return format('end - start (%s) must equal the code-point length of exact (%s); offsets are Unicode code points, never UTF-16 indexes',
                  (p ->> 'end')::bigint - (p ->> 'start')::bigint, char_length(p ->> 'exact'));
  end if;
  if char_length(p ->> 'exact') > 20000 then
    return 'exact is longer than 20,000 code points';
  end if;
  if p ? 'prefix' and (jsonb_typeof(p -> 'prefix') <> 'string' or char_length(p ->> 'prefix') > 64) then
    return 'prefix must be at most 64 code points of text';
  end if;
  if p ? 'suffix' and (jsonb_typeof(p -> 'suffix') <> 'string' or char_length(p ->> 'suffix') > 64) then
    return 'suffix must be at most 64 code points of text';
  end if;
  if p ? 'block' and jsonb_typeof(p -> 'block') <> 'null' then
    if jsonb_typeof(p -> 'block') <> 'object'
       or exists (select 1 from jsonb_object_keys(p -> 'block') k where k not in ('index', 'hash'))
       or jsonb_typeof(p -> 'block' -> 'index') is distinct from 'number'
       or (p -> 'block' ->> 'index') !~ '^[0-9]+$'
       or jsonb_typeof(p -> 'block' -> 'hash') is distinct from 'string'
       or char_length(p -> 'block' ->> 'hash') not between 1 and 128 then
      return 'block must be {"index": <whole number>, "hash": "<1-128 characters>"}';
    end if;
  end if;
  return null;
end;
$fn$;
comment on function platform.text_anchor_problem(jsonb) is
  'RC-A3: the one server-side validator of a text_anchor payload (content_ir kind text_anchor, aidream/kinds/content_anchors.py). NULL when valid, otherwise the sentence naming what is wrong. Used by platform.associations (payload_kind text_anchor) and platform.comments.anchor.';

-- The JSON Schema below is the emitted_json_schema of content_ir.kind_definition 'text_anchor'
-- as published from aidream/kinds/content_anchors.py (2026-09-25), byte-for-byte; the model is its
-- source of truth and the done gate at the end of this file refuses if the two ever differ.
insert into platform.edge_payload_kind (kind, version, description, json_schema, source_type, target_type)
values ('text_anchor', 1,
        'Precise passage identity (W3C TextQuote + TextPosition): a Unicode code-point range into one content_version of the target document, the exact quote, bounded prefix/suffix context and an optional block hint. Carried by annotates / anchored_to / passage-link edges. Any source and target type. Semantic rules (end - start = code-point length of exact) are enforced by platform.text_anchor_problem.',
        $ta${"$defs": {"TextAnchorBlock": {"additionalProperties": false, "description": "Optional stable block hint: which block of the body held the passage, and its hash.", "properties": {"__kind": {"description": "The registered kind this payload is an instance of, when it is one.", "type": "string"}, "hash": {"description": "Hash of that block's text at the captured version.", "maxLength": 128, "minLength": 1, "title": "Hash", "type": "string"}, "index": {"description": "Zero-based index of the block (paragraph, list item, heading) in the body.", "minimum": 0, "title": "Index", "type": "integer"}}, "required": ["index", "hash"], "title": "TextAnchorBlock", "type": "object"}}, "additionalProperties": false, "description": "One passage of one content version, in Unicode code points.", "properties": {"__kind": {"const": "text_anchor", "default": "text_anchor", "description": "The registered kind this payload is an instance of.", "title": "Kind", "type": "string"}, "block": {"anyOf": [{"$ref": "#/$defs/TextAnchorBlock"}, {"type": "null"}], "default": null, "description": "Optional block hint for disambiguation."}, "content_version": {"description": "The document content_version the offsets were captured against.", "minimum": 1, "title": "Content Version", "type": "integer"}, "end": {"description": "Code-point offset just past the passage (end > start).", "minimum": 1, "title": "End", "type": "integer"}, "exact": {"description": "The selected text, exactly; its code-point length is end - start.", "maxLength": 20000, "minLength": 1, "title": "Exact", "type": "string"}, "prefix": {"default": "", "description": "Up to 64 code points of text immediately before the passage.", "maxLength": 64, "title": "Prefix", "type": "string"}, "start": {"description": "Code-point offset where the passage begins.", "minimum": 0, "title": "Start", "type": "integer"}, "suffix": {"default": "", "description": "Up to 64 code points of text immediately after the passage.", "maxLength": 64, "title": "Suffix", "type": "string"}}, "required": ["content_version", "start", "end", "exact"], "title": "TextAnchor", "type": "object"}$ta$::jsonb, null, null)
on conflict (kind) do update
   set json_schema = excluded.json_schema, description = excluded.description;

create or replace function platform._associations_validate_text_anchor()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_problem text := platform.text_anchor_problem(new.payload);
begin
  if v_problem is not null then
    raise exception 'platform.associations: this % -> % edge carries an invalid text_anchor: %', new.source_type, new.target_type, v_problem
      using errcode = '23514',
            hint = 'Send a text_anchor built from the target''s canonical body at one content_version: Unicode code-point start/end, the exact quote, up to 64 code points of prefix and suffix. A whole-document link carries no payload.';
  end if;
  return new;
end;
$fn$;

create trigger trg_associations_validate_text_anchor
  before insert or update of payload, payload_kind on platform.associations
  for each row when (new.payload_kind = 'text_anchor')
  execute function platform._associations_validate_text_anchor();

alter table platform.comments
  add constraint comments_text_anchor_is_valid check (
    anchor is null
    or anchor ->> '__kind' is distinct from 'text_anchor'
    or platform.text_anchor_problem(anchor) is null);

insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, notes)
values
  ('document', 'document', null, 'none', 'viewer',
   'RC-A3 / STORE-DESIGN §3.7: document-to-document relations inside the one rich-content store — roles annotates (an annotation document on its source, payload text_anchor), part_of, derived_from, rendered_from (payload pins the template''s content version). Non-conveying: an annotation is personal and conveys nothing; the association door requires editor on the source and viewer on the target.'),
  ('fc_card', 'document', null, 'none', 'viewer',
   'RC-A3 / annotations storage brief: a flashcard linked to the passage it teaches — role anchored_to, payload text_anchor. The card stays in its own store; detaching removes the edge, never the card. Non-conveying.')
on conflict (source_type, target_type) do nothing;

-- done gate: the edge kind's schema is the registered kind's schema (when the registry has it).
do $$
begin
  if exists (select 1 from content_ir.kind_definition k
              where k.kind = 'text_anchor' and k.deleted_at is null
                and k.emitted_json_schema is distinct from
                    (select e.json_schema from platform.edge_payload_kind e where e.kind = 'text_anchor')) then
    raise exception 'platform.edge_payload_kind text_anchor schema differs from content_ir.kind_definition text_anchor; republish one source';
  end if;
  if platform.text_anchor_problem('{"__kind":"text_anchor","content_version":3,"start":41,"end":56,"exact":"Large-scale map","prefix":"Chapter 2 introduces the ","suffix":" and why its scale matters","block":{"index":4,"hash":"b3c1a9"}}'::jsonb) is not null
     or platform.text_anchor_problem('{"__kind":"text_anchor","content_version":3,"start":41,"end":57,"exact":"Large-scale map"}'::jsonb) is null then
    raise exception 'platform.text_anchor_problem does not judge the canonical example correctly';
  end if;
end $$;
