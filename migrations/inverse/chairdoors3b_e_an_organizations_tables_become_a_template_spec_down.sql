-- chair-step: undo chairdoors3b_e_an_organizations_tables_become_a_template_spec.sql: removes the door row and drops custom.template_from_tables and its two ungranted helpers custom._template_token and custom._template_row_value. Nothing was ever written by them.
-- lane: CHAIR-DOORS-3B
delete from platform.client_callable_door
 where declared_by = 'chairdoors3b_e_an_organizations_tables_become_a_template_spec.sql';
drop function if exists custom.template_from_tables(uuid, uuid[], boolean, integer);
drop function if exists custom._template_row_value(jsonb, jsonb);
drop function if exists custom._template_token(text);
