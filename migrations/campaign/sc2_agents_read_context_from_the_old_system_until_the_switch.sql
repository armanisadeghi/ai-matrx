-- target: branch,production
-- additive: yes
--   It ADDS one knob row, `custom/agent_context_reads_the_copy`, default FALSE. Nothing else.
--   The inverse is `migrations/inverse/sc2_agents_read_context_from_the_old_system_until_the_switch_down.sql`.
-- guard: custom/system_enabled
--
-- LANE SC-2' — WHICH SYSTEM ANSWERS AN AGENT'S CONTEXT (SCOPES-CONTEXT-TRANSITION.md rev 2).
--
-- THE USE CASE. The record store now holds a copy of every organization's scopes that follows
-- the current screens. Before anyone's agents read from it, the owner compares the two side by
-- side. So an agent's context assembly asks this knob for the turn's organization: off — the
-- default, for every organization — and the current context system answers exactly as it does
-- today; on, and the record store's copy answers (every contributing scope checked for the
-- person, lane SC-3'). The owner reserved the switch for himself, so this is the one capability
-- knob that defaults off (the named exception to "store on by default").

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'agent_context_reads_the_copy', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Agents read their context from the record store''s copy of the scopes',
   'Off (the default): every agent turn gets its scopes and context from the current context system, '
   'exactly as today. On: the turn is answered by the record store''s copy of this organization''s '
   'scopes, which follows every edit made in the current screens, and every contributing scope is '
   'checked for the person running the agent. If the copy cannot answer, the current system answers '
   'and the failure is recorded. Stays off until the owner has compared the two side by side.',
   'agent', 'Unified data program, lane SC-2'', 2026-09-24: the owner reserved the switch to the new context system for himself; until he validates, the old path answers.',
   '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict do nothing;
