-- ============================================================================
-- content-ir kind `mermaid_diagram` — full fleet package (definition, examples,
-- surfaces, component, skill, content blocks).
--
-- The simplest kind in the fleet: the content is a raw Mermaid DSL string,
-- not structured JSON. Canonical shape: {"__kind":"mermaid_diagram","code",
-- "title"?}. Renders through the EXISTING MermaidBlock (legacyBlockType
-- "mermaid") via the bridge in features/content-ir/kinds/mermaid-diagram.ts.
-- Authors wanting a STRUCTURED node/edge diagram use `diagram_spec` instead.
--
-- Schemas below are CONVERTER-EMITTED (features/content-ir/convert/
-- kind-to-json-schema.ts + registry/kind-storage-transform.ts over
-- MERMAID_DIAGRAM_KIND_SCHEMA) — never hand-written. Both examples were
-- REAL-validated with Ajv Draft2020-12 against both schemas before this file
-- was written.
--
-- kind_definition has no description column — the human description (incl.
-- the diagram_spec pointer) rides metadata.description.
--
-- is_active stays FALSE until the central integration pass registers the
-- KindDefinition + fence-finalize hook (expected; the R6 resolver gate keeps
-- inactive kinds on the generic viewer). The fence_lang surface rows are
-- correct and waiting: the hosts' fence-finalize hook does not exist yet
-- (XML only today).
--
-- Live-schema notes (verified via information_schema before writing):
--   * skill.definition has NO is_public/user_id columns; version is integer,
--     semver is the varchar. organization_id NOT NULL on every table here —
--     "global" = the platform org 39c38960-….
--   * Coexist-not-clobber: block_ids are kind-mermaid-diagram-* — the 18 live
--     mermaid-* fence blocks are untouched.
--
-- Idempotent on business keys; re-apply never flips is_active.
-- ============================================================================

BEGIN;

-- ── 1. kind_definition ───────────────────────────────────────────────────────

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema,
   is_active, visibility, organization_id, metadata)
SELECT
  'mermaid_diagram',
  'Mermaid Diagram',
  'ts',
  $mtx$[{"name":"code","required":true,"type":"string"},{"name":"title","type":"string"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"code":{"type":"string"},"title":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"mermaid_diagram"}},"required":["__kind","code"],"additionalProperties":false}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"code":{"type":"string"},"title":{"type":"string"}},"required":["code"],"additionalProperties":false}$mtx$::jsonb,
  false,
  'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  $mtx${"category":"pure","description":"Raw Mermaid DSL source rendered live by MermaidBlock (flowchart, sequence, state, ER, pie, gantt, mindmap, timeline, and every other mermaid type). code is the verbatim mermaid source; title is optional. For a STRUCTURED node/edge diagram authored as JSON data (typed nodes, positions, pedigree fields), use the diagram_spec kind instead."}$mtx$::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM content_ir.kind_definition
  WHERE organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND kind = 'mermaid_diagram' AND deleted_at IS NULL
);

-- Keep the generated columns fresh on re-apply — NEVER touches is_active
-- (activation is owned by the dual gate / integration pass).
UPDATE content_ir.kind_definition SET
  label = 'Mermaid Diagram',
  authoring_owner = 'ts',
  data = $mtx$[{"name":"code","required":true,"type":"string"},{"name":"title","type":"string"}]$mtx$::jsonb,
  emitted_block_schema = $mtx${"type":"object","properties":{"code":{"type":"string"},"title":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"mermaid_diagram"}},"required":["__kind","code"],"additionalProperties":false}$mtx$::jsonb,
  emitted_json_schema = $mtx${"type":"object","properties":{"code":{"type":"string"},"title":{"type":"string"}},"required":["code"],"additionalProperties":false}$mtx$::jsonb,
  visibility = 'public',
  metadata = $mtx${"category":"pure","description":"Raw Mermaid DSL source rendered live by MermaidBlock (flowchart, sequence, state, ER, pie, gantt, mindmap, timeline, and every other mermaid type). code is the verbatim mermaid source; title is optional. For a STRUCTURED node/edge diagram authored as JSON data (typed nodes, positions, pedigree fields), use the diagram_spec kind instead."}$mtx$::jsonb,
  updated_at = now()
