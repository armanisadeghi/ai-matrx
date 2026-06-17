/**
 * Authoring helpers for the **output-directive** pipeline (backend contract:
 * `aidream/services/output_directives/FEATURE.md`).
 *
 * An agent opts a single structured output into auto-apply by emitting an object
 * whose top level carries the reserved key `__matrx_apply`. The aidream
 * orchestrator parses that output, and — after persist, before the stream
 * closes — applies the named directive idempotently and streams a receipt.
 *
 * This module is the FRONTEND side of that contract:
 *  - the envelope + receipt-event TYPES (so consumers are type-safe), and
 *  - `buildApplyOutputSchema(...)`, which wraps a payload schema into a full
 *    `output_schema` (`{ name, schema, strict }`) where `__matrx_apply` and
 *    `directive` are `const` and `idempotency_key` is required — so a
 *    schema-strict agent literally cannot emit a malformed envelope.
 *
 * Nothing here mutates an agent or talks to the server; it produces the schema
 * object you store in `agx_agent.output_schema` and the guards you use when
 * reading the stream.
 */

/** Reserved top-level key whose PRESENCE marks an object for auto-apply. */
export const APPLY_RESERVED_KEY = "__matrx_apply" as const;

/** Current envelope contract version. */
export const APPLY_VERSION = "v1" as const;

/** Built-in directive names (mirror the backend registry). Extensible: a new
 *  backend directive just adds a string here. */
export type BuiltinDirective =
  | "create_project_with_tasks"
  | "create_task"
  | "db_create";

// ── Envelope (what the agent emits) ──────────────────────────────────────────

export interface ApplyEnvelope<P = Record<string, unknown>> {
  [APPLY_RESERVED_KEY]: typeof APPLY_VERSION;
  directive: string;
  idempotency_key: string;
  payload: P;
}

export function hasApplyKey(value: unknown): value is ApplyEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    APPLY_RESERVED_KEY in (value as Record<string, unknown>)
  );
}

// ── Receipt stream events (DATA events the dispatcher emits) ─────────────────
//
// These ride the generic `data` stream event. Match on `kind`. They arrive
// AFTER the assistant's content and the `structured_output` event, but before
// the stream's `end` — the apply "has the last word."

export type DirectiveApplyStatus = "applied" | "already_applied" | "failed";

/** 'agent' = the prompt/schema produced a bad envelope; 'processor' = the
 *  server side effect failed. Lets the UI route blame correctly. */
export type DirectiveApplyFault = "agent" | "processor";

export interface DirectiveApplyStartedEvent {
  kind: "directive_apply.started";
  directive: string;
  idempotency_key: string;
}

export interface DirectiveAppliedEvent {
  kind: "directive_apply.applied";
  directive: string;
  idempotency_key: string;
  status: Exclude<DirectiveApplyStatus, "failed">;
  resource_kind: string;
  resource_ids: string[];
  summary: string;
}

export interface DirectiveApplyFailedEvent {
  kind: "directive_apply.failed";
  directive: string;
  idempotency_key: string;
  error: string;
  fault: DirectiveApplyFault;
}

export type DirectiveApplyEvent =
  | DirectiveApplyStartedEvent
  | DirectiveAppliedEvent
  | DirectiveApplyFailedEvent;

export function isDirectiveApplyEvent(value: unknown): value is DirectiveApplyEvent {
  if (typeof value !== "object" || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return (
    kind === "directive_apply.started" ||
    kind === "directive_apply.applied" ||
    kind === "directive_apply.failed"
  );
}

// ── The builder ──────────────────────────────────────────────────────────────

type JsonSchema = Record<string, unknown>;

export interface BuildApplyOutputSchemaArgs {
  /** Schema name stored in the output_schema envelope (letters/numbers/_/-, ≤64). */
  name: string;
  /** Directive the envelope targets (fixed for this agent via a `const`). */
  directive: BuiltinDirective | string;
  /** JSON Schema for `payload` — the directive-specific shape. */
  payloadSchema: JsonSchema;
  description?: string;
  /** Extra top-level properties the agent may also emit (e.g. a human `message`).
   *  Each is added as an optional property; never part of `required`. */
  extraProperties?: Record<string, JsonSchema>;
}

/**
 * Produce a strict `output_schema` (`{ name, description?, schema, strict:true }`)
 * for an apply-envelope agent. Store the return value in
 * `agx_agent.output_schema`. Because `__matrx_apply` and `directive` are
 * `const` and `idempotency_key` is required, a strict provider cannot emit a
 * malformed envelope.
 */
export function buildApplyOutputSchema(
  args: BuildApplyOutputSchemaArgs,
): { name: string; description?: string; schema: JsonSchema; strict: true } {
  const { name, directive, payloadSchema, description, extraProperties } = args;

  const properties: Record<string, JsonSchema> = {
    [APPLY_RESERVED_KEY]: {
      type: "string",
      const: APPLY_VERSION,
      description: "Reserved marker — its presence routes this object to the apply pipeline.",
    },
    directive: {
      type: "string",
      const: directive,
      description: "The directive to apply.",
    },
    idempotency_key: {
      type: "string",
      description:
        "A stable unique id for this apply. Re-applying the same key returns the existing rows instead of creating duplicates.",
    },
    payload: payloadSchema,
    ...(extraProperties ?? {}),
  };

  // Strict structured output requires every property in `required`; the agent
  // must always produce the envelope fields. Extra (optional) properties are
  // intentionally left out of `required`.
  const required = [APPLY_RESERVED_KEY, "directive", "idempotency_key", "payload"];

  return {
    name,
    ...(description ? { description } : {}),
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required,
      properties,
    },
  };
}

// ── Payload schemas for the built-in directives ──────────────────────────────
//
// Hand these to `buildApplyOutputSchema({ payloadSchema })`. They mirror the
// backend input models (`ProjectInput`, `CreateTaskInput`, `DbCreateInput`).

const SUBTASK_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: { type: "string" },
    description: { type: ["string", "null"] },
  },
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

export const BUILTIN_DIRECTIVE_PAYLOAD_SCHEMAS: Record<BuiltinDirective, JsonSchema> = {
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
      resource_type: {
        type: "string",
        description: "An agent_data-registered resource (note, task, project, transcript, …).",
      },
      data: { type: "object", description: "The row's writable fields." },
    },
  },
};
