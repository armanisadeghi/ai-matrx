/**
 * The Matrix binding of THE KIND ROUTE.
 *
 * The route itself — envelope → registered kind → the right component, with the
 * db-override flip, the compiled-bridge path, the resolver path, and the R6
 * generic fallback — lives in `@ai-matrx/content-ir-react`
 * (`route/kind-route.ts`), because every UI that renders a kind has to make
 * exactly those decisions in exactly that order. Read the semantics there.
 *
 * This module binds our registries, our Error Inspector, our platform, and our
 * owned block types, and keeps the historical import path stable so ~60 call
 * sites and every doc pointer still read the same.
 */

import {
  applyIrKindRoute as applyIrKindRoutePure,
  kindServerDataFromStoredValue as kindServerDataFromStoredValuePure,
  type IrRoutableBlock,
} from "@ai-matrx/content-ir-react";
import {
  MATRX_OWNED_BLOCK_TYPES,
  matrxKindRouteEnv,
} from "../host/route-env";

export {
  DB_KIND_COMPONENT_KEY,
  GENERIC_STRUCTURED_COMPONENT_KEY,
  IR_ROUTE_KEY,
  readIrRouteMarker,
  type GenericFallbackReason,
  type IrRoutableBlock,
  type IrRouteMarker,
} from "@ai-matrx/content-ir-react";

/** Route one block through the Matrix registries. */
export function applyIrKindRoute<T extends IrRoutableBlock>(block: T): T {
  return applyIrKindRoutePure(block, matrxKindRouteEnv, {
    ownedTypes: MATRX_OWNED_BLOCK_TYPES,
  });
}

/**
 * Rehydration route for STRUCTURED persisted artifacts (Track 2B): given a
 * stored zero-loss value object, derive the registered kind's legacy
 * `serverData` with no re-parse. Null for non-objects, unregistered kinds, or
 * kinds without a legacy bridge.
 */
export function kindServerDataFromStoredValue(
  value: unknown,
): Record<string, unknown> | null {
  return kindServerDataFromStoredValuePure(value, matrxKindRouteEnv);
}
