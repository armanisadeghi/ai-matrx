-- chair-step: replaces custom.io_proposal_accept so an accepted proposal mints a Field whose `type` is one of the five BEHAVIOURS the shape guard holds it to, translating the proposal's human word ("number", "date", "email") once and keeping the flavour in `format`; a replacement is judged by the allow-list, so the sanctioned route is a terminal-confirmed step
-- based-on: custom.io_proposal_accept(uuid, uuid, text, text, text) c03f3e686584ec7153a980eb10fe61ba3c78cc412c55a2555c0e5339002e5c09
--
-- W4-IO, file 13 — A FIELD'S TYPE IS A BEHAVIOUR, NOT A DATA TYPE.
--
-- WHAT THE GREEN SUITE FOUND:
--     the field lead_score says its behavior is number, and a field behaves as a list, a range,
--     text, a relation or a formula
--
-- `custom._field_shape_guard` holds `type` to exactly five behaviours, and the platform's own
-- parity table shows why: `currency`, `percent` and `datetime` are all `range`; `url`, `email`
-- and `phone` are all `text`; `select` and `multi_select` are both `list`. "Number" is not a
-- behaviour — it is a range with no unit. A Field vocabulary of data types would have needed a
-- new entry for every unit anyone ever invented.
--
-- SO THE TRANSLATION HAPPENS ONCE, HERE, and the proposal keeps speaking human. What a person
-- is offered on the import review screen is still "this looks like a number", because that is
-- the sentence they can judge; what lands is `type: range`. The flavour goes to `format`, which
-- is where the store already keeps it.
--
-- `checkbox` DELIBERATELY BECOMES TEXT. A checkbox is a two-item list and a list needs an
-- options Table nobody has chosen, so proposing one would mint a Field the person then has to
-- repair. Conservative here costs one dropdown; wrong here costs a data repair — the same
-- reason `custom.io_infer_type` answers `text` whenever it is unsure.
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
