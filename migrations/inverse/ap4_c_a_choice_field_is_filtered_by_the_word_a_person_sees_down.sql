-- chair-step: the inverse of ap4_c_a_choice_field_is_filtered_by_the_word_a_person_sees.sql — a choice filter matches the stored key only again.
--   platform._drill_plan and custom.entity_records_find are patched back by text (each added block
--   asserted to occur as ap4_c wrote it, executed back to the bodies ap4_c was based on); then
--   platform._drill_choice_words_in(jsonb, jsonb) is dropped, custom.choice_value_keys(jsonb, jsonb)
--   loses its platform.client_callable_door row and is dropped. Nothing else is touched.
-- lane: AP-4
-- lock: custom,platform

set lock_timeout = '4s';

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

drop function if exists platform._drill_choice_words_in(jsonb, jsonb);

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'choice_value_keys'
   and declared_by = 'ap4_c_a_choice_field_is_filtered_by_the_word_a_person_sees.sql';

drop function if exists custom.choice_value_keys(jsonb, jsonb);
