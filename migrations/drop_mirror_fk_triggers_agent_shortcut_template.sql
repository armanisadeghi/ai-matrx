-- Drop the four platform._mirror_fk_to_assoc triggers on agent.shortcut and
-- agent.template. The physical-FK→association mirror pattern is forbidden
-- (CLAUDE.md § Forbidden relationship shortcuts): it passes a table name where
-- the association system requires a canonical entity token and creates two
-- competing relationship authorities.
--
-- Verified before drop (2026-08-12): 0 of 206 agent.shortcut rows and 0 of 11
-- agent.template rows carry project_id/task_id, and platform.associations holds
-- ZERO edges between shortcut/agent_template and project/task — the triggers
-- never mirrored anything. The shared platform._mirror_fk_to_assoc function is
-- deliberately KEPT: 11 other triggers on 7 other tables still reference it.
--
-- Idempotent.

drop trigger if exists _mirror_proj on agent.shortcut;
drop trigger if exists _mirror_task on agent.shortcut;
drop trigger if exists _mirror_proj on agent.template;
drop trigger if exists _mirror_task on agent.template;
