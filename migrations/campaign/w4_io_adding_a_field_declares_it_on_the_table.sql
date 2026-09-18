-- chair-step: replaces custom.io_proposal_accept so accepting a DOOR-14 proposal declares the new field on the TABLE first, through the record write door, before minting the Field record — the store refuses a Field whose Table does not declare its key, and it is right to; a replacement is judged by the allow-list, so the sanctioned route is a terminal-confirmed step
-- based-on: custom.io_proposal_accept(uuid, uuid, text, text, text) 8984c6f745aa75927cdfbb240ce98394c018899c200f688f770793e31472dd39
--
-- W4-IO, file 14 — "ADD THIS AS A FIELD" MEANS ADDING IT TO THE TABLE.
--
-- WHAT THE GREEN SUITE FOUND:
--     the table does not declare a field called lead_score - declare it there first
--
-- `custom._field_definition_write` refuses any Field record whose Table document does not
-- already list its key. That is the store being consistent, not obstructive: the TABLE is what
-- says which fields exist, and a Field record sitting beside a Table that never heard of it
-- would be a field only half the system knew about — invisible to `custom.applicable_fields`,
-- to the grid, and to the change feed this lane just built.
--
-- So DOOR-14's accept does what its own sentence says. "Add this as a field" adds it to the
-- Table — through `custom.record_update`, the ordinary write door, so the Table's own change
-- is versioned, validated and carries its own event — and only then mints the Field record.
-- The order matters and is the whole fix: declared first, minted second.
--
-- IT IS IDEMPOTENT. A key the Table already declares is left alone, so accepting a proposal for
-- a column that was declared by hand in between does not add a duplicate entry.
--
-- THE INVERSE: `migrations/inverse/w4_io_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

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
  else
    -- Everything else, `checkbox` included: TEXT. A checkbox is a two-item list and a list
    -- needs an options Table nobody chose, so proposing one would mint a Field a person then
    -- has to repair. Conservative here costs one dropdown; wrong here costs a data repair.
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

  -- DOOR-14 IS "ADD THIS AS A FIELD", AND A TABLE OWNS ITS FIELD LIST.
  -- `custom._field_definition_write` refuses a Field whose Table does not declare its key —
  -- "the table does not declare a field called X, declare it there first" — and that rule is
  -- right: the Table document is what says which fields exist, and a Field record that
  -- appeared beside it without being declared would be a field only half the system knew
  -- about. So accepting a proposal declares it on the Table FIRST, through the record write
  -- door like any other change, and only then mints the Field.
  if not exists (select 1 from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
                  where t.organization_id = p_organization_id and t.id = v_run.table_id
                    and f ->> 'name' = v_key) then
    perform custom.record_update(
      p_organization_id, v_run.table_id,
      jsonb_build_object('fields',
        coalesce((select t.data -> 'fields' from custom.record t
                   where t.organization_id = p_organization_id and t.id = v_run.table_id),
                 '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('name', v_key))),
      null);
  end if;

  -- THE SAME DOOR A HAND-MADE FIELD GOES THROUGH. An accepted proposal is a Field, not a
  -- second kind of Field, so nothing downstream ever has to ask where a Field came from.
  v_field_id := custom.record_write(
    p_organization_id, custom.field_kernel_id(),
    -- A FIELD DOCUMENT IS NOT THREE KEYS. `custom._field_shape_guard` requires every Field to
    -- SAY the things a Field has to say — what it is a field OF, whether it holds one value or
    -- many, whether it is required, whether it is dated, its rules (even empty), where its
    -- values come from, and how sensitive they are. An accepted proposal must produce the same
    -- complete document a hand-made Field produces, or it is a second kind of Field after all.
    jsonb_build_object('entity_definition_id', v_run.table_id,
                       'key', v_key,
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
$function$;

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
