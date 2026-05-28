import type { Database } from "@/types/database.types";
import type {
  SklRenderComponent,
  SklRenderDefinition,
  SklResource,
  ShortcutCategoryRow,
} from "./types";

// NOTE — May 2026: skill-definition + category converters moved to
// `features/skills/redux/skillsConverters.ts`. Render-blocks +
// resources continue here.

type RenderDefRow = Database["public"]["Tables"]["skl_render_definitions"]["Row"];
type RenderComponentRow =
  Database["public"]["Tables"]["skl_render_components"]["Row"];
type ResourceRow = Database["public"]["Tables"]["skl_resources"]["Row"];
type ShortcutCategoryDbRow =
  Database["public"]["Tables"]["shortcut_categories"]["Row"];

export function rowToSklRenderDefinition(
  row: RenderDefRow,
): SklRenderDefinition {
  return {
    id: row.id,
    blockId: row.block_id,
    label: row.label,
    description: row.description,
    iconName: row.icon_name,
    template: row.template,
    categoryId: row.category_id,
    skillId: row.skill_id,
    isActive: row.is_active,
    isPublic: row.is_public,
    sortOrder: row.sort_order,
    userId: row.user_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    taskId: row.task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function sklRenderDefinitionToUpdate(
  patch: Partial<SklRenderDefinition>,
): Database["public"]["Tables"]["skl_render_definitions"]["Update"] {
  const u: Database["public"]["Tables"]["skl_render_definitions"]["Update"] = {};
  if (patch.blockId !== undefined) u.block_id = patch.blockId;
  if (patch.label !== undefined) u.label = patch.label;
  if (patch.description !== undefined) u.description = patch.description;
  if (patch.iconName !== undefined) u.icon_name = patch.iconName;
  if (patch.template !== undefined) u.template = patch.template;
  if (patch.categoryId !== undefined) u.category_id = patch.categoryId;
  if (patch.skillId !== undefined) u.skill_id = patch.skillId;
  if (patch.isActive !== undefined) u.is_active = patch.isActive;
  if (patch.isPublic !== undefined) u.is_public = patch.isPublic;
  if (patch.sortOrder !== undefined) u.sort_order = patch.sortOrder;
  return u;
}

export function sklRenderDefinitionToInsert(
  def: Partial<SklRenderDefinition> &
    Pick<SklRenderDefinition, "blockId" | "label" | "iconName" | "template">,
): Database["public"]["Tables"]["skl_render_definitions"]["Insert"] {
  return {
    block_id: def.blockId,
    label: def.label,
    icon_name: def.iconName,
    template: def.template,
    description: def.description ?? null,
    category_id: def.categoryId ?? null,
    skill_id: def.skillId ?? null,
    is_active: def.isActive ?? true,
    is_public: def.isPublic ?? false,
    sort_order: def.sortOrder ?? 0,
    user_id: def.userId ?? null,
    organization_id: def.organizationId ?? null,
    project_id: def.projectId ?? null,
    task_id: def.taskId ?? null,
  };
}

export function rowToSklRenderComponent(
  row: RenderComponentRow,
): SklRenderComponent {
  return {
    id: row.id,
    renderDefinitionId: row.render_definition_id,
    componentKey: row.component_key,
    platform: row.platform,
    parserKey: row.parser_key,
    parserConfig: row.parser_config,
    propsSchema: row.props_schema,
    importPath: row.import_path,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToSklResource(row: ResourceRow): SklResource {
  return {
    id: row.id,
    skillId: row.skill_id,
    resourceType: row.resource_type,
    filename: row.filename,
    content: row.content,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToShortcutCategory(
  row: ShortcutCategoryDbRow,
): ShortcutCategoryRow {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    iconName: row.icon_name,
    color: row.color,
    parentCategoryId: row.parent_category_id,
    sortOrder: row.sort_order ?? 0,
    isActive: row.is_active ?? true,
    placementType: row.placement_type,
    userId: row.user_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    taskId: row.task_id,
  };
}
