-- chair-step: the inverse of ap4_a_platform_record_lists_the_custom_rows_that_link_to_it.sql — it
--   removes the back-link door's platform.client_callable_door row and drops
--   custom.entity_back_links(uuid, text, uuid, integer, text). Nothing else is touched; a platform
--   record page then cannot list the custom rows that link to it (the Table API and the record view
--   say the door is missing).
-- lane: AP-4
-- lock: custom,platform

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'entity_back_links'
   and declared_by = 'ap4_a_platform_record_lists_the_custom_rows_that_link_to_it.sql';

drop function if exists custom.entity_back_links(uuid, text, uuid, integer, text);
