/**
 * Matrx Action Catalog — OpenAPI aliases + derived UI helpers.
 *
 * Wire contract: `types/python-generated/api-types.ts` (aidream action_catalog).
 * Aliases only — never re-declare schemas here.
 *
 * The grid is the noun × verb matrix; the builder turns a chosen (verb, noun)
 * into a canonical Matrx envelope (`features/matrx-envelope/`).
 */

import type { components } from "@/types/python-generated/api-types";

/** OpenAPI schemas — source of truth */
export type NounActions = components["schemas"]["NounActions"];
export type ActionCatalog = components["schemas"]["ActionCatalog"];
export type ActionReceipt = components["schemas"]["ActionReceipt"];
export type ActionApplyResult = components["schemas"]["ActionApplyResult"];
export type ActionExecuteRequest = components["schemas"]["ActionExecuteRequest"];
export type DirectiveConfirmRequest = components["schemas"]["DirectiveConfirmRequest"];
export type DirectiveConfirmResult = components["schemas"]["DirectiveConfirmResult"];

/** One confirm-receipt item — applied or failed (OpenAPI union). */
export type DirectiveConfirmReceipt =
  | components["schemas"]["DirectiveItemApplied"]
  | components["schemas"]["DirectiveItemFailed"];

/** A cell's wiring state — derived from NounActions verb columns. */
export type ActionState = NounActions["reference"];

/** The five verbs — derived from NounActions keys (excludes noun/family/table). */
export type ActionVerb = keyof Pick<
  NounActions,
  "reference" | "view" | "create" | "update" | "delete"
>;

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
