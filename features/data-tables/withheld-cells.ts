/**
 * A WITHHELD CELL ON THE SHEET SAYS WHY (lane POST-PUBLISH-FE, VERIFIER-18 H1).
 *
 * The record store masks a column a reader may not read: the value comes back present and null,
 * and the store's reason rides beside the row (`ReadRow.hidden`). The Sheet used to drop it, so a
 * confidential Budget read "—", the mark an EMPTY cell wears. The record-store seam now hands each
 * row its withheld cells (`withheldCells`), and the Sheet draws them with records-ui's one
 * withheld helper (`WithheldValue`) — the grid's, the cards', the record panel's. This file never
 * decides what is withheld; it only carries what the store decided.
 */
import type { Field, HiddenFieldNotice } from "@ai-matrx/records";
import { WithheldValue, withheldNoticeOf } from "@ai-matrx/records-ui";

export interface WithheldCell {
  field: Field;
  notice: HiddenFieldNotice;
}

/** A row's withheld cells, by column key (the Sheet's `field_name`). */
export type WithheldCells = Record<string, WithheldCell>;

/** The store's notices for one row, paired with the column each names. Absent when none. */
export function withheldCells(
  hidden: Readonly<Record<string, HiddenFieldNotice | undefined>> | null | undefined,
  fields: readonly Field[],
): WithheldCells | undefined {
  if (!hidden) return undefined;
  let out: WithheldCells | undefined;
  for (const field of fields) {
    const notice = withheldNoticeOf(hidden, field.key);
    if (notice) (out ??= {})[field.key] = { field, notice };
  }
  return out;
}

/** The withheld cell at this row and column, when the store withheld it. */
export function withheldCellOf(row: unknown, fieldName: string): WithheldCell | null {
  const cells = (row as { withheld?: WithheldCells } | null)?.withheld;
  return cells?.[fieldName] ?? null;
}

/** The cell as a person reads it: "Withheld", with the store's sentence on hover. */
export function SheetWithheldCell({ cell }: { cell: WithheldCell }) {
  return <WithheldValue field={cell.field} notice={cell.notice} />;
}
