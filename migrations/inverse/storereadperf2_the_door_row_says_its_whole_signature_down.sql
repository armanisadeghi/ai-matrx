-- chair-step: the inverse of migrations/campaign/storereadperf2_the_door_row_says_its_whole_signature.sql (lane STORE-READ-PERF-2) — puts the door row's earlier signature text back.

set local lock_timeout = '30s';

update platform.client_callable_door
   set identity_args = 'p_organization_id uuid, p_record_id uuid, p_by_id boolean, p_levels jsonb, p_cache jsonb'
 where schema_name = 'custom' and function_name = '_read_record_with'
   and declared_by = 'storereadperf2_the_rung_is_asked_once_per_class.sql';
