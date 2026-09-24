-- chair-step: the inverse of sc1p_every_table_a_feature_made_says_so.sql. It takes `kept_by_the_app` and `kept_for` back off exactly the live Table documents the backfill stamped — the ones whose stored `kept_for` is the very word the older facts on the same document already say (custom.table_kept_for_derived). A choices Table custom._options_table_for or the user-tables mover flagged before SC-1 carries no `kept_for` and keeps its flag; a scope-type Table the scopes mover marks `kept_for: "context"` has no older fact that says so and keeps both. (A scope's own Table stamped on the way in by the SC-1 body of custom.scope_table_provision also matches, and is un-stamped with it — the state before SC-1.) No other key of any document is changed.
-- lane: SC-1
-- lock: custom

set local lock_timeout = '10s';
set local statement_timeout = '300s';

update custom.record r
   set data = r.data - 'kept_by_the_app' - 'kept_for'
 where r.table_id = custom.table_kernel_id()
   and r.data_class = 'table'
   and r.deleted_at is null
   and r.data ->> 'kept_by_the_app' = 'true'
   and r.data ? 'kept_for'
   and r.data ->> 'kept_for' = custom.table_kept_for_derived(r.data, false,
         coalesce(custom.table_is_options_table(r.organization_id, r.id), false));
