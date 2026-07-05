-- kind_diagram_spec_skill.sql
-- Teaches agents to emit the content-ir `diagram_spec` render block: a
-- node/edge interactive diagram carried as a JSON object with
-- "__kind":"diagram_spec". This is the STRUCTURED-JSON diagram (nodes + edges,
-- rendered by InteractiveDiagramBlock via parseDiagramJSON) — NOT the
-- ```mermaid fence diagram (that has its own `mermaid-diagrams` skill).
--
-- Creates:
--   1. skill.definition     : the `diagram-spec` render_block skill (global).
--   2. public.content_blocks : one primary right-click block for Diagram Spec,
--      filed under the shared "Render Blocks" content-block category (6913d9fc-…).
--
-- Idempotent on business keys (skill_id + scope; block_id). Schema-qualified.
-- Global scope: user_id / project_id / task_id NULL; organization_id is the
-- platform org (NOT NULL on both tables — mirrors the live mermaid-diagrams row).

BEGIN;

-- ---------------------------------------------------------------------------
-- Constants (kept inline; live-verified names/ids):
--   platform org (owner of system render-block content) : 39c38960-d30c-4840-b0c1-c9960de95582
-- ---------------------------------------------------------------------------

-- 1. The skill definition (global render_block).
INSERT INTO skill.definition (
  skill_id, label, description, body, skill_type, icon_name,
  platform_targets, version, is_system, is_public, is_active,
  visibility, organization_id, user_id, project_id, task_id
)
SELECT
  'diagram-spec',
  'Diagram Spec',
  'How and when to emit a {"__kind":"diagram_spec"} interactive node/edge diagram: the flat title+nodes+edges shape, the diagram_node / diagram_edge child shapes, required fields, syntax rules that prevent render failures, sizing guidance, and editing etiquette. Distinct from ```mermaid fences.',
  $BODY$# Diagram Spec

You can create a live, interactive node-and-edge diagram by emitting a single
JSON object carrying `"__kind": "diagram_spec"`. It renders progressively while
you stream, persists as a versioned artifact the user can edit (visually, as a
structured outline, or as JSON), and can be shared, exported, and modified by
other agents later. Reach for it whenever a set of things and the connections
between them is clearer as a picture than as prose — architectures, processes,
org charts, mind maps, networks, family pedigrees, entity relationships.

> This is the **structured-JSON** diagram (you author nodes and edges by hand).
> It is a DIFFERENT block from a ```mermaid fence. If the user wants terse
> flowchart/sequence/gantt syntax, use a mermaid fence instead. If you want
> explicit control over each node's fields, labels, colors, and relationships —
> use `diagram_spec`.

## How to emit one

Emit one JSON object per diagram. It is recognized whether bare or inside a
```json fence — a fence is fine for clarity:

```json
{
  "__kind": "diagram_spec",
  "title": "Order Lifecycle",
  "type": "flowchart",
  "nodes": [
    { "__kind": "diagram_node", "id": "cart",     "label": "Cart" },
    { "__kind": "diagram_node", "id": "checkout", "label": "Checkout" },
    { "__kind": "diagram_node", "id": "paid",     "label": "Paid" }
  ],
  "edges": [
    { "__kind": "diagram_edge", "source": "cart",     "target": "checkout", "label": "proceed" },
    { "__kind": "diagram_edge", "source": "checkout", "target": "paid",     "label": "pay" }
  ]
}
```

Every node and every edge carries its OWN `__kind` (`diagram_node` /
`diagram_edge`). The envelope is flat: `title`, `nodes`, and `edges` sit at the
top level — do NOT wrap them under a `"diagram"` key.

## The shape

