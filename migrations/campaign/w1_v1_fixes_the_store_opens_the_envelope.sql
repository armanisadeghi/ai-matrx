-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom._value_envelope() b91076e6acb617269699701913421d3a34013302a6537b0da0d2db4603e738fd
--
-- W1-V1-FIXES, FINDINGS 2, 3 AND 4 — THE STORE OPENS THE ENVELOPE, AN AGENT SAYS WHO IT
-- ACTS FOR, AND A VALUE HAS A PUBLISHED CEILING.
--
-- ═══ FINDING 2 — VAL-7'S LAW WAS TRUE ONLY WHEN THE CALLER REMEMBERED ═══════════════
-- `V1-MODEL` measured: `custom.record_write(org, tbl, '{"nm":"…","_actor":"agent"}')` stores
-- `_values = {}`; `custom.value_read` answers `actor <NULL>` and `value_version 1`, and 1
-- again after the value has moved. This lane censused the cause and the blast radius:
-- `custom.stamp_value_envelopes` and `custom.value_versions` both iterate `_values`, and
-- `_value_envelope` returned early for any document that did not already carry one - so the
-- envelope existed for exactly the keys A CALLER had opened. Over the whole store on the
-- branch, **0 of 86 records carried an envelope at all** (33 of them `record`-class).
-- VAL-7 says "EVERY write stamps an actor and every value's provenance is queryable"; a law
-- that only holds when the writer opts in is not the law, it is a convention.
--
-- THE FIX: the STORE opens the envelope. For a business document (`data_class = 'record'`)
-- every content key - every top-level key that is not one of the store's own underscore
-- blocks - gets an envelope whether the caller opened one or not, and the existing stamping
-- and versioning then apply to all of them. Nothing a caller DID supply is overwritten:
-- `custom.stamp_value_envelopes` merges onto the caller's envelope, so an alternate, a
-- source pointer or an absence reason the caller wrote survives. A caller-forged `actor` or
-- `ver` is still overwritten by the store, exactly as before.
--
-- WHY `data_class = 'record'` AND NOT EVERY ROW. `kernel`, `table`, `field`, `rule`,
-- `merge_field` and `relation` rows are DEFINITIONS - a Field's `key`, `type` and `sort` are
-- the shape of the store, not Values a person or an agent asserted about a thing - and they
-- have their own shape guards. Opening envelopes over them would put a provenance envelope
-- on the schema. Those rows keep their prior behaviour exactly, which is why this is inert
-- for the 53 non-record rows on the branch.
--
-- ═══ FINDING 3 — AN AGENT THAT NAMES NOBODY ════════════════════════════════════════
-- The converse arm was already built and is correct (a `user` write claiming
-- `_on_behalf_of` is refused by name). The forward arm did not exist: an `agent` write with
-- no `_on_behalf_of` landed unremarked. It is refused now, by name, and the remedy names the
-- word that exists for exactly this case: work the platform does for nobody in particular is
-- written by `system`. That is why the vocabulary has three words and not two.
--
-- ═══ FINDING 4 — A 5 MB VALUE, AND NO CEILING ANYWHERE ═════════════════════════════
-- `V1-MODEL` landed a single 5,242,890-byte value. There was no per-value and no
-- per-document ceiling published or enforced anywhere in the write path.
--
-- THE NUMBERS ARE CHOSEN FROM EVIDENCE, AND THEY ARE KNOBS WITH DEFAULTS, NEVER CONSTANTS:
--   · **Airtable** publishes 100,000 characters as the ceiling of a Long Text cell, and
--     routes anything larger to an Attachment - a separate record with its own storage.
--   · **Notion**'s API caps a single rich-text value at 2,000 characters per request, an
--     order of magnitude tighter than Airtable's.
--   · **Postgres** allows a jsonb value up to 255 MB, so the database is not the bound. What
--     IS the bound is TOAST: anything past roughly 2 KB is stored out of line, and because
--     jsonb has no partial update, EVERY write to the record reads and rewrites the WHOLE
--     document. A 5 MB document costs a 5 MB rewrite per keystroke-save.
-- So the default per-value ceiling is Airtable's 100,000 - the most generous of the parity
-- set, and the number a user coming from Airtable already expects - and the default
-- per-document ceiling is 1 MiB. Both are `platform.feature_knob` rows an organization can
-- move, bounded, because a ceiling is a knob an agent sets with a default and a review date,
-- never a constant.
--
-- THE REFUSAL NAMES THE FIELD AND THE REMEDY, which is this store's own File Table (the
-- kernel Table `custom.file_kernel_id()`): a big thing is a file record the value points at,
-- not a megabyte inside the document.
--
-- WHAT THE CEILING COUNTS, SAID PLAINLY. It is measured over what the WRITER supplied, at
-- the envelope trigger, before anything else touches the document. The store's own computed
-- and derived blocks (`_computed`, `_derived`) are written later by
-- `custom._derived_fields` and are not counted: they are bounded by the Fields they are
-- computed from, which are themselves bounded here.
--
-- THE INVERSE: `migrations/inverse/w1_v1_fixes_the_store_opens_the_envelope_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '300s';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. THE TWO CEILINGS, AS KNOBS WITH DEFAULTS (finding 4)
-- ═══════════════════════════════════════════════════════════════════════════════

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label,
   description, set_by, basis, review_due, overridable_by, override_direction, propagation,
   public_read, ui)
values
  ('custom', 'value_max_bytes', '100000'::jsonb, '100000'::jsonb, 'integer', 'bytes',
   1000, 1000000,
   'Largest single value in a custom record',
   'The ceiling on ONE value inside a custom record''s document, in bytes. The default is '
   'Airtable''s published Long Text ceiling of 100,000 characters - the most generous of the '
   'parity set, and what a user arriving from Airtable already expects; Notion''s API caps a '
   'rich-text value at 2,000. Postgres itself would allow 255 MB, so the bound is not the '
   'database: jsonb has no partial update, so every write to a record reads and rewrites the '
   'WHOLE document, and a multi-megabyte value makes every save cost megabytes. A value over '
   'this ceiling is refused by name, and the remedy is a record of the kernel File Table that '
   'the value points at.',
   'agent',
   'Unified data campaign, 2026-09-17 (W1-V1-FIXES, V1-MODEL finding 4): a single 5,242,890-byte value landed with no ceiling published or enforced anywhere in the write path.',
   '2026-12-17', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'document_max_bytes', '1048576'::jsonb, '1048576'::jsonb, 'integer', 'bytes',
   10000, 10000000,
   'Largest custom record document',
   'The ceiling on a whole custom record''s document, in bytes, measured over what the writer '
   'supplied. It exists beside the per-value ceiling because a hundred values just under the '
   'per-value ceiling is the same rewrite cost as one value far over it. The store''s own '
   'computed and derived blocks are written after this check and are not counted - they are '
   'bounded by the Fields they are computed from. A document over this ceiling is refused by '
   'name with the same File-record remedy.',
   'agent',
   'Unified data campaign, 2026-09-17 (W1-V1-FIXES, V1-MODEL finding 4).',
   '2026-12-17', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. THE CEILING, READ AND ENFORCED IN ONE PLACE  (NEW FUNCTION)
-- ═══════════════════════════════════════════════════════════════════════════════

create function custom.size_refusal(p_organization_id uuid, p_data jsonb)
  returns text
  language plpgsql
  stable
  set search_path to 'pg_catalog'
as $fn_sr$
declare
  v_value_max bigint;
  v_doc_max   bigint;
  v_key       text;
  v_bytes     bigint;
  v_total     bigint;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return null;
  end if;

  -- Read the way every campaign body reads a knob, and unable to raise: a ceiling this
  -- writer cannot read falls back to the published default rather than letting anything
  -- through. Passing the organization id means an organization rung answers for that
  -- organization (§6b.4b).
  begin
    v_value_max := coalesce((platform.knob_resolve('custom', 'value_max_bytes', p_organization_id) #>> '{}')::bigint, 100000);
  exception when others then v_value_max := 100000;
  end;
  begin
    v_doc_max := coalesce((platform.knob_resolve('custom', 'document_max_bytes', p_organization_id) #>> '{}')::bigint, 1048576);
  exception when others then v_doc_max := 1048576;
  end;

  for v_key in select k from jsonb_object_keys(p_data) k loop
    if left(v_key, 1) = '_' then
      continue;                       -- the store's own blocks, not a writer's value
    end if;
    v_bytes := octet_length((p_data -> v_key)::text);
    if v_bytes > v_value_max then
      return format('%s is %s bytes, and one value in a record holds at most %s. Put the big thing in a file record and point the value at it - this store has a File table for exactly that.',
                    v_key, v_bytes, v_value_max);
    end if;
  end loop;

  v_total := octet_length(p_data::text);
  if v_total > v_doc_max then
    return format('this record is %s bytes, and one record holds at most %s. Put the big things in file records and point the values at them - this store has a File table for exactly that.',
                  v_total, v_doc_max);
  end if;

  return null;
end;
$fn_sr$;

comment on function custom.size_refusal(uuid, jsonb) is
  'The per-value and per-document ceilings for schema custom, read from custom/value_max_bytes and custom/document_max_bytes with their published defaults (Airtable''s 100,000-character cell, and 1 MiB per document). Returns the refusal sentence naming the field and the File-record remedy, or null. One place, read by the one trigger that opens the envelope.';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. THE ENVELOPE TRIGGER — the door, the ceiling, and the store opening the envelope
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function custom._value_envelope()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_data     jsonb := coalesce(new.data, '{}'::jsonb);
  v_actor    text;
  v_obo      text;
  v_refusal  text;
  v_values   jsonb;
  v_key      text;
  v_declared boolean;
begin
  -- THE DOOR. The thirteenth and last RETURNS trigger in this schema to read the ONE
  -- predicate, which judges custom.caller_role() and never current_user. custom/system_enabled
  -- decides WHO may write and never which check runs.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- THE CEILING (finding 4), over what the WRITER supplied, before anything else touches
  -- the document.
  v_refusal := custom.size_refusal(new.organization_id, v_data);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514',
            hint = 'The ceilings are custom/value_max_bytes and custom/document_max_bytes - organization-settable knobs with published defaults, not constants. A value too big to live in the record lives as a record of this store''s File table, and the value points at it.';
  end if;

  v_declared := v_data ? '_values' or v_data ? '_sources' or v_data ? '_actor' or v_data ? '_on_behalf_of';

  -- WHO OPENS THE ENVELOPE (finding 2). A business document always gets one, whether or not
  -- its writer opened it; a DEFINITION row (kernel, table, field, rule, merge_field,
  -- relation) is the shape of the store rather than a set of asserted Values, and keeps its
  -- prior behaviour exactly - nothing to do unless it declared something itself.
  if new.data_class is distinct from 'record' and not v_declared then
    return new;
  end if;

  v_actor := custom.actor_word(v_data ->> '_actor');
  v_obo   := nullif(btrim(coalesce(v_data ->> '_on_behalf_of', '')), '');
  if v_obo is not null and v_actor <> 'agent' then
    raise exception 'This write says it is on behalf of somebody, and its author is a %. Only an agent acts on behalf of a person.', v_actor
      using errcode = '22023';
  end if;
  -- THE FORWARD ARM (finding 3). The converse above was built; this one was not, so an agent
  -- write naming nobody landed unremarked.
  if v_actor = 'agent' and v_obo is null then
    raise exception 'This write says an agent wrote it, and does not say who the agent is acting for. An agent always acts on behalf of a person.'
      using errcode = '22004',
            hint = 'Put "_on_behalf_of" in the record with that person''s id. Work the platform does for nobody in particular is written by "system" - that is what the third word in the vocabulary is for. The vocabulary is exactly user, agent, system.';
  end if;

  -- The declaration is a fact about the WRITE, not content of the record.
  v_data := v_data - '_actor' - '_on_behalf_of';

  if new.data_class = 'record' then
    v_values := coalesce(v_data -> '_values', '{}'::jsonb);
    if jsonb_typeof(v_values) <> 'object' then
      v_values := '{}'::jsonb;        -- the envelope law below refuses it by name
    end if;
    for v_key in select k from jsonb_object_keys(v_data) k loop
      if left(v_key, 1) <> '_' and not (v_values ? v_key) then
        v_values := v_values || jsonb_build_object(v_key, '{}'::jsonb);
      end if;
    end loop;
    -- Never write an empty block onto a record that has no content keys at all: an empty
    -- _values says nothing and would appear on every relation stub in the store.
    if v_values <> '{}'::jsonb or v_data ? '_values' then
      v_data := jsonb_set(v_data, '{_values}', v_values);
    end if;
  end if;

  v_data := custom.intern_provenance(v_data);
  v_data := custom.stamp_value_envelopes(v_data, v_actor, v_obo, now());
  v_data := custom.value_versions(case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_data);

  v_refusal := custom.value_envelope_refusal(v_data);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514', hint = 'VAL-1..VAL-8: a value carries its source, its author, its reason for being missing and its other candidates, inside this record''s one document.';
  end if;

  new.data := v_data;
  return new;
end;
$function$;

comment on function custom._value_envelope() is
  'VAL-1..VAL-8''s envelope law, and the store is what opens the envelope: every content key of a business document is stamped with its author and versioned whether or not the caller opened one (VAL-7 - every write stamps an actor). It also carries the store door (custom/system_enabled, through custom.assert_store_door) and the published per-value and per-document ceilings. Definition rows keep their prior behaviour exactly.';
