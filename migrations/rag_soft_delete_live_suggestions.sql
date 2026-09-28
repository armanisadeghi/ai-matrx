-- chair-step: suggestion rows with deleted_at are hidden from their owner, so an identical pending
-- suggestion must not remain blocked by an invisible row. Permanent acknowledgement identity is
-- intentionally unchanged: its writer ignores duplicate acknowledgements so a dismissed suggestion
-- never retriggers.
-- rag_soft_delete_live_suggestions
set local lock_timeout = '2s';

drop index if exists rag.scope_assoc_pending_uniq_created_by;
create unique index scope_assoc_pending_uniq_created_by
  on rag.scope_association_suggestions (created_by, source_kind, source_id, target_scope_id, kg_entity_id, target_scope_item_id, target_slot_name) nulls not distinct
  where deleted_at is null and status = 'pending';
drop index if exists rag.scope_item_value_pending_uniq_created_by;
create unique index scope_item_value_pending_uniq_created_by
  on rag.scope_item_value_suggestions (created_by, source_kind, source_id, target_scope_id, target_context_item_id)
  where deleted_at is null and status = 'pending';
