-- chair-step: drops custom.data_home_custom_fields and custom.custom_fields_on, the two doors the all-my-data view on /data reads; only if that view is being retired
-- INVERSE of migrations/campaign/datahomefix2_b_the_all_my_data_custom_fields_doors.sql

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('data_home_custom_fields', 'custom_fields_on');

drop function if exists custom.data_home_custom_fields(uuid);
drop function if exists custom.custom_fields_on(uuid, text);
