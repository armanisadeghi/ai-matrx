-- chair-step: inverse of migrations/rag_soft_delete_live_suggestions.sql. Restoring any former
-- global identity is safe only while no deleted row collides with a live row on that identity.
-- This refuses rather than deleting, merging, or silently selecting either record.
-- rag_soft_delete_live_suggestions_down
set local lock_timeout = '2s';

do $inverse$
begin
  if exists (
    select 1 from rag.kg_suggestion_ack
    group by created_by, suggestion_id
    having count(*) > 1
  ) then
    raise exception 'RAG soft-delete inverse refused: acknowledgement identities collide across live or deleted rows';
  end if;
  if exists (
    select 1 from rag.scope_association_suggestions
    group by created_by, source_kind, source_id, target_scope_id, kg_entity_id, target_scope_item_id, target_slot_name
    having count(*) > 1
  ) then
    raise exception 'RAG soft-delete inverse refused: association suggestion identities collide across live or deleted rows';
  end if;
  if exists (
    select 1 from rag.scope_item_value_suggestions
    group by created_by, source_kind, source_id, target_scope_id, target_context_item_id
    having count(*) > 1
  ) then
    raise exception 'RAG soft-delete inverse refused: value suggestion identities collide across live or deleted rows';
  end if;
end
$inverse$;

drop index if exists rag.kg_suggestion_ack_created_by_suggestion_key;
create unique index kg_suggestion_ack_created_by_suggestion_key
  on rag.kg_suggestion_ack (created_by, suggestion_id);

drop index if exists rag.scope_assoc_pending_uniq_created_by;
create unique index scope_assoc_pending_uniq_created_by
  on rag.scope_association_suggestions (created_by, source_kind, source_id, target_scope_id, kg_entity_id, target_scope_item_id, target_slot_name) nulls not distinct
  where status = 'pending';

drop index if exists rag.scope_item_value_pending_uniq_created_by;
create unique index scope_item_value_pending_uniq_created_by
  on rag.scope_item_value_suggestions (created_by, source_kind, source_id, target_scope_id, target_context_item_id)
  where status = 'pending';
