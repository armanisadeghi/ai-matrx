/**
 * The ONE way a new rule id is minted. `id` is the citable handle every audit
 * verdict points at, so it must be human-readable, stable forever, and unique
 * inside its Rulebook. Two surfaces mint rules (the rule editor and the Final
 * Checkup) — they mint them the same way.
 */

export function kebabRuleId(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

/** A fresh id for `name`, suffixed until it clears `existingIds`. */
export function nextRuleId(name: string, existingIds: Set<string>): string {
  const base = kebabRuleId(name) || "rule";
  let id = base;
  let n = 2;
  while (existingIds.has(id)) id = `${base}-${n++}`;
  return id;
}
