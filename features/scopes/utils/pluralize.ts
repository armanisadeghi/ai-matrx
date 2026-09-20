/**
 * English plural for a scope-type label typed by a person ("Client" → "Clients",
 * "Category" → "Categories", "Box" → "Boxes"). Used wherever a scope type is
 * created from a single name so the plural label is never left blank — the
 * Add Scope modal and the inline "+ Create" in every scope-type picker. The
 * person can always correct it on the scope type's own page.
 */
export function pluralize(s: string): string {
  if (!s) return "";
  if (/[sxz]$|[cs]h$/i.test(s)) return s + "es";
  if (/[^aeiou]y$/i.test(s)) return s.slice(0, -1) + "ies";
  return s + "s";
}
