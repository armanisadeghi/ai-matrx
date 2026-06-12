-- ============================================================================
-- Mermaid render block — platform registration.
--
-- One migration, five registrations (idempotent on business keys):
--   1. ui_surface row for the Mermaid Workbench (canvas editor surface) so
--      agents can be bound to it via agx_agent_surface.
--   2. skl_categories 'render-blocks' — the category that will hold the
--      teaching skill for EVERY render block as the skill rollout continues
--      (mermaid is the first; ~40-50 more follow this exact pattern).
--   3. skl_definitions 'mermaid-diagrams' — the system skill whose body
--      teaches an agent how/when to emit ```mermaid fences. Injected into the
--      system prompt via agx_agent.skill_config.included (aidream
--      skill_merge.apply_unified_skills) and discoverable via skill_get.
--   4. skl_render_definitions block_id 'mermaid' + skl_render_components per
--      platform. web is live; chrome-extension / desktop / mobile rows ship
--      is_active=false — the EXPLICIT notation that those platforms await the
--      server-side render-block processing switch (aidream
--      packages/matrx-ai/.../block_detector.py SPECIAL_CODE_LANGUAGES already
--      includes 'mermaid'; the clients just don't consume server blocks yet).
--   5. content_blocks 'mermaid-diagram' — the condensed instructions template
--      users inject into an agent's system instructions from the context menu.
-- Plus the user-edit versioning RPC:
--   6. cx_canvas_save_user_version — the canonical "user edited an artifact →
--      new version row" path. cx_canvas_update_version is the MODEL-update
--      path (requires the new message id); workbench saves have no message.
-- ============================================================================

BEGIN;

-- ── 1. Workbench surface ────────────────────────────────────────────────────

INSERT INTO public.ui_surface
  (name, client_name, description, sort_order, is_active, execution_mode)
VALUES (
  'matrx-user/mermaid-editor',
  'matrx-user',
  'Mermaid diagram workbench (canvas editor: visual / outline / code modes). Agents bound here receive the diagram source and editor state, and return ONE full updated ```mermaid fence.',
  220, true, 'python-stream'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

-- ── 2. Skill category ───────────────────────────────────────────────────────

INSERT INTO public.skl_categories
  (category_key, label, description, icon_name, sort_order, is_active)
VALUES (
  'render-blocks',
  'Render Blocks',
  'Teaching skills for first-class streamed render blocks: when and how to emit each block type.',
  'Blocks', 50, true
)
ON CONFLICT (category_key) DO NOTHING;

-- ── 3. System skill: mermaid-diagrams ───────────────────────────────────────

INSERT INTO public.skl_definitions
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, is_public, category_id, sort_order, version, platform_targets)
VALUES (
  'mermaid-diagrams',
  'Mermaid Diagrams',
  'How and when to emit ```mermaid render blocks: supported diagram types, fence rules, syntax rules that prevent render failures, sizing guidance, and editing etiquette.',
  'render_block',
  $SKILL_BODY$# Mermaid Diagrams

You can create live, interactive diagrams by emitting mermaid code fences. They render
progressively while you stream, persist as versioned artifacts the user can edit
(visually, in a structured outline, or as code), and can be shared, exported, and
modified by other agents later. A diagram is often dramatically clearer than prose —
prefer one whenever the user asks about a process, structure, relationship, schedule,
or proportion.

## How to emit a diagram

Write a standard mermaid code fence. Nothing else is needed — no wrapper tags:

```mermaid
flowchart TD
  A[Start] --> B{Approved?}
  B -->|Yes| C[Ship it]
  B -->|No| D[Revise]
  D --> A
```

Rules:
- One diagram per fence. Never combine two diagram types in one fence.
- The fence opens at the start of a line with exactly ```mermaid (the alias ```mmd also works).
- The first line inside the fence (after optional frontmatter) is the diagram-type keyword.
- Never wrap a mermaid fence inside <artifact> tags — the fence IS the artifact.
- To title a diagram, open the body with YAML frontmatter:

