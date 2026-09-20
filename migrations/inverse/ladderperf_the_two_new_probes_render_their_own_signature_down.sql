-- INVERSE of migrations/campaign/ladderperf_the_two_new_probes_render_their_own_signature.sql.
-- It puts the two door rows' stored signature back to the words that were written the first
-- time (the IN parameters only), which is what makes census 9 of pnpm check:store-doors-decide
-- red again.
update platform.client_callable_door
   set identity_args = 'p_resource_type text, p_id uuid'
 where schema_name = 'iam' and function_name = 'registry_owner_of';
update platform.client_callable_door
   set identity_args = 'p_schema text, p_table text, p_id uuid'
 where schema_name = 'platform' and function_name = 'partitioned_row_attrs';
