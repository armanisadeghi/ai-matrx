/**
 * What the COLLAPSED variable row draws for a variable — the one decision every
 * run surface that uses `AgentVariablesInline` inherits.
 *
 * The collapsed row used to draw a bare `<input type="text">` for every
 * variable that was not picklist-bound, so a `select` with four options showed
 * up as a free-text box on the run page (the feedback-triage agents,
 * 2026-09-23): the person could type "urgent-ish" into a field whose only legal
 * answers are low / medium / high / critical. The collapsed form now draws the
 * SAME component the expanded editor draws (`VariableInputComponent`, compact)
 * for anything that is not free text; only genuinely free-text variables keep
 * the one-line text box, and variables that cannot fit in a row (media) open
 * the full editor instead of pretending to be text.
 */

import {
  isMediaVariableType,
  type VariableCustomComponent,
} from "@/features/agents/types/agent-definition.types";

export type CollapsedRowKind =
  /** One-line text box; the full editor is behind the chevron. */
  | "text-line"
  /** The variable's real component, compact, inline in the row. */
  | "component"
  /** A button that opens the full editor — the value cannot be typed. */
  | "open-editor";

/** Free-text types: a one-line box IS the compact form of their editor. */
const TEXT_LINE_TYPES = new Set([
  "textarea",
  "markdown",
  "email",
  "url",
  "phone",
]);

/** Choice types whose component needs options to be anything but a text box. */
const OPTION_TYPES = new Set([
  "radio",
  "pill-toggle",
  "selection-list",
  "buttons",
  "checkbox",
  "select",
]);

export function collapsedRowKind(
  customComponent: VariableCustomComponent | undefined | null,
  { picklistBound = false }: { picklistBound?: boolean } = {},
): CollapsedRowKind {
  if (picklistBound) return "open-editor";
  const type = customComponent?.type ?? "textarea";
  if (isMediaVariableType(type)) return "open-editor";
  if (TEXT_LINE_TYPES.has(type)) return "text-line";
  if (OPTION_TYPES.has(type) && !(customComponent?.options?.length ?? 0)) {
    // No options: the expanded editor falls back to a text area too.
    return "text-line";
  }
  return "component";
}