WHERE organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND kind = 'mermaid_diagram' AND deleted_at IS NULL;

-- ── 2. kind_example (2 rows; first canonical) ───────────────────────────────
-- Both payloads passed REAL Ajv Draft2020-12 validation against
-- emitted_block_schema (verbatim) and emitted_json_schema (__kind-stripped).

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical,
   validation_status, validated_at, organization_id)
SELECT kd.id, kd.version,
  $mtx${"__kind":"mermaid_diagram","title":"Order Fulfillment","code":"flowchart TD\n  A[Order placed] --> B{In stock?}\n  B -- Yes --> C[Pack and ship]\n  B -- No --> D[Backorder]\n  C --> E[Delivered]\n  D --> E"}$mtx$::jsonb,
  'Canonical example — small flowchart', 'authored', true, 'passed', now(),
  '39c38960-d30c-4840-b0c1-c9960de95582'
FROM content_ir.kind_definition kd
WHERE kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND kd.kind = 'mermaid_diagram' AND kd.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_example e
    WHERE e.kind_definition_id = kd.id AND e.is_canonical AND e.deleted_at IS NULL
  );

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical,
   validation_status, validated_at, organization_id)
SELECT kd.id, kd.version,
  $mtx${"__kind":"mermaid_diagram","title":"Login Handshake","code":"sequenceDiagram\n  autonumber\n  participant U as User\n  participant A as App\n  participant S as Auth Server\n  U->>A: Enter credentials\n  A->>S: POST /login\n  S-->>A: 200 + session token\n  A-->>U: Signed in"}$mtx$::jsonb,
  'Sequence diagram', 'authored', false, 'passed', now(),
  '39c38960-d30c-4840-b0c1-c9960de95582'
FROM content_ir.kind_definition kd
WHERE kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND kd.kind = 'mermaid_diagram' AND kd.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_example e
    WHERE e.kind_definition_id = kd.id AND e.label = 'Sequence diagram'
      AND e.deleted_at IS NULL
  );

-- ── 3. kind_surface: fence_lang/mermaid + fence_lang/mmd ────────────────────
-- Strategy 'mermaid_legacy_text' (features/content-ir/surfaces/
-- mermaid-legacy-text.ts). streaming=true: MermaidBlock renders progressive
-- last-good frames while the fence streams; convergence itself is
-- complete-only, like every surface.

INSERT INTO content_ir.kind_surface
  (kind_definition_id, surface_type, token, parser_strategy, streaming,
   priority, is_active, organization_id)
SELECT kd.id, 'fence_lang', v.token, 'mermaid_legacy_text', true, 100, true,
  '39c38960-d30c-4840-b0c1-c9960de95582'
FROM content_ir.kind_definition kd
CROSS JOIN (VALUES ('mermaid'), ('mmd')) AS v(token)
WHERE kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND kd.kind = 'mermaid_diagram' AND kd.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_surface s
    WHERE s.surface_type = 'fence_lang' AND s.token = v.token
      AND s.deleted_at IS NULL
  );

