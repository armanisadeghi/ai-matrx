/**
 * Naming and summarizing ONE item of a directive, for the compact card.
 *
 * THE RULE: a user is never asked to approve a write they cannot identify. The
 * card must say WHAT is about to be created/updated/deleted, and it must derive
 * that from authority rather than guesswork, in this order:
 *
 *   1. the noun's catalog `title_column` — the server's own answer to "what
 *      names a row of this table" (`CATALOG_NOUNS`), so `create_agent` reads the
 *      same field the agent list reads;
 *   2. the conventional identity fields, in a fixed order;
 *   3. the honest last resort — "Item 2 of 3", never a blank chip and never a
 *      slug pretending to be a name.
 *
 * Facts are scalars ONLY. A nested object in a chip is the unreadable
 * developer artefact the structured-value window exists to fix — nesting goes
 * to the panel, never into the row.
 */

import { CATALOG_NOUNS } from "@/features/matrx-envelope/catalog-nouns.generated";

/** Identity fields, in the order a human would reach for them. */
const NAME_KEYS = [
  "name",
  "title",
  "label",
  "heading",
  "slug",
  "key",
  "question",
  "summary",
] as const;

/** Never shown as a fact chip — identity, plumbing, or already in the title. */
const FACT_EXCLUDE = new Set<string>([
  "__kind",
  ...NAME_KEYS,
  "id",
  "description",
  "about",
  "notes",
  "content",
  "text",
  "body",
  "organization_id",
  "user_id",
  "created_by",
  "resource_type",
]);

function firstString(
  item: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * What to call this item. `noun` is the directive's noun, used to consult the
 * catalog's title column first.
 */
export function itemTitle(
  item: Record<string, unknown>,
  noun: string,
  index: number,
  total: number,
): string {
  const titleColumn = CATALOG_NOUNS[noun]?.title_column;
  const fromCatalog = titleColumn ? firstString(item, [titleColumn]) : null;
  const name = fromCatalog ?? firstString(item, NAME_KEYS);
  if (name) return name;
  // The honest last resort — positional, so it still distinguishes items.
  return total > 1 ? `Item ${index + 1} of ${total}` : "Item";
}

/** A one-line subtitle when the item carries prose about itself. */
export function itemSubtitle(item: Record<string, unknown>): string | null {
  return firstString(item, ["description", "about", "summary", "doc"]);
}

export interface ItemFact {
  key: string;
  label: string;
  value: string;
}

/** `variable_definitions` → "variables". Underscores read as developer output. */
function factLabel(key: string): string {
  return key.replace(/_/g, " ");
}

/**
 * Up to `limit` scalar facts about the item — counts for collections, values
 * for scalars. Nested objects are deliberately absent (they belong in the
 * panel), and so is anything already carried by the title/subtitle.
 */
export function itemFacts(
  item: Record<string, unknown>,
  limit = 4,
): ItemFact[] {
  const facts: ItemFact[] = [];
  for (const [key, value] of Object.entries(item)) {
    if (facts.length >= limit) break;
    if (FACT_EXCLUDE.has(key)) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      facts.push({ key, label: factLabel(key), value: String(value.length) });
      continue;
    }
    if (typeof value === "string") {
      if (!value.trim() || value.length > 40) continue;
      facts.push({ key, label: factLabel(key), value: value.trim() });
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      facts.push({ key, label: factLabel(key), value: String(value) });
    }
    // Objects/null: deliberately skipped — see the module docstring.
  }
  return facts;
}