```mermaid
---
title: Order Lifecycle
---
flowchart LR
  A[Cart] --> B[Checkout] --> C[Paid]
```

## Choosing the right diagram type

| User intent | Diagram | First line |
|---|---|---|
| Process, decision logic, workflow | Flowchart | `flowchart TD` (or `LR`) |
| Who talks to whom, in what order | Sequence diagram | `sequenceDiagram` |
| Brainstorm, hierarchy of ideas | Mind map | `mindmap` |
| Proportions of a whole | Pie chart | `pie` |
| Events over time | Timeline | `timeline` |
| Project schedule with dates | Gantt chart | `gantt` |
| States and transitions | State diagram | `stateDiagram-v2` |
| Data model / database entities | ER diagram | `erDiagram` |
| User experience scoring | Journey | `journey` |
| Classes and inheritance | Class diagram | `classDiagram` |
| Effort/value style 2x2 | Quadrant chart | `quadrantChart` |
| Branches and merges | Git graph | `gitGraph` |
| Bar/line data | XY chart | `xychart-beta` |
| Work in status columns | Kanban | `kanban` |
| System architecture | Architecture | `architecture-beta` |

Flowchart, mind map, sequence, pie, and timeline additionally support the platform's
visual and outline editors — prefer them when several types would work equally well.

## Syntax rules that prevent render failures

These are the errors that actually break diagrams in production — follow them exactly:

1. QUOTE any label containing parentheses, brackets, braces, colons, semicolons,
   pipes, or the # or & characters:
   - Wrong: `A[Validate (strict) mode]`
   - Right: `A["Validate (strict) mode"]`
2. Node ids are letters, digits, underscores, and hyphens only — put everything else
   in the label: `user_input["User's input (raw)"]`.
3. Never use lowercase `end` as a flowchart node id — it is reserved for closing
   subgraphs. Use `End`, `end_node`, or `done`.
4. Escape a double quote inside a quoted label as `#quot;`.
5. Line breaks inside labels use `<br/>` — never a literal newline.
6. Comments are `%% like this` on their own line — never `//` or `#`.
7. Arrows: `-->` (solid), `-.->` (dotted), `==>` (thick), `---` (line, no arrow).
   Edge labels: `A -->|label| B`. Plain `->` is invalid in flowcharts.
8. No markdown inside labels (`**bold**` breaks rendering) and no raw HTML.
9. Pie/xychart data lines take no trailing commas: `"Slice" : 42`.
10. Every `subgraph` needs a matching `end` line.

## Sizing and layout guidance

- Keep diagrams under ~50 nodes. Bigger ideas split into several focused diagrams,
  each in its own fence, with a sentence between them.
- `flowchart TD` suits tall step-by-step flows; `flowchart LR` suits wide pipelines
  with long labels.
- In sequence diagrams with more than ~7 messages, add `autonumber` as the second line.
- Use subgraphs sparingly — one level deep, only when grouping genuinely clarifies.

## Editing an existing diagram

When asked to modify a diagram (yours or one provided as context):

- Return ONE complete ```mermaid fence containing the FULL updated diagram —
  never a fragment, a diff, or prose mixed with partial syntax.
- Preserve existing node ids and labels you weren't asked to change — the platform
  tracks versions, and minimal diffs keep history readable.
- Keep the original diagram type unless explicitly asked to convert it.
- Keep the frontmatter title unless asked to retitle.
- If asked something impossible in the current type (e.g. "add a pie slice" to a
  flowchart), say so briefly and offer the conversion.

## Per-type quick reference

```mermaid
flowchart LR
  A[Input] --> B{Valid?}
  B -->|Yes| C["Process (async)"]
  B -->|No| D[Reject]
  subgraph Storage
    C --> E[(Database)]
  end
```

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant A as API
  U->>A: POST /login
  A-->>U: 200 + token
  note over U,A: Session established
```

