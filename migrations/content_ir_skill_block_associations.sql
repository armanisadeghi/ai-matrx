-- content_ir_skill_block_associations.sql
-- migrate: skip: pending Arman approval of the content_block->skill association_types rule (direction + conveyance are his call via /administration/relationships). Remove this line + apply Section 1 once approved.
-- Shape System R9: link each gold-mine kind's render_block SKILL (skill.definition)
-- to its TWO teaching content blocks (public.content_blocks, simple + full) via
-- platform.associations, so the platform knows which blocks teach which skill.
--
-- STATUS: STAGED — NOT APPLIED, NOT LEDGERED.
--   A hard prerequisite (Section 1) is a product-semantics decision reserved for
--   Arman and lies outside the orchestrator's write-scope. See the BLOCKER below.
--   Do not `apply_migration` this file until Section 1 is approved. Once approved,
--   the whole file is idempotent and safe to re-run.
--
-- ============================================================================
-- BLOCKER (why this is staged, not live)
-- ============================================================================
-- platform.associations enforces two BEFORE-INSERT triggers:
--   * trg_associations_enforce_known -> platform.enforce_known_association()
--       raises check_violation for any (source_type,target_type) pair that is
--       NOT registered + active in platform.association_types.
--   * trg_associations_auto_orient   -> platform.enforce_association_direction()
--       rejects the wrong-way write of a REGISTERED pair.
-- The pair (content_block -> skill) is registered in NEITHER direction today,
-- so EVERY edge insert (via the assoc_add RPC or a direct INSERT) fails until the
-- pair exists. Registering an association_types pair encodes DIRECTION +
-- CONVEYANCE (container_side / conveys_max) — a hierarchy/conveyance decision that
-- is Arman's call via /administration/relationships, and is outside the scope this
-- migration was authorized to touch (platform.associations rows only). Hence the
-- pair-registration in Section 1 is written out but left for human approval.
--
-- Verified live 2026-07-07 (project txzxabzwovsujtloxrus):
--   * tokens: skill -> skill.definition, content_block -> public.content_blocks
--     (both is_active=true).
--   * 10 skills (skill_id kind_<slug>) + 20 blocks (block_id kind-<slug>-simple/-full)
--     all present, all org 39c38960-d30c-4840-b0c1-c9960de95582.
--   * 0 pre-existing content_block<->skill edges.
--   * Direction chosen per canonical-associations doctrine ("content/child points to
--     container; little -> big"): the block is the teaching part, the skill is the
--     concept it belongs to -> content_block (source) -> skill (target). This mirrors
--     the only structural analog already in the registry: fc_card -> fc_set.
--
-- ============================================================================
-- Section 1 — REQUIRES ARMAN APPROVAL: register the direction pair (neutral)
-- ============================================================================
-- Neutral registration: container_side='none' (no access cascade — these are
-- platform-global builtins), conveys_max='viewer' (least privilege; moot under
-- container_side='none' — the column default is 'editor', which we deliberately
-- do NOT use). Adjust direction/conveyance in /administration/relationships if
-- this relationship should convey access. Idempotent: PK is
-- (source_type, target_type, label); label NULL.
--
INSERT INTO platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
SELECT 'content_block', 'skill', NULL, 'none', 'viewer', true,
       'Shape System R9: a content block teaches a render_block skill. Direction content_block->skill per canonical-associations doctrine (part->container); mirrors fc_card->fc_set. container_side=none (global builtins, no access cascade). Review conveyance in /administration/relationships.'
WHERE NOT EXISTS (
  SELECT 1 FROM platform.association_types
  WHERE source_type='content_block' AND target_type='skill' AND label IS NULL
);

-- ============================================================================
-- Section 2 — the 20 edges (2 per kind): content_block -> skill
-- ============================================================================
-- Direct INSERT is the canonical MIGRATION path for platform.associations
-- (Recipe A-DB); the assoc_add RPC is the RUNTIME path and cannot run here
-- (it requires an authenticated org context / iam.has_org_access, absent under
-- an admin/MCP apply). Rows are keyed by the stable string ids (skill_id /
-- block_id) and joined to their UUIDs live, so the file is correct-by-construction.
-- Idempotent via ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING.
-- position: 0 = simple, 1 = full. role left NULL (edges are distinct on source_id).
--
INSERT INTO platform.associations
  (source_type, source_id, target_type, target_id, organization_id, role, label, position, metadata, created_by)
SELECT
  'content_block'            AS source_type,
  cb.id                      AS source_id,
  'skill'                    AS target_type,
  sd.id                      AS target_id,
  cb.organization_id         AS organization_id,
  NULL                       AS role,
  NULL                       AS label,
  m.pos                      AS position,
  jsonb_build_object(
    'purpose', 'teaches_skill',
    'kind', m.kind,
    'variant', m.variant,
    'source', 'content_ir_skill_block_associations.sql'
  )                          AS metadata,
  sd.created_by              AS created_by
FROM (
  VALUES
    -- kind,                    skill_id (kind_<slug>),        block_id (kind-<slug>-*),               variant,   pos
    ('timeline',                'kind_timeline',               'kind-timeline-simple',                 'simple',  0),
    ('timeline',                'kind_timeline',               'kind-timeline-full',                   'full',    1),
    ('cooking_recipe',          'kind_cooking_recipe',         'kind-cooking-recipe-simple',           'simple',  0),
    ('cooking_recipe',          'kind_cooking_recipe',         'kind-cooking-recipe-full',             'full',    1),
    ('troubleshooting_guide',   'kind_troubleshooting_guide',  'kind-troubleshooting-guide-simple',    'simple',  0),
    ('troubleshooting_guide',   'kind_troubleshooting_guide',  'kind-troubleshooting-guide-full',      'full',    1),
    ('resource_collection',     'kind_resource_collection',    'kind-resource-collection-simple',      'simple',  0),
    ('resource_collection',     'kind_resource_collection',    'kind-resource-collection-full',        'full',    1),
    ('research_report',         'kind_research_report',        'kind-research-report-simple',          'simple',  0),
    ('research_report',         'kind_research_report',        'kind-research-report-full',            'full',    1),
    ('progress_tracker',        'kind_progress_tracker',       'kind-progress-tracker-simple',         'simple',  0),
    ('progress_tracker',        'kind_progress_tracker',       'kind-progress-tracker-full',           'full',    1),
    ('structured_info',         'kind_structured_info',        'kind-structured-info-simple',          'simple',  0),
    ('structured_info',         'kind_structured_info',        'kind-structured-info-full',            'full',    1),
    ('task_list',               'kind_task_list',              'kind-task-list-simple',                'simple',  0),
    ('task_list',               'kind_task_list',              'kind-task-list-full',                  'full',    1),
    ('transcript',              'kind_transcript',             'kind-transcript-simple',               'simple',  0),
    ('transcript',              'kind_transcript',             'kind-transcript-full',                 'full',    1),
    ('mermaid_diagram',         'kind_mermaid_diagram',        'kind-mermaid-diagram-simple',          'simple',  0),
    ('mermaid_diagram',         'kind_mermaid_diagram',        'kind-mermaid-diagram-full',            'full',    1)
) AS m(kind, skill_id, block_id, variant, pos)
JOIN skill.definition        sd ON sd.skill_id  = m.skill_id AND sd.deleted_at IS NULL
JOIN public.content_blocks   cb ON cb.block_id  = m.block_id AND cb.deleted_at IS NULL
ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

-- ============================================================================
-- Section 3 — verify (run after apply; expect 20 total, 2 per kind)
-- ============================================================================
--   SELECT a.metadata->>'kind' AS kind, count(*) AS edges
--   FROM platform.associations a
--   WHERE a.source_type='content_block' AND a.target_type='skill'
--     AND a.metadata->>'source'='content_ir_skill_block_associations.sql'
--   GROUP BY 1 ORDER BY 1;   -- 10 rows, each edges=2
