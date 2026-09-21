-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.io_proposal_accept(uuid, uuid, text, text, text) f72941e1a7d7451ed2be914ae5ece729a11a3dcfd9d87f80ef4a51907e725473
--
-- RED-SUITES — AN ACCEPTED COLUMN KEEPS THE TYPE THE DOOR INFERRED FOR IT.
--
-- `custom.io_infer_column` looks at a spreadsheet column's values and answers, in its own
-- words, `{"type": "number", "label": "Lead score", "why": "Every value is a number."}`.
-- `custom.io_import_rows` stores that object as the column's PROPOSAL. `custom.io_proposal_accept`
-- then read `v_proposal ->> 'inferred_type'` — a key no door in this system has ever written.
-- The coalesce fell through to `'text'` every single time.
--
-- So the whole of the inference was decoration: a person was shown "this looks like a number",
-- accepted it, and got a text column. Then the next import of the same file wrote the
-- spreadsheet's own string "60" into it and it was kept as a string, because a text column is
-- exactly what it now was. Measured on the main database 2026-09-21 through `w4_io_green`
-- DOOR-14, whose clause for this is the words "so it is a label and not a type".
--
-- The same line drops the LABEL the same door worked out, so an accepted column is named by
-- its raw header key (`lead_score`) instead of the heading the person actually wrote
-- (`Lead score`). One class, one file: what the door inferred is what accepting keeps. A
-- caller that names `p_type` or `p_label` itself still wins over both, unchanged.
--
-- Nothing else moves: the five behaviours, the format flavours, the Field document and the
-- `custom.field_declare` call are byte-for-byte what they were.

