-- chair-step: the true inverse of
--   `migrations/campaign/definer7_the_dictionary_door_rules_its_arguments.sql`. The dictionary
--   door's row goes back to carrying no argument rules at all, which is what it carried on
--   2026-09-22 before DEFINER-7.
-- lock: platform
-- lane: DEFINER-7

update platform.client_callable_door
   set argument_rules = null
 where schema_name = 'public'
   and function_name = 'dict_resolve';
