-- chair-step: this REPLACES TWO live bodies — `custom.pin_agent_cells(jsonb, jsonb, text[])`
-- and the trigger `custom._value_envelope()` — each under the `-- based-on:` hash below, and
-- does nothing else. No table, column, index, policy, grant or row is touched. Its inverse is
-- `migrations/inverse/enrich_a_pin_is_the_cell_they_typed_in_down.sql`.
-- lane: ENRICH (PRODUCTS row 10)
-- based-on: custom.pin_agent_cells(jsonb, jsonb, text[]) d25fe6d595e341ecb4b59a96460b1166b9cab4ba6fff9b6a2349a84f35e5287c
-- based-on: custom._value_envelope() 8836ae9ccdff6f35f7856cc5218137c5f36970454d6b00edbc9601e11df6882c
--
-- It carries no `-- guard:` line for the same reason, and with the same reasoning, as
-- `enrich_the_trigger_takes_the_pin.sql`: the trigger's first statement IS the read of
-- `custom/system_enabled` (`custom.assert_store_door`), the text check cannot see it through
-- a helper, and the two ways to satisfy that search would each be worse than saying so.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- THE DEFECT, FOUND BY RUNNING THE SUITE AND NOT BY READING THE CODE
-- ════════════════════════════════════════════════════════════════════════════════
--
-- `custom.stamp_value_envelopes` writes the writer's word — `actor` — onto EVERY envelope in
-- the document on every write, not only onto the values that moved. The pin rule read that
-- word. So a person writing ONE column of a record pinned EVERY agent-owned column of that
-- record, because after stamping all of them said `actor: user`.
--
-- What it cost, measured in `scripts/campaign-tests/enrich_green.sql` on the main database:
-- PART 9 asserts that writing the headcount leaves the industry's own moment alone. It did
-- not. The spurious pin changed the industry's envelope, `custom.value_versions` therefore
-- bumped its version, `custom.carry_unchanged_value_stamps` correctly declined to carry a
-- stamp for a value whose version had moved — and a forty-day-old moment was restamped to
-- now. One person editing one unrelated cell silently marked the whole row fresh AND handed
-- every agent-owned cell in it to nobody.
--
-- THE FIX IS AN ORDERING, AND IT USES AN ANSWER THE STORE ALREADY HAS. The pin now runs
-- AFTER `custom.value_versions`, and asks the question that function has just answered: did
-- THIS value move? A person's write pins the cell whose version moved, and leaves every
-- other cell of that record exactly as it was. Nothing else about the rule changes: an
-- explicit `pinned` is still obeyed (that is how un-pinning works), and a pin already on a
-- value is still carried forward so no later write can drop it in silence.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.pin_agent_cells(
  p_new jsonb, p_old jsonb, p_agent_keys text[])
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_out   jsonb := '{}'::jsonb;
  v_key   text;
  v_env   jsonb;
  v_prior jsonb;
  v_moved boolean;
begin
  if p_new is null or coalesce(jsonb_typeof(p_new -> '_values'), '') <> 'object' then
    return p_new;
  end if;
  for v_key, v_env in select * from jsonb_each(p_new -> '_values') loop
    if jsonb_typeof(v_env) <> 'object' then
      v_out := v_out || jsonb_build_object(v_key, v_env);
      continue;
    end if;
    v_prior := coalesce(p_old, '{}'::jsonb) -> '_values' -> v_key;

    -- DID THIS VALUE MOVE? custom.value_versions has already decided it, over the value,
    -- its source, its reason for absence and its alternates, and its answer is the version.
    -- Asking it a second way here is how the pin and the version would drift apart.
    v_moved := jsonb_typeof(v_prior) <> 'object'
               or (v_env -> 'ver') is distinct from (v_prior -> 'ver');

    if v_env ? 'pinned' then
      -- THE CALLER SAID SO. `false` is a deliberate un-pin (custom.enrich_pin writes it),
      -- and it is stored as an absence rather than as the word "false", so the envelope
      -- stays the shape every other reader already knows.
      if jsonb_typeof(v_env -> 'pinned') <> 'boolean' then
        raise exception 'Whether "%" is held against the model is yes or no, and this says %.',
                        v_key, jsonb_typeof(v_env -> 'pinned')
          using errcode = '22023',
                hint = 'AGT-6: pinned is true or false. custom.enrich_pin is the door that sets it.';
      end if;
      if not (v_env ->> 'pinned')::boolean then
        v_env := v_env - 'pinned';
      end if;
    elsif coalesce((v_prior ->> 'pinned')::boolean, false) then
      -- CARRIED FORWARD. A write that says nothing about the pin cannot drop it, so a pin
      -- survives every later edit of the record until somebody un-pins it on purpose.
      v_env := v_env || jsonb_build_object('pinned', true);
    elsif v_moved
          and coalesce(v_env ->> 'actor', '') = 'user'
          and v_key = any (coalesce(p_agent_keys, '{}'::text[])) then
      -- A PERSON TYPED OVER A COLUMN A MODEL OWNS — and over THIS one, which is what
      -- `v_moved` is here to say. Taken in custom._value_envelope so that every door — the
      -- grid, the record form, an import, a restore — takes it.
      v_env := v_env || jsonb_build_object('pinned', true);
    end if;

    v_out := v_out || jsonb_build_object(v_key, v_env);
  end loop;
  return jsonb_set(p_new, '{_values}', v_out);
end;
$fn$;

comment on function custom.pin_agent_cells(jsonb, jsonb, text[]) is
  'AGT-6: a person''s edit of a cell whose Field says source = agent holds THAT CELL — and '
  'no other cell of the same record — against the enrichment, until somebody un-pins it. '
  'Which cell they edited is the version custom.value_versions has just decided, never the '
  'blanket actor custom.stamp_value_envelopes writes onto every envelope.';

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
  return new;
end;
$function$;
