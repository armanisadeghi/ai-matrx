-- chair-step: this DROPs the one function accesspersonal_every_table_i_can_open_in_every_organization.sql added, custom.tables_i_can_open(), and deletes its platform.client_callable_door row. Nothing else existed before it and nothing else is touched; the hub's "All my organizations" then says it could not be read.
-- lane: ACCESS-IS-PERSONAL

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'tables_i_can_open';

drop function if exists custom.tables_i_can_open();
