/**
 * Matrx reference taxonomy + the directive-apply receipt events.
 *
 * 🚨 THE SHELL NO LONGER LIVES HERE. A directive is
 * `{"__kind":"directive_v1_<class>_<noun>","items":[…]}` and its grammar,
 * detector and decoder are `features/content-ir/directives/` — one shape, one
 * discriminator, shared with every other kind. What remains in this module is
 * what is genuinely reference-specific: the reference NOUN taxonomy and the
 * per-noun item shapes the chips render, plus the typed stream receipts.
 *
 * The retired 4-key shell (`matrx_version`/`kind`/`type`/`items`) is READ-ONLY
 * and understood in exactly one place — `directives/legacyShell.ts`, reachable
 * only through `decodeDirective`. Nothing here emits it and nothing here
 * detects it. See common-docs/projects/kind-directives/PLAN.md.
 */

// ── Output-directive receipt events (stream `data` events) ───────────────────

export type DirectiveApplyStatus = "applied" | "already_applied" | "failed";
export type DirectiveFault = "agent" | "processor";

/**
 * 🚨 EVERY receipt's identity field is `directive` and it carries the SLUG.
 * There is deliberately no second field and no alias: the slug is the identity,
 * and a receipt that named the thing differently from the payload it describes
 * is the exact split the Kind Directives merge closed. Server contract:
 * aidream `services/output_directives/events.py`.
 */
export interface DirectiveApplyStarted {
  kind: "directive_apply.started";
  directive: string;
  item_count: number;
}
export interface DirectiveItemApplied {
  kind: "directive_apply.item";
  directive: string;
  index: number;
  status: Exclude<DirectiveApplyStatus, "failed">;
  resource_kind: string;
  resource_ids: string[];
  summary: string;
}
export interface DirectiveItemFailed {
  kind: "directive_apply.failed";
  directive: string;
  index: number;
  error: string;
  fault: DirectiveFault;
}
export interface DirectiveApplyCompleted {
  kind: "directive_apply.completed";
  directive: string;
  applied: number;
  failed: number;
}
/**
 * A model-emitted directive whose resolved apply policy is `ask` — NOT applied.
 * The client renders an approve/decline card and, on accept, POSTs `shell`
 * back to `/directives/confirm`. Idempotent by `proposal_id`. See the backend
 * cascade: aidream services/output_directives/policy.py + confirm.py.
 */
export interface DirectiveProposed {
  kind: "directive_apply.proposed";
  directive: string;
  proposal_id: string;
  item_count: number;
  /** Display hints DERIVED from the slug — never a second source of identity. */
  directive_class: string;
  noun: string;
  summary: string | null;
  /** The two-key shell, POSTed back to /directives/confirm verbatim. */
  shell: Record<string, unknown>;
}
/** A directive suppressed by the cascade (`off`, or `ask` with no human). */
export interface DirectiveApplyBlocked {
  kind: "directive_apply.blocked";
  directive: string;
  reason: string;
}
export type DirectiveApplyEvent =
  | DirectiveApplyStarted
  | DirectiveItemApplied
  | DirectiveItemFailed
  | DirectiveApplyCompleted
  | DirectiveProposed
  | DirectiveApplyBlocked;

export function isDirectiveApplyEvent(
  value: unknown,
): value is DirectiveApplyEvent {
  if (typeof value !== "object" || value === null) return false;
  const k = (value as { kind?: unknown }).kind;
  return (
    k === "directive_apply.started" ||
    k === "directive_apply.item" ||
    k === "directive_apply.failed" ||
    k === "directive_apply.completed" ||
    k === "directive_apply.proposed" ||
    k === "directive_apply.blocked"
  );
}

export function isDirectiveProposed(
  value: unknown,
): value is DirectiveProposed {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "directive_apply.proposed"
  );
}

import {
  type DirectiveClass,
  KIND_KEY,
  buildDirectiveSlug,
} from "@/features/content-ir/directives/grammar";

// ── Reference item (in a ```matrx fence) ─────────────────────────────────────
//
// The CANONICAL reference item is PURE FLAT IDENTITY: the typed ids that name
// the thing + optional, non-authoritative display hints. NOTHING ELSE. There is
// no `purpose` / `slot` / `ref` / `display` nesting — intent is decided by the
// item's POSITION (in-content fence = resolve in place; variable binding = the
// map key is the slot), never a field on the item. (See
// docs/protocol/MATRX_REFERENCES.md — "The item shape" + "Where purpose went".)

// (The legacy `purpose` intent field and the `legacyTranslate.ts` translation layer were
// deleted 2026-07-08 — no stored value carries the old nested/`picklist_ref` shapes anymore;
// resolution intent is decided by POSITION only.)

