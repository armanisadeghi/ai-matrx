-- chair-step: the inverse of ap4_b_a_platform_type_lists_its_columns_with_their_origin.sql — it takes choices/links_to back out of platform._drill_resolve and drops platform.entity_columns.
--   platform._drill_resolve is patched back by text (the added block asserted to occur exactly once,
--   executed back to the body ap4_b was based on); platform.entity_columns(uuid, text) loses its
--   platform.client_callable_door row and is dropped. Nothing else is touched. Afterwards a custom
--   choice column is described without its words again and no door answers CONTRACTS §0 Column[].
-- lane: AP-4
-- lock: platform

set lock_timeout = '4s';

delete from platform.client_callable_door
 where schema_name = 'platform' and function_name = 'entity_columns'
   and declared_by = 'ap4_b_a_platform_type_lists_its_columns_with_their_origin.sql';

drop function if exists platform.entity_columns(uuid, text);

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
