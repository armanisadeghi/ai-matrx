-- chair-step: the inverse of migrations/campaign/choiceval_the_render_finds_the_column_either_way.sql.
--   It puts back the renderer that looked a list column up by its KEY alone — so a document
--   re-keyed by field id, which is what every list surface asks for, came back untouched and the
--   page a person reads showed the stored word instead of the label while the single-record door
--   looked right. Running this restores that disagreement, which is what it is for.

set lock_timeout = '2s';
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
  e       record;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or p_table_id is null then
    return p_doc;
  end if;
  v_map := custom.choice_field_map(p_organization_id, p_table_id);
  if v_map = '{}'::jsonb then
    return p_doc;
  end if;

  v_out := p_doc;
  for e in select key as k, value as v from jsonb_each(v_map) loop
    if not (p_doc ? e.k) then
      continue;
    end if;
    v_note := custom.choice_render_note(e.v, p_doc -> e.k);
    if v_note is null then
      continue;
    end if;
    v_out   := v_out   || jsonb_build_object(e.k, custom.choice_render_value(e.v, p_doc -> e.k));
    v_notes := v_notes || jsonb_build_object(e.k, v_note);
  end loop;

  if v_notes <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_choices', v_notes);
  end if;
  return v_out;
end;
$function$;
