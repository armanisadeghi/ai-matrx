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
//
// The CANONICAL reference item is PURE FLAT IDENTITY: the typed ids that name
// the thing + optional, non-authoritative display hints. NOTHING ELSE. There is
// no `purpose` / `slot` / `ref` / `display` nesting — intent is decided by the
// item's POSITION (in-content fence = resolve in place; variable binding = the
// map key is the slot), never a field on the item. (See
// docs/protocol/MATRX_REFERENCES.md — "The item shape" + "Where purpose went".)

/**
 * @deprecated The legacy intent field. It no longer lives on a canonical item —
 * resolution is decided by position. Kept ONLY so the loud legacy-translation
 * layer (`legacyTranslate.ts`) can type the old nested input it migrates away.
 * Do NOT add this to a new item.
 */
export type ReferencePurpose = "substitute" | "expand" | "inline" | "context";

/** The 7-type reference taxonomy. `dataset_cell` is a legacy alias of `table_cell`. */
export const REFERENCE_TYPES = [
  "picklist",
  "picklist_group",
  "picklist_item",
  "table",
  "table_column",
  "table_row",
  "table_cell",
] as const;

export type ReferenceType = (typeof REFERENCE_TYPES)[number];

/**
 * Display hints — all optional, all non-authoritative (re-fetched live on every
 * read). Present only for instant paint + offline/LLM readability. `extra="allow"`
 * on the backend item model is mirrored here by the open-ended index signature so
 * UI fetch hints (limit / offset / sort) survive a round-trip.
 */
export interface ReferenceItemHints {
  label?: string;
  table_name?: string;
  list_name?: string;
  column_display_name?: string;
  description?: string;
  [extra: string]: unknown;
}

export interface PicklistRefItem extends ReferenceItemHints {
  list_id: string;
}
export interface PicklistGroupRefItem extends ReferenceItemHints {
  list_id: string;
  group_name: string;
}
export interface PicklistItemRefItem extends ReferenceItemHints {
  list_id: string;
  item_id: string;
}
export interface TableRefItem extends ReferenceItemHints {
  table_id: string;
}
export interface TableColumnRefItem extends ReferenceItemHints {
  table_id: string;
  column_name: string;
}
export interface TableRowRefItem extends ReferenceItemHints {
  table_id: string;
  row_id: string;
}
export interface TableCellRefItem extends ReferenceItemHints {
  table_id: string;
  row_id: string;
  column_name: string;
}

/**
 * The canonical reference item — a flat union over the 7-type taxonomy. Every
 * member is identity ids + {@link ReferenceItemHints}. The open index signature
 * keeps it assignable from a generic decoded envelope (`Record<string,unknown>`).
 */
export type ReferenceItem =
  | PicklistRefItem
  | PicklistGroupRefItem
  | PicklistItemRefItem
  | TableRefItem
  | TableColumnRefItem
  | TableRowRefItem
  | TableCellRefItem;

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
