/**
 * The context inspector's selection — ONE ordered drill-down (lane
 * CONTEXT-INSPECTOR-GUIDED, Arman 2026-09-25):
 *
 *   Organization → Scope type → Scope → Context item
 *
 * Each step's options come from the previous choice only, and choosing a step
 * clears every step after it (a Clients scope under a Departments type is a
 * contradiction, never a state). The address carries the selection
 * (`?org=&scopeType=&scope=&item=`), so a link reopens exactly this view.
 *
 * Pure: no React, no network — the suite drives it directly.
 */

export interface InspectorSelection {
  org: string | null;
  scopeType: string | null;
  scope: string | null;
  item: string | null;
}

export type InspectorStep = keyof InspectorSelection;

/** The steps in order. A step's options depend on every step before it. */
export const INSPECTOR_STEPS: readonly InspectorStep[] = ["org", "scopeType", "scope", "item"];

export const EMPTY_SELECTION: InspectorSelection = {
  org: null,
  scopeType: null,
  scope: null,
  item: null,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idOrNull(value: string | null | undefined): string | null {
  const v = value?.trim() ?? "";
  return UUID_RE.test(v) ? v : null;
}

/** Read the selection from an address query. Anything that is not an id is ignored. */
export function parseSelection(search: URLSearchParams | string): InspectorSelection {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return {
    org: idOrNull(params.get("org")),
    scopeType: idOrNull(params.get("scopeType")),
    scope: idOrNull(params.get("scope")),
    item: idOrNull(params.get("item")),
  };
}

/**
 * The address query for a selection. Params this page does not own (`agent`,
 * anything a peer adds) are kept; the four steps are written in order, and an
 * empty step is dropped rather than written blank.
 */
export function selectionSearch(
  selection: InspectorSelection,
  current: URLSearchParams | string = "",
): string {
  const params = new URLSearchParams(typeof current === "string" ? current : current.toString());
  for (const step of INSPECTOR_STEPS) params.delete(step);
  for (const step of INSPECTOR_STEPS) {
    const value = selection[step];
    if (value) params.set(step, value);
  }
  return params.toString();
}

/** Choose one step: it takes the value, and every later step is cleared. */
export function chooseStep(
  selection: InspectorSelection,
  step: InspectorStep,
  value: string | null,
): InspectorSelection {
  const index = INSPECTOR_STEPS.indexOf(step);
  const next: InspectorSelection = { ...selection, [step]: value };
  for (const later of INSPECTOR_STEPS.slice(index + 1)) next[later] = null;
  if (selection[step] === value) return selection;
  return next;
}

/**
 * The deepest step chosen, counting only an unbroken chain from the organization
 * (a scope without its organization is not a depth yet; the page back-fills it).
 */
export function selectionDepth(selection: InspectorSelection): InspectorStep | null {
  let depth: InspectorStep | null = null;
  for (const step of INSPECTOR_STEPS) {
    if (!selection[step]) break;
    depth = step;
  }
  return depth;
}

/**
 * How many of a type's scopes the preview hands the agent at the type step. The
 * server resolves every one on both sides, so a type holding hundreds is
 * previewed by its first scopes by name — and the caption says how many.
 */
export const TYPE_PREVIEW_LIMIT = 25;

export interface PreviewRequest {
  depth: InspectorStep;
  organizationId: string;
  /** The scopes both sides of the compare receive — identical on both sides. */
  scopeIds: string[];
  /** At the item step: the one context item the preview narrows to. */
  itemId: string | null;
  /** At the type step: how many scopes the type holds in total. */
  typeScopeCount: number | null;
}

/**
 * What the preview asks for at the current depth — the SAME selection for the
 * old scope system and the record store:
 *
 * - organization — no scope: what an agent in that organization is handed with
 *   nothing selected;
 * - scope type — the type's scopes (first {@link TYPE_PREVIEW_LIMIT} by name).
 *   Sent as scope ids, never as a type id: the server's old side resolves scope
 *   ids only, so a type id would reach one side and not the other;
 * - scope — that one scope;
 * - context item — that scope, narrowed on screen to the one item.
 *
 * Null while the next step's options are still loading (the type step needs its
 * scopes) or when nothing is chosen.
 */
export function previewRequest(
  selection: InspectorSelection,
  typeScopeIds: string[] | null,
): PreviewRequest | null {
  const depth = selectionDepth(selection);
  if (!depth || !selection.org) return null;
  if (depth === "org") {
    return { depth, organizationId: selection.org, scopeIds: [], itemId: null, typeScopeCount: null };
  }
  if (depth === "scopeType") {
    if (!typeScopeIds) return null;
    return {
      depth,
      organizationId: selection.org,
      scopeIds: typeScopeIds.slice(0, TYPE_PREVIEW_LIMIT),
      itemId: null,
      typeScopeCount: typeScopeIds.length,
    };
  }
  return {
    depth,
    organizationId: selection.org,
    scopeIds: [selection.scope as string],
    itemId: depth === "item" ? selection.item : null,
    typeScopeCount: null,
  };
}
