/**
 * Relevance-weighted search scoring.
 *
 * Use instead of the naive `name.includes(q) || description.includes(q)` pattern
 * so that title/name matches rank above description matches, and exact/prefix
 * matches rank above partial ones.
 *
 * ── Quick start ────────────────────────────────────────────────────────────────
 *   const filtered = filterAndSortBySearch(items, query, [
 *     { get: (t) => t.name, weight: "title" },
 *     { get: (t) => t.description, weight: "body" },
 *     { get: (t) => t.tags, weight: "tag" },
 *   ]);
 *
 * ── Weight tiers (higher = more important field) ──────────────────────────────
 *   title    — the primary identifier (name, label, subject)
 *   subtitle — secondary identifier (vendor, author, category name)
 *   body     — long-form descriptive text (description, summary)
 *   tag      — tag/category labels
 *   meta     — weak metadata (modelId, type)
 *   id       — raw identifiers (uuid, slug) — only useful for pasted-id lookups
 *
 * Within each field, an EXACT match > STARTS-WITH match > INCLUDES match.
 * Fields declared first are a slight tiebreaker (via field-index bonus).
 *
 * ── Automatic id matching ─────────────────────────────────────────────────────
 * Every item with a string `id` is ALSO matched against the query at the `id`
 * weight tier, automatically — you do NOT need to declare an id field. This
 * means a user can paste a full or partial UUID into ANY search box wired to
 * this helper and find the record. It kicks in from {@link MIN_AUTO_ID_QUERY_LEN}
 * characters up (so short queries don't match random hex). Declare an explicit
 * `{ weight: "id" }` field only if you want id matching at any length / on a
 * non-`id` property; doing so opts that callsite out of the automatic pass.
 */

export type SearchFieldWeight =
  | "title"
  | "subtitle"
  | "body"
  | "tag"
  | "meta"
  | "id"
  | "custom";

export interface SearchFieldConfig<T> {
  /**
   * Extracts the value(s) from the item. Return a string, an array of strings,
   * or null/undefined. Arrays score based on the best-matching element.
   */
  get: (item: T) => string | string[] | null | undefined;
  /** Field importance tier. Defaults to "body". */
  weight?: SearchFieldWeight;
  /** Optional override for custom tiers. Ignored when `weight` is preset. */
  exact?: number;
  startsWith?: number;
  includes?: number;
}

const WEIGHT_TABLE: Record<
  Exclude<SearchFieldWeight, "custom">,
  { exact: number; startsWith: number; includes: number }
> = {
  title: { exact: 10000, startsWith: 5000, includes: 2000 },
  subtitle: { exact: 2000, startsWith: 1000, includes: 500 },
  body: { exact: 1000, startsWith: 600, includes: 400 },
  tag: { exact: 500, startsWith: 400, includes: 300 },
  meta: { exact: 200, startsWith: 150, includes: 100 },
  id: { exact: 100, startsWith: 75, includes: 50 },
};

/**
 * Below this query length we do NOT auto-match the row `id`. A 1–2 char query
 * is almost always a substring of *some* hex chars in *every* UUID, so matching
 * id at that length would flood results with the whole table. From 3 chars up a
 * partial-UUID paste is selective enough to be a real lookup.
 */
const MIN_AUTO_ID_QUERY_LEN = 3;

/** Pull a non-empty string `id` off an item, or null if it has none. */
function getStringId(item: unknown): string | null {
  if (item && typeof item === "object" && "id" in item) {
    const id = (item as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

function resolveTiers(field: SearchFieldConfig<unknown>) {
  if (field.weight === "custom" || field.exact != null) {
    return {
      exact: field.exact ?? 0,
      startsWith: field.startsWith ?? 0,
      includes: field.includes ?? 0,
    };
  }
  return WEIGHT_TABLE[field.weight ?? "body"];
}

function scoreValue(
  value: string,
  q: string,
  tiers: { exact: number; startsWith: number; includes: number },
): number {
  if (!value) return 0;
  const v = value.toLowerCase();
  if (v === q) return tiers.exact;
  if (v.startsWith(q)) return tiers.startsWith;
  if (v.includes(q)) return tiers.includes;
  return 0;
}

/**
 * Compute a weighted relevance score for `item` against `query`.
 * Returns 0 if there is no match — callers can treat `> 0` as a match predicate.
 *
 * Within each field, multiple values (e.g. tags) contribute the BEST match,
 * not the sum, so an item with many tags doesn't unfairly outrank one with a
 * single exact title match.
 */
export function computeSearchScore<T>(
  item: T,
  query: string,
  fields: SearchFieldConfig<T>[],
): number {
  const trimmed = query.trim();
  if (!trimmed) return 0;
  const q = trimmed.toLowerCase();

  let total = 0;
  fields.forEach((field, idx) => {
    const raw = field.get(item);
    if (raw == null) return;
    const tiers = resolveTiers(field as SearchFieldConfig<unknown>);

    let best = 0;
    if (Array.isArray(raw)) {
      for (const v of raw) {
        if (typeof v !== "string") continue;
        const s = scoreValue(v, q, tiers);
        if (s > best) best = s;
      }
    } else if (typeof raw === "string") {
      best = scoreValue(raw, q, tiers);
    }

    if (best > 0) {
      // Tiny bias so that when two fields tie, the one declared first wins.
      total += best + (fields.length - idx);
    }
  });

  // Auto-match the row's UUID `id` against EVERY search box. A user can paste a
  // full or partial id and find the record, without each callsite remembering
  // to declare an id field. Skipped when the caller already declared an
  // explicit `weight: "id"` field (so we don't double-score), and gated on a
  // minimum query length so short queries don't match random hex substrings.
  const hasExplicitId = fields.some((f) => f.weight === "id");
  if (!hasExplicitId && q.length >= MIN_AUTO_ID_QUERY_LEN) {
    const id = getStringId(item);
    if (id) {
      total += scoreValue(id, q, WEIGHT_TABLE.id);
    }
  }

  return total;
}

export function matchesSearch<T>(
  item: T,
  query: string,
  fields: SearchFieldConfig<T>[],
): boolean {
  return computeSearchScore(item, query, fields) > 0;
}

/**
 * Drop-in id-match for hand-rolled `.filter()` predicates that can't (yet) move
 * onto {@link filterAndSortBySearch}. Returns true when `query` is a substring
 * of the item's string `id`, applying the same {@link MIN_AUTO_ID_QUERY_LEN}
 * guard as the automatic pass so short queries don't match random hex.
 *
 *   list.filter((x) => x.name.toLowerCase().includes(q) || idMatchesQuery(x, q))
 *
 * Prefer migrating the callsite to `filterAndSortBySearch` (which does this for
 * free); reach for this only when an existing custom sort must be preserved.
 */
export function idMatchesQuery(item: unknown, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_AUTO_ID_QUERY_LEN) return false;
  const id = getStringId(item);
  return id != null && id.toLowerCase().includes(q);
}

/**
 * Filter out non-matches and sort remaining items by descending relevance.
 * Stable with respect to the original order when two items tie.
 */
export function filterAndSortBySearch<T>(
  items: readonly T[],
  query: string,
  fields: SearchFieldConfig<T>[],
): T[] {
  const trimmed = query.trim();
  if (!trimmed) return items.slice();

  const scored: { item: T; score: number; idx: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const score = computeSearchScore(items[i], trimmed, fields);
    if (score > 0) scored.push({ item: items[i], score, idx: i });
  }
  scored.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
  return scored.map((s) => s.item);
}
