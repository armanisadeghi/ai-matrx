-- chair-step: this DROPs the one function datahome1_the_data_home_knows_whose_each_table_is.sql added, custom.data_home_tables(), after deleting its platform.client_callable_door row. Nothing else existed before it and nothing else is touched; the data home then says its tables could not be read.
-- lane: DATA-HOME-1

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'data_home_tables';

drop function if exists custom.data_home_tables();
