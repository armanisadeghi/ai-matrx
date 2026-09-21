-- INVERSE of tails3_a_portal_says_which_tables_it_shows.sql
-- It takes the one new reading door away again, with its declaration row. Running it puts the
-- hole back: the Portals rail can no longer ask which Tables a portal exposes, so it falls
-- back to the organization-scoped list and the build/ask offer disappears from every table of
-- an organization that already has one portal.
drop function if exists custom.portal_tables(uuid);
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'portal_tables';
