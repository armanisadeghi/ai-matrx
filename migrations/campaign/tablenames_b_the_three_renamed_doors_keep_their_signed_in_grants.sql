-- chair-step: re-points the door register at the renamed parameters (grants follow in tablenames_c)
-- lane: TABLE-NAMES-FINAL
-- lock: custom
--
-- tablenames_a dropped and recreated seven functions. Four came back with their signed-in grants
-- restored by the door register; these three came back with the default (everyone) and are put back
-- exactly as they were: data_home_slim and the two-argument table_list_everywhere to the signed-in role,
-- the two-argument data_home_tables to the same five roles its one-argument twin holds.
-- The door register names each door by its parameters; the renamed ones follow, then the grants.
update platform.client_callable_door
   set identity_args = replace(identity_args, 'include_app_tables', 'include_platform_tables'),
       reason = replace(reason, 'include_app_tables', 'include_platform_tables')
 where schema_name = 'custom' and (identity_args ~ 'include_app_tables' or reason ~ 'include_app_tables');

