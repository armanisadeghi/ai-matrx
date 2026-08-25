"use client";

/**
 * THE ONE loading-slug resolution — declared → derived → generic, in one place.
 *
 * Every surface that renders a kind's loading state needs the same answer to
 * "which silhouette does this kind get?": the chat render path, the workflow
 * run slots, the Stream tab's verdicts, the loader gallery. Three copies of a
 * `??` chain is three chances to disagree, and the chain has a trap in it that
 * a copy will reproduce (below), so it lives here and nowhere else.
 *
 * 🚨 THE TRAP — an INVALID declaration must never suppress derivation.
 * `getDeclaredLoadingComponent` returns whatever string the row holds. A `??`
 * chain advances only on null/undefined, so a kind declaring a slug the
 * library does not have (`"report"`, live on `keyword_serp_intent_analysis_v1`
 * until 2026-08-23) returns non-null, skips derivation entirely, and lands on
 * the shapeless `generic` skeleton — making a WRONG declaration strictly worse
 * than no declaration at all. Here an unknown slug is treated as "not
 * declared" for RESOLUTION, while still being reported as the defect it is:
 * the doctor reds it (`unknown-loading-component`) and this module screams
 * once per kind per session, because nothing else at runtime ever says so.
 */

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { kindRegistry } from "../../registry/kind-registry";
import {
  inferLoadingSlug,
  inferLoadingSlugFromJsonSchema,
} from "./infer-loading-slug";
import { isKnownKindLoadingSlug, type KindLoadingSlug } from "./kind-loading-slugs";

/** Where the answer came from — surfaced so the Stream tab / doctor can say. */
export type LoadingSlugOrigin = "declared" | "derived" | "generic";

export interface LoadingSlugResolution {
  /** The library slug, or null when nothing beat the generic skeleton. */
  slug: KindLoadingSlug | null;
  origin: LoadingSlugOrigin;
  /**
   * The declared value when it was NOT a library slug — a data defect that
   * resolution routed around. Present means "this kind declares a lie".
   */
  invalidDeclared?: string;
}

const GENERIC: LoadingSlugResolution = { slug: null, origin: "generic" };

/** One scream per kind per session — a re-render re-reports nothing. */
const reportedInvalidDeclarations = new Set<string>();

function reportInvalidDeclaration(kind: string, declared: string): void {
  if (reportedInvalidDeclarations.has(kind)) return;
  reportedInvalidDeclarations.add(kind);
  const message =
    `[content-ir] kind "${kind}" declares loading_component "${declared}", which is not in ` +
    `the loading library (kind-loading-slugs.ts). Falling back to the DERIVED loader so the ` +
    `declaration cannot make the render worse — but the declaration is a defect: fix the row ` +
    `or add "${declared}" to the library.`;
  console.error(message);
  try {
    captureError({
      source: "content-ir",
      message,
      relation: kind,
      callSite: "resolveLoadingSlugForKind",
      hint: "kind_definition.metadata.loading_component must name a slug from KIND_LOADING_SLUGS.",
      raw: { kind, declared },
    });
  } catch {
    /* diagnostics must never break rendering */
  }
}

/** Test seam — resets the once-per-kind scream dedupe. */
export function resetInvalidLoadingDeclarationReports(): void {
  reportedInvalidDeclarations.clear();
}

/**
 * Which loading silhouette does this kind get?
 *
 * 1. DECLARED — `metadata.loading_component` (read through the registry, not
 *    off the definition: a Python-owned kind never produces a definition, so
 *    its owner's choice lives only in the catalog side map) when it names a
 *    real library slug.
 * 2. DERIVED — from the kind's own parser schema, else from its emitted JSON
 *    Schema (the only shape description most kinds carry). Costs nothing to
 *    author and gives 857-of-868 undeclared kinds a shaped loader.
 * 3. GENERIC — nothing distinctive enough; `null` lets the registry's own
 *    default answer.
 */
export function resolveLoadingSlugForKind(
  kind: string | null | undefined,
): LoadingSlugResolution {
  if (!kind) return GENERIC;

  const declared = kindRegistry.getDeclaredLoadingComponent(kind);
  if (declared && isKnownKindLoadingSlug(declared)) {
    return { slug: declared, origin: "declared" };
  }
  const invalidDeclared = declared ?? undefined;
  if (invalidDeclared !== undefined) {
    reportInvalidDeclaration(kind, invalidDeclared);
  }

  const derived =
    inferLoadingSlug(kindRegistry.getDefinition(kind)?.schema) ??
    inferLoadingSlugFromJsonSchema(kindRegistry.getEmittedJsonSchema(kind));

  if (derived) {
    return invalidDeclared === undefined
      ? { slug: derived, origin: "derived" }
      : { slug: derived, origin: "derived", invalidDeclared };
  }
  return invalidDeclared === undefined
    ? GENERIC
    : { slug: null, origin: "generic", invalidDeclared };
}
