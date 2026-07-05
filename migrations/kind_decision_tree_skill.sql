-- Migration: kind_decision_tree_skill
-- Teaches AI Matrx agents to emit the content-ir `decision_tree` render block
-- as bare JSON carrying "__kind":"decision_tree" (nodes carry "__kind":"decision_node").
--
-- Creates:
--   1. skill.definition row  skill_id = 'decision-tree'  (skill_type='render_block', global/system/public)
--   2. public.content_blocks row  block_id = 'decision-tree-kind'  (right-click → agent system prompt)
--
-- Idempotent on business keys (skill_id + user_id IS NULL; block_id).
-- Schema-qualified. Safe to re-apply.
--
-- Category ids (live, verified against platform.categories):
--   skill category   49c845cb-9314-485c-88ed-a7ace4f286ca  dimension 'skill'    "Render Blocks"  (same as mermaid-diagrams)
--   content category 6913d9fc-b8c0-4107-af40-27d55c177694  dimension 'shortcut' "Render Blocks"  (shared content-block home for __kind blocks)
--   platform org     39c38960-d30c-4840-b0c1-c9960de95582  (system org that owns the render-block library)

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Skill: teaches the decision_tree __kind block
-- ---------------------------------------------------------------------------
INSERT INTO skill.definition (
    skill_id,
    label,
    description,
    skill_type,
    body,
    icon_name,
    platform_targets,
    version,
    category_id,
    is_active,
    is_system,
    is_public,
    sort_order,
    user_id,
    organization_id,
    project_id,
    task_id,
    visibility
)
SELECT
    'decision-tree',
    'Decision Tree',
    'How and when to emit a decision_tree render block: the __kind JSON shape, recursive yes/no node structure, syntax rules that prevent render failures, sizing guidance, and editing etiquette.',
    'render_block'::public.skl_skill_type,
    $BODY$# Decision Tree

You can render a live, interactive decision tree by emitting a single JSON object
carrying `"__kind": "decision_tree"`. It renders progressively while you stream,
persists as a versioned artifact the user can explore and edit, and can be shared
and revised later by other agents. A decision tree is far clearer than prose
whenever the answer depends on a chain of yes/no conditions — troubleshooting
guides, eligibility flows, triage logic, "which option should I pick" walkthroughs.

## How to emit a decision tree

