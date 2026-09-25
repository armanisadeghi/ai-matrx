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

import type { components } from "@/types/python-generated/api-types";

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

/** The agent "Answer on both paths" asks — `?agent=`, never a hidden id: its picker sets it. */
export function parseAgent(search: URLSearchParams | string): string | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return idOrNull(params.get("agent"));
}

/** The address query with `?agent=` set (or dropped); every other param is kept. */
export function agentSearch(agentId: string | null, current: URLSearchParams | string = ""): string {
  const params = new URLSearchParams(typeof current === "string" ? current : current.toString());
  const id = idOrNull(agentId);
  if (id) params.set("agent", id);
  else params.delete("agent");
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
 * THE selection both sides of the compare receive — the server's own type
 * (`aidream conversation_context/context_selection.py#ContextSelection`),
 * generated into the API types. One contract, one parser: the page never
 * expands a scope type into scope ids itself; the server does, once, for the
 * old scope system and the record store alike, with no cap.
 */
export type ContextSelection = components["schemas"]["ContextSelection"];

export interface PreviewRequest {
  depth: InspectorStep;
  selection: ContextSelection;
}

/**
 * What the preview asks for at the current depth — the SAME selection for the
 * old scope system and the record store:
 *
 * - organization — no scope: what an agent in that organization is handed with
 *   nothing selected;
 * - scope type — the type: the server hands both sides every scope of it the
 *   person can read;
 * - scope — that one scope;
 * - context item — that scope, and the item the page narrows what it shows to.
 *
 * Only the unbroken chain from the organization is sent (a `?scope=` link waits
 * for its back-fill). Null when nothing is chosen.
 */
export function previewRequest(selection: InspectorSelection): PreviewRequest | null {
  const depth = selectionDepth(selection);
  if (!depth || !selection.org) return null;
  const reached = (step: InspectorStep) =>
    INSPECTOR_STEPS.indexOf(step) <= INSPECTOR_STEPS.indexOf(depth);
  return {
    depth,
    selection: {
      organization_id: selection.org,
      scope_type_id: reached("scopeType") ? selection.scopeType : null,
      scope_id: reached("scope") ? selection.scope : null,
      context_item_id: reached("item") ? selection.item : null,
    },
  };
}
