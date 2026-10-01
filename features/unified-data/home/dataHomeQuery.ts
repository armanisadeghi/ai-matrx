// features/unified-data/home/dataHomeQuery.ts — LANE DATA-HOME-3A
//
// Pure helpers the data home's list config hands the shell: typed tokens → filter-bag entries,
// and the Updated column's group buckets.

import type { EntityFilters } from "@/lib/entity-list/types";
import { dataHomeKindWord } from "./dataHomeRows";
import { normalize, parseTokens } from "./dataHomeSearch";

/** The group header's bucket for a date (Updated grouped). */
export function updatedBucket(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const days = (now - at) / 86_400_000;
  if (days < 1) return "Today";
  if (days < 7) return "This week";
  if (days < 30) return "This month";
  if (days < 365) return "This year";
  return "Older";
}

/** Typed tokens → filter-bag entries, when every token has one (else the service reads them as text). */
export function tokensToFilters(
  search: string,
  known: { kinds: readonly string[]; organizations: ReadonlyArray<{ id: string; name: string }> },
): { search: string; filters: EntityFilters } | null {
  const { text, tokens } = parseTokens(search);
  if (text === search.replace(/\s+/g, " ").trim()) return null;
  const filters: EntityFilters = {};
  if (tokens.kind.length) {
    const values = known.kinds.filter((k) =>
      tokens.kind.some((t) => normalize(k).startsWith(t) || normalize(dataHomeKindWord(k)).startsWith(t)),
    );
    if (values.length === 0) return null;
    filters.kind = { kind: "select", values };
  }
  if (tokens.org.length) {
    const values = known.organizations
      .filter((o) => tokens.org.every((t) => normalize(o.name).includes(t)))
      .map((o) => o.id);
    if (values.length === 0) return null;
    filters.organization = { kind: "select", values };
  }
  if (tokens.owner.length) {
    if (!tokens.owner.every((t) => t === "me")) return null;
    filters.owner = { kind: "select", values: ["You"] };
  }
  if (tokens.starred) filters.favorite = { kind: "boolean", value: true };
  if (tokens.updated) filters.updated = { kind: "select", values: [tokens.updated] };
  if (tokens.titleOnly) filters.title_only = { kind: "boolean", value: true };
  return { search: text ? `${text} ` : "", filters };
}

