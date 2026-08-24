/**
 * Matrx Directive Catalog — OpenAPI aliases + derived UI helpers.
 *
 * Wire contract: `types/python-generated/api-types.ts` (aidream directive_catalog).
 * Aliases only — never re-declare schemas here.
 *
 * The grid is the noun × verb matrix; the builder turns a chosen (verb, noun)
 * into a canonical Matrx envelope (`features/matrx-envelope/`).
 */

import type { components } from "@/types/python-generated/api-types";

/** OpenAPI schemas — source of truth */
export type NounDirectives = components["schemas"]["NounDirectives"];
export type DirectiveCatalog = components["schemas"]["DirectiveCatalog"];
export type DirectiveReceipt = components["schemas"]["DirectiveReceipt"];
export type DirectiveApplyResult =
  components["schemas"]["DirectiveApplyResult"];
export type DirectiveExecuteRequest =
  components["schemas"]["DirectiveExecuteRequest"];
export type DirectiveConfirmRequest =
  components["schemas"]["DirectiveConfirmRequest"];
export type DirectiveConfirmResult =
  components["schemas"]["DirectiveConfirmResult"];

/** One confirm-receipt item — applied or failed (OpenAPI union). */
export type DirectiveConfirmReceipt =
  | components["schemas"]["DirectiveItemApplied"]
  | components["schemas"]["DirectiveItemFailed"];

/** One Plane-2 function (or deprecated legacy named directive). */
export type CustomActionEntry = components["schemas"]["KindActionEntry"];

/** A cell's wiring state — derived from NounDirectives verb columns. */
export type DirectiveState = NounDirectives["reference"];

/** The five verbs — derived from NounDirectives keys (excludes noun/family/table). */
export type DirectiveVerb = keyof Pick<
  NounDirectives,
  "reference" | "view" | "create" | "update" | "delete"
>;

/** The read verbs — everything else is a write producing `verb:noun`. The
 * runtime axis is `catalog.verbs`; this only names the two pure reads. */
export const READ_VERBS: readonly DirectiveVerb[] = [
  "reference",
  "view",
] as const;

export const DIRECTIVE_VERBS = [
  "reference",
  "view",
  "create",
  "update",
  "delete",
] as const satisfies readonly DirectiveVerb[];

const DIRECTIVE_VERB_SET: ReadonlySet<string> = new Set(DIRECTIVE_VERBS);

export function isDirectiveVerb(value: string): value is DirectiveVerb {
  return DIRECTIVE_VERB_SET.has(value);
}

export function isWriteVerb(verb: string): boolean {
  return !READ_VERBS.includes(verb as DirectiveVerb);
}

/** Runtime guard — the response is non-sensitive but still untrusted JSON. */
export function isDirectiveCatalog(value: unknown): value is DirectiveCatalog {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.directive_version === "number" &&
    Array.isArray(v.nouns)
  );
}

/** Read one verb's state off a noun row (the verbs are flat columns). */
export function cellState(
  noun: NounDirectives,
  verb: DirectiveVerb,
): DirectiveState {
  return noun[verb];
}

/** Runtime guard for the execute response. */
export function isDirectiveApplyResult(
  value: unknown,
): value is DirectiveApplyResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.directive === "string" &&
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
    typeof v.directive === "string" &&
    typeof v.proposal_id === "string" &&
    typeof v.applied === "number" &&
    typeof v.failed === "number" &&
    Array.isArray(v.receipts)
  );
}
