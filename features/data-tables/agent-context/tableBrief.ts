/**
 * THE TABLE'S BRIEF — the two compact text values a board lists a table / picklist by
 * (`briefValues` of `matrx-user/data-tables`): its column names, and its first few rows.
 *
 * Why strings: the surface brief projects an array to `{ count }` and an object to its title, so a
 * column LIST would reach the agent as "7 columns" — no names, no content. A short text survives
 * the projection and is cut (never dropped) to the item's fair share.
 *
 * Pure: no React, no store.
 */

/** First rows a brief shows (the share's text cap cuts them further on a crowded board). */
export const TABLE_BRIEF_ROWS = 3;
/** One cell's text in the brief. */
export const TABLE_BRIEF_CELL_CHARS = 40;
/** Columns named in the brief before "+N more". */
export const TABLE_BRIEF_COLUMNS = 12;

export interface TableBriefColumn {
  field_name: string;
  display_name: string;
}

/** `Item, Room, Quantity (+3 more)` — what the person reads as column headers. */
export function briefColumns(columns: ReadonlyArray<TableBriefColumn>): string {
  const names = columns.map((c) => (c.display_name || c.field_name).trim()).filter(Boolean);
  if (names.length === 0) return "";
  const shown = names.slice(0, TABLE_BRIEF_COLUMNS).join(", ");
  return names.length > TABLE_BRIEF_COLUMNS ? `${shown} (+${names.length - TABLE_BRIEF_COLUMNS} more)` : shown;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > TABLE_BRIEF_CELL_CHARS ? `${one.slice(0, TABLE_BRIEF_CELL_CHARS)}…` : one;
}

/** `Item: Boxes, Room: Kitchen | Item: Lamp, Room: Hall` — the first rows, empty cells left out. */
export function briefFirstRows(
  columns: ReadonlyArray<TableBriefColumn>,
  rows: ReadonlyArray<{ data: Record<string, unknown> }>,
  limit: number = TABLE_BRIEF_ROWS,
): string {
  return rows
    .slice(0, limit)
    .map((row) =>
      columns
        .map((c) => {
          const text = cellText(row.data[c.field_name]);
          return text ? `${(c.display_name || c.field_name).trim()}: ${text}` : "";
        })
        .filter(Boolean)
        .join(", "),
    )
    .filter(Boolean)
    .join(" | ");
}
