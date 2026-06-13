-- ============================================================================
-- Mermaid content blocks — per-diagram-type + combination prompt snippets.
--
-- Content blocks are the condensed instructions a user injects into an agent's
-- system prompt from the context menu ("a couple of clicks"). This adds a
-- dedicated "Diagrams" category with one block per diagram type (human labels,
-- not "mermaid X" — non-technical users) plus a few combination blocks, mirror-
-- ing the existing pattern (cf. the Timeline / Interactive Diagram blocks).
--
-- The general all-types block (`mermaid-diagram`, seeded by
-- mermaid_render_block_platform.sql) is re-homed into this category here.
-- Idempotent on content_blocks.block_id (UNIQUE).
-- ============================================================================

BEGIN;

-- ── Category: Diagrams ──────────────────────────────────────────────────────
INSERT INTO public.shortcut_categories
  (placement_type, label, description, icon_name, sort_order, is_active)
SELECT 'content-block', 'Diagrams',
       'Inject instructions that teach an agent to draw a specific kind of diagram (flowchart, mind map, sequence, etc.) as a live, editable render block.',
       'Workflow', 40, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.shortcut_categories
  WHERE placement_type = 'content-block' AND label = 'Diagrams'
    AND user_id IS NULL AND organization_id IS NULL
    AND project_id IS NULL AND task_id IS NULL
);

-- Helper: resolve the Diagrams category id once.
DO $$
DECLARE
  v_cat uuid;
BEGIN
  SELECT id INTO v_cat FROM public.shortcut_categories
   WHERE placement_type = 'content-block' AND label = 'Diagrams'
     AND user_id IS NULL AND organization_id IS NULL
     AND project_id IS NULL AND task_id IS NULL
   LIMIT 1;

  -- Re-home the general all-types block into Diagrams + relabel for humans.
  UPDATE public.content_blocks
     SET category_id = v_cat, label = 'Any Diagram (all types)', sort_order = 0, updated_at = now()
   WHERE block_id = 'mermaid-diagram';
END $$;

-- ── Per-type + combo blocks ────────────────────────────────────────────────
-- One INSERT … SELECT per block; category resolved inline; ON CONFLICT updates.

INSERT INTO public.content_blocks (block_id, label, description, icon_name, template, category_id, sort_order, is_active)
SELECT v.block_id, v.label, v.description, 'Workflow', v.template,
       (SELECT id FROM public.shortcut_categories
         WHERE placement_type = 'content-block' AND label = 'Diagrams'
           AND user_id IS NULL AND organization_id IS NULL AND project_id IS NULL AND task_id IS NULL LIMIT 1),
       v.sort_order, true
