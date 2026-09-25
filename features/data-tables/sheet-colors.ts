/**
 * THE SHEET PAINTS WITH THE ONE RESOLVER (lane UI-FIX-18, VERIFIER-18 H3).
 *
 * MEASURED 2026-09-24 on production: the Rooms table colored by Status with one rule
 * (*Status is On Hold → Red*) read *Complete* red on the Sheet — the same red as the alarm —
 * and amber on the default grid and every card; Quoting, Planning and In Progress were tinted
 * on the Sheet and plain on the grid. Two translations of the table's decorations and two
 * color-by lookups: this app's own (`colorForChoice`, the option's place in the palette) and
 * `@ai-matrx/records-ui`'s (`colorFromTheValue`, what the grid, kanban, calendar and gallery
 * paint with).
 *
 * For a RECORD-STORE table there is now one of each, and both are records-ui's:
 * `resolveTableStyle` turns the store's decorations into the style, and `colorFromTheValue` is
 * the color-by lookup. Rule precedence is the design system's `resolveRowColor` /
 * `resolveCellColor`, the same function records-ui's grid calls. The older store (tables that
 * are not on the record store) keeps its own option colors.
 */
import type { Field, TableDecorations } from "@ai-matrx/records";
import { colorFromTheValue, resolveTableStyle } from "@ai-matrx/records-ui";
import {
  colorForChoice,
  type ChoiceColorLookup,
  type TableStyle,
} from "@ai-matrx/design-system/data-table/table-style";

/** A record-store table's decorations as the Sheet's `TableStyle` — records-ui's translation. */
export function sheetStyleFromDecorations(
  decorations: TableDecorations | null | undefined,
  fields: readonly Field[],
): TableStyle {
  return resolveTableStyle(decorations, fields, undefined);
}

/** The color-by lookup the Sheet paints with. */
export function sheetChoiceColorLookup(
  onTheRecordStore: boolean,
  choicesFor: (fieldName: string) => readonly { value: string; color?: string }[] | undefined,
): ChoiceColorLookup {
  if (onTheRecordStore) return colorFromTheValue;
  return (fieldName, value) => colorForChoice(choicesFor(fieldName), value);
}
