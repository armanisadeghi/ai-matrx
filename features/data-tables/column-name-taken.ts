/**
 * WHAT IS WRONG WITH THIS COLUMN NAME, SAID AS IT IS TYPED (DATA-V2-BASICS-2, 2026-09-28/29).
 *
 * MEASURED on the Sheet's Add Column: a name another column already has went to the store, came
 * back refused (409), and the page logged "Error adding column" to the console while the dialog
 * said the same thing. BREAKER-2 then added: three spaces made a nameless column (its header blank,
 * the internal key "F" leaking onto every Gallery card, B2-08); "Visit  Status" (two spaces) sat
 * beside "Visit Status" as a second column reading the same (B2-09); a 300-letter name drew a
 * 2,418 px header (B2-17); "id" was taken as a name although the table keeps it (B2-18).
 *
 * The table's columns are already on screen, so the dialog says it as the person types and never
 * sends a name that cannot be saved. Names compare as a person reads them: case, surrounding spaces
 * and runs of spaces do not make two names different. A renamed column's OLD name is free (only the
 * names columns carry now count), which is what BREAKER-1's "rename, then add the old name" needs.
 */
import { sanitizeFieldName } from "./field-name-key";

/** The longest name a column takes — long enough for any heading a person writes. */
export const COLUMN_NAME_MAX = 80;

/** Names every table keeps for itself (what the store and the grid already use). */
const RESERVED = new Set([
  "id", "created_at", "updated_at", "deleted_at", "created_by", "updated_by", "organization_id",
  "table_id", "version", "data", "metadata", "data_class",
]);

/** What a person likely means by each kept name, offered instead of it. */
const INSTEAD: Record<string, string> = {
  id: "Reference number", created_at: "Date added", updated_at: "Last updated", deleted_at: "Date removed",
  created_by: "Added by", updated_by: "Changed by", organization_id: "Organization", table_id: "Table",
  version: "Version number", data: "Details", metadata: "More details", data_class: "Category",
};

const said = (name: string) => name.trim().replace(/\s+/g, " ");

export function columnNameProblem(
  name: string,
  columns: readonly { display_name: string }[],
): string | null {
  const wanted = said(name);
  if (!wanted) return "A column needs a name. Type the heading you want to see above it.";
  if (wanted.length > COLUMN_NAME_MAX) {
    return `That name is ${wanted.length} characters long; a column name takes up to ${COLUMN_NAME_MAX}. Say the rest in the column's description.`;
  }
  const kept = sanitizeFieldName(wanted);
  if (RESERVED.has(kept)) {
    // A name a person would choose, never the kept word with a suffix ("created_at number": BREAKER-3 B3-31).
    return `“${wanted}” is kept by every table. Try “${INSTEAD[kept] ?? "Reference"}”.`;
  }
  const lower = wanted.toLocaleLowerCase();
  const hit = columns.find((c) => said(c.display_name ?? "").toLocaleLowerCase() === lower);
  return hit
    ? `You already have a column called "${said(hit.display_name)}". Column names must be different so formulas and agents can tell them apart.`
    : null;
}

/** The earlier name of the check, kept for the dialogs that only asked whether a name was taken. */
export function columnNameTaken(name: string, columns: readonly { display_name: string }[]): string | null {
  return said(name) ? columnNameProblem(name, columns) : null;
}

/** The name as it is kept: trimmed, one space between words. */
export function columnNameToKeep(name: string): string {
  return said(name);
}
