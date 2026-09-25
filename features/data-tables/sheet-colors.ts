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
 * LEFT BEHIND, SAID HERE: `record-store.ts`'s `olderStyle` still translates the decorations
 * itself (the same translation as records-ui's `styleFromDecorations`, field by field). It is
 * replaced by `resolveTableStyle` from `@ai-matrx/records-ui` as soon as the version that
 * exports it (records-ui Unreleased, lane UI-FIX-18) is in this app's lockfile; importing it
 * today would break the build against 0.85.4.
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
