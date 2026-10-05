-- chair-step: the six old scope tables lose their 58 old-row triggers (nothing writes those rows since scopesfts1f_the_scope_doors_write_no_old_row.sql) and the 7 functions only those triggers ran are dropped (0 callers: bodies, triggers on any other table, views, policies, cron, five repos). Effect: none on any door — the store writes are the only writes. Proven up → down → up in one rolled-back transaction on live (the clone is a restore from before tonight's scope files).
-- lane: FINISH-THE-SWITCH (FTS-1f, old-row writes off, item 3)
-- window-class: 58 DROP TRIGGER on the six context.* tables take each table's ACCESS EXCLUSIVE lock (plus the supautils set) for milliseconds; 01:00-04:00 Pacific at production, lock_timeout 5s, retry on timeout. Nothing on platform.associations or auth.*.
-- lock: context,public
--
-- Inverse: migrations/inverse/scopesfts1f_the_old_scope_rows_lose_their_triggers_down.sql.


DROP TRIGGER _stamp_actor_tier ON context.context_item_values;
DROP TRIGGER custom_fields_validation ON context.context_item_values;
DROP TRIGGER trg_ctx_validate_value_scope_type ON context.context_item_values;
DROP TRIGGER trg_ctx_version_context_item_value ON context.context_item_values;
DROP TRIGGER zz_follow_to_the_copy ON context.context_item_values;
DROP TRIGGER _gc_assoc_harddelete ON context.context_items;
DROP TRIGGER _gc_assoc_softdelete ON context.context_items;
DROP TRIGGER _guard_soft_delete_parent ON context.context_items;
DROP TRIGGER _history ON context.context_items;
DROP TRIGGER _stamp_actor ON context.context_items;
DROP TRIGGER _stamp_actor_tier ON context.context_items;
DROP TRIGGER _touch_row ON context.context_items;
DROP TRIGGER context_items_compute_review ON context.context_items;
DROP TRIGGER context_items_updated_at ON context.context_items;
DROP TRIGGER custom_fields_validation ON context.context_items;
DROP TRIGGER enforce_context_item_reference_source ON context.context_items;
DROP TRIGGER ensure_slug ON context.context_items;
DROP TRIGGER provision_scope_datasets_on_item ON context.context_items;
DROP TRIGGER trg_sweep_notify_context_item ON context.context_items;
DROP TRIGGER zz_follow_to_the_copy ON context.context_items;
DROP TRIGGER _stamp_actor_tier ON context.context_value_refs;
DROP TRIGGER custom_fields_validation ON context.context_value_refs;
DROP TRIGGER _stamp_actor_tier ON context.scope_dataset_instances;
DROP TRIGGER custom_fields_validation ON context.scope_dataset_instances;
DROP TRIGGER _cascade_softdelete ON context.scope_types;
DROP TRIGGER _gc_assoc_harddelete ON context.scope_types;
DROP TRIGGER _gc_assoc_softdelete ON context.scope_types;
DROP TRIGGER _guard_soft_delete_parent ON context.scope_types;
DROP TRIGGER _history ON context.scope_types;
DROP TRIGGER _search_item_sync ON context.scope_types;
DROP TRIGGER _stamp_actor ON context.scope_types;
DROP TRIGGER _stamp_actor_tier ON context.scope_types;
DROP TRIGGER _touch_row ON context.scope_types;
DROP TRIGGER custom_fields_validation ON context.scope_types;
DROP TRIGGER ensure_slug ON context.scope_types;
DROP TRIGGER set_updated_at ON context.scope_types;
DROP TRIGGER trg_sweep_notify_scope_type ON context.scope_types;
DROP TRIGGER zz_follow_to_the_copy ON context.scope_types;
DROP TRIGGER _a0_t13_dual_write ON context.scopes;
DROP TRIGGER _cascade_softdelete ON context.scopes;
DROP TRIGGER _gc_assoc_harddelete ON context.scopes;
DROP TRIGGER _gc_assoc_softdelete ON context.scopes;
DROP TRIGGER _gc_scope_assoc ON context.scopes;
DROP TRIGGER _guard_governance ON context.scopes;
DROP TRIGGER _guard_soft_delete_parent ON context.scopes;
DROP TRIGGER _history ON context.scopes;
DROP TRIGGER _search_item_sync ON context.scopes;
DROP TRIGGER _stamp_actor ON context.scopes;
DROP TRIGGER _stamp_actor_tier ON context.scopes;
DROP TRIGGER _t13_count_row_column_writes ON context.scopes;
DROP TRIGGER _touch_row ON context.scopes;
DROP TRIGGER custom_fields_validation ON context.scopes;
DROP TRIGGER ensure_slug ON context.scopes;
DROP TRIGGER provision_scope_datasets_on_scope ON context.scopes;
DROP TRIGGER set_updated_at ON context.scopes;
DROP TRIGGER trg_ctx_validate_scope_parent ON context.scopes;
DROP TRIGGER trg_sweep_notify_scope ON context.scopes;
DROP TRIGGER zz_follow_to_the_copy ON context.scopes;

DROP FUNCTION _notify_suggestion_sweep_context_item();
DROP FUNCTION context._follow_to_the_copy();
DROP FUNCTION context.enforce_context_item_reference_source();
DROP FUNCTION context.provision_scope_datasets_trigger();
DROP FUNCTION ctx_validate_scope_parent();
DROP FUNCTION ctx_validate_value_scope_type();
DROP FUNCTION ctx_version_context_item_value();
