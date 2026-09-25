/**
 * THE SHEET PAINTS WITH THE ONE LOOKUP (lane UI-FIX-18, VERIFIER-18 H3).
 *
 * MEASURED 2026-09-24 on production: the Rooms table colored by Status with one rule
 * (*Status is On Hold → Red*) read *Complete* red on the Sheet — the same red as the alarm —
 * and amber on the default grid and every card; Quoting, Planning and In Progress were tinted
 * on the Sheet and plain on the grid. The Sheet's color-by lookup was this app's own
 * (`colorForChoice`: the option's place in the palette); the grid, kanban, calendar and gallery
 * paint with `@ai-matrx/records-ui`'s `colorFromTheValue`.
 *
 * For a RECORD-STORE table the Sheet now paints with records-ui's lookup, and rule precedence
 * is the design system's `resolveRowColor` / `resolveCellColor` — the function records-ui's
 * grid calls. The older store (tables not on the record store) keeps its own option colors.
 *
 * The decorations themselves (Field ids → keys, rule ids) are translated by records-ui's
 * `resolveTableStyle` in `record-store.ts` — the one translation the grid and every card read
 * (lane POST-PUBLISH-FE deleted the Sheet's own copy, `olderStyle`).
 */
import { colorFromTheValue } from "@ai-matrx/records-ui";
import { colorForChoice, type ChoiceColorLookup } from "@ai-matrx/design-system/data-table/table-style";

/** The color-by lookup the Sheet paints with. */
export function sheetChoiceColorLookup(
  onTheRecordStore: boolean,
  choicesFor: (fieldName: string) => readonly { value: string; color?: string }[] | undefined,
): ChoiceColorLookup {
  if (onTheRecordStore) return colorFromTheValue;
  return (fieldName, value) => colorForChoice(choicesFor(fieldName), value);
}
