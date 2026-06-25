/**
 * Matrx Action Catalog — the live "two dimensions" contract.
 *
 * Mirrors the backend `GET /actions/catalog` response BYTE-FOR-BYTE (aidream
 * `aidream/services/.../action_catalog`). Every noun (a row) × every verb (a
 * column) is a cell whose state says whether that action is wired, planned, or
 * not applicable. Keep this in lock-step with the server shape — it is the
 * source of truth, this is only the typed FE mirror.
 *
 * The grid is the noun × verb matrix; the builder turns a chosen (verb, noun)
 * into a canonical Matrx envelope (`features/matrx-envelope/`).
 */

/** A cell's wiring state. Literal union — matches the backend exactly. */
export type ActionState = "yes" | "planned" | "no";

/** The five verbs, in display order — the catalog's `verbs` array. */
export type ActionVerb = "reference" | "view" | "create" | "update" | "delete";

/** One noun (a table-backed resource) and its per-verb states — one grid row. */
export interface NounActions {
  noun: string;
  family: string;
  table: string;
  reference: ActionState;
  view: ActionState;
  create: ActionState;
  update: ActionState;
  delete: ActionState;
}

/** The full catalog payload from `GET /actions/catalog`. */
export interface ActionCatalog {
  matrx_version: number;
  verbs: string[];
  nouns: NounActions[];
}

/** Runtime guard — the response is non-sensitive but still untrusted JSON. */
export function isActionCatalog(value: unknown): value is ActionCatalog {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.matrx_version === "number" &&
    Array.isArray(v.verbs) &&
    Array.isArray(v.nouns)
  );
}

/** Read one verb's state off a noun row (the verbs are flat columns). */
export function cellState(noun: NounActions, verb: ActionVerb): ActionState {
  return noun[verb];
}

// ── Execute (Plane-1 writer) — mirrors POST /actions/execute ──────────────────

/** One item's apply outcome. Matches the backend `ActionReceipt`. */
export interface ActionReceipt {
  verb: string;
  noun: string;
  status: "applied" | "already_applied" | "not_implemented" | "failed";
  resource_ids: string[];
  summary: string;
  idempotency_key: string;
  error: string | null;
  detail: Record<string, unknown> | null;
}

/** The execute response — per-item receipts + counts. Matches `ActionApplyResult`. */
export interface ActionApplyResult {
  type: string;
  applied: number;
  failed: number;
  receipts: ActionReceipt[];
}

/** The execute request body. Matches `ActionExecuteRequest`. */
export interface ActionExecuteRequest {
  kind: "output_directive";
  type: string; // "create:<noun>" | "update:<noun>" | "delete:<noun>"
  items: Record<string, unknown>[];
  conversation_id?: string | null;
  force?: boolean;
}

/** Runtime guard for the execute response. */
export function isActionApplyResult(value: unknown): value is ActionApplyResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === "string" &&
    typeof v.applied === "number" &&
    typeof v.failed === "number" &&
    Array.isArray(v.receipts)
  );
}

// ── Confirm (ask policy) — mirrors POST /actions/confirm ─────────────────────

/**
 * Apply a directive an agent PROPOSED under the `ask` policy, once the user
 * accepts. The body is the round-tripped envelope from the
 * `directive_apply.proposed` stream event. Matches the backend
 * `DirectiveConfirmRequest`.
 */
export interface DirectiveConfirmRequest {
  matrx_version: number;
  kind: "output_directive";
  type: string;
  items: Record<string, unknown>[];
  proposal_id?: string | null;
  force?: boolean;
}

/** One confirmed item's receipt — the `directive_apply.*` stream shapes. */
export interface DirectiveConfirmReceipt {
  kind: "directive_apply.item" | "directive_apply.failed";
  type: string;
  index: number;
  status?: "applied" | "already_applied";
  resource_kind?: string;
  resource_ids?: string[];
  summary?: string;
  error?: string;
  fault?: "agent" | "processor";
}

/** The confirm response — counts + per-item receipts. Matches `DirectiveConfirmResult`. */
export interface DirectiveConfirmResult {
  type: string;
  proposal_id: string;
  applied: number;
  failed: number;
  receipts: DirectiveConfirmReceipt[];
}

/** Runtime guard for the confirm response. */
export function isDirectiveConfirmResult(
  value: unknown,
): value is DirectiveConfirmResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === "string" &&
    typeof v.proposal_id === "string" &&
    typeof v.applied === "number" &&
    typeof v.failed === "number" &&
    Array.isArray(v.receipts)
  );
}
