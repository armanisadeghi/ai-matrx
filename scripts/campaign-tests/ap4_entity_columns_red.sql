-- AP-4 — RED TWIN of ap4_entity_columns_green.sql: PROVES CLAUSE 1 (THE CHOICES) CAN FAIL.
--
-- Inside its own rolled-back transaction it takes the AP-4 block back out of
-- platform._drill_resolve — exactly what the inverse
-- migrations/inverse/ap4_b_a_platform_type_lists_its_columns_with_their_origin_down.sql does — and
-- REQUIRES platform.entity_columns to answer "Preferred channel" WITHOUT its words. If the column
-- still carries them, the green suite's choices clause is not testing what it claims, and this suite
-- fails. Ends in ROLLBACK; the live body is untouched.

\set suite 'ap4_entity_columns_red.sql'
\set requires 'function:platform.entity_columns|function:platform._drill_resolve|relation:custom.record'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

-- the describer as it was before ap4_b (the inverse's own patch-back)
do $ap4$
declare
  c_old constant text := $o$          'unit', v_f.data ->> 'unit')));$o$;
  c_new constant text := $n$          'unit', v_f.data ->> 'unit',
          -- AP-4 (2026-10-06): a custom CHOICE field says its live words and a LINK field the kinds
          -- it may point at, here in the one describer, so every reader of this description
          -- (drill_describe, drill_rows' columns, the Table API, platform.entity_columns) has them.
          'choices', case when v_ft = 'list'
                           and coalesce(nullif(v_f.data ->> 'options_table_id', ''),
                                        nullif(v_f.data -> 'config' ->> 'options_table_id', '')) is not null
                          then (select jsonb_agg(o.value ->> 'label'
                                                 order by (o.value ->> 'position')::integer nulls last, o.value ->> 'label')
                                  from jsonb_each(custom.choice_options(v_f.organization_id,
                                         coalesce(nullif(v_f.data ->> 'options_table_id', ''),
                                                  nullif(v_f.data -> 'config' ->> 'options_table_id', ''))::uuid)) o
                                 where not coalesce((o.value ->> 'retired')::boolean, false)) end,
          'links_to', case when jsonb_typeof(v_f.data -> 'config' -> 'allowed_types') = 'array'
                            and jsonb_array_length(v_f.data -> 'config' -> 'allowed_types') > 0
                           then v_f.data -> 'config' -> 'allowed_types' end)));$n$;
  v_def text := pg_get_functiondef('platform._drill_resolve(uuid,text)'::regprocedure);
begin
  if (length(v_def) - length(replace(v_def, c_new, ''))) / length(c_new) <> 1 then
    raise exception 'AP-4 inverse: platform._drill_resolve does not carry the ap4_b block exactly once; it was changed since.'
      using errcode = '55000';
  end if;
  execute replace(v_def, c_new, c_old);
end
$ap4$;

do $$
declare
  c_owner  uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com
  c_studio uuid := '2643e470-b275-47f3-95f3-ae275ad3ca47';  -- Oak Street Studio
  c_field  uuid := '2e39664c-91bf-4eea-8de7-2736189bbd54';  -- party field "Preferred channel"
  v_boss   text := current_user;
  v_col    jsonb;
begin
  perform set_config('app.actor_system', 'campaign.ap4_entity_columns_red', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select c into v_col from jsonb_array_elements(platform.entity_columns(c_studio, 'party') -> 'columns') c
   where c ->> 'field_id' = c_field::text;
  if v_col is null then
    raise exception 'red: "Preferred channel" is missing altogether — the twin weakened more than the choices';
  end if;
  if v_col ? 'choices' then
    raise exception 'red: with the describer''s block removed "Preferred channel" still carries %, so green clause 1 cannot fail', v_col -> 'choices';
  end if;
  perform set_config('role', v_boss, true);
  raise notice 'ap4_entity_columns_red: without the describer''s block the choice column lost its words, as it must — green clause 1 is a real check';
end $$;

rollback;
