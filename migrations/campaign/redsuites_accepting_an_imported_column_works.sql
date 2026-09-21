-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.io_proposal_accept(uuid, uuid, text, text, text) 8dc46ce78d9f2e6b89aaf6f58fbfdb646c56a4614f81af5a6788e96d7c8a856b
--
-- RED-SUITES — ACCEPTING AN IMPORTED COLUMN WORKS AGAIN: ONE DOOR, NOT TWO GUARDS FACING
-- EACH OTHER.
--
-- Measured on the main database 2026-09-21, through `w4_io_green` PART 4 and again by hand:
--   select custom.io_proposal_accept(org, run, 'Lead score');
--   ERROR:  Leads says it has a column called "lead_score", and there is no such field.
--
-- `custom.io_proposal_accept` is the door behind "yes, add that spreadsheet column to this
-- table" — the end of the CSV import flow lane LIMITS-FIX built. It wrote the column's NAME
-- onto the Table and then minted the Field, in that order, because
-- `custom._field_definition_write` refuses a Field whose Table has not declared its key.
-- Lane FIELD-TRUTH then landed `custom.assert_columns_are_defined` on `custom.record_update`,
-- which refuses a Table that declares a column no Field defines. Both guards are right —
-- FIELD-TRUTH measured 53 claimed columns with nothing behind them — and together they leave
-- the two-step no order to run in: whichever half goes first, the other guard refuses it.
--
-- THE CLASS: any caller that adds a column in two steps is now deadlocked, and the ONE door
-- that does both halves in one transaction is `custom.field_declare` — which is exactly what
-- FIELD-TRUTH's own refusal hint tells a person to use. This file makes the store's own
-- import door take its own advice. The Field document it builds is byte-for-byte the one it
-- built before; only the two calls that wrote it became one. Re-accepting an already-accepted
-- proposal now answers the Field that exists instead of raising.
--
-- Census run the same day for other two-step column writers in `custom`: `custom.promote_field`
-- and `custom.entity_field_update` change an EXISTING column and add no name, and
-- `custom.table_declare` writes names and Fields together through `custom._field_document_for`
-- already. This door was the only one deadlocked.
--
-- GUARDED: `custom.field_declare`'s first line is `custom.assert_store_door`, so this body
-- reaches the switch exactly as it did before (it also reads it itself, on its own first line).

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
  v_word := coalesce(nullif(btrim(coalesce(p_type, '')), ''), v_proposal ->> 'inferred_type', 'text');
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
                         'label', coalesce(nullif(btrim(coalesce(p_label, '')), ''), btrim(p_column)),
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