/**
 * UDT + record reference taxonomy. `dataset_cell` is a legacy alias of `table_cell`.
 * Record types (`task`, `note`, …) share the backend `RecordRef { id }` item shape.
 */
export const REFERENCE_TYPES = [
  "structured_list",
  "structured_list_group",
  "structured_list_item",
  // Legacy (read-only): pre-rename historical references. NEW content emits the
  // structured_list* tokens above. See common-docs/projects/structured-lists-rename.
  "picklist",
  "picklist_group",
  "picklist_item",
  "table",
  "table_schema",
  "table_column",
  "table_row",
  "table_cell",
  "task",
  "note",
  "project",
  "agent",
  "agent_app",
  "transcript",
  "transcript_segment",
  "transcript_session",
  "session_transcript",
  "workbook",
  "workbook_sheet",
  "document",
  "document_page",
  "file",
  "file_page",
  "organization",
  "scope_type",
  "scope",
  "context_item",
  "context_value",
  "url",
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
/** Column definitions only — no row payload (`table_schema` / bookmark `table_schema`). */
export interface TableSchemaRefItem extends ReferenceItemHints {
  table_id: string;
}
export interface TranscriptSegmentRefItem extends ReferenceItemHints {
  transcript_id: string;
  segment_index: string;
}
export interface SessionTranscriptRefItem extends ReferenceItemHints {
  session_id: string;
  transcript_id: string;
}
export interface WorkbookSheetRefItem extends ReferenceItemHints {
  workbook_id: string;
  sheet_id: string;
}
export interface DocumentPageRefItem extends ReferenceItemHints {
  document_id: string;
  page_index: string;
}
export interface FilePageRefItem extends ReferenceItemHints {
  file_id: string;
  page_number: string;
}
/** Filled cell at scope × context_item (`ctx_context_item_values`, current row). */
export interface ContextValueRefItem extends ReferenceItemHints {
  scope_id: string;
  context_item_id: string;
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

/** Generic id-keyed record (`task`, `note`, `agent`, …). */
export interface RecordRefItem extends ReferenceItemHints {
  id: string;
}
/**
 * An arbitrary external URL — the one reference type with no Matrx-owned id.
 * Covers anything not already modeled by a canonical entity type (a public
 * web page, a third-party doc link, …). Context items that allow `file` for
 * "our" documents allow `url` alongside it for links we don't own.
 */
export interface UrlRefItem extends ReferenceItemHints {
  url: string;
}

/**
 * The canonical reference item — a flat union over the reference taxonomy. Every
 * member is identity ids + {@link ReferenceItemHints}. The open index signature
 * keeps it assignable from a generic decoded envelope (`Record<string,unknown>`).
 */
export type ReferenceItem =
  | PicklistRefItem
  | PicklistGroupRefItem
  | PicklistItemRefItem
  | TableRefItem
  | TableSchemaRefItem
  | TableColumnRefItem
  | TableRowRefItem
  | TableCellRefItem
  | TranscriptSegmentRefItem
  | SessionTranscriptRefItem
  | WorkbookSheetRefItem
  | DocumentPageRefItem
  | FilePageRefItem
  | ContextValueRefItem
  | RecordRefItem
  | UrlRefItem;

// ── Output-schema builder (generic; mirrors aidream's schema_gen) ─────────────

type JsonSchema = Record<string, unknown>;

/**
 * Build the strict output_schema (`{ name, schema, strict }`) for a directive
 * shape: the two-key shell with `__kind` pinned `const` and FIRST, plus `items`
 * as an array of the provided per-item JSON schema.
 *
 * `__kind` first is load-bearing, not cosmetic — the streaming detector types a
 * JSON document by its first key alone, and a provider that emits the keys in
 * declaration order is what makes a directive route through the kind pipeline
 * from its first bytes instead of arriving as raw text and swapping at the end.
 *
 * `additionalProperties: false` mirrors the server's `extra="forbid"`: it makes
 * "everything lives inside items" structurally true, so a stray top-level key
 * is a hard error and never a silent passthrough. The server owns the canonical
 * generator (`scripts/generate_kind_directive_registry.py`); this mirrors it for
 * FE authoring.
 */
export function buildDirectiveOutputSchema(args: {
  name: string;
  directiveClass: DirectiveClass;
  noun: string;
  itemSchema: JsonSchema;
  strict?: boolean;
}): { name: string; strict: boolean; schema: JsonSchema } {
  const { name, directiveClass, noun, itemSchema, strict = false } = args;
  return {
    name,
    strict,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [KIND_KEY, "items"],
      properties: {
        [KIND_KEY]: {
          type: "string",
          const: buildDirectiveSlug(directiveClass, noun),
        },
        items: { type: "array", items: itemSchema },
      },
    },
  };
}
