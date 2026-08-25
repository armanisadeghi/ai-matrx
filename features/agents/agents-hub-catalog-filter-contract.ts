import { AGENT_NONE_SENTINEL } from "@/features/agents/redux/agent-consumers/slice";

export const AGENTS_HUB_CATALOG_FILTER_KEYS = [
  "search_query",
  "deep_search",
  "ownership_tab",
  "sort_by",
  "included_categories",
  "included_tags",
  "favorites_filter",
  "archived_filter",
  "favorites_first",
] as const;

export interface AgentsHubCatalogFilterPatch<
  TOwnership extends string,
  TSort extends string,
  TArchived extends string,
> {
  search_query?: string;
  deep_search?: boolean;
  ownership_tab?: TOwnership;
  sort_by?: TSort;
  included_categories?: string[];
  included_tags?: string[];
  favorites_filter?: "all" | "yes" | "no";
  archived_filter?: TArchived;
  favorites_first?: boolean;
}

interface ParseAgentsHubCatalogFiltersOptions<
  TOwnership extends string,
  TSort extends string,
  TArchived extends string,
> {
  categories: string[];
  tags: string[];
  ownershipTabs: readonly TOwnership[];
  sortOptions: readonly TSort[];
  archivedOptions: readonly TArchived[];
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readBoolean(key: string, raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(
    `catalog_filters.${key} expects a boolean (true or false) — received ${JSON.stringify(raw)}.`,
  );
}

function readEnum<T extends string>(
  key: string,
  raw: unknown,
  allowed: readonly T[],
): T {
  const match = allowed.find((value) => value === raw);
  if (match !== undefined) return match;
  throw new Error(
    `catalog_filters.${key} must be exactly one of: ${allowed.join(", ")}. ` +
      `Received ${JSON.stringify(raw)}, which is not an option this gallery offers.`,
  );
}

function readFacetSet(
  key: string,
  raw: unknown,
  vocabulary: string[],
): string[] {
  let list: unknown = raw;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      throw new Error(
        `catalog_filters.${key} expects an array of strings (pass [] to clear this filter) — received a string that is not valid JSON.`,
      );
    }
  }
  if (!Array.isArray(list)) {
    throw new Error(
      `catalog_filters.${key} expects an array of strings (pass [] to clear this filter) — received ${typeof list}.`,
    );
  }
  const values = list.map((entry, index) => {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new Error(
        `catalog_filters.${key} entry ${index} is not a non-empty string.`,
      );
    }
    return entry.trim();
  });
  const allowed = new Set([...vocabulary, AGENT_NONE_SENTINEL]);
  const unknown = values.filter((entry) => !allowed.has(entry));
  if (unknown.length > 0) {
    throw new Error(
      `catalog_filters.${key} rejected: ${unknown.map((entry) => JSON.stringify(entry)).join(", ")} ` +
        `${unknown.length === 1 ? "is not a value" : "are not values"} this library uses, so no filter was changed. ` +
        `Available: ${vocabulary.length > 0 ? vocabulary.join(", ") : "(none — no agent has one yet)"}` +
        `, plus "${AGENT_NONE_SENTINEL}" for the Uncategorized/Untagged chip.`,
    );
  }
  return Array.from(new Set(values));
}

/**
 * Parse and validate the Agents Hub's ONE composite view-write target.
 * Both list implementations consume this pure contract, then translate the
 * validated patch into their existing UI setters.
 */
export function parseAgentsHubCatalogFilters<
  TOwnership extends string,
  TSort extends string,
  TArchived extends string,
>(
  value: unknown,
  options: ParseAgentsHubCatalogFiltersOptions<TOwnership, TSort, TArchived>,
): AgentsHubCatalogFilterPatch<TOwnership, TSort, TArchived> {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new Error(
        "catalog_filters expects an object of filter keys, e.g. " +
          '{"ownership_tab": "mine", "sort_by": "updated-desc"} — received a string that is not valid JSON.',
      );
    }
  }
  if (!isUnknownRecord(raw)) {
    throw new Error(
      `catalog_filters expects an object of filter keys — received ${Array.isArray(raw) ? "an array" : typeof raw}.`,
    );
  }

  const badKeys = Object.keys(raw).filter(
    (key) =>
      !AGENTS_HUB_CATALOG_FILTER_KEYS.some((allowedKey) => allowedKey === key),
  );
  if (badKeys.length > 0) {
    throw new Error(
      `catalog_filters received unknown key(s): ${badKeys.join(", ")}. ` +
        `Nothing was changed. Valid keys are: ${AGENTS_HUB_CATALOG_FILTER_KEYS.join(", ")}. ` +
        "This target only shapes the VIEW — it cannot favorite, archive, delete, publish or share an agent.",
    );
  }
  if (Object.keys(raw).length === 0) {
    throw new Error(
      `catalog_filters needs at least one of: ${AGENTS_HUB_CATALOG_FILTER_KEYS.join(", ")}. An empty object would change nothing.`,
    );
  }

  const patch: AgentsHubCatalogFilterPatch<TOwnership, TSort, TArchived> = {};
  if ("search_query" in raw) {
    if (typeof raw.search_query !== "string") {
      throw new Error(
        `catalog_filters.search_query expects a string (pass "" to clear the search) — received ${typeof raw.search_query}.`,
      );
    }
    patch.search_query = raw.search_query;
  }
  if ("deep_search" in raw)
    patch.deep_search = readBoolean("deep_search", raw.deep_search);
  if ("ownership_tab" in raw)
    patch.ownership_tab = readEnum(
      "ownership_tab",
      raw.ownership_tab,
      options.ownershipTabs,
    );
  if ("sort_by" in raw)
    patch.sort_by = readEnum("sort_by", raw.sort_by, options.sortOptions);
  if ("included_categories" in raw)
    patch.included_categories = readFacetSet(
      "included_categories",
      raw.included_categories,
      options.categories,
    );
  if ("included_tags" in raw)
    patch.included_tags = readFacetSet(
      "included_tags",
      raw.included_tags,
      options.tags,
    );
  if ("favorites_filter" in raw)
    patch.favorites_filter = readEnum<"all" | "yes" | "no">(
      "favorites_filter",
      raw.favorites_filter,
      ["all", "yes", "no"],
    );
  if ("archived_filter" in raw)
    patch.archived_filter = readEnum(
      "archived_filter",
      raw.archived_filter,
      options.archivedOptions,
    );
  if ("favorites_first" in raw)
    patch.favorites_first = readBoolean("favorites_first", raw.favorites_first);
  return patch;
}
