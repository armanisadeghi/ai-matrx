-- crm_ui_surface_chasebox_draft_reviewer.sql
-- Fill the `draft_reviewer` role default on matrx-user/crm-chasebox
-- (outreach-system WP5 round 4, IC-7).
--
-- WP1 declared the role with defaultAgentId NULL and asked WP5 to author and
-- bind the agent. `outreach_draft_reviewer` (fa6a4506-…) is that agent: a
-- builtin authored through the sanctioned factory, conversational per D-W5-3
-- (zero variables, system prompt only), with a public card so `agent.card`
-- admits it for a normal authenticated user.
--
-- Mirrors features/surfaces/manifests/crm-chasebox.manifest.ts (the source of
-- truth); regenerated with scripts/emit-surface-sync-sql.ts. Idempotent.

INSERT INTO ui.ui_surface_agent_role (
  surface_name, name, label, description, kind, default_agent_id,
  max_agents, allow_custom, auto_run, sort_order
) VALUES (
  'matrx-user/crm-chasebox',
  'draft_reviewer',
  'Draft reviewer',
  'Reads a held draft beside its personalization evidence and says whether the claim is actually supported by the quoted fact and source page, then suggests a better line. Never approves, sends, or edits — it hands wording to the human.',
  'single',
  'fa6a4506-a658-41c0-9094-8a370e490849',
  1,
  true,
  'user-choice',
  100
)
ON CONFLICT (surface_name, name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  kind = EXCLUDED.kind,
  default_agent_id = EXCLUDED.default_agent_id,
  max_agents = EXCLUDED.max_agents,
  allow_custom = EXCLUDED.allow_custom,
  auto_run = EXCLUDED.auto_run,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Readiness moves partial -> verified: the role now carries an agent and the
-- pairing was proven against a real draft + evidence pair.
UPDATE ui.ui_surface
SET readiness = 'verified',
    readiness_note = 'Read vocabulary verified against crm_chasebox_items + the draft review dialog; emitter and assist strip both mounted on ChaseboxPage. draft_reviewer carries its default agent (outreach_draft_reviewer, WP5 round 4) and was proven against a real draft + evidence pair. Note: draft_body and visible_items are autoContext:false, so they arrive DEFERRED — verify them with retrieval allowed or an emitter that works looks broken.',
    updated_at = now()
WHERE name = 'matrx-user/crm-chasebox';
