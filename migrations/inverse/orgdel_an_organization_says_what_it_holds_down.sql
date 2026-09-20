-- INVERSE of migrations/campaign/orgdel_an_organization_says_what_it_holds.sql (lane ORG-DELETE).
-- It puts back the exact state before that file: no door that says what an organization holds,
-- and no supported way to empty one — so an organization with records refuses the delete with
-- the database's own foreign-key string and nothing a person can act on. Running this is what
-- turns scripts/campaign-tests/orgdel_green.sql red on every PART.
drop function if exists custom.organization_clear(uuid, text, boolean);
drop function if exists custom.organization_contents(uuid);
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('organization_contents', 'organization_clear');
