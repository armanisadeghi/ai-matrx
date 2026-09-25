-- chair-step: lane STORE-READ-PERF-2 — the platform.client_callable_door row this lane wrote for custom._read_record_with (storereadperf2_the_rung_is_asked_once_per_class.sql) stored its signature without the two OUT parameters, so check:store-doors-decide census "door rows whose stored signature is not what the catalog renders" named it. This stores the text the catalog renders. One registry row of this lane's own; no function, grant or data is touched. Inverse: migrations/inverse/storereadperf2_the_door_row_says_its_whole_signature_down.sql.
-- target: branch,production
-- lane: STORE-READ-PERF-2

set local lock_timeout = '30s';

update platform.client_callable_door
   set identity_args = 'p_organization_id uuid, p_record_id uuid, p_by_id boolean, p_levels jsonb, p_cache jsonb, OUT o_doc jsonb, OUT o_cache jsonb'
 where schema_name = 'custom' and function_name = '_read_record_with'
   and declared_by = 'storereadperf2_the_rung_is_asked_once_per_class.sql';
