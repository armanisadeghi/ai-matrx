-- inverse of tablenames_b_the_three_renamed_doors_keep_their_signed_in_grants.sql
-- WHAT IT DOES NOT UNDO: nothing; it only widens back to the default grant the functions were born with.
grant execute on function custom.data_home_slim(uuid, text, boolean) to public;
grant execute on function custom.table_list_everywhere(uuid, boolean) to public;
grant execute on function custom.data_home_tables(uuid, boolean) to public;
update platform.client_callable_door
   set identity_args = replace(identity_args, 'include_platform_tables', 'include_app_tables'),
       reason = replace(reason, 'include_platform_tables', 'include_app_tables')
 where schema_name = 'custom' and (identity_args ~ 'include_platform_tables' or reason ~ 'include_platform_tables');
