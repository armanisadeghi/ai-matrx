-- kind_schema_proposal_skill.sql
--
-- Platform render-block SKILL + content block(s) for the content-ir kind
-- `schema_proposal`. Teaches agents to emit the bare-JSON `__kind` block
--
--   { "__kind": "schema_proposal", "name", "schema": { ...JSON Schema... }, "strict"? }
--
-- which renders live as a "Proposed output schema" card and can be applied to
-- an agent's `output_schema` from the UI ("Apply to an agent").
--
-- Idempotent + schema-qualified. Safe to re-apply. DO NOT confuse this with a
-- generic JSON block — the discriminator `"__kind": "schema_proposal"` is what
-- routes it to SchemaProposalBlock.
--
-- Tables (post-2026 reorg):
--   skill.definition        — the skill row (skill_type = 'render_block', global)
--   public.content_blocks   — the right-click-into-prompt content block(s)
--   platform.categories     — shared categories (skill dim + shortcut/content-block dim)

BEGIN;

-- ---------------------------------------------------------------------------
-- Skill: schema-proposal-render-block
-- Composite-unique table → guard on (skill_id, user_id IS NULL) per the brief.
-- Reuses the existing "Render Blocks" skill-dimension category + Matrx System org.
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
  visibility,
  organization_id,
  user_id,
  project_id,
  task_id
)
SELECT
  'schema-proposal-render-block',
  'Schema Proposal',
  'How and when to emit a schema_proposal render block: a proposed JSON Schema for an agent''s structured output, rendered as an applyable card. Covers the __kind shape, JSON Schema rules that keep it valid and strict-mode compatible, sizing, and editing etiquette.',
  'render_block',
  $BODY$# Schema Proposal

You can propose a **structured-output JSON Schema** for an AI agent by emitting a
`schema_proposal` block. It renders live as a compact "Proposed output schema"
card the user can inspect and, with one click, **apply to any of their agents** —
writing the schema to that agent's `output_schema` so the agent is thereafter
forced to answer as JSON matching this schema.

Reach for this whenever the user asks you to *design*, *draft*, or *propose* the
shape an agent should return: "make an agent that outputs X", "give me a schema
for a support-ticket classifier", "what structured output should this agent
produce". You are proposing the contract, not filling it in — emit the schema,
not example data.

## How to emit a schema proposal

