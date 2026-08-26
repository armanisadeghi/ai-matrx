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

// ---------------------------------------------------------------------------
// THE DOM SNIFFER — per-row identity with no resolver code
// ---------------------------------------------------------------------------

/**
 * A token SHAPE check, deliberately not a registry lookup.
 *
 * `isEntityTypeToken` would be the precise guard, but it lives in the 2,500-line
 * generated entity module and this file loads in the INERT SHELL (see the header
 * law). A shape check catches the realistic failure — a typo, a label, a raw
 * uuid in the wrong attribute — at zero weight; a well-formed but unregistered
 * token is caught downstream by Attach To's own write path.
 */
const TOKEN_SHAPE = /^[a-z][a-z0-9_]*$/;

/**
 * Read the right-clicked row's entity straight off the DOM.
 *
 * 🚨 WHY THIS EXISTS (Phase 0, 2026-08-25). `resolveContextOnOpen` is the
 * precise path and remains it — but it made per-row identity cost a
 * hand-written resolver on EVERY table. With ~500 surfaces still to wire that
 * is ~500 bespoke `rowFor(target)` functions, each one a place to return the
 * wrong row. A row that already knows what it is can now simply SAY so:
 *
 *   <tr data-entity-type="seo_keyword" data-entity-id={k.id} data-entity-title={k.phrase}>
 *
 * and Attach To / Share target that record with no resolver at all.
 *
 * PRECEDENCE — THE SURFACE ALWAYS WINS. This runs ONLY when
 * `resolveContextOnOpen` did not speak about the entity at all (key absent).
 * An explicit `null` from the surface means "this target has no entity" and is
 * honoured; the DOM never overrides a deliberate answer.
 */
export function sniffEntityFromDom(
  target: HTMLElement | null,
): ContextMenuEntityRef | null {
  const host = target?.closest?.("[data-entity-type][data-entity-id]");
  if (!(host instanceof HTMLElement)) return null;

  const type = host.getAttribute("data-entity-type")?.trim() ?? "";
  const id = host.getAttribute("data-entity-id")?.trim() ?? "";
  if (!type || !id) return null;

  if (!TOKEN_SHAPE.test(type)) {
    if (isDev) {
      console.error(
        `%c[ContextMenuV3] MALFORMED data-entity-type%c — "${type}" is not an entity token (expected snake_case, e.g. "seo_keyword"), so Attach To / Share would target nothing. Fix the attribute or drop it.`,
        "color:#ef4444;font-weight:bold",
        "color:inherit",
        { element: host },
      );
    }
    return null;
  }

  // Title is what the user sees the row called; the row's own text is the
  // honest fallback so an Attach is never labelled with a raw uuid.
  const title =
    host.getAttribute("data-entity-title")?.trim() ||
    (host.textContent ?? "").trim().slice(0, 120) ||
    id;

  const resourceType = host.getAttribute("data-entity-resource")?.trim();

  return {
    type: type as ContextMenuEntityRef["type"],
    id,
    title,
    ...(resourceType
      ? { resourceType: resourceType as ContextMenuEntityRef["resourceType"] }
      : {}),
  };
}

/**
 * The effective entity for one open, DOM sniff included. Surface answer wins;
 * the sniff only fills a silence.
 */
export function resolveEffectiveEntityWithDom(
  entityProp: ContextMenuEntityRef | undefined,
  resolved: ResolvedContextMenuContext | null,
  target: HTMLElement | null,
): ContextMenuEntityRef | undefined {
  const surfaceSpoke = !!resolved && CONTEXT_MENU_ENTITY_KEY in resolved;
  if (surfaceSpoke) return resolveEffectiveEntity(entityProp, resolved);
  return sniffEntityFromDom(target) ?? entityProp;
}