```mermaid
mindmap
  root((Product Launch))
    Marketing
      Social posts
      Email campaign
    Engineering
      Final QA
```

```mermaid
pie title Budget
  "Engineering" : 50
  "Marketing" : 30
  "Operations" : 20
```

```mermaid
timeline
  title Company History
  2023 : Founded
  2024 : First customer : Seed round
  2025 : Series A
```

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Review : submit
  Review --> Published : approve
  Review --> Draft : reject
  Published --> [*]
```

```mermaid
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
```

```mermaid
gantt
  title Release Plan
  dateFormat YYYY-MM-DD
  section Build
  Feature work :a1, 2026-06-01, 10d
  QA :after a1, 5d
```

```mermaid
journey
  title Support Call
  section Contact
    Find number: 3: Customer
    Wait on hold: 1: Customer
  section Resolution
    Issue fixed: 5: Customer, Agent
```

```mermaid
quadrantChart
  title Prioritization
  x-axis Low Effort --> High Effort
  y-axis Low Impact --> High Impact
  quadrant-1 Do now
  quadrant-2 Plan
  quadrant-3 Skip
  quadrant-4 Delegate
  "Quick win": [0.2, 0.8]
```

```mermaid
xychart-beta
  title "Monthly Revenue"
  x-axis [Jan, Feb, Mar, Apr]
  y-axis "USD (k)" 0 --> 100
  bar [28, 45, 61, 80]
```
$SKILL_BODY$,
  'GitBranch',
  true, true, true,
  (SELECT id FROM public.skl_categories WHERE category_key = 'render-blocks'),
  10, '1.0.0', '["web"]'::jsonb
)
ON CONFLICT (skill_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  skill_type = EXCLUDED.skill_type,
  body = EXCLUDED.body,
  icon_name = EXCLUDED.icon_name,
  category_id = EXCLUDED.category_id,
  version = EXCLUDED.version,
  is_active = true,
  updated_at = now();

-- ── 4. Render definition + per-platform components ──────────────────────────

INSERT INTO public.skl_render_definitions
  (block_id, label, description, icon_name, template, skill_id, is_active, is_public, sort_order)
SELECT
  'mermaid',
  'Mermaid Diagram',
  'Native mermaid code-fence render block. Renders progressively during streaming, materializes into a versioned canvas artifact with visual/outline/code editing.',
  'GitBranch',
  E'```mermaid\nflowchart TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Done]\n  B -->|No| A\n```',
  (SELECT id FROM public.skl_definitions WHERE skill_id = 'mermaid-diagrams'),
  true, true, 10
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_render_definitions WHERE block_id = 'mermaid'
);

-- Per-platform components. is_active=false rows are the explicit multi-platform
-- notation: those clients render mermaid once they switch to server-side block
-- processing (server support already shipped with this build).
WITH rd AS (
  SELECT id FROM public.skl_render_definitions WHERE block_id = 'mermaid' LIMIT 1
)
INSERT INTO public.skl_render_components
  (render_definition_id, component_key, platform, import_path, is_active, sort_order)
SELECT rd.id, v.component_key, v.platform, v.import_path, v.is_active, v.sort_order
FROM rd,
  (VALUES
    ('MermaidBlock', 'web',              '@/components/mardown-display/blocks/mermaid/MermaidBlock', true,  10),
    ('MermaidBlock', 'chrome-extension', NULL,                                                       false, 20),
    ('MermaidBlock', 'desktop',          NULL,                                                       false, 30),
    ('MermaidBlock', 'mobile',           NULL,                                                       false, 40)
  ) AS v(component_key, platform, import_path, is_active, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_render_components c
  WHERE c.render_definition_id = rd.id AND c.platform = v.platform
);

-- ── 5. Content block (condensed prompt snippet) ─────────────────────────────

INSERT INTO public.shortcut_categories
  (placement_type, label, description, icon_name, sort_order, is_active)
SELECT
  'content-block', 'Render Blocks',
  'Insertable templates that teach agents to emit first-class render blocks.',
  'Blocks', 50, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.shortcut_categories
  WHERE placement_type = 'content-block' AND label = 'Render Blocks'
    AND user_id IS NULL AND organization_id IS NULL
    AND project_id IS NULL AND task_id IS NULL
);

INSERT INTO public.content_blocks
  (block_id, label, description, icon_name, template, category_id, sort_order, is_active)
VALUES (
  'mermaid-diagram',
  'Mermaid Diagrams',
  'Condensed instructions for emitting mermaid diagram render blocks.',
  'GitBranch',
  $TPL$When a diagram communicates better than prose, emit a mermaid render block — it renders live and becomes an editable, shareable artifact:

```mermaid
flowchart TD
  A[Start] --> B{Condition?}
  B -->|Yes| C[Do thing]
  B -->|No| D[Other path]
