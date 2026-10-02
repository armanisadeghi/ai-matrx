/**
 * What the COLLAPSED variable row draws for a variable in `AgentVariablesInline`
 * (the "inline" variables style used above the smart agent input).
 *
 * 🚨 THE COLLAPSED ROW IS ALWAYS A ONE-LINE TEXT BOX YOU CAN TYPE INTO — BY
 * DESIGN (Arman, 2026-09-27/28). Free typing is the point of this view: a person
 * can type any value, even for a select, radio, checkbox or toggle. NEVER swap
 * the text box for the variable's real component here.
 *
 * What a row MAY add is help that keeps it on one line: a variable with a fixed
 * set of choices gets a choices arrow beside the text box that lists them, and
 * picking one fills the box. Typing stays allowed ("best of both worlds"). The
 * full component is always behind the chevron at the end of the row.
 *
 * History: on 2026-09-22 the row was changed to draw each variable's full
 * component inline — vertical radio lists, checkbox walls, no free typing. It
 * was reverted on 2026-09-27 and replaced by this rule on 2026-09-28.
 *
 * The only values that genuinely cannot be typed:
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

/** Choice types whose options can be offered beside the text box. */
const SINGLE_CHOICE_TYPES = new Set([
  "select",
  "radio",
  "buttons",
  "selection-list",
  "pill-toggle",
]);

export interface RowChoices {
  options: string[];
  /** Checkbox: each pick toggles one line of a newline-joined value. */
  multiple: boolean;
}

/**
 * The choices a text-line row offers beside its text box, or null when the
 * variable has no fixed set. Never changes what the box accepts — it only
 * helps fill it.
 */
export function collapsedRowChoices(
  customComponent: VariableCustomComponent | undefined | null,
): RowChoices | null {
  const type = customComponent?.type;
  if (!type) return null;
  if (type === "toggle" || type === "light-switch") {
    const [off = "No", on = "Yes"] = customComponent.toggleValues ?? [];
    return { options: [off, on], multiple: false };
  }
  const options = customComponent.options ?? [];
  if (options.length === 0) return null;
  if (type === "checkbox") return { options, multiple: true };
  if (SINGLE_CHOICE_TYPES.has(type)) return { options, multiple: false };
  return null;
}

/** Toggle one option in a newline-joined multi value (checkbox wire format). */
export function toggleMultiValue(value: string, option: string): string {
  const items = value.split("\n").filter(Boolean);
  const next = items.includes(option)
    ? items.filter((i) => i !== option)
    : [...items, option];
  return next.join("\n");
}
