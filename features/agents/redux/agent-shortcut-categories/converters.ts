import type {
  AgentShortcutCategoryDef,
  CategoryApiRow,
} from "./types";

export function categoryRowToDef(
  row: CategoryApiRow,
): AgentShortcutCategoryDef {
  return {
    id: row.id,
    // Keep the canonical client record renderable even when an old/malformed
    // platform category reaches the compatibility API without a name.
    label: row.label?.trim() || "Unnamed category",
    description: row.description,
    iconName: row.icon_name,
    color: row.color,
    sortOrder: row.sort_order ?? 0,
    placementType: row.placement_type,
    parentCategoryId: row.parent_category_id,
    enabledFeatures: row.enabled_features ?? null,
    metadata: row.metadata ?? null,
    isActive: row.is_active,
    userId: row.user_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    taskId: row.task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function categoryDefToRowPatch(
  patch: Partial<AgentShortcutCategoryDef>,
): Partial<CategoryApiRow> {
  const out: Partial<CategoryApiRow> = {};
  if (patch.label !== undefined) out.label = patch.label;
  if (patch.description !== undefined) out.description = patch.description;
  if (patch.iconName !== undefined) out.icon_name = patch.iconName;
  if (patch.color !== undefined) out.color = patch.color;
  if (patch.sortOrder !== undefined) out.sort_order = patch.sortOrder;
  if (patch.placementType !== undefined)
    out.placement_type = patch.placementType;
  if (patch.parentCategoryId !== undefined)
    out.parent_category_id = patch.parentCategoryId;
  if (patch.enabledFeatures !== undefined)
    out.enabled_features = patch.enabledFeatures;
  if (patch.metadata !== undefined) out.metadata = patch.metadata;
  if (patch.isActive !== undefined) out.is_active = patch.isActive;
  if (patch.userId !== undefined) out.user_id = patch.userId;
  if (patch.organizationId !== undefined)
    out.organization_id = patch.organizationId;
  if (patch.projectId !== undefined) out.project_id = patch.projectId;
  if (patch.taskId !== undefined) out.task_id = patch.taskId;
  return out;
}
