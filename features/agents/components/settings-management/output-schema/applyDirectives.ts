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
  | "db_update";

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

/** The JSON schema for ONE item of each directive (becomes `items[]`). */
export const DIRECTIVE_ITEM_SCHEMAS: Record<BuiltinDirective, JsonSchema> = {
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