**Envelope — `diagram_spec`:**
- `__kind` — always `"diagram_spec"`. Required.
- `title` — string. Required.
- `nodes` — array of `diagram_node`. Required, non-empty.
- `edges` — array of `diagram_edge`. Optional (omit or `[]` for a node-only
  diagram like a mind map's leaves).
- `type` — the diagram flavor: `"flowchart"` (default), `"mindmap"`,
  `"orgchart"`, `"network"`, `"system"`, `"process"`, `"pedigree"`,
  `"timeline"`, `"erd"`, `"sequence"`. Drives auto-layout.
- `description` — optional string shown under the title.
- `layout` — optional `{ direction?: "TB"|"LR"|"BT"|"RL", spacing?: number, algorithm?: "dagre"|"radial"|"pedigree" }`.
- `renderHints` — optional `{ showLegend?, showEdgeLabels?, compactNodes?, hideArrows? }` booleans.

**Node — `diagram_node`:**
- `__kind` — `"diagram_node"`.
- `id` — string, **unique within the diagram**. Required. Edges reference it.
- `label` — string, the visible text. Required.
- `type` — optional category (e.g. `"start"`, `"process"`, `"decision"`, `"end"`, `"service"`, `"database"`).
- `description` / `details` — optional longer text shown on the node.
- `color` — optional CSS color string. `icon` — optional icon name.
- `position` — optional `{ "x": number, "y": number }`. **Omit it** and layout
  is auto-generated from `type`; only pin positions when you truly need an exact
  arrangement (all-or-nothing — pin every node or none).
- Pedigree-only: `gender` (`"male"|"female"|"unknown"`), `affected`,
  `deceased`, `proband` (booleans), `birthYear`, `deathYear`, `generation`.

**Edge — `diagram_edge`:**
- `__kind` — `"diagram_edge"`.
- `source` — id of the origin node. Required.
- `target` — id of the destination node. Required.
- `id` — optional; auto-synthesized if omitted.
- `label` — optional edge caption. `relationship` — optional semantic type
  (e.g. `"parent"`, `"child"`, `"marriage"`, `"biological"`).
- `color`, `dashed`, `strokeWidth`, `arrow`, `animated` — optional visual overrides.

## Rules that prevent render failures

1. **Required floor:** the envelope must have `title` and a non-empty `nodes`
   array, or the block fails to parse. Every node must have `id` AND `label`.
   Every edge must have `source` AND `target`.
2. **Edge endpoints must be real node ids.** `source` and `target` must each
   match some node's `id` exactly (case-sensitive). A dangling edge is a defect.
3. **Node ids are unique.** Duplicate ids collapse nodes and mis-route edges.
4. **Reference ids, not labels.** Edges connect by `id`; the `label` is only for
   display. `"source": "checkout"` (an id), never `"source": "Checkout"` (a label)
   unless the id literally is `Checkout`.
5. **One diagram per block.** Don't put two `diagram_spec` objects in one fence.
6. **Valid JSON** — double-quoted keys/strings, no trailing commas, no comments.
7. Keep `__kind` on the envelope and on every node and edge. Missing child
   `__kind` degrades the block.

## Sizing

Best legibility is roughly **3–25 nodes**. Beyond ~40 nodes the diagram gets
crowded — split into multiple focused diagrams or raise `layout.spacing`. Keep
labels to a few words; put longer text in `description`/`details`.

## Editing an existing diagram

When asked to change a diagram, return **ONE complete, updated** `diagram_spec`
object — not a patch, not a diff. Keep `__kind`, keep the same node `id`s for
nodes that persist (so edges and layout stay stable), and keep any pinned
`position`s the user arranged unless the change is specifically about layout.

## One correct minimal example

```json
{
  "__kind": "diagram_spec",
  "title": "Deployment Pipeline",
  "type": "flowchart",
  "layout": { "direction": "LR" },
  "nodes": [
    { "__kind": "diagram_node", "id": "commit", "label": "Commit",  "type": "start" },
    { "__kind": "diagram_node", "id": "build",  "label": "Build",   "type": "process" },
    { "__kind": "diagram_node", "id": "test",   "label": "Test",    "type": "process" },
    { "__kind": "diagram_node", "id": "deploy", "label": "Deploy",  "type": "end" }
  ],
  "edges": [
    { "__kind": "diagram_edge", "source": "commit", "target": "build" },
    { "__kind": "diagram_edge", "source": "build",  "target": "test" },
    { "__kind": "diagram_edge", "source": "test",   "target": "deploy", "label": "on pass" }
  ]
}
```
$BODY$,
  'render_block',
  'Workflow',
  '["web"]'::jsonb,
  '1.0.0',
  true,
  true,
  true,
  'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'diagram-spec'
    AND user_id IS NULL
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND project_id IS NULL
);

-- 2. Content block (right-click into an agent's system prompt).
INSERT INTO public.content_blocks (
  block_id, label, description, icon_name, template, sort_order,
  is_active, category_id, organization_id
)
SELECT
  'diagram-spec',
  'Diagram Spec',
  'An interactive node/edge diagram (flowchart, org chart, network, pedigree…)',
  'Workflow',
  $CB$When a set of things and the links between them is clearer as a picture — a process, architecture, org chart, network, or entity relationships — emit an interactive diagram as one JSON object:

```json
{ "__kind": "diagram_spec", "title": "Order Lifecycle", "type": "flowchart",
  "nodes": [
    { "__kind": "diagram_node", "id": "cart", "label": "Cart" },
    { "__kind": "diagram_node", "id": "paid", "label": "Paid" }
  ],
  "edges": [
    { "__kind": "diagram_edge", "source": "cart", "target": "paid", "label": "checkout" }
  ] }
```

Rules: `title` + a non-empty `nodes` array are required; each node needs `id` + `label`; each edge needs `source` + `target` matching real node `id`s (not labels); ids are unique; every node/edge keeps its own `__kind`. `type` picks the flavor (flowchart/mindmap/orgchart/network/pedigree/erd). This is the structured-JSON diagram — for terse flowchart syntax use a ```mermaid fence instead.$CB$,
  10,
  true,
  '6913d9fc-b8c0-4107-af40-27d55c177694',  -- shared "Render Blocks" content-block category
  '39c38960-d30c-4840-b0c1-c9960de95582'
ON CONFLICT (block_id) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  icon_name   = EXCLUDED.icon_name,
  template    = EXCLUDED.template,
  category_id = EXCLUDED.category_id,
  updated_at  = now();

COMMIT;
