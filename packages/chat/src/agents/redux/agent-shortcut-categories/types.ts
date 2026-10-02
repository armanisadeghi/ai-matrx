import type { FieldFlags } from "@/features/agents/redux/shared/field-flags";
import type { Scope } from "@/features/agents/redux/shared/scope";

export interface AgentShortcutCategoryDef {
  id: string;
  label: string;
  description: string | null;
  iconName: string | null;
  color: string | null;
  sortOrder: number;
  // NULLABLE in storage, and there are live rows with no placement. Grouping /
  // sorting must go through `placementGroupKey` — a bare null key crashed the
  // Categories page (see features/agent-shortcuts/constants.ts).
  placementType: string | null;
  parentCategoryId: string | null;
  enabledFeatures: string[] | null;
  metadata: Record<string, unknown> | null;
  isActive: boolean;

  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;

  createdAt: string;
  updatedAt: string;
}

export type CategoryFieldSnapshot = {
  [K in keyof AgentShortcutCategoryDef]?: AgentShortcutCategoryDef[K];
};

export type CategoryLoadedFields = FieldFlags<keyof AgentShortcutCategoryDef>;

export interface AgentShortcutCategoryRecord extends AgentShortcutCategoryDef {
  _dirty: boolean;
  _dirtyFields: FieldFlags<keyof AgentShortcutCategoryDef>;
  _fieldHistory: CategoryFieldSnapshot;
  _loadedFields: CategoryLoadedFields;
  _loading: boolean;
  _error: string | null;
}

export interface AgentShortcutCategorySliceState {
  categoriesById: Record<string, AgentShortcutCategoryRecord>;
  categoryIdsByScope: Record<string, string[]>;
  activeCategoryId: string | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  scopeLoaded: Record<string, boolean>;
}

export interface CategoryApiRow {
  id: string;
  /** External reads can contain legacy rows with a missing platform name. */
  label: string | null;
  description: string | null;
  icon_name: string | null;
  color: string | null;
  sort_order: number;
  // NULLABLE in platform.categories, and live rows carry null.
  placement_type: string | null;
  parent_category_id: string | null;
  enabled_features: string[] | null;
  metadata: Record<string, unknown> | null;
  is_active: boolean;
  user_id: string | null;
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateCategoryPayload = Partial<
  Omit<AgentShortcutCategoryDef, "id" | "createdAt" | "updatedAt">
> & {
  label: string;
  placementType: string;
  scope?: Scope;
  scopeId?: string | null;
};

export type UpdateCategoryPatch = Partial<
  Omit<AgentShortcutCategoryDef, "id" | "createdAt" | "updatedAt">
>;
