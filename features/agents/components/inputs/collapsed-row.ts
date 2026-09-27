/**
 * What the COLLAPSED variable row draws for a variable in `AgentVariablesInline`
 * (the "inline" variables style used above the smart agent input).
 *
 * 🚨 THE COLLAPSED ROW IS A ONE-LINE TEXT BOX FOR EVERY TYPED VARIABLE — BY
 * DESIGN. DO NOT "FIX" IT (Arman, 2026-09-27).
 *
 * This view exists so a person can just TYPE any value — even for a select,
 * radio, checkbox or slider — and click the chevron when they want the real
 * component (the expanded editor). A select showing as a text box here is the
 * feature, not a bug: free text is always allowed. Other variable styles
 * (form, cards, guided, wizard, compact) draw the real components; pick one of
 * those if a surface needs the structured controls up front.
 *
 * On 2026-09-22 this row was changed to draw each variable's full component
 * inline ("a select must never be a free-text box"). That put a vertical radio
 * list, checkbox lists and button walls inside the composer and removed free
 * typing. It was reverted on 2026-09-27. Never reintroduce it.
 *
 * The only exceptions are values that genuinely cannot be typed:
 *   - media (image / audio / video / document / youtube) — a MediaRef, not text
 *   - picklist-bound variables — the value is a reference fence, not text
 * Those draw a button that opens the full editor.
 */

import {
  isMediaVariableType,
  type VariableCustomComponent,
} from "@/features/agents/types/agent-definition.types";

export type CollapsedRowKind =
  /** One-line text box; the full component is behind the chevron. */
  | "text-line"
  /** A button that opens the full editor — the value cannot be typed. */
  | "open-editor";

export function collapsedRowKind(
  customComponent: VariableCustomComponent | undefined | null,
  { picklistBound = false }: { picklistBound?: boolean } = {},
): CollapsedRowKind {
  if (picklistBound) return "open-editor";
  if (isMediaVariableType(customComponent?.type ?? "textarea")) {
    return "open-editor";
  }
  return "text-line";
}