CREATE OR REPLACE FUNCTION custom.io_proposal_accept(p_organization_id uuid, p_import_id uuid, p_column text, p_type text DEFAULT NULL::text, p_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run      custom.io_import;
  v_proposal jsonb;
  v_type     text;
  v_word     text;
  v_format   text;
  v_key      text;
  v_field_id uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_proposal_accept');
  perform custom.assert_store_door(p_organization_id, 'custom.io_proposal_accept');
  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'custom.io_proposal_accept: no import run % for this organization', p_import_id
      using errcode = '23503';
  end if;

  select p into v_proposal
    from jsonb_array_elements(v_run.proposals) p
   where p ->> 'column' = p_column
   limit 1;
  if v_proposal is null then
    raise exception 'custom.io_proposal_accept: import run % proposed no column "%". Its proposals are %.',
      p_import_id, p_column, coalesce((select string_agg(p ->> 'column', ', ')
                                         from jsonb_array_elements(v_run.proposals) p), '(none)')
      using errcode = '23503';
  end if;
  if v_proposal ->> 'state' = 'accepted' then
    raise exception 'custom.io_proposal_accept: "%" was already accepted on this run. Accepting twice would mint a second Field with the same key.', p_column
      using errcode = '23505';
  end if;

  -- THE PROPOSAL SPEAKS HUMAN; THE FIELD SPEAKS BEHAVIOUR. What a person sees offered is
  -- "this looks like a number" — but `custom._field_shape_guard` holds a Field's `type` to
  -- exactly five BEHAVIOURS (list, range, text, relation, formula), because "number",
  -- "currency" and "percent" are one behaviour wearing three units. So the human word is
  -- translated here, once, and the flavour is kept where the store keeps flavour: `format`.
  -- 🚨 RED-SUITES 2026-09-21 — THE KEY IS `type`, AND `inferred_type` WAS NEVER WRITTEN BY
  -- ANYBODY. `custom.io_infer_column` answers
  --     {"why": "Every value is a number.", "type": "number", "label": "Lead score", …}
  -- and `custom.io_import_rows` stores that object, minus `header` and `matched`, as the
  -- proposal. This line read `inferred_type`, which no door has ever produced, so the
  -- coalesce fell through to `'text'` EVERY TIME: the screen offered the person "this looks
  -- like a number", they accepted it, and the store minted a TEXT column. Measured through
  -- `w4_io_green` DOOR-14 on the main database — the accepted Field came back
  -- `"type": "text"` and the next import wrote the string "60" into it, which is precisely
  -- the "it is a label and not a type" the suite exists to catch.
  v_word := coalesce(nullif(btrim(coalesce(p_type, '')), ''),
                     nullif(btrim(coalesce(v_proposal ->> 'type', '')), ''),
                     'text');
  if v_word in ('list', 'range', 'text', 'relation', 'formula') then
    v_type := v_word;                    -- the caller named a behaviour outright
    v_format := null;
  elsif v_word = 'number' then
    v_type := 'range'; v_format := null;
  elsif v_word = 'date' then
    v_type := 'range'; v_format := 'date';
  elsif v_word = 'email' then
    v_type := 'text';  v_format := 'email';
  elsif v_word = 'url' then
    v_type := 'text';  v_format := 'url';
  elsif v_word = 'phone' then
    v_type := 'text';  v_format := 'phone';
  elsif v_word in ('checkbox', 'boolean', 'bool', 'yes_no', 'toggle') then
    -- LIMITS-FIX 2026-09-21: a tick box is now a BEHAVIOUR of its own and needs no options
    -- Table, so the conservative answer and the right answer are finally the same one. This
    -- arm used to fall through to TEXT with the note below; the note is kept in the file's
    -- header so the reason it existed is not lost.
    v_type := 'boolean'; v_format := null;
  else
    -- Everything else: TEXT. Conservative here costs one dropdown a person fixes in a
    -- second; wrong here costs a data repair.
    v_type := 'text';  v_format := null;
  end if;
  -- The key is the column's own name, lowered and de-spaced, because that is what the next
  -- import of the same file will match on without anyone authoring a mapping.
  v_key := regexp_replace(lower(btrim(p_column)), '[^a-z0-9]+', '_', 'g');
  v_key := btrim(v_key, '_');
  if v_key = '' then
    raise exception 'custom.io_proposal_accept: column "%" leaves no usable Field key', p_column
      using errcode = '22023';
  end if;

  -- DOOR-14 IS "ADD THIS AS A FIELD", AND THERE IS EXACTLY ONE DOOR THAT DOES BOTH HALVES.
  --
  -- 🚨 RED-SUITES 2026-09-21 — THIS BODY DEADLOCKED BETWEEN TWO CORRECT GUARDS, and accepting
  -- an imported column stopped working on the live database:
  --     Leads says it has a column called "lead_score", and there is no such field.
  --     HINT: REC-1 / REC-51 … Define it with custom.field_declare, which adds the name and
  --           the definition together, or leave the name off the table.
  -- It used to write the NAME onto the Table first and mint the Field second, because
  -- `custom._field_definition_write` refuses a Field whose Table has not declared its key.
  -- Lane FIELD-TRUTH then landed `custom.assert_columns_are_defined`, which refuses a Table
  -- that declares a column with no Field behind it — and it is right: a column nobody defined
  -- has no type, no rules and no validation, and 53 such names were found live. Both guards
  -- are correct and together they leave no order the two-step can run in: whichever half goes
  -- first, the other guard refuses it. `w4_io_green` PART 4 caught it.
  --
  -- The remedy is the one the refusal itself names. `custom.field_declare` writes the name
  -- and the definition in ONE transaction through `custom._field_document_for`, the builder
  -- both doors already share, so neither guard ever sees a half-made column. It is also the
  -- same door a hand-made Field goes through, which is what this body's next comment always
  -- said it wanted: an accepted proposal is a Field, not a second kind of Field, and nothing
  -- downstream has to ask where a Field came from.
  --
  -- A FIELD DOCUMENT IS NOT THREE KEYS. `custom._field_shape_guard` requires every Field to
  -- SAY the things a Field has to say — what it is a field OF, whether it holds one value or
  -- many, whether it is required, whether it is dated, its rules (even empty), where its
  -- values come from, and how sensitive they are — so the whole document is spelled out here
  -- exactly as it was before, and only the two calls that wrote it became one.
  --
  -- ALREADY THERE IS NOT AN ERROR. Re-accepting the same proposal answers the Field that
  -- exists rather than raising, which is what a person clicking twice deserves.
  select f.id into v_field_id
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and (f.data ->> 'entity_definition_id')::uuid = v_run.table_id
     and f.data ->> 'key' = v_key
     and f.deleted_at is null
   limit 1;
  if v_field_id is null then
    v_field_id := custom.field_declare(
      p_organization_id, v_run.table_id,
      jsonb_build_object('key', v_key,
                                                  -- RED-SUITES 2026-09-21: and the LABEL the same door worked out —
                         -- "Lead score", not the raw header key "lead_score". Same class as
                         -- the type above: the inference was made, shown, accepted, and then
                         -- dropped on the floor.
                         'label', coalesce(nullif(btrim(coalesce(p_label, '')), ''),
                                           nullif(btrim(coalesce(v_proposal ->> 'label', '')), ''),
                                           btrim(p_column)),
                         'type', v_type,
                         'format', v_format,
                         'multi', false,
                         'required', false,
                         'dated', false,
                         'sort', 0,
                         'rules', '[]'::jsonb,
                         'config', '{}'::jsonb,
                         'depends_on', '[]'::jsonb,
                         'applies_to_types', '[]'::jsonb,
                         -- `manual`, because that is the closed vocabulary's word for "a person
                         -- fills this in". WHERE it came from is source_config, below.
                         'source', 'manual',
                         'source_config', jsonb_build_object('origin', 'import_proposal',
                                                             'import_id', p_import_id,
                                                             'source_column', p_column),
                         -- `internal` is the conservative default: a column nobody has classified
                         -- is the organization's business and not the world's.
                         'sensitivity', 'internal',
                         'context_policy', 'include',
                         '_actor', 'system'));
  end if;

  update custom.io_import
     set proposals = (select jsonb_agg(case when p ->> 'column' = p_column
                                            then p || jsonb_build_object('state', 'accepted',
                                                                         'field_id', v_field_id)
                                            else p end)
                        from jsonb_array_elements(proposals) p),
         mapping   = mapping || jsonb_build_object(p_column, v_key)
   where organization_id = p_organization_id and id = p_import_id;

  return v_field_id;
end;
$function$
;
