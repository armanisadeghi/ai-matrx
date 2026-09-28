-- chair-step: suggestion and acknowledgement rows with deleted_at are hidden from their owner, so
-- an identical live row must not remain blocked by an invisible one. An acknowledgement is a
-- dismissal only while it is live: after a deliberate soft delete, the next dismissal creates a
-- new live acknowledgement. Its client writer uses insert plus duplicate-as-success (not an
-- ON CONFLICT target), because PostgreSQL cannot infer this partial unique index from columns alone.
-- rag_soft_delete_live_suggestions
set local lock_timeout = '2s';

drop index if exists rag.kg_suggestion_ack_created_by_suggestion_key;
create unique index kg_suggestion_ack_created_by_suggestion_key
  on rag.kg_suggestion_ack (created_by, suggestion_id)
  where deleted_at is null;

drop index if exists rag.scope_assoc_pending_uniq_created_by;
create unique index scope_assoc_pending_uniq_created_by
  on rag.scope_association_suggestions (created_by, source_kind, source_id, target_scope_id, kg_entity_id, target_scope_item_id, target_slot_name) nulls not distinct
  where deleted_at is null and status = 'pending';
drop index if exists rag.scope_item_value_pending_uniq_created_by;
create unique index scope_item_value_pending_uniq_created_by
  on rag.scope_item_value_suggestions (created_by, source_kind, source_id, target_scope_id, target_context_item_id)
  where deleted_at is null and status = 'pending';
