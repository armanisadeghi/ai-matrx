-- INVERSE of migrations/campaign/scopesw3_the_old_scope_tables_move_to_deprecated.sql (lane FINISH-THE-SWITCH): the six old scope tables move back to `context`, with everything that moved with them.
-- chair-step: moves context.scopes, scope_types, context_items, context_item_values, context_value_refs, scope_dataset_instances back from `deprecated`.
alter table deprecated.scopes set schema context;
alter table deprecated.scope_types set schema context;
alter table deprecated.context_items set schema context;
alter table deprecated.context_item_values set schema context;
alter table deprecated.context_value_refs set schema context;
alter table deprecated.scope_dataset_instances set schema context;
