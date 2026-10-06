-- AP-4 — RED TWIN of ap4_choice_words_filter_green.sql: PROVES CLAUSES 1a AND 3a CAN FAIL.
--
-- Inside its own rolled-back transaction it takes the AP-4 mapping back out of platform._drill_plan
-- and custom.entity_records_find — exactly what the inverse
-- migrations/inverse/ap4_c_a_choice_field_is_filtered_by_the_word_a_person_sees_down.sql does — and
-- REQUIRES the word "Text message" to find nobody in drill_rows (both paths) and entity_records_find
-- while the stored key text_message still finds Dana. If the word still finds her, the green suite is
-- not testing the mapping, and this suite fails. Ends in ROLLBACK; the live bodies are untouched.

\set suite 'ap4_choice_words_filter_red.sql'
\set requires 'function:custom.choice_value_keys|function:platform.drill_rows|function:custom.entity_records_find'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

-- the two read doors as they were before ap4_c (the inverse's own patch-back)
do $ap4$
declare
  c_old constant text := $o$    v_def := platform._drill_protect(v_def, q, p_kind);   -- LANE7-W4A[p1]: protected custom fields$o$;
  c_new constant text := $n$    v_def := platform._drill_protect(v_def, q, p_kind);   -- LANE7-W4A[p1]: protected custom fields
    q := platform._drill_choice_words_in(v_def, q);         -- AP-4: a choice is filtered by its word too$n$;
  v_def text := pg_get_functiondef('platform._drill_plan(uuid,jsonb,jsonb,text)'::regprocedure);
begin
  if (length(v_def) - length(replace(v_def, c_new, ''))) / length(c_new) <> 1 then
    raise exception 'AP-4 inverse: platform._drill_plan does not carry the ap4_c line exactly once; it was changed since.'
      using errcode = '55000';
  end if;
  execute replace(v_def, c_new, c_old);
end
$ap4$;

do $ap4$
declare
  c_decl_old constant text := $o$  v_pf     custom.record;   -- LANE7-W4A[f1]$o$;
  c_decl_new constant text := $n$  v_pf     custom.record;   -- LANE7-W4A[f1]
  v_asked  jsonb := p_value;   -- AP-4: the value as asked, echoed back$n$;
  c_sel_old  constant text := $o$  select * into v_pf from custom.entity_fields(p_organization_id, p_token) f where f.data ->> 'key' = p_key limit 1;$o$;
  c_sel_new  constant text := $n$  select * into v_pf from custom.entity_fields(p_organization_id, p_token) f where f.data ->> 'key' = p_key limit 1;
  -- AP-4: a CHOICE field is found by the word a person sees as well as by its stored key — the same
  -- resolution a write uses (custom.choice_value_keys), over the options read as the caller.
  if p_value is not null and v_pf.data ->> 'type' = 'list' then
    p_value := custom.choice_value_keys(jsonb_build_object('options',
                 (select x -> 'options'
                    from jsonb_array_elements(custom.entity_fields_across(p_token, array[p_organization_id]) -> 'fields') x
                   where x ->> 'id' = v_pf.id::text
                   limit 1)), p_value);
  end if;$n$;
  c_echo_old constant text := $o$'value', p_value, 'rows'$o$;
  c_echo_new constant text := $n$'value', v_asked, 'rows'$n$;
  v_def text := pg_get_functiondef('custom.entity_records_find(uuid,text,text,jsonb,integer,integer)'::regprocedure);
begin
  if (length(v_def) - length(replace(v_def, c_decl_new, ''))) / length(c_decl_new) <> 1
     or (length(v_def) - length(replace(v_def, c_sel_new, ''))) / length(c_sel_new) <> 1
     or (length(v_def) - length(replace(v_def, c_echo_new, ''))) / length(c_echo_new) <> 2 then
    raise exception 'AP-4 inverse: custom.entity_records_find does not carry the ap4_c blocks as written; it was changed since.'
      using errcode = '55000';
  end if;
  execute replace(replace(replace(v_def, c_echo_new, c_echo_old), c_sel_new, c_sel_old), c_decl_new, c_decl_old);
end
$ap4$;

do $$
declare
  c_owner  uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com
  c_studio uuid := '2643e470-b275-47f3-95f3-ae275ad3ca47';  -- Oak Street Studio
  c_col    text := 'cf:2e39664c-91bf-4eea-8de7-2736189bbd54'; -- "Preferred channel"
  c_dana   uuid := '686f46e7-74d4-48df-8e54-aff77a22114e';
  v_boss   text := current_user;
  v_api    boolean;
  v_res    jsonb;
begin
  perform set_config('app.actor_system', 'campaign.ap4_choice_words_filter_red', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  foreach v_api in array array[true, false] loop
    v_res := platform.drill_rows(c_studio, jsonb_build_object('kind', 'entity', 'token', 'party', 'api', v_api),
                                 jsonb_build_object('where', jsonb_build_object(c_col, 'Text message'), 'limit', 50));
    if jsonb_array_length(v_res -> 'rows') <> 0 then
      raise exception 'red (api %): without the mapping "Text message" still found %, so green clause 1a cannot fail', v_api, v_res -> 'rows';
    end if;
    v_res := platform.drill_rows(c_studio, jsonb_build_object('kind', 'entity', 'token', 'party', 'api', v_api),
                                 jsonb_build_object('where', jsonb_build_object(c_col, 'text_message'), 'limit', 50));
    if not exists (select 1 from jsonb_array_elements(v_res -> 'rows') r where (r ->> 'id')::uuid = c_dana) then
      raise exception 'red (api %): the stored key no longer finds Dana — the twin weakened more than the mapping', v_api;
    end if;
  end loop;
  v_res := custom.entity_records_find(c_studio, 'party', 'preferred_channel', '"Text message"'::jsonb, 50, 0);
  if jsonb_array_length(v_res -> 'rows') <> 0 then
    raise exception 'red: without the mapping entity_records_find "Text message" still found %, so green clause 3a cannot fail', v_res -> 'rows';
  end if;
  perform set_config('role', v_boss, true);
  raise notice 'ap4_choice_words_filter_red: without the mapping the word finds nobody and the key still finds Dana, as it must — green clauses 1a and 3a are real checks';
end $$;

rollback;