Emit a single JSON object carrying the `"__kind": "schema_proposal"`
discriminator. You may wrap it in a ```json fence for clarity — both fenced and
bare are recognized:

```json
{
  "__kind": "schema_proposal",
  "name": "support_ticket_classification",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["category", "priority", "summary"],
    "properties": {
      "category": {
        "type": "string",
        "enum": ["billing", "technical", "account", "other"],
        "description": "Best-fit ticket category."
      },
      "priority": {
        "type": "string",
        "enum": ["low", "medium", "high", "urgent"]
      },
      "summary": {
        "type": "string",
        "description": "One-sentence summary of the customer's issue."
      }
    }
  }
}
```

## The shape

The block is an object with a fixed top level:

| Field    | Type    | Required | Meaning |
|----------|---------|----------|---------|
| `__kind` | string  | yes      | Always exactly `"schema_proposal"`. The render discriminator. |
| `name`   | string  | yes      | Schema identifier — letters, digits, underscores, dashes only; ≤ 64 chars. No spaces. |
| `schema` | object  | yes      | A **root JSON Schema** describing the output. Must itself be `"type": "object"`. |
| `strict` | boolean | no       | When `true`, the provider enforces the schema exactly (recommended). |

`schema` is a standard JSON Schema object. Supported keywords: `type`,
`description`, `properties`, `required`, `additionalProperties`, `items`,
`enum`, `const`, `anyOf`, `format`, `pattern`, string/number/array constraints
(`minimum`/`maximum`/`minItems`/`maxItems`/`pattern`…), and `$defs` + `$ref` for
reuse. `type` values: `string`, `number`, `integer`, `boolean`, `object`,
`array`, `null`.

## Rules that keep it valid (and strict-mode compatible)

These prevent both a broken card and a schema the "Apply to an agent" step will
reject:

- **`name` must be a plain string and `schema` a plain object.** If either is
  missing or the wrong type, the card can't render and the raw JSON shows
  instead. Never emit an array as `schema`.
- **The root `schema` is always `"type": "object"`.** Provider structured-output
  requires an object at the root — never a bare string/array/number schema at
  the top level. Wrap primitives in a single-property object.
- **Set `"additionalProperties": false` on every object** (root and nested).
  Strict structured output rejects unlisted keys; omitting this is the most
  common cause of a rejected schema.
- **List EVERY property in that object's `required` array when `strict` is
  true.** Strict mode has no concept of optional keys — a key that may be absent
  must instead be modeled as `"type": ["string", "null"]` (nullable) and still
  appear in `required`.
- **Prefer `enum` over free text** for finite choice fields — it makes the
  agent's output reliable and machine-checkable.
- **Do not put a top-level `"__kind"` INSIDE `schema`.** The discriminator lives
  at the block root only. (A render-block-aware output schema may legitimately
  declare its own `__kind` *property* — but only do that deliberately when the
  agent's answers are themselves render blocks.)
- **Valid JSON throughout** — double-quoted keys, no trailing commas, no
  comments.

## What to include

Propose the *contract*, not sample answers. Give each property a short
`description` so the downstream agent knows what to put there. Use nesting
(`properties` within an object property) and arrays (`items`) to model real
structure. Keep it focused: model the fields the task actually needs — a tight
5–15 field schema beats a sprawling one. Very large schemas (many dozens of
deeply nested fields) are harder for providers to satisfy; split a giant
contract into a smaller core plus optional `$defs`.

## Editing etiquette

When revising a proposed schema, return **one complete updated block** — the
full `{ "__kind": "schema_proposal", ... }` object, never a fragment or a diff.
Keep the `"__kind"` discriminator, keep the same `name` unless the user renames
it, and preserve the properties you aren't changing (descriptions, enums, nested
shapes) exactly. The card replaces wholesale on each emission.

## One correct minimal example

```json
{
  "__kind": "schema_proposal",
  "name": "contact_extraction",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["full_name", "email"],
    "properties": {
      "full_name": { "type": "string", "description": "Person's full name." },
      "email": { "type": "string", "format": "email" }
    }
  }
}
```
$BODY$,
  'FileJson',
  '["web"]'::jsonb,
  '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',  -- platform.categories: dimension 'skill', "Render Blocks"
  true,
  true,
  true,
  0,
  'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',  -- Matrx System org (all system skills)
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'schema-proposal-render-block' AND user_id IS NULL
);

-- Keep the body/metadata current on re-apply (business-key = skill_id + global scope).
UPDATE skill.definition SET
  label            = 'Schema Proposal',
  description      = 'How and when to emit a schema_proposal render block: a proposed JSON Schema for an agent''s structured output, rendered as an applyable card. Covers the __kind shape, JSON Schema rules that keep it valid and strict-mode compatible, sizing, and editing etiquette.',
  skill_type       = 'render_block',
  icon_name        = 'FileJson',
  platform_targets = '["web"]'::jsonb,
  version          = '1.0.0',
  category_id      = '49c845cb-9314-485c-88ed-a7ace4f286ca',
  is_active        = true,
  is_system        = true,
  is_public        = true,
  visibility       = 'public',
  body             = $BODY$# Schema Proposal

You can propose a **structured-output JSON Schema** for an AI agent by emitting a
`schema_proposal` block. It renders live as a compact "Proposed output schema"
card the user can inspect and, with one click, **apply to any of their agents** —
writing the schema to that agent's `output_schema` so the agent is thereafter
forced to answer as JSON matching this schema.

Reach for this whenever the user asks you to *design*, *draft*, or *propose* the
shape an agent should return: "make an agent that outputs X", "give me a schema
for a support-ticket classifier", "what structured output should this agent
produce". You are proposing the contract, not filling it in — emit the schema,
not example data.

## How to emit a schema proposal

Emit a single JSON object carrying the `"__kind": "schema_proposal"`
discriminator. You may wrap it in a ```json fence for clarity — both fenced and
bare are recognized:

```json
{
  "__kind": "schema_proposal",
  "name": "support_ticket_classification",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["category", "priority", "summary"],
    "properties": {
      "category": {
        "type": "string",
        "enum": ["billing", "technical", "account", "other"],
        "description": "Best-fit ticket category."
      },
      "priority": {
        "type": "string",
        "enum": ["low", "medium", "high", "urgent"]
      },
      "summary": {
        "type": "string",
        "description": "One-sentence summary of the customer's issue."
      }
    }
  }
}
```

## The shape

The block is an object with a fixed top level:

| Field    | Type    | Required | Meaning |
|----------|---------|----------|---------|
| `__kind` | string  | yes      | Always exactly `"schema_proposal"`. The render discriminator. |
| `name`   | string  | yes      | Schema identifier — letters, digits, underscores, dashes only; ≤ 64 chars. No spaces. |
| `schema` | object  | yes      | A **root JSON Schema** describing the output. Must itself be `"type": "object"`. |
| `strict` | boolean | no       | When `true`, the provider enforces the schema exactly (recommended). |

`schema` is a standard JSON Schema object. Supported keywords: `type`,
`description`, `properties`, `required`, `additionalProperties`, `items`,
`enum`, `const`, `anyOf`, `format`, `pattern`, string/number/array constraints
(`minimum`/`maximum`/`minItems`/`maxItems`/`pattern`…), and `$defs` + `$ref` for
reuse. `type` values: `string`, `number`, `integer`, `boolean`, `object`,
`array`, `null`.

