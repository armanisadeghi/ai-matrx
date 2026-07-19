-- Cleanup: delete agent→surface binding edges in platform.associations whose
-- source agent no longer exists in agent.card (deleted test agents).
-- Approved by Arman 2026-07-19 (surface-manifest consolidation initiative).
--
-- Polymorphic association edges have no FK on source_id, so deleting an agent
-- leaves its binding edges behind; agent.menu_surface inner-joins agent.card
-- and silently hides them (30 of 38 edges at time of writing).
-- Idempotent: re-running deletes nothing once orphans are gone.

delete from platform.associations a
where a.source_type = 'agent'
  and a.target_type = 'surface'
  and not exists (select 1 from agent.card c where c.id = a.source_id);
