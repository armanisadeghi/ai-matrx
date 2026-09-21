import type {
  CredentialDefinition,
  CredentialFamily,
  VaultItem,
} from "./types";

export type VaultListSort =
  | "newest"
  | "recently-updated"
  | "recently-viewed"
  | "name-asc"
  | "name-desc";

export const VAULT_LIST_SORT_OPTIONS: ReadonlyArray<{
  value: VaultListSort;
  label: string;
}> = [
  { value: "newest", label: "Newest added" },
  { value: "recently-updated", label: "Recently updated" },
  { value: "recently-viewed", label: "Recently viewed" },
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
];

const NAME_COLLATOR = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

export function filterAndSortVaultItems({
  items,
  definitions,
  family,
  query,
  sort,
  stateById,
}: {
  items: readonly VaultItem[];
  definitions: readonly CredentialDefinition[];
  family: "all" | CredentialFamily;
  query: string;
  sort: VaultListSort;
  stateById?: ReadonlyMap<string, { isFavorite: boolean; lastViewedAt: string | null }>;
}): VaultItem[] {
  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const normalizedQuery = query.trim().toLocaleLowerCase("en");
  return items
    .filter((item) => {
      const definition = definitionsByKey.get(item.definition_key);
      if (family !== "all" && definition?.payload.family !== family) return false;
      if (!normalizedQuery) return true;
      return searchableMetadata(item, definition)
        .join(" ")
        .toLocaleLowerCase("en")
        .includes(normalizedQuery);
    })
    .sort((left, right) => compareVaultItems(left, right, sort, stateById));
}

function searchableMetadata(
  item: VaultItem,
  definition: CredentialDefinition | undefined,
): string[] {
  return [
    item.display_name,
    item.description,
    item.definition_key,
    item.provider_key,
    definition?.key,
    definition?.payload.label,
    ...item.login_urls,
    ...item.tags,
    ...item.fields.flatMap((field) => [field.field_key, field.env_key]),
  ].filter((value): value is string => typeof value === "string");
}

function compareVaultItems(
  left: VaultItem,
  right: VaultItem,
  sort: VaultListSort,
  stateById: ReadonlyMap<string, { isFavorite: boolean; lastViewedAt: string | null }> | undefined,
): number {
  if (sort === "name-asc" || sort === "name-desc") {
    const nameComparison = NAME_COLLATOR.compare(left.display_name, right.display_name);
    if (nameComparison !== 0) return sort === "name-desc" ? -nameComparison : nameComparison;
    return compareId(left.id, right.id);
  }

  const dateComparison = compareNewestDate(
    sort === "newest" ? left.created_at : sort === "recently-viewed" ? stateById?.get(left.id)?.lastViewedAt ?? null : left.updated_at,
    sort === "newest" ? right.created_at : sort === "recently-viewed" ? stateById?.get(right.id)?.lastViewedAt ?? null : right.updated_at,
  );
  return dateComparison !== 0 ? dateComparison : compareId(left.id, right.id);
}

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNewestDate(left: string | null, right: string | null): number {
  const leftTime = parseDate(left);
  const rightTime = parseDate(right);
  if (leftTime === null) return rightTime === null ? 0 : 1;
  if (rightTime === null) return -1;
  return rightTime - leftTime;
}

function parseDate(value: string | null): number | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
