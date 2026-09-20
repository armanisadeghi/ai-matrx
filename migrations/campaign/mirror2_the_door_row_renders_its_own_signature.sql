-- chair-step: it UPDATEs one live row of platform.client_callable_door, which the production
-- allow-list admits only as an INSERT. The row is this lane's own, landed minutes earlier by
-- mirror2_the_mirror_asks_one_organization_once_a_statement.sql, and the correction is taken
-- FROM THE CATALOGUE rather than re-typed: census 9 of `pnpm check:store-doors-decide` compares
-- the stored `identity_args` against `pg_get_function_identity_arguments`, which renders
-- `platform.visibility` (the type is not on the door's search_path) where the row was written
-- `visibility`. Nothing about who may call the door changes — the identity_argtypes, the flags
-- and the reason are untouched. Its inverse is
-- migrations/inverse/mirror2_the_door_row_renders_its_own_signature_down.sql.
--
-- THE SAME DEFECT LADDER-PERF HIT ON ITS OWN TWO DOOR ROWS at 14:26:56Z, in the same shape and
-- for the same reason. It is a class: a door row written by hand renders its signature the way
-- a person types it; the catalogue renders it the way PostgreSQL does. The fix is always to ask
-- the catalogue.

update platform.client_callable_door d
   set identity_args = pg_catalog.pg_get_function_identity_arguments(p.oid)
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 where d.schema_name = 'iam'
   and d.function_name = 'record_visible_in_org'
   and n.nspname = d.schema_name
   and p.proname = d.function_name
   and platform.door_argtypes(p.proargtypes) = d.identity_argtypes
   and d.identity_args is distinct from pg_catalog.pg_get_function_identity_arguments(p.oid);
