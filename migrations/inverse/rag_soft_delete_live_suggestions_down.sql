-- chair-step: inverse of migrations/rag_soft_delete_live_suggestions.sql. Only the two pending
-- suggestion indexes changed. Their former identities apply to pending rows exactly: expired and
-- rejected rows may legally coexist with the same key and must not refuse this inverse.
-- rag_soft_delete_live_suggestions_down
set local lock_timeout = '2s';

do $inverse$
begin
  if exists (
    select 1 from rag.scope_association_suggestions
    where status = 'pending'
    group by created_by, source_kind, source_id, target_scope_id, kg_entity_id, target_scope_item_id, target_slot_name
    having count(*) > 1
  ) then
    raise exception 'RAG soft-delete inverse refused: association suggestion identities collide across live or deleted rows';
  end if;
  if exists (
    select 1 from rag.scope_item_value_suggestions
    where status = 'pending'
    group by created_by, source_kind, source_id, target_scope_id, target_context_item_id
    having count(*) > 1
  ) then
    raise exception 'RAG soft-delete inverse refused: value suggestion identities collide across live or deleted rows';
  end if;
end
$inverse$;

drop index if exists rag.scope_assoc_pending_uniq_created_by;
create unique index scope_assoc_pending_uniq_created_by
  on rag.scope_association_suggestions (created_by, source_kind, source_id, target_scope_id, kg_entity_id, target_scope_item_id, target_slot_name) nulls not distinct
  where status = 'pending';

drop index if exists rag.scope_item_value_pending_uniq_created_by;
create unique index scope_item_value_pending_uniq_created_by
  on rag.scope_item_value_suggestions (created_by, source_kind, source_id, target_scope_id, target_context_item_id)
  where status = 'pending';
