-- chair-step: the inverse of formsfix1_the_owners_preview_asks_the_store_the_same_question.sql. It deletes the one `platform.client_callable_door` row for `custom.form_preview_asks`, DROPS `custom.form_preview_asks(uuid, uuid, jsonb, jsonb)`, restores `custom.form_public_asks` to the body formsfix1_a_public_form_asks_the_store_which_questions_come_next.sql created (captured verbatim from pg_get_functiondef on the clone and branch, sha 73017f51…7315), and then DROPS `custom._form_questions_asked(uuid, jsonb, jsonb)`. No data is touched. Run the grant's inverse first when the grant was applied; a DROP takes the grant with it either way.
-- lane: FORMS-FIX-1
-- based-on: custom.form_public_asks(uuid, jsonb, text, text) 23aafcfc0c3e3aad49c676dac9d377bdab96ec9db38fff92fb78267bdb3d5213

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'form_preview_asks';

drop function if exists custom.form_preview_asks(uuid, uuid, jsonb, jsonb);

CREATE OR REPLACE FUNCTION custom.form_public_asks(p_form_id uuid, p_values jsonb, p_secret text DEFAULT NULL::text, p_origin text DEFAULT NULL::text)
 RETURNS TABLE(field_key text, asked boolean, decided boolean, said text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f       custom.anon_form;
  v_tok     record;
  v_values  jsonb := '{}'::jsonb;
  v_q       jsonb;
  v_key     text;
  v_expr    jsonb;
  v_answer  jsonb;
begin
  if p_form_id is null then return; end if;

  -- An embed names itself with its token; the token has to be THIS form's.
  if p_secret is not null then
    select * into v_tok from custom.anon_token_verify(p_secret, p_origin, 'write');
    if v_tok.form_id is distinct from p_form_id then
      raise exception 'This embed is for a different form.'
        using errcode = '42501',
              hint = 'The token names the one form it was issued for. Use the embed that was issued for this form.';
    end if;
  end if;

  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  -- Silence for everything the public page is silent or closed about: missing, unpublished,
  -- closed, and a store that is switched off. Nothing to branch on a page that asks nothing.
  if not found or v_f.published_at is null or v_f.closed_at is not null then return; end if;
  if not custom.store_is_open(v_f.organization_id) then return; end if;

  -- The stranger's answers, narrowed to the keys this form asks for. Anything else is dropped
  -- here rather than refused: this is a question about the NEXT step, and the submit door is
  -- the one that refuses an unknown key by name.
  if jsonb_typeof(p_values) = 'object' then
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_values
      from jsonb_each(p_values) e
     where v_f.exposed_field_keys ? e.key;
  end if;

  for v_q in select q.value
               from jsonb_array_elements(coalesce(v_f.presentation -> 'questions', '[]'::jsonb))
                    with ordinality q(value, ord)
              order by q.ord loop
    v_key := nullif(btrim(coalesce(v_q ->> 'field', v_q ->> 'key', '')), '');
    continue when v_key is null;
    v_expr := coalesce(v_q -> 'showIf', v_q -> 'show_if');

    field_key := v_key;
    said := null;
    if v_expr is null or jsonb_typeof(v_expr) = 'null' then
      asked := true; decided := true;
      return next;
      continue;
    end if;

    begin
      v_answer := custom.rule_eval(v_f.organization_id, v_expr, v_values, '{}'::jsonb);
      if v_answer = 'true'::jsonb then
        asked := true; decided := true;
      elsif v_answer = 'false'::jsonb then
        asked := false; decided := true;
      else
        -- UNDECIDED IS NOT FALSE. Nobody has answered what this condition is about yet.
        asked := true; decided := false;
      end if;
    exception when others then
      asked := true; decided := false; said := sqlerrm;
    end;
    return next;
  end loop;
end;
$function$

;

drop function if exists custom._form_questions_asked(uuid, jsonb, jsonb);
