-- Inverse of migrations/campaign/notionprops_b_a_formula_shows_its_answer_as_it_is_typed.sql: revokes and drops the one
-- door it added and its platform.client_callable_door row. Nothing else is touched.
-- lane: NOTION-PROPS
-- guard: custom/system_enabled

revoke execute on function custom.formula_preview(uuid, uuid, uuid, text) from authenticated;
delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'formula_preview';
drop function custom.formula_preview(uuid, uuid, uuid, text);
