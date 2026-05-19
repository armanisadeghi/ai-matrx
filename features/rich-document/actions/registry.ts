// features/rich-document/actions/registry.ts
//
// The canonical action registry. Phase 0 ships an empty registry — handlers
// migrate over from features/agents/components/messages-display/message-options/
// messageActionRegistry.ts during Phase 1.
//
// LOOKUP CONTRACT: handlers are looked up by `id` at render time, not stored
// in Redux. This preserves the "no functions in Redux state" doctrine and
// lets the same action ID resolve to different implementations across runtime
// (e.g. analyze-response can swap its overlay target without invalidating
// any persisted surface registration).

import type {
  ContentSourceType,
  RichDocumentAction,
  RichDocumentActionContext,
  RichDocumentActionId,
} from "../types";

/**
 * Module-scope registry. Populated by handler modules during Phase 1
 * (registerAction calls in actions/handlers/copy.ts, save.ts, etc.).
 *
 * Map iteration order = insertion order = a stable display order for
 * variants that don't sort, but variants generally sort by category +
 * `action.order`.
 */
const REGISTRY = new Map<string, RichDocumentAction>();

/**
 * Register an action. Idempotent — re-registering an ID overwrites the
 * previous entry. Phase 1 handler modules call this at module-load time.
 */
export function registerAction(action: RichDocumentAction): void {
  REGISTRY.set(action.id, action);
}

/** Get one action by ID. Returns undefined if unregistered. */
export function getAction(
  id: RichDocumentActionId | string,
): RichDocumentAction | undefined {
  return REGISTRY.get(id);
}

/** Get all registered actions. */
export function getAllActions(): RichDocumentAction[] {
  return Array.from(REGISTRY.values());
}

/**
 * Compute the action list for a given context — applies source filtering,
 * visibility predicates, auth gating, and the consumer's exclude list. Used
 * by every variant renderer.
 */
export function resolveActions(
  ctx: RichDocumentActionContext,
  options?: {
    exclude?: (RichDocumentActionId | string)[];
    extra?: RichDocumentAction[];
  },
): RichDocumentAction[] {
  const excludeSet = new Set(options?.exclude ?? []);
  const sourceType: ContentSourceType = ctx.source.type;

  const all = [...getAllActions(), ...(options?.extra ?? [])];

  return all
    .filter((action) => {
      if (excludeSet.has(action.id)) return false;
      if (
        action.supportedSources !== "*" &&
        !action.supportedSources.includes(sourceType)
      ) {
        return false;
      }
      if (action.requiresAuth && !ctx.isAuthenticated) return false;
      if (action.visible && !action.visible(ctx)) return false;
      return true;
    })
    .sort((a, b) => {
      // Within category by `order` ascending; categories themselves alphabetic
      // for now — variants can re-group as they see fit.
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return (a.order ?? 0) - (b.order ?? 0);
    });
}
