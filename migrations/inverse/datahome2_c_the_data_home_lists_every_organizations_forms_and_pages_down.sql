-- chair-step: this removes custom.data_home_pages(uuid), which datahome2_c added and nothing but the data home reads, with its platform.client_callable_door row. The data home's Forms and Bookings listings then fall back to the working organization's doors. No other object and no data row is touched.
-- lane: DATA-HOME-2
-- based-on: custom.data_home_pages(uuid) 39e3b935a999b3d27d24fe8e1715efc8913decb2934ad33dbabae30b25e16d85

drop function if exists custom.data_home_pages(uuid);
delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'data_home_pages';
