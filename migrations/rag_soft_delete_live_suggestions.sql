-- chair-step: suggestion rows with deleted_at are hidden from their owner, so pending identities
-- must be unique only while live. `rag.kg_suggestion_ack` is deliberately untouched: its existing
-- composite primary key (user_id, suggestion_id) is a lifetime identity and the client explicitly
-- revives that row with an upsert when the same person dismisses it again.
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
