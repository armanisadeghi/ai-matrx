/**
 * Authoring helpers for `output_directive` agents (the Matrx Envelope `output_directive`
 * kind). An agent emits `{ matrx_version:1, kind:"output_directive", type, items:[...] }`;
 * the aidream dispatcher applies each item after persist, before stream close.
 *
 * Canonical envelope contract + receipt events live in `features/matrx-envelope/envelope.ts`;
 * this module adds the directive item schemas + the output-schema builder for the builder UI.
 *
 * Backend contract: `docs/protocol/MATRX_ENVELOPE.md`, `aidream/services/output_directives/`.
 */

import {
  buildEnvelopeOutputSchema,
  type DirectiveApplyEvent,
  type DirectiveApplyStatus,
  isDirectiveApplyEvent,
} from "@/features/matrx-envelope/envelope";

export type { DirectiveApplyEvent, DirectiveApplyStatus };
export { isDirectiveApplyEvent };

export type BuiltinDirective =
  | "create_project_with_tasks"
  | "create_task"
  | "db_create"
  | "db_update"
  | "plan_tree"
  | "plan_node_patch";

type JsonSchema = Record<string, unknown>;

// ── Per-item JSON schemas (one item = one thing to create/update) ────────────

const SUBTASK_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: { name: { type: "string" }, description: { type: ["string", "null"] } },
};

const TASK_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: { type: "string" },
    description: { type: ["string", "null"] },
    subtasks: { type: "array", items: SUBTASK_SCHEMA },
  },
};

// Content Planning (plan schema). Mirrors aidream PlanTreeItem /
// PlanNodePatchItem (services/content_plan/directives.py — the generated
// manifest docs/protocol/matrx_envelope_registry.generated.json is
// canonical). Derived plan.node cache (route/depth/pillar/cluster labels)
// is DB-trigger-owned and deliberately absent from both schemas.
//
// DEPTH-FLATTENED, NOT RECURSIVE: Anthropic structured outputs reject
// self-referencing $defs ("Circular reference detected: PlanNode ->
// PlanNode" — hit live 2026-07-25 running plan_tree on an Anthropic model;
// OpenAI accepts recursion). Four explicit levels (pillar → cluster →
// article + one spare) cover every real plan; aidream's Pydantic side
// accepts arbitrary depth regardless. aidream's own injected schema has
// the same recursion bug — flagged in the content-plan handoff.
function planTreeNodeSchema(childRef: string | null): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["label", "node_type"],
    properties: {
      label: { type: "string" },
      node_type: { enum: ["home", "pillar", "cluster", "article", "index"] },
      slug: { type: ["string", "null"], description: "kebab-case; null only for home." },
      status: { type: ["string", "null"], description: "plan_status slug (idea|planned|…)." },
      page_type: { type: ["string", "null"], description: "plan_page_type slug." },
      priority: { type: ["integer", "null"], minimum: 1, maximum: 3 },
      technical_depth: { type: ["string", "null"], enum: ["low", "medium", "high", null] },
      needs_reviewer: { type: "boolean" },
      brief: { type: "array", items: { type: "string" } },
      attributes: { type: "object" },
      primary_keyword_id: { type: ["string", "null"] },
      primary_keyword_phrase: { type: ["string", "null"] },
      topics: { type: "array", items: { type: "string" } },
      sources: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label"],
          properties: {
            label: { type: "string" },
            url: { type: ["string", "null"] },
            source_type: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
          },
        },
      },
      ...(childRef
        ? { children: { type: "array", items: { $ref: childRef } } }
        : {}),
    },
  };
}

/** The JSON schema for ONE item of each directive (becomes `items[]`). */
export const DIRECTIVE_ITEM_SCHEMAS: Record<BuiltinDirective, JsonSchema> = {
  plan_tree: {
    type: "object",
    additionalProperties: false,
    required: ["site_id", "nodes"],
    $defs: {
      plan_node_l1: planTreeNodeSchema("#/$defs/plan_node_l2"),
      plan_node_l2: planTreeNodeSchema("#/$defs/plan_node_l3"),
      plan_node_l3: planTreeNodeSchema("#/$defs/plan_node_l4"),
      plan_node_l4: planTreeNodeSchema(null),
    },
    properties: {
      site_id: { type: "string", description: "web.site uuid the plan belongs to." },
      default_status: { type: ["string", "null"], description: "plan_status slug for nodes without one." },
      nodes: { type: "array", items: { $ref: "#/$defs/plan_node_l1" } },
    },
  },
  plan_node_patch: {
    type: "object",
    additionalProperties: false,
    properties: {
      node_id: { type: ["string", "null"], description: "plan.node uuid — OR address by site_id+route." },
      site_id: { type: ["string", "null"] },
      route: { type: ["string", "null"], description: "The node's current route (derived, read-only — used only to address it)." },
      label: { type: ["string", "null"] },
      slug: { type: ["string", "null"] },
      node_type: { type: ["string", "null"] },
      parent_id: { type: ["string", "null"] },
      status: { type: ["string", "null"] },
      page_type: { type: ["string", "null"] },
      priority: { type: ["integer", "null"], minimum: 1, maximum: 3 },
      technical_depth: { type: ["string", "null"] },
      needs_reviewer: { type: ["boolean", "null"] },
      brief: { type: ["array", "null"], items: { type: "string" } },
      attributes: { type: ["object", "null"] },
      primary_keyword_id: { type: ["string", "null"] },
    },
  },
  create_project_with_tasks: {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: { type: "string" },
      slug: { type: ["string", "null"] },
      description: { type: ["string", "null"] },
      start_date: { type: ["string", "null"], description: "ISO date (YYYY-MM-DD)." },
      end_date: { type: ["string", "null"], description: "ISO date (YYYY-MM-DD)." },
      tasks: { type: "array", items: TASK_SCHEMA },
    },
  },
  create_task: {
    type: "object",
    additionalProperties: false,
    required: ["title"],
    properties: {
      title: { type: "string" },
      description: { type: ["string", "null"] },
      project_id: { type: ["string", "null"] },
      parent_task_id: { type: ["string", "null"] },
    },
  },
  db_create: {
    type: "object",
    additionalProperties: false,
    required: ["resource_type", "data"],
    properties: {
      resource_type: { type: "string", description: "An agent_data resource (note, task, …)." },
      data: { type: "object", description: "The row's writable fields." },
    },
  },
  db_update: {
    type: "object",
    additionalProperties: false,
    required: ["resource_type", "id", "data"],
    properties: {
      resource_type: { type: "string" },
      id: { type: "string" },
      data: { type: "object" },
    },
  },
};

/**
 * The full `output_schema` an agent stores to emit a directive envelope. Control
 * fields are `const`; the model only authors `items`. Mirrors aidream's
 * `directive_output_schema(type)` — the server is the canonical generator.
 */
export function buildDirectiveOutputSchema(
  type: BuiltinDirective,
  opts?: { name?: string },
): { name: string; strict: boolean; schema: JsonSchema } {
  return buildEnvelopeOutputSchema({
    name: opts?.name ?? `${type}_directive`,
    kind: "output_directive",
    type,
    itemSchema: DIRECTIVE_ITEM_SCHEMAS[type],
  });
}
