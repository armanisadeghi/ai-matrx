-- War Room context-scope membership → the reversed `→ scope` association edge.
--
-- A war-room thread/room carries its context scopes in a `context_scope_ids`
-- jsonb array on the row. In the unified model, "this thread is in scope X" is a
-- REVERSED edge `thread → scope` (the thread/room is the member, the scope is the
-- container — opposite direction to content attachments).
--
-- We do NOT write `platform.associations` directly. We write the canonical
-- "tag with a scope" record — `public.ctx_scope_assignments` — whose
-- `_mirror_assoc` trigger (platform._mirror_m2m_to_assoc) produces the
-- `thread/war_room → scope` edge for free, resolving org from `ctx_scopes`.
-- This is the established scope-tagging path, NOT a parallel writer (R1).
--
-- Additive + idempotent (ON CONFLICT on the unique (scope_id, entity_type,
-- entity_id)). Stale scope ids (not in ctx_scopes) are skipped so the FK never
-- trips. Safe to re-run before deploy to capture test-session stragglers.

-- thread → scope (each tile's context scopes)
insert into public.ctx_scope_assignments (scope_id, entity_type, entity_id, created_by)
select distinct (s.value)::uuid, 'thread', t.id, t.created_by
from public.ctx_war_room_tiles t
cross join lateral jsonb_array_elements_text(t.context_scope_ids) s(value)
where t.is_deleted = false
  and t.context_scope_ids is not null
  and jsonb_array_length(t.context_scope_ids) > 0
  and exists (select 1 from public.ctx_scopes c where c.id = (s.value)::uuid)
on conflict (scope_id, entity_type, entity_id) do nothing;

-- war_room → scope (each room's context scopes)
insert into public.ctx_scope_assignments (scope_id, entity_type, entity_id, created_by)
select distinct (s.value)::uuid, 'war_room', ss.id, ss.created_by
from public.ctx_war_room_sessions ss
cross join lateral jsonb_array_elements_text(ss.context_scope_ids) s(value)
where ss.is_deleted = false
  and ss.context_scope_ids is not null
  and jsonb_array_length(ss.context_scope_ids) > 0
  and exists (select 1 from public.ctx_scopes c where c.id = (s.value)::uuid)
on conflict (scope_id, entity_type, entity_id) do nothing;
