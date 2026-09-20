-- chair-step: replaces custom.io_proposal_accept so an accepted field proposal produces a COMPLETE Field document — the shape guard requires a Field to declare what it is a field of, its cardinality, its rules, its source and its sensitivity, and the three-key document this minted was refused; a replacement is judged by the allow-list, so the sanctioned route is a terminal-confirmed step
-- based-on: custom.io_proposal_accept(uuid, uuid, text, text, text) 6140ac5b5cee508d9e9ef29c8d9a7497eade447d4a5a5386fd6583dbfc22a396
--
-- W4-IO, file 12 — AN ACCEPTED PROPOSAL IS A WHOLE FIELD.
--
-- WHAT THE GREEN SUITE FOUND:
--     the field lead_score has to say what it is a field OF - a custom table or a standard one,
--     and exactly one of them
-- `custom._field_shape_guard` requires a Field document to declare what it belongs to
-- (`entity_definition_id`), whether it holds one value or many, whether it is required, whether
-- it is dated, its rules as a list even when empty, where its values come from, and how
-- sensitive they are. This minted three keys and a `table_token`, so every acceptance failed.
--
-- IT IS THE SAME DEFECT AS THE ACTOR WORDS, ONE LAYER UP: the door was written against what a
-- Field looked like in this lane's head rather than against what the store actually enforces.
-- The suite calls the function, so the store answered.
--
-- THE DEFAULTS ARE CHOSEN AND NAMED, not left blank: single-valued, not required, not dated,
-- no rules, `manual` source (a person fills it in from now on), `internal` sensitivity (a
-- column nobody has classified is the organization's business, not the world's), and
-- `include` context policy. Where the column came FROM rides in `source_config` — the import
-- run and the original spelling of the header — because that is the question source_config
-- exists to answer, and it is what lets a second import of the same file map it without anyone
-- authoring a mapping.
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

  v_type := coalesce(nullif(btrim(coalesce(p_type, '')), ''), v_proposal ->> 'inferred_type', 'text');
  -- The key is the column's own name, lowered and de-spaced, because that is what the next
  -- import of the same file will match on without anyone authoring a mapping.
  v_key := regexp_replace(lower(btrim(p_column)), '[^a-z0-9]+', '_', 'g');
  v_key := btrim(v_key, '_');
  if v_key = '' then
    raise exception 'custom.io_proposal_accept: column "%" leaves no usable Field key', p_column
      using errcode = '22023';
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
