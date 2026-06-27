import type { Database } from "@/types/database.types";

// ─── DB row types (camelCased for Redux state) ───────────────────────────────
//
// NOTE — May 2026: the skill *definition* + *category* types moved to
// `features/skills/redux/` and are now backed by `/api/skills` (the
// Python backend). Only render-blocks (renderDefinitions /
// renderComponents / renderBlockCategories) and resources still live
// in this slice — they're awaiting their own migration. Do not add
// new skill / category code here.

type Json =
  Database["skill"]["Tables"]["render_component"]["Row"]["parser_config"];

export interface SklRenderDefinition {
  id: string;
  blockId: string;
  label: string;
  description: string | null;
  iconName: string;
  template: string;
  categoryId: string | null;
  skillId: string | null;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SklRenderComponent {
  id: string;
  renderDefinitionId: string;
  componentKey: string;
  platform: string;
  parserKey: string | null;
  parserConfig: Json | null;
  propsSchema: Json | null;
  importPath: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SklResource {
  id: string;
  skillId: string;
  resourceType: string;
  filename: string;
  content: string | null;
  storagePath: string | null;
  mimeType: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// Render Blocks temporarily FK to shortcut_categories (per migration guide).
// Same tree shape, different table. Only the fields we need.
export interface ShortcutCategoryRow {
  id: string;
  label: string;
  description: string | null;
  iconName: string;
  color: string | null;
  parentCategoryId: string | null;
  sortOrder: number;
  isActive: boolean;
  placementType: string;
  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
}

// ─── Slice state ─────────────────────────────────────────────────────────────

export type SklStatus = "idle" | "loading" | "ready" | "error";

export interface SklSliceState {
  renderDefinitions: {
    byId: Record<string, SklRenderDefinition>;
    allIds: string[];
    status: SklStatus;
    error: string | null;
    activeId: string | null;
  };
  renderComponents: {
    byId: Record<string, SklRenderComponent>;
    allIds: string[];
    byRenderDefinitionId: Record<string, string[]>;
    status: SklStatus;
    error: string | null;
  };
  renderBlockCategories: {
    byId: Record<string, ShortcutCategoryRow>;
    allIds: string[];
    status: SklStatus;
    error: string | null;
  };
  resources: {
    byId: Record<string, SklResource>;
    allIds: string[];
    bySkillId: Record<string, string[]>;
    status: SklStatus;
    error: string | null;
  };
}

export const initialSklSliceState: SklSliceState = {
  renderDefinitions: {
    byId: {},
    allIds: [],
    status: "idle",
    error: null,
    activeId: null,
  },
  renderComponents: {
    byId: {},
    allIds: [],
    byRenderDefinitionId: {},
    status: "idle",
    error: null,
  },
  renderBlockCategories: { byId: {}, allIds: [], status: "idle", error: null },
  resources: {
    byId: {},
    allIds: [],
    bySkillId: {},
    status: "idle",
    error: null,
  },
};
