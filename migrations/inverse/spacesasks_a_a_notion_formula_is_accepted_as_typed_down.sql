-- Inverse of migrations/campaign/spacesasks_a_a_notion_formula_is_accepted_as_typed.sql: restores custom.formula_parse to the
-- body gridprim_a_formula_is_typed_and_the_store_works_it_out.sql wrote (no Notion translation) and drops the translator.
-- A formula column already saved from a prop() text keeps its stored expression; only re-typing prop() text is refused again.
-- lane: SPACES-ASKS
-- guard: custom/system_enabled

create or replace function custom.formula_parse(p_organization_id uuid, p_table_id uuid, p_text text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_fields jsonb;
  v_tokens jsonb;
  v_r      jsonb;
  v_expr   jsonb;
  v_refs   jsonb := '[]'::jsonb;
  v_msg    text;
  v_at     text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.formula_parse');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.formula_parse');

  -- The columns a reference may name: this Table's live Fields, by key and by label.
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'key', f.data ->> 'key', 'label', f.data ->> 'label',
                                               'type', f.data ->> 'type', 'config', f.data -> 'config')
                            order by (f.data ->> 'sort')::numeric nulls last), '[]'::jsonb)
    into v_fields
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class = 'field'
     and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = p_table_id::text;

  -- NOTHING THROWS: a formula a person is still typing is an answer, not an error.
  begin
    if btrim(coalesce(p_text, '')) = '' then
      raise exception 'This formula is empty.' using errcode = '22023', detail = '0';
    end if;
    v_tokens := custom._fxp_tokens(p_text);
    v_r := custom._fxp_level(v_tokens, 0, 0);
    if (v_tokens -> ((v_r ->> 'i')::integer)) ->> 't' <> 'end' then
      raise exception 'Nothing should follow the formula here — remove `%`.',
                      (v_tokens -> ((v_r ->> 'i')::integer)) ->> 'x'
        using errcode = '22023', detail = (v_tokens -> ((v_r ->> 'i')::integer)) ->> 'p';
    end if;
    v_r := custom._fxp_resolve(v_r -> 'n', v_fields, v_refs);
    v_expr := v_r -> 'n';
    v_refs := v_r -> 'refs';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text, v_at = pg_exception_detail;
    return jsonb_build_object('ok', false, 'error', v_msg,
                              'position', coalesce(nullif(v_at, '')::integer, 0), 'text', p_text);
  end;

  return jsonb_build_object('ok', true, 'expr', v_expr, 'references', v_refs,
                            'result_type', custom._fxp_type(v_expr, v_fields), 'text', p_text);
end
$fn$;

drop function custom.formula_translate_notion(text, jsonb);
drop function custom._nfx_expr(jsonb, integer, integer, jsonb);
drop function custom._nfx_unary(jsonb, integer, jsonb);
drop function custom._nfx_primary(jsonb, integer, jsonb);
drop function custom._nfx_arglist(jsonb, integer, jsonb);
drop function custom._nfx_bin(text, jsonb, jsonb);
drop function custom._nfx_call(text, jsonb, jsonb);
drop function custom._nfx_colkind(text);
drop function custom._nfx_tokens(text);
