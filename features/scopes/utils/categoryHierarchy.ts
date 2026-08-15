import type { PlatformCategory } from "@/features/scopes/types";

export interface CategoryHierarchyItem {
  category: PlatformCategory;
  depth: 0 | 1;
  parent: PlatformCategory | null;
  displayName: string;
}

export interface CategoryHierarchy {
  items: CategoryHierarchyItem[];
  roots: PlatformCategory[];
  hasHierarchy: boolean;
}

/**
 * Turns the RPC's ordered flat rows into the canonical two-level display order.
 * Flat facets retain their exact input order. Invalid/orphaned rows remain
 * visible at the root; the database guard prevents new ones from being made.
 */
export function buildCategoryHierarchy(
  categories: PlatformCategory[],
): CategoryHierarchy {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const hasHierarchy = categories.some(
    (category) => category.parentId !== null && byId.has(category.parentId),
  );

  if (!hasHierarchy) {
    return {
      items: categories.map((category) => ({
        category,
        depth: 0,
        parent: null,
        displayName: category.name,
      })),
      roots: categories.filter((category) => category.parentId === null),
      hasHierarchy: false,
    };
  }

  const roots = categories.filter(
    (category) => category.parentId === null || !byId.has(category.parentId),
  );
  const childrenByParent = new Map<string, PlatformCategory[]>();
  for (const category of categories) {
    if (!category.parentId || !byId.has(category.parentId)) continue;
    const children = childrenByParent.get(category.parentId) ?? [];
    children.push(category);
    childrenByParent.set(category.parentId, children);
  }

  const items: CategoryHierarchyItem[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    items.push({
      category: root,
      depth: 0,
      parent: null,
      displayName: root.name,
    });
    seen.add(root.id);

    for (const child of childrenByParent.get(root.id) ?? []) {
      items.push({
        category: child,
        depth: 1,
        parent: root,
        displayName: `${root.name} / ${child.name}`,
      });
      seen.add(child.id);
    }
  }

  // Loud database guards make this fallback unreachable for valid data, but a
  // picker must never hide an identity merely because older data is malformed.
  for (const category of categories) {
    if (seen.has(category.id)) continue;
    items.push({
      category,
      depth: 0,
      parent: null,
      displayName: category.name,
    });
  }

  return {
    items,
    roots: categories.filter((category) => category.parentId === null),
    hasHierarchy: true,
  };
}
