-- inverse of writeperf_the_page_decision_is_executable_by_the_person.sql
-- WHAT IT DOES NOT UNDO: nothing. It takes the EXECUTE grant back, which puts
-- custom.entity_records_find back to dying on `permission denied for function page_size` for
-- every signed-in caller.
revoke execute on function custom.page_ceiling(uuid) from authenticated, anon;
revoke execute on function custom.export_ceiling(uuid) from authenticated, anon;
revoke execute on function custom.page_size(uuid, text, integer, integer, integer) from authenticated, anon;
