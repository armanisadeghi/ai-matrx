import { getIconComponent } from "@ai-matrx/icons";
import type { AgentShortcutCategory } from "../types";

export interface FlatAgentCategory {
  category: {
    id: string;
    placementType: string;
    parentCategoryId: string | null;
    label: string;
    description: string | null;
    iconName: string | null;
    color: string | null;
    sortOrder: number;
    isActive: boolean;
    enabledFeatures?: string[] | null;
    metadata: Record<string, unknown> | null;
  };
  items: AgentMenuItem[];
}

export interface AgentMenuItem {
  id: string;
  type: "shortcut" | "content_block";
  label: string;
  description: string | null;
  iconName: string | null;
  sortOrder: number;
  enabledFeatures?: string[] | null;
  icon?: React.ComponentType<{ className?: string }>;
  [key: string]: unknown;
}

export interface AgentCategoryGroup {
  category: FlatAgentCategory["category"];
  items: AgentMenuItem[];
  children: AgentCategoryGroup[];
}

export function filterByContext(
  flatData: FlatAgentCategory[],
  contextFilter?: string,
): FlatAgentCategory[] {
  if (!contextFilter) return flatData;

  return flatData
    .map((category) => {
      const categoryEnabled =
        category.category.enabledFeatures?.includes(contextFilter) ?? true;
      if (!categoryEnabled) return null;

      const filteredItems = category.items.filter((item) => {
        const itemEnabled = item.enabledFeatures?.includes(contextFilter) ?? true;
        return itemEnabled;
      });

      if (filteredItems.length === 0) return null;

      return {
        ...category,
        items: filteredItems,
      };
    })
    .filter((cat): cat is FlatAgentCategory => cat !== null);
}

export function buildAgentCategoryHierarchy(
  flatData: FlatAgentCategory[],
  contextFilter?: string,
): AgentCategoryGroup[] {
  if (!flatData || flatData.length === 0) return [];

  const filteredData = filterByContext(flatData, contextFilter);
  if (filteredData.length === 0) return [];

  const idMap = new Map<string, AgentCategoryGroup>();
  const roots: AgentCategoryGroup[] = [];

  filteredData.forEach((item) => {
    const hydratedItems = hydrateIcons(item.items || []);
    const node: AgentCategoryGroup = {
      category: item.category,
      items: hydratedItems,
      children: [],
    };
    idMap.set(item.category.id, node);
  });

  filteredData.forEach((item) => {
    const node = idMap.get(item.category.id);
    if (!node) return;

    if (item.category.parentCategoryId) {
      const parent = idMap.get(item.category.parentCategoryId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  sortHierarchyRecursive(roots);
  return roots;
}

function hydrateIcons(items: AgentMenuItem[]): AgentMenuItem[] {
  return items.map((item) => {
    if (item.iconName) {
      const IconComponent = getIconComponent(item.iconName, "FileText");
      return { ...item, icon: IconComponent };
    }
    return item;
  });
}

function sortHierarchyRecursive(nodes: AgentCategoryGroup[]): void {
  nodes.sort((a, b) => a.category.sortOrder - b.category.sortOrder);
  nodes.forEach((node) => {
    if (node.children.length > 0) {
      sortHierarchyRecursive(node.children);
    }
  });
}

export function buildCategoryTree(
  categories: AgentShortcutCategory[],
): AgentShortcutCategory[] {
  const byParent = new Map<string | null, AgentShortcutCategory[]>();
  categories.forEach((cat) => {
    const parent = cat.parentCategoryId ?? null;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent)!.push(cat);
  });

  byParent.forEach((list) => {
    list.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });
  });

  return byParent.get(null) ?? [];
}

export function getCategoryHierarchyLabel(
  category: AgentShortcutCategory,
  all: AgentShortcutCategory[],
): string {
  if (!category.parentCategoryId) return category.label;
  const parent = all.find((c) => c.id === category.parentCategoryId);
  if (!parent) return category.label;
  return `${getCategoryHierarchyLabel(parent, all)} > ${category.label}`;
}

export function flattenCategoryDescendants(
  categoryId: string,
  all: AgentShortcutCategory[],
): string[] {
  const result: string[] = [];
  const stack = [categoryId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    result.push(current);
    const children = all.filter((c) => c.parentCategoryId === current);
    children.forEach((c) => stack.push(c.id));
  }
  return result;
}
