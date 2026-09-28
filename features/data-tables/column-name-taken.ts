/**
 * IS THIS COLUMN NAME ALREADY TAKEN? (DATA-V2-BASICS-2, 2026-09-28)
 *
 * MEASURED on the Sheet's Add Column: a name another column already has went to the store, came
 * back refused (409), and the page logged "Error adding column" to the console while the dialog
 * said the same thing. The table's columns are already on screen, so the dialog says it as the
 * person types and never sends a name that cannot be saved. Names compare as a person reads them:
 * case and surrounding spaces do not make two names different. A renamed column's OLD name is free
 * (only the names columns carry now count), which is what BREAKER-1's "rename, then add the old
 * name" needs.
 */
export function columnNameTaken(
  name: string,
  columns: readonly { display_name: string }[],
): string | null {
  const wanted = name.trim().toLocaleLowerCase();
  if (!wanted) return null;
  const hit = columns.find((c) => (c.display_name ?? "").trim().toLocaleLowerCase() === wanted);
  return hit ? `You already have a column called "${hit.display_name.trim()}". Column names must be different so formulas and agents can tell them apart.` : null;
}