```

Rules:
- One diagram per ```mermaid fence; first line is the type: flowchart TD|LR, sequenceDiagram, mindmap, pie, timeline, stateDiagram-v2, erDiagram, gantt, journey, quadrantChart, xychart-beta.
- QUOTE labels containing ( ) [ ] { } : ; # & — e.g. A["Step (optional)"].
- Node ids: letters/digits/underscores only. Never lowercase `end` as a node id.
- Comments use %% on their own line. Line breaks in labels use <br/>. No markdown inside labels.
- Arrows are --> (never bare ->). Edge labels: A -->|label| B.
- Optional title: open the body with --- / title: My Diagram / --- frontmatter.
- Keep diagrams under ~50 nodes; split bigger ideas into several fences.
- When editing an existing diagram, return ONE complete updated ```mermaid fence (never a fragment) and preserve untouched ids/labels.$TPL$,
  (SELECT id FROM public.shortcut_categories
   WHERE placement_type = 'content-block' AND label = 'Render Blocks'
     AND user_id IS NULL AND organization_id IS NULL
     AND project_id IS NULL AND task_id IS NULL
   LIMIT 1),
  10, true
)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  template = EXCLUDED.template,
  category_id = EXCLUDED.category_id,
  is_active = true,
  updated_at = now();

-- ── 6. User-edit versioning RPC ─────────────────────────────────────────────
-- The canonical "user edited artifact content → new version row" path.
-- Chain root = COALESCE(parent_canvas_id, id); version = MAX+1 over the chain
-- (atomic via row lock on the root); source_message_id/artifact_index NULL so
-- the (source_message_id, artifact_index) partial unique never collides.
-- Owner-checked SECURITY DEFINER, same auth model as the sibling cx_canvas_*
-- RPCs (per the deferred security overhaul, D2 in KNOWN_DEFECTS.md).

CREATE OR REPLACE FUNCTION public.cx_canvas_save_user_version(
  p_user_id uuid,
  p_canvas_id uuid,
  p_title text,
  p_content jsonb
) RETURNS public.canvas_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig public.canvas_items;
  v_new public.canvas_items;
  v_root uuid;
  v_next integer;
BEGIN
  SELECT * INTO v_orig
  FROM public.canvas_items
  WHERE id = p_canvas_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'canvas item % not found or not owned by user', p_canvas_id;
  END IF;

  v_root := COALESCE(v_orig.parent_canvas_id, v_orig.id);

  -- Serialize concurrent version bumps on the same chain.
  PERFORM 1 FROM public.canvas_items WHERE id = v_root FOR UPDATE;

  SELECT COALESCE(MAX(version), v_orig.version) + 1 INTO v_next
  FROM public.canvas_items
  WHERE id = v_root OR parent_canvas_id = v_root;

  INSERT INTO public.canvas_items
    (user_id, type, title, content, conversation_id,
     source_message_id, artifact_index, version, parent_canvas_id, source_type)
  VALUES
    (p_user_id, v_orig.type, COALESCE(p_title, v_orig.title), p_content,
     v_orig.conversation_id, NULL, NULL, v_next, v_root, 'user_created')
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$$;

COMMIT;