-- ── 4. kind_component: web/output → the existing MermaidBlock ───────────────
-- component_key = the legacyBlockType ("mermaid" — the BlockComponentRegistry
-- / splitter type string; alias fence ```mmd maps to the same type).

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source, is_default,
   is_active, organization_id)
SELECT kd.id, 'web', 'output', 'mermaid', 'bundled', true, true,
  '39c38960-d30c-4840-b0c1-c9960de95582'
FROM content_ir.kind_definition kd
WHERE kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND kd.kind = 'mermaid_diagram' AND kd.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = kd.id AND c.platform = 'web'
      AND c.role = 'output' AND c.component_key = 'mermaid'
      AND c.deleted_at IS NULL
  );

-- ── 5. Skill: kind_mermaid_diagram (render_block, JSON syntax) ──────────────
-- Live columns only (no is_public/user_id; version int, semver varchar).
-- Filed under the existing skill-dimension "Render Blocks" category — the
-- same one the fence counterpart skill `mermaid-diagrams` uses.

INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, visibility, category_id, sort_order, semver,
   platform_targets, organization_id, metadata)
SELECT
  'kind_mermaid_diagram',
  'Mermaid Diagram (JSON)',
  'How and when to emit a mermaid_diagram render block as "__kind" JSON: the flat code/title shape, JSON string-escaping rules that prevent render failures, when to use the ```mermaid fence or diagram_spec instead, and editing etiquette.',
  'render_block',
  $SKILL_BODY$# Mermaid Diagram (JSON kind)

You can emit a live-rendering **mermaid diagram** as a single JSON object marked
with `"__kind": "mermaid_diagram"`. It renders through the same diagram block as
a ` ```mermaid ` fence — progressive rendering while streaming, then a full
toolbar (theme/style options, SVG/PNG export, source view, fullscreen, canvas
editing) — and persists as an editable artifact.

## The three mermaid-shaped tools (pick the right one)

- **` ```mermaid ` fence** — the PRIMARY authoring syntax for chat prose (see the
  `mermaid-diagrams` skill). If you are writing a normal markdown answer, use the
  fence; it is easier to write and identical in rendering.
- **`mermaid_diagram` `__kind` JSON (this skill)** — for structured emission
  contexts: agent output schemas, workflow node I/O, tool results, or any place
  the platform asked for canonical `__kind` JSON rather than markdown.
- **`diagram_spec` kind** — a STRUCTURED node/edge diagram (typed nodes, edges,
  layout, positions) authored as JSON data. Use it when the diagram's structure
  should be machine-readable data, not DSL text.

## The shape

```json
{
  "__kind": "mermaid_diagram",
  "title": "Order Fulfillment",
  "code": "flowchart TD\n  A[Order placed] --> B{In stock?}\n  B -- Yes --> C[Pack and ship]\n  B -- No --> D[Backorder]\n  C --> E[Delivered]\n  D --> E"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Always the literal `"mermaid_diagram"`. |
| `code` | string | yes | The complete, verbatim Mermaid source. |
| `title` | string | no | Header label. Mermaid YAML frontmatter titles inside `code` also work. |

## Syntax rules that prevent render failures

1. `code` is ONE JSON string — every newline in the mermaid source must be
   escaped as `\n`, and every double quote inside the source as `\"`. Unescaped
   raw newlines/quotes make the whole JSON object invalid and drop the block.
2. `code` starts with a valid mermaid header (`flowchart TD`, `sequenceDiagram`,
   `stateDiagram-v2`, `erDiagram`, `pie`, `gantt`, `mindmap`, `timeline`, …).
   Prose before the header breaks the parse.
3. Do NOT wrap the source in ``` fences inside `code` — it is raw DSL, not
   markdown.
4. Quote node labels containing parentheses, brackets, or commas:
   `A["Total (net)"]`.
5. One diagram per object. Two ideas = two `mermaid_diagram` objects with a
   sentence between them.
6. Valid JSON only: double-quoted keys/strings, no trailing commas, no comments.

## Sizing

Keep diagrams readable: roughly <= 25 nodes for flowcharts, <= 10 participants
for sequence diagrams. Split bigger systems into several focused diagrams.

## Editing an existing diagram

- Return ONE complete `mermaid_diagram` object with the FULL updated `code` —
  never a fragment or a diff.
- Keep `__kind`, and keep `title` unless asked to rename.
- Preserve the parts of the diagram you were not asked to change.

## Minimal example

```json
{
  "__kind": "mermaid_diagram",
  "code": "sequenceDiagram\n  participant U as User\n  participant S as Server\n  U->>S: Request\n  S-->>U: Response"
}
```
$SKILL_BODY$,
  'GitBranch',
  true, true, 'public',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  30, '1.0.0', '["web"]'::jsonb,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'kind_mermaid_diagram'
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND project_id IS NULL AND task_id IS NULL AND deleted_at IS NULL
);

-- Keep label/description/category fresh on re-apply (body owned by insert;
-- a later authored body edit in the DB must not be clobbered).
UPDATE skill.definition SET
  label = 'Mermaid Diagram (JSON)',
  description = 'How and when to emit a mermaid_diagram render block as "__kind" JSON: the flat code/title shape, JSON string-escaping rules that prevent render failures, when to use the ```mermaid fence or diagram_spec instead, and editing etiquette.',
  skill_type = 'render_block',
  icon_name = 'GitBranch',
  is_active = true, is_system = true, visibility = 'public',
  category_id = '49c845cb-9314-485c-88ed-a7ace4f286ca',
  platform_targets = '["web"]'::jsonb,
  updated_at = now()
WHERE skill_id = 'kind_mermaid_diagram'
  AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND project_id IS NULL AND task_id IS NULL AND deleted_at IS NULL;

-- ── 6. Content blocks (Agent Skills category; coexist-not-clobber) ──────────
-- kind-mermaid-diagram-* block_ids — the existing mermaid-* fence blocks stay
-- untouched. metadata.skill_id pairs each block with the skill above.

INSERT INTO public.content_blocks
  (block_id, label, description, icon_name, template, category_id, sort_order,
   is_active, organization_id, metadata)
SELECT
  v.block_id, v.label, v.description, v.icon_name, v.template,
  '2c324058-95e9-4b7e-a991-884f4443eb6e',
  v.sort_order, true,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"skill_id":"kind_mermaid_diagram"}'::jsonb
