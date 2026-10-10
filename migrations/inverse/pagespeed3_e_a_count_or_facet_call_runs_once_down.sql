-- chair-step: removes platform.list_rpc_once. Callers that route through it (lib/entity-list/readListRpc via supabase.schema('platform')) must be on the paged reader first.
-- inverse of campaign/pagespeed3_e_a_count_or_facet_call_runs_once.sql
set local lock_timeout = '2s';

drop function if exists platform.list_rpc_once(text, jsonb);
