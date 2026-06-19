/**
 * Matrx Envelope — the canonical client mirror.
 *
 * One flat shape for every kind: `{ matrx_version, kind, type, items: [...] }`.
 * Detect by `matrx_version` presence; route by `kind`; each item is typed per
 * `(kind, type)`. This module is the single FE home for the envelope contract —
 * detection, types, the directive-receipt events, and the output-schema builder.
 *
 * Spec (kept byte-identical with aidream): `docs/protocol/MATRX_ENVELOPE.md`.
 */

export const MATRX_VERSION = 1 as const;

export type MatrxKind = "output_directive" | "reference" | "secret" | "validation";

/** The universal outer shell. Items are unknown until routed by `(kind, type)`. */
export interface MatrxEnvelope<Item = Record<string, unknown>> {
  matrx_version: number;
  kind: string;
  type: string;
  items: Item[];
}

/** The one detector — presence of `matrx_version`. */
export function isMatrxEnvelope(value: unknown): value is MatrxEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "matrx_version" in (value as Record<string, unknown>)
  );
}

// ── Output-directive receipt events (stream `data` events) ───────────────────

export type DirectiveApplyStatus = "applied" | "already_applied" | "failed";
export type DirectiveFault = "agent" | "processor";

export interface DirectiveApplyStarted {
  kind: "directive_apply.started";
  type: string;
  item_count: number;
}
export interface DirectiveItemApplied {
  kind: "directive_apply.item";
  type: string;
  index: number;
  status: Exclude<DirectiveApplyStatus, "failed">;
  resource_kind: string;
  resource_ids: string[];
  summary: string;
}
export interface DirectiveItemFailed {
  kind: "directive_apply.failed";
  type: string;
  index: number;
  error: string;
  fault: DirectiveFault;
}
export interface DirectiveApplyCompleted {
  kind: "directive_apply.completed";
  type: string;
  applied: number;
  failed: number;
}
export type DirectiveApplyEvent =
  | DirectiveApplyStarted
  | DirectiveItemApplied
  | DirectiveItemFailed
  | DirectiveApplyCompleted;

export function isDirectiveApplyEvent(value: unknown): value is DirectiveApplyEvent {
  if (typeof value !== "object" || value === null) return false;
  const k = (value as { kind?: unknown }).kind;
  return (
    k === "directive_apply.started" ||
    k === "directive_apply.item" ||
    k === "directive_apply.failed" ||
    k === "directive_apply.completed"
  );
}

// ── Reference item (in a ```matrx fence) ─────────────────────────────────────

export type ReferencePurpose = "substitute" | "expand" | "inline" | "context";

export interface ReferenceItem {
  purpose: ReferencePurpose;
  slot?: string;
  ref: Record<string, string>;
  display?: { label?: string } & Record<string, unknown>;
}

// ── Output-schema builder (generic; mirrors aidream's schema_gen) ─────────────

type JsonSchema = Record<string, unknown>;

/**
 * Build the strict-shell `output_schema` (`{ name, schema, strict }`) for a shape:
 * the fixed envelope with `const` control fields + `items` as an array of the
 * provided per-item JSON schema. The server owns the canonical generator
 * (`scripts/generate_envelope_registry.py`); this mirrors it for FE authoring.
 */
export function buildEnvelopeOutputSchema(args: {
  name: string;
  kind: MatrxKind;
  type: string;
  itemSchema: JsonSchema;
  strict?: boolean;
}): { name: string; strict: boolean; schema: JsonSchema } {
  const { name, kind, type, itemSchema, strict = false } = args;
  return {
    name,
    strict,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["matrx_version", "kind", "type", "items"],
      properties: {
        matrx_version: { type: "integer", const: MATRX_VERSION },
        kind: { type: "string", const: kind },
        type: { type: "string", const: type },
        items: { type: "array", items: itemSchema },
      },
    },
  };
}