FROM (VALUES
  -- ── per type ──
  ('mermaid-flowchart', 'Flowchart', 'Process, decision, or workflow diagram', 10,
   $CB$For a process, decision, or workflow, emit a flowchart render block:

```mermaid
flowchart TD
  A[Start] --> B{Decision?}
  B -->|Yes| C[Do this]
  B -->|No| D[Do that]
  C --> E[Done]
  D --> E
```

- `flowchart TD` (top-down) or `LR` (left-right). One diagram per ```mermaid fence.
- Shapes: [box], (rounded), ([pill]), {diamond = decision}, ((circle)).
- Quote labels with special characters: A["Validate (input)"]. Arrows are --> with optional |label|.$CB$),

  ('mermaid-mindmap', 'Mind Map', 'Brainstorm or hierarchy of ideas', 20,
   $CB$For brainstorming or a hierarchy of ideas, emit a mind map render block:

```mermaid
mindmap
  root((Central Idea))
    Topic One
      Detail A
      Detail B
    Topic Two
      Detail C
```

- Indentation defines the hierarchy (2 spaces per level). Exactly one root.
- Root shape: ((circle)), [square], or (rounded). Keep labels short.$CB$),

  ('mermaid-sequence', 'Sequence Diagram', 'Who talks to whom, in what order', 30,
   $CB$For interactions between participants over time, emit a sequence diagram:

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant S as Server
  U->>S: Request
  S-->>U: Response
  note over U,S: Session established
```

- `->>` solid arrow, `-->>` dashed reply. `autonumber` numbers the steps.
- Declare participants first; annotate with `note over A,B: text`.$CB$),

  ('mermaid-pie', 'Pie Chart', 'Proportions of a whole', 40,
   $CB$For proportions of a whole, emit a pie chart render block:

```mermaid
pie title Budget
  "Engineering" : 50
  "Marketing" : 30
  "Operations" : 20
```

- Each slice is `"Label" : number` — no trailing commas.
- Add `showData` after `pie` to print the values on the chart.$CB$),

  ('mermaid-timeline', 'Timeline', 'Events across time', 50,
   $CB$For events across time, emit a timeline render block:

```mermaid
timeline
  title Company History
  2023 : Founded
  2024 : First customer : Seed round
  2025 : Series A
```

- Each row is `period : event`. Several events on one period: `period : a : b`.
- Group rows with `section Name` lines.$CB$),

  ('mermaid-state', 'State Diagram', 'States and transitions', 60,
   $CB$For states and the transitions between them, emit a state diagram:

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Running : start
  Running --> Idle : stop
  Running --> [*] : finish
```

- `[*]` marks start and end. Transitions: `A --> B : trigger`.$CB$),

  ('mermaid-er', 'Entity Relationship', 'Data model / database entities', 70,
   $CB$For a data model, emit an entity-relationship diagram:

```mermaid
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
```

- Format: `ENTITY rel ENTITY : label`.
- Cardinality: `||` one, `o{` zero-or-many, `|{` one-or-many.$CB$),

  ('mermaid-gantt', 'Gantt Chart', 'Project schedule with dates', 80,
   $CB$For a project schedule with dates, emit a Gantt chart:

```mermaid
gantt
  title Release Plan
  dateFormat YYYY-MM-DD
  section Build
  Feature work :a1, 2026-06-01, 10d
  QA :after a1, 5d
```

- Tasks: `Name :id, start, duration`. Depend on another with `after <id>`.
- Group tasks under `section` lines.$CB$),

  ('mermaid-journey', 'User Journey', 'A user experience, step by step', 90,
   $CB$For a user's experience step by step, emit a journey diagram:

```mermaid
journey
  title Support Call
  section Contact
    Find number: 3: Customer
    Wait on hold: 1: Customer
  section Resolution
    Issue fixed: 5: Customer, Agent
```

- Each step: `Task: score(1-5): Actor`. Higher score = better experience.$CB$),

  ('mermaid-quadrant', 'Quadrant Chart', 'Items across two axes (e.g. effort vs impact)', 100,
   $CB$For plotting items across two axes, emit a quadrant chart:

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

- Items: `"Label": [x, y]` with x and y between 0 and 1.$CB$),

  ('mermaid-class', 'Class Diagram', 'Classes, fields, and relationships', 110,
   $CB$For classes and their relationships, emit a class diagram:

```mermaid
classDiagram
  class Animal {
    +String name
    +makeSound()
  }
  Animal <|-- Dog
```

- `+` public, `-` private. Relations: `<|--` inheritance, `*--` composition, `o--` aggregation.$CB$),

  ('mermaid-git', 'Git Graph', 'Branches, commits, and merges', 120,
   $CB$For branches, commits, and merges, emit a git graph:

```mermaid
gitGraph
  commit
  branch develop
  commit
  checkout main
  merge develop
```

- Commands: `commit`, `branch <name>`, `checkout <name>`, `merge <name>`.$CB$),

  ('mermaid-xychart', 'Bar / Line Chart', 'Numeric data on X/Y axes', 130,
   $CB$For numeric data on X/Y axes, emit an XY chart:

```mermaid
xychart-beta
  title "Monthly Revenue"
  x-axis [Jan, Feb, Mar, Apr]
  y-axis "USD (k)" 0 --> 100
  bar [28, 45, 61, 80]
  line [20, 40, 55, 70]
```

- `bar [...]` and/or `line [...]`. x-axis is the category list; y-axis is `"label" min --> max`.$CB$),

  -- ── combinations ──
  ('mermaid-process-logic', 'Process & Logic', 'Flowcharts, sequence, and state — pick the right one', 200,
   $CB$For processes, interactions, and state machines, emit a mermaid diagram — pick the type that fits:

- Workflow / decisions → `flowchart TD`
- Who-talks-to-whom over time → `sequenceDiagram`
- States + transitions → `stateDiagram-v2`

```mermaid
flowchart TD
  A[Start] --> B{OK?}
  B -->|Yes| C[Proceed]
  B -->|No| A
```

One diagram per ```mermaid fence. Quote labels with special characters. Arrows are -->.$CB$),

  ('mermaid-planning', 'Planning & Brainstorm', 'Mind map, flowchart, timeline, or gantt', 210,
   $CB$For planning and brainstorming, emit a mermaid diagram — pick the type that fits:

- Ideas / hierarchy → `mindmap`
- Steps / workflow → `flowchart`
- Events over time → `timeline`
- Schedule with dates → `gantt`

```mermaid
mindmap
  root((Plan))
    Goals
    Tasks
    Risks
```

One diagram per ```mermaid fence; keep each under ~50 nodes.$CB$),

  ('mermaid-charts-data', 'Charts & Data', 'Pie, bar/line, or quadrant', 220,
   $CB$For data and proportions, emit a mermaid chart — pick the type that fits:

- Proportions of a whole → `pie`
- Bar / line over categories → `xychart-beta`
- Effort / impact 2x2 → `quadrantChart`

```mermaid
pie title Share
  "A" : 60
  "B" : 40
```

Data lines take no trailing commas; quote text labels.$CB$),

  ('mermaid-technical-design', 'Technical Design', 'Sequence, ERD, class, and state for engineering docs', 230,
   $CB$For technical design docs, emit a mermaid diagram — pick the type that fits:

- Component interactions → `sequenceDiagram`
- Data model → `erDiagram`
- Classes → `classDiagram`
- State machine → `stateDiagram-v2`

```mermaid
sequenceDiagram
  participant Client
  participant API
  Client->>API: POST /login
  API-->>Client: 200 + token
```

One diagram per ```mermaid fence.$CB$)
) AS v(block_id, label, description, sort_order, template)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon_name = EXCLUDED.icon_name,
  template = EXCLUDED.template,
  category_id = EXCLUDED.category_id,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

COMMIT;