FROM (VALUES
  ('kind-mermaid-diagram-simple', 'Mermaid Diagram (JSON)',
   'Condensed instructions for emitting a mermaid_diagram render block as __kind JSON.',
   'GitBranch', 10,
   $CB$When a diagram communicates better than prose and the output must be structured JSON, emit a mermaid_diagram block — it renders live and becomes an editable artifact:

```json
{ "__kind": "mermaid_diagram", "code": "flowchart TD\n  A[Start] --> B{Decision?}\n  B -- Yes --> C[Do it]\n  B -- No --> D[Skip]" }
```

- `__kind` is `mermaid_diagram`; `code` (required) is the complete Mermaid source as ONE JSON string — escape newlines as `\n` and inner quotes as `\"`.
- `code` starts with a valid mermaid header (`flowchart TD`, `sequenceDiagram`, `pie`, ...); no fences inside it.
- Optional `title` labels the block. One diagram per object; valid JSON, no trailing commas.
- In normal markdown prose, prefer a ```mermaid fence; for structured node/edge JSON data, use diagram_spec instead.$CB$),

  ('kind-mermaid-diagram-full', 'Mermaid Diagram (JSON, all types)',
   'Full instructions for mermaid_diagram blocks: every diagram type, title, and escaping rules.',
   'Workflow', 20,
   $CB$For any diagram as structured JSON output, emit a mermaid_diagram block — pick the mermaid type that fits: workflow/decision -> `flowchart TD`, interactions over time -> `sequenceDiagram`, states -> `stateDiagram-v2`, data model -> `erDiagram`, proportions -> `pie`, schedule -> `gantt`, ideas -> `mindmap`, events -> `timeline`:

```json
{ "__kind": "mermaid_diagram", "title": "Login Handshake",
  "code": "sequenceDiagram\n  autonumber\n  participant U as User\n  participant S as Server\n  U->>S: POST /login\n  S-->>U: 200 + token" }
```

- `code` (required) is the verbatim Mermaid source in ONE JSON string: escape every newline as `\n` and every inner double quote as `\"` — unescaped raw newlines drop the whole block.
- Start `code` with the mermaid header line; never wrap it in ``` fences; quote labels containing parentheses/commas: `A["Total (net)"]`.
- `title` is optional (YAML frontmatter titles inside `code` also work). One diagram per object; keep it readable (<= ~25 nodes) and split big systems into several diagrams.
- Prefer a ```mermaid fence in plain markdown answers; use the diagram_spec kind when the diagram should be machine-readable node/edge data instead of DSL text.$CB$)
) AS v(block_id, label, description, icon_name, sort_order, template)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon_name = EXCLUDED.icon_name,
  template = EXCLUDED.template,
  category_id = EXCLUDED.category_id,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  metadata = EXCLUDED.metadata,
  updated_at = now();

COMMIT;
