-- crm_ui_surface_role_defaults_wp5_r4.sql
-- Fill two IC-7 role seams other packages declared (outreach-system WP5 r4).
--
--   matrx-user/marketing-backlinks  keyword_expander      -> seo_keyword_expander (ed0b568d)
--     Declared by WP2 (D-W2-9) with defaultAgentId NULL; the "Expand with AI"
--     button rendered disabled until now, with manual entry carrying the flow.
--     The agent proposes PLAIN phrases only — the guest-post / resource-page
--     footprints are added by the run's own variants, and volume is measured
--     by the real lookup on that screen.
--
--   matrx-user/crm-outreach-lists   personalization_writer -> personalization_coach (2b15f237)
--     Was pointing at personalization_line_writer (67df8ca0), the STRUCTURED
--     batch writer: correct as the role's implementation, which the
--     personalization run still resolves through its own slot, but launched
--     from the chat menu it asked a non-technical user for two JSON variables
--     (the round-3 readiness finding). The batch writer is unchanged.
--
-- Both agents are builtins authored through the sanctioned factory,
-- conversational per D-W5-3, public card per the builtin invariant.
-- Mirrors the two manifests (the source of truth); regenerated with
-- scripts/emit-surface-sync-sql.ts. Idempotent.

INSERT INTO ui.ui_surface_agent_role (surface_name, name, label, description, kind, default_agent_id, max_agents, allow_custom, auto_run, sort_order) VALUES
('matrx-user/marketing-backlinks', 'keyword_expander', 'Keyword expander', 'Expands a topic into the keyword list a prospecting run should search — validated against real search volume before use.', 'single', 'ed0b568d-a32d-463c-8dc6-a6f3191ee0d2', 1, true, 'user-choice', 120),
('matrx-user/crm-outreach-lists', 'personalization_writer', 'Personalization writer', 'Explains what personalizing this campaign will do, why a particular member has no line, and how to word one that only says what the evidence says. The lines themselves are written by the validated run, from facts read on each target''s own pages — every one carrying the fact and the source page it came from.', 'single', '2b15f237-0cf7-4917-bd14-918d4bac6be8', 1, true, 'user-choice', 110)
ON CONFLICT (surface_name, name) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, kind = EXCLUDED.kind, default_agent_id = EXCLUDED.default_agent_id, max_agents = EXCLUDED.max_agents, allow_custom = EXCLUDED.allow_custom, auto_run = EXCLUDED.auto_run, sort_order = EXCLUDED.sort_order, updated_at = now();
