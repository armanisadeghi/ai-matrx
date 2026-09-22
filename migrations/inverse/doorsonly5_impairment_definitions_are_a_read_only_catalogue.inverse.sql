-- chair-step: DOORS-ONLY-5 inverse — clears `client_read_only` on
-- legal.wc_impairment_definition and regenerates, which RE-GRANTS `authenticated` INSERT,
-- UPDATE and DELETE on a 215-row global reference catalogue and re-emits its std_insert /
-- std_update / std_delete policies. That is the state in which any signed-in user could empty
-- the AMA Guides vocabulary every permanent-disability rating in this product is computed
-- against. There is no client writer to restore — the table is read through a server-side RPC —
-- so run this only to undo a closure that broke a real path, and say which path.

set lock_timeout = '2s';
set statement_timeout = '600s';

update platform.entity_types
   set client_read_only = false
 where schema_name = 'legal' and table_name = 'wc_impairment_definition';

select iam.apply_rls('legal', 'wc_impairment_definition', 'wc_impairment_definition', 'system');
