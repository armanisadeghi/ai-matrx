import type { Database, Json } from "@/types/database.types";

type PlatformCategoryRow = Database["platform"]["Tables"]["categories"]["Row"];

type PlatformCategorySelectRow = Pick<
  PlatformCategoryRow,
  | "id"
  | "name"
  | "icon"
  | "color"
  | "placement_type"
  | "parent_id"
  | "position"
  | "organization_id"
  | "created_at"
  | "updated_at"
  | "metadata"
>;

/** Legacy shortcut-category wire shape (pre platform.categories migration). */
export type ShortcutCategoryLegacyRow = {
  id: string;
  label: string;
  icon_name: string | null;
  color: string | null;
  placement_type: string | null;
  parent_category_id: string | null;
  sort_order: number | null;
  organization_id: string | null;
  created_at?: string;
  updated_at?: string;
  metadata: Json;
  description: string | null;
  is_active: string | null;
  enabled_features: unknown;
  user_id: string | null;
  project_id: string | null;
  task_id: string | null;
};

export const PLATFORM_CATEGORY_SELECT =
  "id, name, icon, color, placement_type, parent_id, position, organization_id, created_at, updated_at, metadata" as const;

function metaValue(meta: Json, key: string): unknown {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  return (meta as Record<string, unknown>)[key] ?? null;
}

function metaString(meta: Json, key: string): string | null {
  const value = metaValue(meta, key);
  return typeof value === "string" ? value : null;
}

function metaIsActiveString(meta: Json): string | null {
  const value = metaValue(meta, "is_active");
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  return null;
}

/** Maps `platform.categories` rows to the legacy API shape callers expect. */
export function platformCategoryToLegacyRow(
  row: PlatformCategorySelectRow,
): ShortcutCategoryLegacyRow {
  return {
    id: row.id,
    label: row.name,
    icon_name: row.icon,
    color: row.color,
    placement_type: row.placement_type,
    parent_category_id: row.parent_id,
    sort_order: row.position,
    organization_id: row.organization_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata: row.metadata,
    description: metaString(row.metadata, "description"),
    is_active: metaIsActiveString(row.metadata),
    enabled_features: metaValue(row.metadata, "enabled_features"),
    user_id: metaString(row.metadata, "user_id"),
    project_id: metaString(row.metadata, "project_id"),
    task_id: metaString(row.metadata, "task_id"),
  };
}

export function coerceLegacyCategoryIsActive<T extends { is_active?: unknown }>(
  row: T,
): T & { is_active: boolean } {
  const raw = row.is_active;
  const isActive =
    raw === undefined
      ? true
      : typeof raw === "string"
        ? raw === "true"
        : Boolean(raw);
  return { ...row, is_active: isActive };
}