Emit one JSON object. The system recognizes it live whether it is bare or inside a
```json fence — a fence is fine for readability:

```json
{
  "__kind": "decision_tree",
  "title": "Password Reset Triage",
  "description": "Route a locked-out user to the right fix.",
  "root": {
    "__kind": "decision_node",
    "question": "Does the user remember their email?",
    "yes": {
      "__kind": "decision_node",
      "question": "Did the reset email arrive?",
      "yes": { "__kind": "decision_node", "action": "Have them follow the reset link" },
      "no":  { "__kind": "decision_node", "action": "Resend and check spam / verify the address" }
    },
    "no": {
      "__kind": "decision_node",
      "action": "Escalate to identity verification",
      "priority": "high",
      "estimatedTime": "10 min"
    }
  }
}
```

That's the whole block. No wrapper tags, no `<artifact>`, no extra prose inside it.

## The shape

The tree object (`"__kind": "decision_tree"`):

| Field | Required | Type | Meaning |
|---|---|---|---|
| `__kind` | yes | `"decision_tree"` | Block discriminator. |
| `title` | yes | string | Heading shown above the tree. |
| `root` | yes | object | The first `decision_node` — every tree starts here. |
| `description` | no | string | One line under the title. |

Each node (`"__kind": "decision_node"`) is **either a question or an action**:

| Field | Type | Meaning |
|---|---|---|
| `__kind` | `"decision_node"` | Node discriminator (every node carries it). |
| `question` | string | Makes this a **branch** node. Requires `yes` and/or `no` children. |
| `action` | string | Makes this a **leaf** (the outcome). A leaf has no children. |
| `yes` | node | The child followed when the answer is yes. |
| `no` | node | The child followed when the answer is no. |
| `description` | string | Optional extra context on the node. |
| `priority` | `"low" \| "medium" \| "high"` | Colors a leaf's urgency. Ignored if not one of these three. |
| `category` | string | Free-text grouping label on the node. |
| `estimatedTime` | string | e.g. `"10 min"`, `"2 days"` — shown on the node. |

## Rules that prevent render failures

- **Every node needs `question` OR `action` — never both, never neither.** A node with a `question` is a branch; a node with an `action` is a leaf. A node with neither can't render.
- **A `question` node must have at least one of `yes` / `no`.** A dangling question with no children is invalid.
- **An `action` node is a leaf — do not give it `yes`/`no` children.** The path ends there.
- **`__kind` is required on the tree and on every node.** Omitting it on a nested node breaks detection of that branch.
- **`root` is a single node object, not an array.** The tree has exactly one root.
- **`yes` and `no` are single node objects, not arrays.** Each answer leads to exactly one next node.
- **Emit strictly valid JSON** — double-quoted keys and strings, no trailing commas, no comments. One decision tree per block.
- `priority` must be exactly `low`, `medium`, or `high`; any other value is dropped silently, so use those three or omit it.

## Sizing

- Keep it to what a person can actually walk: aim for **depth ≤ 5** and **≤ ~30 nodes**. Deeper trees get hard to read.
- Every question should lead somewhere — end each branch in an `action` leaf rather than a dead question.
- Use `description` sparingly for the one clarifying sentence a node needs; keep `question`/`action` text short and scannable.

## Editing etiquette

When asked to change a tree, return **ONE complete, updated `decision_tree` block** — the whole object, not a diff or a fragment. Keep `"__kind": "decision_tree"` on the tree and `"__kind": "decision_node"` on every node. Preserve the parts the user didn't ask you to change (titles, untouched branches, existing `priority`/`category`/`estimatedTime`). Never reply with just the changed sub-branch.

## Minimal correct example

```json
{
  "__kind": "decision_tree",
  "title": "Should I deploy now?",
  "root": {
    "__kind": "decision_node",
    "question": "Are all tests passing?",
    "yes": { "__kind": "decision_node", "action": "Deploy" },
    "no":  { "__kind": "decision_node", "action": "Fix failing tests first", "priority": "high" }
  }
}
```
$BODY$,
    'GitFork',
    '["web"]'::jsonb,
    '1.0.0',
    '49c845cb-9314-485c-88ed-a7ace4f286ca',
    true,
    true,
    true,
    0,
    NULL,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    NULL,
    NULL,
    'public'::platform.visibility
WHERE NOT EXISTS (
    SELECT 1 FROM skill.definition
    WHERE skill_id = 'decision-tree' AND user_id IS NULL
);

-- ---------------------------------------------------------------------------
-- 2. Content block: right-click → inject the decision_tree __kind shape
-- ---------------------------------------------------------------------------
INSERT INTO public.content_blocks (
    block_id,
    label,
    description,
    icon_name,
    template,
    sort_order,
    is_active,
    category_id,
    organization_id,
    version,
    metadata
) VALUES (
    'decision-tree-kind',
    'Decision Tree',
    'Emit an interactive yes/no decision tree as a decision_tree render block.',
    'GitFork',
    $CB$When the answer depends on a chain of yes/no conditions (troubleshooting, triage, eligibility), emit an interactive decision tree render block — it renders live and becomes an editable, shareable artifact:

```json
{
  "__kind": "decision_tree",
  "title": "Password Reset Triage",
  "root": {
    "__kind": "decision_node",
    "question": "Does the reset email arrive?",
    "yes": { "__kind": "decision_node", "action": "Follow the reset link" },
    "no":  { "__kind": "decision_node", "action": "Resend and verify the address", "priority": "high" }
  }
}
```

- `title` and `root` are required; the tree and every node carry `__kind`.
- Each node has EITHER `question` (a branch, needs `yes`/`no`) OR `action` (a leaf, no children) — never both.
- `yes`/`no`/`root` are single node objects, not arrays. `priority` is `low`/`medium`/`high` or omitted.
- Valid JSON, no trailing commas. Keep depth <= 5. Return one complete block when editing.$CB$,
    50,
    true,
    '6913d9fc-b8c0-4107-af40-27d55c177694',  -- shared "Render Blocks" content-block category
    '39c38960-d30c-4840-b0c1-c9960de95582',
    1,
    '{}'::jsonb
)
ON CONFLICT (block_id) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    icon_name = EXCLUDED.icon_name,
    template = EXCLUDED.template,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    category_id = EXCLUDED.category_id,
    updated_at = now();

COMMIT;
