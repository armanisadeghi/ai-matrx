-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.choice_render(uuid, uuid, jsonb) 7ed8ae05b6f4feda5c5a4dfcd3bb4a32816317eb706f10ecbec24c94b85e25d6
--
-- CHOICE-VALUE (5 of 5) — THE RENDERER FINDS THE COLUMN WHETHER IT IS NAMED OR NUMBERED.
--
-- MEASURED BY THIS LANE'S OWN GREEN SUITE, 2026-09-20 07:16Z: `custom.read_record` answered
-- `kind: "Circle"`, and `custom.read_records` on the SAME record answered
-- `"28ca3965-…": "circle"`. Two doors of one store, disagreeing about one value.
--
-- WHY: `custom.mask_document(..., p_by_id, ...)` re-keys the document BY FIELD ID when the caller
-- asks for it, and every list surface in the product asks for it. `custom.choice_render` looked
-- the column up by its KEY alone, found nothing, and handed the document back untouched — so the
-- page a person actually reads was the one that still showed the stored word instead of the
-- label, while the single-record door looked right.
--
-- THE FIX IS THE CLASS, not the one door: the renderer now finds a list column under its key OR
-- under its field id, and writes the label and the `_choices` entry back under WHICHEVER of the
-- two the document actually uses. It stays where it is — AFTER masking — so a field this reader
-- may not see keeps its notice and is never resolved, and `_choices` can never name a choice on
-- a column that was masked.
--
-- THE INVERSE: migrations/inverse/choiceval_the_render_finds_the_column_either_way_down.sql.

set lock_timeout = '45s';
set statement_timeout = '600s';

create or replace function custom.choice_render(p_organization_id uuid, p_table_id uuid, p_doc jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_map   jsonb;
  v_out   jsonb;
  v_notes jsonb := '{}'::jsonb;
  v_note  jsonb;
  v_at    text;
  e       record;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or p_table_id is null then
    return p_doc;
  end if;
  v_map := custom.choice_field_map(p_organization_id, p_table_id);
  if v_map = '{}'::jsonb then
    return p_doc;                       -- no list Field on this Table: nothing to say.
  end if;

  v_out := p_doc;
  for e in select key as k, value as v from jsonb_each(v_map) loop
    -- THE COLUMN, UNDER WHICHEVER NAME THIS DOCUMENT USES. `custom.mask_document` re-keys the
    -- whole document by field id when the caller asks for it, and every list surface does.
    v_at := case when p_doc ? e.k then e.k
                 when p_doc ? (e.v ->> 'field_id') then e.v ->> 'field_id'
            end;
    if v_at is null then
      continue;
    end if;
    v_note := custom.choice_render_note(e.v, p_doc -> v_at);
    if v_note is null then
      continue;                         -- a notice, or a token that names no choice: untouched.
    end if;
    v_out   := v_out   || jsonb_build_object(v_at, custom.choice_render_value(e.v, p_doc -> v_at));
    v_notes := v_notes || jsonb_build_object(v_at, v_note);
  end loop;

  if v_notes <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_choices', v_notes);
  end if;
  return v_out;
end;
$function$;