## Rules that keep it valid (and strict-mode compatible)

These prevent both a broken card and a schema the "Apply to an agent" step will
reject:

- **`name` must be a plain string and `schema` a plain object.** If either is
  missing or the wrong type, the card can't render and the raw JSON shows
  instead. Never emit an array as `schema`.
- **The root `schema` is always `"type": "object"`.** Provider structured-output
  requires an object at the root — never a bare string/array/number schema at
  the top level. Wrap primitives in a single-property object.
- **Set `"additionalProperties": false` on every object** (root and nested).
  Strict structured output rejects unlisted keys; omitting this is the most
  common cause of a rejected schema.
- **List EVERY property in that object's `required` array when `strict` is
  true.** Strict mode has no concept of optional keys — a key that may be absent
  must instead be modeled as `"type": ["string", "null"]` (nullable) and still
  appear in `required`.
- **Prefer `enum` over free text** for finite choice fields — it makes the
  agent's output reliable and machine-checkable.
- **Do not put a top-level `"__kind"` INSIDE `schema`.** The discriminator lives
  at the block root only. (A render-block-aware output schema may legitimately
  declare its own `__kind` *property* — but only do that deliberately when the
  agent's answers are themselves render blocks.)
- **Valid JSON throughout** — double-quoted keys, no trailing commas, no
  comments.

## What to include

Propose the *contract*, not sample answers. Give each property a short
`description` so the downstream agent knows what to put there. Use nesting
(`properties` within an object property) and arrays (`items`) to model real
structure. Keep it focused: model the fields the task actually needs — a tight
5–15 field schema beats a sprawling one. Very large schemas (many dozens of
deeply nested fields) are harder for providers to satisfy; split a giant
contract into a smaller core plus optional `$defs`.

## Editing etiquette

When revising a proposed schema, return **one complete updated block** — the
full `{ "__kind": "schema_proposal", ... }` object, never a fragment or a diff.
Keep the `"__kind"` discriminator, keep the same `name` unless the user renames
it, and preserve the properties you aren't changing (descriptions, enums, nested
shapes) exactly. The card replaces wholesale on each emission.

## One correct minimal example

```json
{
  "__kind": "schema_proposal",
  "name": "contact_extraction",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["full_name", "email"],
    "properties": {
      "full_name": { "type": "string", "description": "Person's full name." },
      "email": { "type": "string", "format": "email" }
    }
  }
}
```
$BODY$
WHERE skill_id = 'schema-proposal-render-block' AND user_id IS NULL;

-- ---------------------------------------------------------------------------
-- Content block: right-click "Schema Proposal" into an agent's system prompt.
-- Shared render-block content-block category (dimension 'shortcut',
-- placement_type 'content-block', "Render Blocks"). block_id is UNIQUE.
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
  user_id,
  project_id,
  task_id,
  version,
  metadata
)
VALUES (
  'schema-proposal',
  'Schema Proposal',
  'Propose a structured-output JSON Schema an agent can adopt',
  'FileJson',
  $CB$When the user asks you to design the structured output an agent should return, propose a JSON Schema as a schema_proposal block — it renders as a card the user can apply to any agent:

```json
{ "__kind": "schema_proposal", "name": "support_ticket_classification", "strict": true, "schema": {
  "type": "object", "additionalProperties": false,
  "required": ["category", "summary"],
  "properties": {
    "category": { "type": "string", "enum": ["billing","technical","account","other"] },
    "summary":  { "type": "string", "description": "One-sentence issue summary." }
  }
} }
```

- `name`: letters/digits/_/- only, ≤ 64 chars. `schema` root is always `"type":"object"`.
- Set `"additionalProperties": false` on every object; when `strict:true`, list EVERY property in `required` (model optional fields as nullable, e.g. `"type":["string","null"]`).
- Propose the contract, not example data. Prefer `enum` for finite choices.
- Editing: return ONE complete block, keep `__kind`, preserve unchanged properties.$CB$,
  10,
  true,
  '6913d9fc-b8c0-4107-af40-27d55c177694',  -- platform.categories: dimension 'shortcut', placement 'content-block', "Render Blocks"
  '39c38960-d30c-4840-b0c1-c9960de95582',  -- Matrx System org
  NULL,
  NULL,
  NULL,
  1,
  '{}'::jsonb
)
ON CONFLICT (block_id) DO UPDATE SET
  label           = EXCLUDED.label,
  description     = EXCLUDED.description,
  icon_name       = EXCLUDED.icon_name,
  template        = EXCLUDED.template,
  sort_order      = EXCLUDED.sort_order,
  is_active       = EXCLUDED.is_active,
  category_id     = EXCLUDED.category_id,
  updated_at      = now();

COMMIT;
