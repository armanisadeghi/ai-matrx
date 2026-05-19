// features/rich-document/variants/shared/categories.ts
//
// Category display metadata. The action registry stores `category` as a
// lowercased semantic key; this module turns it into a human label and a
// stable display order for menu rendering.

import type { ActionCategory } from "../../types";

interface CategoryMeta {
  /** Display label shown as the section heading. */
  label: string;
  /** Sort weight — lower categories render earlier. */
  weight: number;
}

const CATEGORY_META: Record<ActionCategory, CategoryMeta> = {
  edit: { label: "Edit", weight: 0 },
  creator: { label: "Creator", weight: 1 },
  copy: { label: "Copy", weight: 2 },
  export: { label: "Export", weight: 3 },
  save: { label: "Actions", weight: 4 },
  share: { label: "Share", weight: 5 },
  feedback: { label: "Feedback", weight: 6 },
  admin: { label: "Server API (test)", weight: 7 },
  app: { label: "App", weight: 8 },
};

export function getCategoryLabel(category: ActionCategory): string {
  return CATEGORY_META[category]?.label ?? category;
}

export function getCategoryWeight(category: ActionCategory): number {
  return CATEGORY_META[category]?.weight ?? 99;
}

export function sortCategoriesInDisplayOrder(
  categories: ActionCategory[],
): ActionCategory[] {
  return [...categories].sort(
    (a, b) => getCategoryWeight(a) - getCategoryWeight(b),
  );
}
