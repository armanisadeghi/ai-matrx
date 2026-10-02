/**
 * The store's refusal, made fit for a tooltip (KINDS-GLUE wave 3, B3): the clause that names a
 * database function ("…, so custom.table_kind_facts has nothing to show you.") is dropped — a code
 * name never reaches the screen (interface-text). What remains is the store's own words.
 */
export function refusalForPeople(message: string): string {
  const kept = message
    .split(/,\s+/)
    .filter((part) => !/\b[a-z_]+\.[a-z_]+\b/.test(part))
    .join(", ")
    .trim()
    .replace(/[.\s]+$/, "");
  return kept ? `${kept}.` : "You may not open this table.";
}
