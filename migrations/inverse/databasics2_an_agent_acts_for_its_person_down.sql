-- INVERSE of databasics2_an_agent_acts_for_its_person.sql: the body it replaced, byte for byte.
-- based-on: custom._value_envelope() 6d63852443efb8e7cd201a0bd31c01c9166198af5f23749f448cddec5582f0d4

CREATE OR REPLACE FUNCTION custom._value_envelope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_data     jsonb := coalesce(new.data, '{}'::jsonb);
  v_actor    text;
  v_obo      text;
  v_refusal  text;
  v_values   jsonb;
  v_key      text;
  v_declared boolean;
  v_type_fld text;
  v_rtype    text;
  v_src      text;
  v_agent    text[] := '{}'::text[];   -- ENRICH: the keys of this Table a model owns
  -- BIG-VALUES-WRITE: the text values over the ceiling this write carries into files.
  v_whole    jsonb := '{}'::jsonb;     -- key -> the whole text the writer supplied
  v_park     jsonb := '{}'::jsonb;     -- key -> the whole text that still needs its file
  v_ceiling  bigint;
  v_text     text;
  v_prior    jsonb;
  v_carry    jsonb;
begin
  -- THE DOOR. The thirteenth and last RETURNS trigger in this schema to read the ONE
  -- predicate, which judges custom.caller_role() and never current_user. custom/system_enabled
  -- decides WHO may write and never which check runs.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- A WRITE THAT ASSERTS NO VALUE HAS NO AUTHOR TO JUDGE (lane AGENT, 2026-09-19).
  -- MEASURED: a real agent turn wrote twenty records and could not delete ONE of them.
  -- custom.record_delete does `update custom.record set deleted_at = now()`, which fires
  -- this trigger over the UNCHANGED document; the document names no `_actor`, so
  -- custom.actor_word falls back to the connection's declaration ('agent'), and the
  -- forward arm below then refuses because nothing names the person the agent acts for —
  -- and nothing CAN, because a delete carries no document to put `_on_behalf_of` in and
  -- there is no GUC for it. So every agent delete, restore and reparent of a business
  -- record was refused, by a check about authorship, on a statement that authors nothing.
  --
  -- The condition is exactly that: an UPDATE whose `data` is not distinct from the row's
  -- existing `data` asserts no Value, so there is no new authorship to record and the
  -- authorship already stored stays exactly as it was. Every check below still runs, in
  -- full, on every statement that DOES change the document. This cannot widen anything:
  -- a write that changes no data could not have carried a value to mis-author.
  if TG_OP = 'UPDATE' and old.data is not distinct from new.data then
    return new;
  end if;

  -- A TEXT VALUE OF ANY SIZE SIMPLY SAVES (lane BIG-VALUES-WRITE, 2026-09-25). The owner:
  -- "Make sure that large data size is easy for users." A business record's text value over
  -- this organization's ceiling for one value (custom/value_max_bytes) is no longer refused:
  -- the cell keeps its first 1000 characters, and the whole text is carried into a file by
  -- the ONE rule the table mover already uses (matrx_records.big_values) - here it waits in
  -- custom.whole_value_parked until its file is written (below, and custom.whole_value_complete).
  -- The ceiling below then judges what the cell really holds. A definition row, a JSON value
  -- and a value on a key that is not one of the Table's Fields keep the refusal.
  if new.data_class = 'record'
     and new.table_id is not null
     and new.table_id <> custom.table_kernel_id()
     and new.table_id <> custom.field_kernel_id() then
    v_ceiling := custom.whole_value_ceiling(new.organization_id);
    for v_key, v_text in
      select e.key, e.value #>> '{}'
        from jsonb_each(v_data) e
       where left(e.key, 1) <> '_' and jsonb_typeof(e.value) = 'string'
         and octet_length(e.value::text) > v_ceiling
    loop
      -- Held OFF by the store's own switch (custom/system_enabled): an organization whose store
      -- is not on keeps the refusal below, exactly as before this file.
      exit when not coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean, false);
      v_whole := v_whole || jsonb_build_object(v_key, v_text);
      v_data := jsonb_set(v_data, array[v_key], to_jsonb(custom.whole_value_head(v_text)));
    end loop;
  end if;

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

  -- A VALUE IS A FIELD'S VALUE. The envelope is opened over the APPLICABLE FIELDS of this
  -- record's Table - the same set custom._record_field_validation validates against, chosen
  -- by the record's own type field where the Table has one - and never over the document's
  -- other keys, which carry structure rather than assertions. custom.validate_value_envelope
  -- refuses an envelope on a key that is not a declared Field, and it is right to.
  if new.data_class = 'record'
     and new.table_id is not null
     and new.table_id <> custom.table_kernel_id()
     and new.table_id <> custom.field_kernel_id() then
    v_type_fld := custom.table_type_field(new.organization_id, new.table_id);
    if v_type_fld is not null then
      v_rtype := v_data ->> v_type_fld;
    end if;
    v_values := coalesce(v_data -> '_values', '{}'::jsonb);
    if jsonb_typeof(v_values) <> 'object' then
      v_values := '{}'::jsonb;        -- the envelope law below refuses the malformed block by name
    end if;
    -- ENRICH, 2026-09-20: THE SAME LOOP NOW ALSO ANSWERS "WHO OWNS THIS COLUMN".
    -- A Field whose `source` is `agent` is a column an enrichment fills (AGT-6). Reading it
    -- here costs nothing - the Field rows are already being walked - and it is what lets the
    -- rule below pin a cell the moment a PERSON types over one of them.
    for v_key, v_src in select f.data ->> 'key', f.data ->> 'source'
                          from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) f
    loop
      if v_key is not null and v_data ? v_key and not (v_values ? v_key) then
        v_values := v_values || jsonb_build_object(v_key, '{}'::jsonb);
      end if;
      if v_key is not null and v_src = 'agent' then
        v_agent := v_agent || v_key;
      end if;
    end loop;
    if v_values <> '{}'::jsonb or v_data ? '_values' then
      v_data := jsonb_set(v_data, '{_values}', v_values);
    end if;
  end if;

  -- BIG-VALUES-WRITE: each carried value's envelope names its whole text. The SAME whole text
  -- the cell's file already holds (same SHA-256) keeps that pointer, so re-saving it is not a
  -- new version; any other text gets a pending pointer and waits for its file.
  for v_key, v_text in select e.key, e.value #>> '{}' from jsonb_each(v_whole) e loop
    if coalesce(jsonb_typeof(v_data -> '_values' -> v_key), '') <> 'object' then
      raise exception '%', custom.size_refusal(new.organization_id,
                                               jsonb_build_object(v_key, v_whole -> v_key))
        using errcode = '23514',
              hint = 'Only a Field of this Table carries a big text into a file. Declare the Field, then write it again.';
    end if;
    v_prior := null;
    if tg_op = 'UPDATE' then
      v_prior := old.data -> '_sources' -> (old.data -> '_values' -> v_key ->> 'src');
    end if;
    v_carry := custom.whole_value_source(v_text, v_data -> '_values' -> v_key -> 'src');
    if v_prior is not null and v_prior ->> 'kind' = 'whole_value_in_file'
       and v_prior ->> 'sha256' = v_carry ->> 'sha256' then
      v_data := jsonb_set(v_data, array[v_key], old.data -> v_key);
      v_data := jsonb_set(v_data, array['_values', v_key, 'src'], v_prior);
    else
      v_data := jsonb_set(v_data, array['_values', v_key, 'src'], v_carry);
      v_park := v_park || jsonb_build_object(v_key, v_text);
    end if;
  end loop;

  v_data := custom.intern_provenance(v_data);
  v_data := custom.stamp_value_envelopes(v_data, v_actor, v_obo, now());
  v_data := custom.value_versions(case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_data);
  -- ENRICH: A PERSON'S EDIT OF AN AGENT-OWNED CELL PINS IT, THROUGH EVERY DOOR AT ONCE —
  -- AND ONLY THE CELL THEY ACTUALLY EDITED. This runs AFTER custom.value_versions on
  -- purpose: `custom.stamp_value_envelopes` puts the writer's word on EVERY envelope in the
  -- document, so before the version is decided there is no way to tell the value a person
  -- just typed from the forty others the same write left alone. The version IS that
  -- distinction, already computed, and asking it a second way is how the two would drift.
  v_data := custom.pin_agent_cells(v_data,
              case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_agent);
  -- ENRICH: AND A VALUE NOBODY RE-ASSERTED KEEPS ITS OWN MOMENT AND ITS OWN AUTHOR.
  v_data := custom.carry_unchanged_value_stamps(
              case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_data);

  v_refusal := custom.value_envelope_refusal(v_data);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514', hint = 'VAL-1..VAL-8: a value carries its source, its author, its reason for being missing and its other candidates, inside this record''s one document.';
  end if;

  new.data := v_data;

  -- BIG-VALUES-WRITE: the whole texts that still need their file wait beside the record, in
  -- the same transaction - so a refused write leaves nothing waiting.
  if v_park <> '{}'::jsonb then
    perform custom.whole_value_park(new.organization_id, new.table_id, new.id,
                                    coalesce(new.created_by, custom.query_principal()),
                                    new.visibility, v_data, v_park);
  end if;
  return new;
end;
$function$

;
