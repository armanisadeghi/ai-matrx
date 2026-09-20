-- chair-step: it UPDATEs two rows of platform.client_callable_door, which no allow-list admits
-- and no knob can hold OFF. Census 9 of `pnpm check:store-doors-decide` — "door rows whose
-- stored signature is not what the catalog renders" — went red the moment
-- ladderperf_a_partitioned_row_is_probed_by_a_cached_plan.sql landed, naming both rows this lane
-- had just written:
--
--   iam.registry_owner_of        stored 'p_resource_type text, p_id uuid'
--                                catalog 'p_resource_type text, p_id uuid, OUT o_handled boolean, OUT o_owner uuid'
--   platform.partitioned_row_attrs stored 'p_schema text, p_table text, p_id uuid'
--                                catalog '… , OUT o_handled boolean, OUT o_vis platform.visibility, …'
--
-- `pg_get_function_identity_arguments` RENDERS THE OUT PARAMETERS for a function declared with
-- them, and the declaration must be what the catalogue says or the census cannot tell a door
-- that moved from a door that was written down wrong. This takes the words from the catalogue
-- itself rather than re-typing them, so it cannot be wrong in the same way twice; it changes no
-- access decision and opens nothing — `signed_in_callers` and `anonymous_callers` stay false on
-- both rows.

update platform.client_callable_door d
   set identity_args = pg_catalog.pg_get_function_identity_arguments(p.oid)
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 where n.nspname = d.schema_name
   and p.proname = d.function_name
   and (d.schema_name, d.function_name) in (('iam', 'registry_owner_of'),
                                            ('platform', 'partitioned_row_attrs'))
   and d.identity_args is distinct from pg_catalog.pg_get_function_identity_arguments(p.oid);
