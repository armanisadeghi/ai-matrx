/**
 * A WITHHELD CELL SAYS WHY.
 *
 * The record store masks a column a reader may not read: the value comes back present and null,
 * and the store's reason rides beside the row (`ReadRow.hidden`). A confidential Budget must not
 * read "—", the mark an EMPTY cell wears. The record-store seam hands each row its withheld cells
 * (`withheldCells`), and records-ui draws them with its one withheld helper (`WithheldValue`).
 * This file never decides what is withheld; it only carries what the store decided.
 */
import type { Field, HiddenFieldNotice } from "@ai-matrx/records";
import { withheldNoticeOf } from "@ai-matrx/records-ui";

export interface WithheldCell {
  field: Field;
  notice: HiddenFieldNotice;
}

/** A row's withheld cells, by column key (the grid's `field_name`). */
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
