// features/context-menu-v3/utils/per-row-entity.ts
//
// THE PER-ROW ENTITY — the delegated-menu half of the entity contract.
//
// A table wires ONE menu for the whole pane (`resolveContextOnOpen`), so the
// menu-level `entity` prop can never name the row that was actually
// right-clicked: before 2026-08-24 Attach To / Share on a table menu silently
// targeted the pane's entity, or rendered nothing at all. `resolveContextOnOpen`
// may now return the reserved `CONTEXT_MENU_ENTITY_KEY` and the shell rebuilds
// the entity-bound actions from it.
//
// Kept in its own module (not `value-resolution.ts`) on purpose: the INERT
// SHELL imports this, and value-resolution pulls the surface-manifest registry.
// Nothing here may import anything heavier than types.

import {
  CONTEXT_MENU_ENTITY_KEY,
  type ContextMenuEntityRef,
  type ResolvedContextMenuContext,
} from "../types";

const isDev = process.env.NODE_ENV !== "production";

/**
 * The effective entity for ONE menu open.
 *
 *   key absent  → the menu-level prop stands (single-entity surfaces unchanged)
 *   key present → that row's entity wins
 *   key `null`  → this target has no entity, so the entity-bound actions hide
 *                 rather than target the wrong record
 *
 * A malformed value (no string `type` + `id`) is treated as absent and SCREAMS
 * in dev — a half-built entity would render an Attach that writes a broken edge.
 */
export function resolveEffectiveEntity(
  entityProp: ContextMenuEntityRef | undefined,
  resolved: ResolvedContextMenuContext | null,
): ContextMenuEntityRef | undefined {
  if (!resolved || !(CONTEXT_MENU_ENTITY_KEY in resolved)) return entityProp;
  const perRow = resolved[CONTEXT_MENU_ENTITY_KEY];
  if (perRow === null || perRow === undefined) return undefined;
  const candidate = perRow as ContextMenuEntityRef;
  if (
    typeof perRow !== "object" ||
    typeof candidate.type !== "string" ||
    !candidate.type ||
    typeof candidate.id !== "string" ||
    !candidate.id
  ) {
    if (isDev) {
      console.error(
        `%c[ContextMenuV3] MALFORMED PER-ROW ENTITY%c — resolveContextOnOpen returned "${CONTEXT_MENU_ENTITY_KEY}" without a string type + id, so Attach To / Share would target nothing. Falling back to the menu-level entity.`,
        "color:#ef4444;font-weight:bold",
        "color:inherit",
        { received: perRow },
      );
    }
    return entityProp;
  }
  return candidate;
}

/**
 * The effective `contextData` for one open: static payload + per-target merge,
 * with the reserved entity key stripped so it never lands in the
 * `ApplicationScope` as a value.
 */
export function mergeResolvedContextData(
  contextData: Record<string, unknown> | undefined,
  resolved: ResolvedContextMenuContext | null,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...(contextData ?? {}),
    ...(resolved ?? {}),
  };
  delete merged[CONTEXT_MENU_ENTITY_KEY];
  return merged;
}
