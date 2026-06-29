import type { Database, Json } from "@/types/database.types";

type PlatformCategoryRow = Database["platform"]["Tables"]["categories"]["Row"];

export type FeedbackCategoryRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  color: string | null;
  sort_order: number | null;
  is_active: string | null;
  created_at: string;
  updated_at: string;
};

export const FEEDBACK_CATEGORY_SELECT =
  "id, name, slug, color, position, created_at, updated_at, metadata" as const;

type FeedbackCategorySelectRow = Pick<
  PlatformCategoryRow,
  | "id"
  | "name"
  | "slug"
  | "color"
  | "position"
  | "created_at"
  | "updated_at"
  | "metadata"
>;

function metaString(meta: Json, key: string): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function metaIsActiveString(meta: Json): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>).is_active;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  return null;
}

export function platformCategoryToFeedbackRow(
  row: FeedbackCategorySelectRow,
): FeedbackCategoryRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: metaString(row.metadata, "description"),
    color: row.color,
    sort_order: row.position,
    is_active: metaIsActiveString(row.metadata),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
