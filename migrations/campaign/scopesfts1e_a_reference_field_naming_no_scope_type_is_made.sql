-- chair-step: custom._ctx_item_shape reads a missing or null allowed_scope_type_ids / allowed_reference_types as an empty list (the field contract: none named = any), so a reference context field made without naming scope types is made instead of failing "cannot get array length of a scalar". Same answer for every input it answered before (an array or a missing key reads exactly as before; only a JSON scalar, which raised, changes). Guard scripts/campaign-tests/scopesfts1e_a_reference_field_naming_no_scope_type_is_made_red_green.sql RED (F1 the scalar error, admin and test@test.com) then GREEN (field made, a scope reference saved on it and found by list_context_value_refs).
-- lane: FINISH-THE-SWITCH (FTS-1e, scopes finish, item 8)
-- based-on: custom._ctx_item_shape(jsonb, boolean) 16ec36fd491b1b2811a22ffab5fabab22bec05f44e3be0ec185947021f612a32
-- lock: custom
--
-- Inverse: migrations/inverse/scopesfts1e_a_reference_field_naming_no_scope_type_is_made_down.sql.
--
-- THE USE CASE. Cedar Ridge Physical Therapy adds "Preferred clinic" to Referring Physicians as a reference to any scope.

CREATE OR REPLACE FUNCTION custom._ctx_item_shape(p_item jsonb, p_as_text boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  vt      text := coalesce(p_item ->> 'value_type', 'string');
  s       jsonb;
  -- A field that names no scope types (missing or null) points at any (FTS-1e): an empty list, never a scalar.
  allowed jsonb := case when jsonb_typeof(p_item -> 'allowed_scope_type_ids') = 'array' then p_item -> 'allowed_scope_type_ids' else '[]'::jsonb end;
  kinds   text[];
  tokens  text[];
  v_multi boolean;
begin
  if p_as_text or (p_item -> 'reference_source') is not null and jsonb_typeof(p_item -> 'reference_source') <> 'null' then
    return jsonb_build_object('behavior', 'text', 'config', '{}'::jsonb, 'multi', false, 'as_text', true);
  end if;
  s := case vt
    when 'string'   then '{"behavior":"text"}'
    when 'number'   then '{"behavior":"range","config":{"kind":"number"}}'
    when 'boolean'  then '{"behavior":"boolean","parity":"checkbox"}'
    when 'object'   then '{"behavior":"text","format":"json"}'
    when 'array'    then '{"behavior":"text","multi":true}'
    when 'document' then '{"behavior":"relation","needs_target":true,"parity":"attachment"}'
    when 'reference' then '{"behavior":"relation","needs_target":true,"parity":"select"}'
    when 'date'     then '{"behavior":"range","config":{"kind":"date"},"format":"date"}'
    when 'datetime' then '{"behavior":"range","config":{"kind":"datetime"},"format":"datetime","parity":"datetime"}'
    when 'time'     then '{"behavior":"text","format":"time"}'
    when 'email'    then '{"behavior":"text","format":"email","parity":"email"}'
    when 'url'      then '{"behavior":"text","format":"url","parity":"url"}'
    when 'phone'    then '{"behavior":"text","format":"phone","parity":"phone"}'
    when 'percent'  then '{"behavior":"range","config":{"kind":"number"},"format":"percent","unit":"%","parity":"percent"}'
    when 'color'    then '{"behavior":"text","format":"color"}'
    when 'markdown' then '{"behavior":"text","format":"markdown"}'
    when 'currency' then '{"behavior":"range","config":{"kind":"number"},"format":"currency","unit":"USD","parity":"currency"}'
    else null end::jsonb;
  if s is null then
    return jsonb_build_object('behavior', 'text', 'config', '{}'::jsonb, 'multi', false, 'as_text', true);
  end if;
  s := jsonb_build_object('config', '{}'::jsonb, 'multi', false) || s;

  -- SC-R / P12: a reference that names no scope type points at platform things.
  if vt = 'reference' and jsonb_array_length(allowed) = 0 then
    select array_agg(lower(btrim(k))) filter (where btrim(k) <> '') into kinds
      from jsonb_array_elements_text(case when jsonb_typeof(p_item -> 'allowed_reference_types') = 'array' then p_item -> 'allowed_reference_types' else '[]'::jsonb end) k;
    if kinds is not null and not (kinds && array['scope', 'url']) then
      v_multi := coalesce((p_item ->> 'max_items')::int, 1) > 1;
      if kinds <@ array['file', 'document'] then
        return jsonb_build_object('behavior', 'relation', 'config', '{}'::jsonb, 'multi', v_multi,
                                  'parity', 'attachment', 'relation_target', '11111111-0000-4000-8000-000000000006');
      elsif not (kinds && array['file', 'document']) then
        select array_agg(t order by min_ord) into tokens from (
          select case k when 'table' then 'dataset' else k end as t, min(ord) as min_ord
            from unnest(kinds) with ordinality u(k, ord) group by 1) x;
        return jsonb_build_object('behavior', 'relation',
                                  'config', jsonb_build_object('target_mode', 'any', 'allowed_types', to_jsonb(tokens)),
                                  'multi', v_multi, 'entity', true);
      end if;
    end if;
  end if;

  if coalesce((s ->> 'needs_target')::boolean, false) then
    if vt = 'document' then
      s := s || jsonb_build_object('relation_target', '11111111-0000-4000-8000-000000000006');
    elsif jsonb_array_length(allowed) = 1 then
      -- REFERENCE-CARRY: a reference to one scope type that holds many holds many (max_items > 1).
      s := s || jsonb_build_object('relation_target', allowed ->> 0,
                                   'multi', coalesce((p_item ->> 'max_items')::int, 1) > 1);
    else
      return jsonb_build_object('behavior', 'text', 'config', '{}'::jsonb, 'multi', false, 'as_text', true);
    end if;
  end if;
  return s - 'needs_target';
end;
$function$;
