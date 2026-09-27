// features/scopes/utils/templateCategory.ts — a template category as a person reads it.
// "brand_marketing" → "Brand Marketing". One home, so the Templates page and the template drawer
// never print it two ways (lane HANDOVER, 2026-09-27: the page printed the raw key).
export function humanizeTemplateCategory(category: string): string {
  return category
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
