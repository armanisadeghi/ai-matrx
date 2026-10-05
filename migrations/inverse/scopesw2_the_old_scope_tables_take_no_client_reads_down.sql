-- INVERSE of migrations/campaign/scopesw2_the_old_scope_tables_take_no_client_reads.sql (lane FINISH-THE-SWITCH): re-grants the exact pre-image read from pg_class.relacl on production 2026-10-05 04:08Z.
-- chair-step: PERMISSION CHANGE — restores authenticated's SELECT/INSERT/UPDATE/DELETE on the old scope tables as production held them.

GRANT SELECT ON TABLE context.context_item_values TO authenticated;
GRANT DELETE ON TABLE context.context_items TO authenticated;
GRANT INSERT ON TABLE context.context_items TO authenticated;
GRANT SELECT ON TABLE context.context_items TO authenticated;
GRANT UPDATE ON TABLE context.context_items TO authenticated;
GRANT DELETE ON TABLE context.context_value_refs TO authenticated;
GRANT INSERT ON TABLE context.context_value_refs TO authenticated;
GRANT SELECT ON TABLE context.context_value_refs TO authenticated;
GRANT UPDATE ON TABLE context.context_value_refs TO authenticated;
GRANT DELETE ON TABLE context.scope_dataset_instances TO authenticated;
GRANT INSERT ON TABLE context.scope_dataset_instances TO authenticated;
GRANT SELECT ON TABLE context.scope_dataset_instances TO authenticated;
GRANT UPDATE ON TABLE context.scope_dataset_instances TO authenticated;
GRANT DELETE ON TABLE context.scope_types TO authenticated;
GRANT INSERT ON TABLE context.scope_types TO authenticated;
GRANT SELECT ON TABLE context.scope_types TO authenticated;
GRANT UPDATE ON TABLE context.scope_types TO authenticated;
GRANT DELETE ON TABLE context.scopes TO authenticated;
GRANT INSERT ON TABLE context.scopes TO authenticated;
GRANT SELECT ON TABLE context.scopes TO authenticated;
GRANT UPDATE ON TABLE context.scopes TO authenticated;
