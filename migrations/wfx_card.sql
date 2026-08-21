-- wfx_card.sql
--
-- THE WORKFLOW CARD — the public face of a workflow.
--
-- Arman's ruling (2026-08-20): workflows adopt the AGENT sharing model verbatim.
-- The agent model was settled 2026-08-12 and is recorded in
-- features/agents/FEATURE.md:
--
--     "anything you can view, you may duplicate and run"
--
-- Two consequences, copied here without invention:
--
--  1. THE BODY IS NEVER PUBLIC. A workflow's GRAPH (nodes/edges/channels) is the
--     same kind of thing as an agent's prompt body: it is the author's craft.
--     `agent_definition_body_not_public_chk` bans `public` on agent bodies;
--     `workflow_definition_body_not_public_chk` does the same here, so the
--     invariant is enforced at the DB edge rather than by convention.
--
--  2. THE CARD IS THE PUBLIC FACE. `card_visibility` is a SECOND, independent
--     visibility that governs the card only — exactly as on agent.definition.
--     `workflow.card` mirrors `agent.card`: a view over the definition exposing
--     only card-safe columns, doing its own access filtering
--     (security_invoker=false, like its agent twin).
--
-- What the card deliberately does NOT expose: nodes, edges, viewport, channels,
-- entry_nodes, metadata. `step_count` is an AGGREGATE over nodes — it answers
-- "how big is this" without handing over a single step of the graph.
--
-- Builtins are "public" purely by living in the Matrx System org
-- (`global_readable`) — there is no `is_public` boolean here and never will be;
-- agents deleted theirs deliberately.

BEGIN;

-- 1. The card's own visibility. Independent of the body's.
ALTER TABLE workflow.definition
  ADD COLUMN IF NOT EXISTS card_visibility platform.visibility
  NOT NULL DEFAULT 'internal'::platform.visibility;

-- 2. THE INVARIANT: a workflow body is never anon-readable.
--    Verified 2026-08-20 against db.matrxserver.com: 0 of 146 live definitions
--    are `public` (136 internal, 10 personal), so this validates clean.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workflow_definition_body_not_public_chk'
      AND conrelid = 'workflow.definition'::regclass
  ) THEN
    ALTER TABLE workflow.definition
      ADD CONSTRAINT workflow_definition_body_not_public_chk
      CHECK (visibility <> 'public'::platform.visibility);
  END IF;
END $$;

-- 3. The card view — the shape of agent.card, column-for-column in intent.
CREATE OR REPLACE VIEW workflow.card
WITH (security_invoker = false) AS
  SELECT
    id,
    name,
    description,
    category,
    tags,
    -- What you must give it to run it. The agent twin exposes
    -- variable_definitions for the same reason: you cannot decide whether to
    -- duplicate something without knowing what it asks of you.
    variables,
    -- How big it is, WITHOUT the graph itself.
    coalesce(jsonb_array_length(nodes), 0) AS step_count,
    is_active,
    version,
    created_at,
    updated_at,
    created_by,
    organization_id,
    card_visibility
  FROM workflow.definition d
  WHERE deleted_at IS NULL
    AND (
      (SELECT auth.uid()) = created_by
      OR card_visibility = 'public'::platform.visibility
      OR (card_visibility >= 'internal'::platform.visibility
          AND organization_id IS NOT NULL
          AND iam.has_org_access(organization_id))
      OR has_permission('workflow_card'::text, id, 'viewer'::permission_level)
    );

-- Grants mirror agent.card exactly: the card is the one workflow surface an
-- anonymous visitor may read.
GRANT SELECT ON workflow.card TO anon, authenticated;

-- 4. Register the card's canonical entity identity before making it shareable.
--    The shareable registry guard requires every resource_type to already be
--    a live platform.entity_types token.
INSERT INTO platform.entity_types (
  token, schema_name, table_name, label,
  is_component, is_active, is_listed
) VALUES (
  'workflow_card', 'workflow', 'card', 'Workflow Card',
  true, true, false
)
ON CONFLICT (token) DO UPDATE SET
  schema_name = EXCLUDED.schema_name,
  table_name  = EXCLUDED.table_name,
  label       = EXCLUDED.label,
  is_component = EXCLUDED.is_component,
  is_active   = true;

-- 5. Register the card as a shareable resource, alongside agent_card.
INSERT INTO platform.shareable_resource_registry (
  resource_type, schema_name, table_name, id_column, owner_column,
  is_public_column, display_label, url_path_template,
  rls_uses_has_permission, is_active, content_role, is_scopeable,
  public_columns, is_link_shareable, notes
) VALUES (
  'workflow_card', 'workflow', 'card', 'id', 'created_by',
  NULL, 'Workflow Card', '',
  true, true, 'utility', false,
  ARRAY['id','name','description','category','tags','variables','step_count','created_at','updated_at'],
  true,
  'The public face of a workflow. The definition body (nodes/edges) is never public — workflow_definition_body_not_public_chk enforces it.'
)
ON CONFLICT (resource_type) DO UPDATE SET
  schema_name             = EXCLUDED.schema_name,
  table_name              = EXCLUDED.table_name,
  id_column               = EXCLUDED.id_column,
  owner_column            = EXCLUDED.owner_column,
  display_label           = EXCLUDED.display_label,
  rls_uses_has_permission = EXCLUDED.rls_uses_has_permission,
  is_active               = EXCLUDED.is_active,
  content_role            = EXCLUDED.content_role,
  is_scopeable            = EXCLUDED.is_scopeable,
  public_columns          = EXCLUDED.public_columns,
  is_link_shareable       = EXCLUDED.is_link_shareable,
  notes                   = EXCLUDED.notes,
  updated_at              = now();

COMMIT;

NOTIFY pgrst, 'reload schema';
