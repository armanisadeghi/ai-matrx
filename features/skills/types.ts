/**
 * features/skills/types.ts
 *
 * Wire shapes and view models for the Agent Skills feature.
 *
 * The Python backend wire shape uses snake_case (per Pydantic) — see
 * `aidream/api/routers/skills.py` and `docs/AGENT_SKILLS_HANDOFF.md`. We
 * mirror it once here in camelCase and convert at the slice boundary
 * (`skillsConverters.ts`) so consumer components never touch snake_case.
 *
 * When the backend OpenAPI regenerates and `/api/skills/{id}/projects/...`
 * is in `types/python-generated/api-types.ts`, swap the hand-mirrored
 * `SkillRowWire` for the generated `components["schemas"]["SkillRow"]`
 * and drop the `as never` casts in the thunks.
 */

// ---------------------------------------------------------------------------
// Wire shapes (snake_case — match the Python backend exactly)
// ---------------------------------------------------------------------------

export interface SkillRowWire {
  id: string;
  skill_id: string;
  label: string;
  description: string;
  skill_type: string;
  body: string | null;
  icon_name: string | null;
  model_preference: string | null;
  allowed_tools: string[];
  trigger_patterns: string[];
  disable_auto_invocation: boolean;
  platform_targets: string[];
  version: string | null;
  config: Record<string, unknown>;
  category_id: string | null;
  parent_skill_id: string | null;
  is_active: boolean;
  is_system: boolean;
  is_public: boolean;
  sort_order: number;
  user_id: string | null;
  organization_id: string | null;
  project_id: string | null;
  /** Many-to-many associations from skl_skill_projects (read-only on the list endpoint). */
  project_ids: string[];
}

export interface CategoryRowWire {
  id: string;
  category_key: string;
  label: string;
  description: string | null;
  icon_name: string | null;
  color: string | null;
  parent_category_id: string | null;
  sort_order: number;
  is_active: boolean;
  /** `user_id IS NULL` → system category. Populated when reading direct
   * from Supabase; the Python wire shape currently strips this on its
   * CategoryRow response model (it's still on the row server-side). */
  user_id?: string | null;
}

export interface SkillsListWire {
  count: number;
  skills: SkillRowWire[];
}

export interface CategoryListWire {
  count: number;
  categories: CategoryRowWire[];
}

/** `skl_resources` row as it comes off Supabase. The Python backend
 * doesn't yet expose a CRUD surface for resources; reads + writes go
 * direct via the Supabase client (RLS gates on parent-skill ownership). */
export interface ResourceRowWire {
  id: string;
  skill_id: string;
  resource_type: string;
  filename: string;
  content: string | null;
  storage_path: string | null;
  mime_type: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface IngestRequestWire {
  roots: string[];
  dry_run: boolean;
}

export interface IngestReportWire {
  parsed: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: string[];
  skills: Array<{ skill_id: string; source_path: string }>;
  roots: string[];
}

export interface SkillCreateWire {
  skill_id: string;
  label: string;
  description: string;
  skill_type?: string;
  body?: string;
  icon_name?: string | null;
  model_preference?: string | null;
  allowed_tools?: string[];
  trigger_patterns?: string[];
  disable_auto_invocation?: boolean;
  platform_targets?: string[];
  version?: string | null;
  config?: Record<string, unknown>;
  category_id?: string | null;
  parent_skill_id?: string | null;
  is_public?: boolean;
}

export interface SkillPatchWire {
  label?: string;
  description?: string;
  skill_type?: string;
  body?: string;
  icon_name?: string | null;
  model_preference?: string | null;
  allowed_tools?: string[];
  trigger_patterns?: string[];
  disable_auto_invocation?: boolean;
  platform_targets?: string[];
  version?: string | null;
  config?: Record<string, unknown>;
  category_id?: string | null;
  parent_skill_id?: string | null;
  is_public?: boolean;
  is_active?: boolean;
}

export interface ProjectAssociationWire {
  skill_id: string;
  project_id: string;
}

// ---------------------------------------------------------------------------
// View models (camelCase — used everywhere in component / hook code)
// ---------------------------------------------------------------------------

/** The full skill row as it flows through the FE. Matches `SkillRowWire`
 * field-for-field with snake_case → camelCase conversion. */
export interface SkillRow {
  id: string;
  skillId: string;
  label: string;
  description: string;
  skillType: SkillType;
  body: string | null;
  iconName: string | null;
  modelPreference: string | null;
  allowedTools: string[];
  triggerPatterns: string[];
  disableAutoInvocation: boolean;
  platformTargets: string[];
  version: string | null;
  config: Record<string, unknown>;
  categoryId: string | null;
  parentSkillId: string | null;
  isActive: boolean;
  isSystem: boolean;
  isPublic: boolean;
  sortOrder: number;
  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  /** Multi-project membership via skl_skill_projects join. */
  projectIds: string[];
}

/** Resource row tied to a skill — markdown / text attachment, or a
 * storage-path pointer (the storage-bucket integration is deferred;
 * inline `content` covers the cases we use today). */
export interface ResourceRow {
  id: string;
  skillId: string;
  resourceType: string; // 'reference' | 'snippet' | 'example' | free-string
  filename: string;
  content: string | null;
  storagePath: string | null;
  mimeType: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** Local form draft for create / edit. */
export interface ResourceDraft {
  id?: string;
  skillId: string;
  resourceType: string;
  filename: string;
  content: string;
  mimeType: string | null;
  sortOrder: number;
}

export interface CategoryRow {
  id: string;
  categoryKey: string;
  label: string;
  description: string | null;
  iconName: string | null;
  color: string | null;
  parentCategoryId: string | null;
  sortOrder: number;
  isActive: boolean;
  /** `null` → system category (visible to every user). Populated when
   * the row was fetched via Supabase direct; may be undefined when read
   * via the Python `/api/skills/categories` GET (which strips it
   * today). The editor uses this to gate write-paths. */
  userId?: string | null;
}

export interface IngestReport {
  parsed: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: string[];
  skills: Array<{ skillId: string; sourcePath: string }>;
  roots: string[];
}

/** Per-agent visibility tiering. Stored on `agx_agent.skill_config` JSONB. */
export interface SkillConfig {
  included: string[];
  listed: string[];
  forbidden: string[];
  disabled: boolean;
}

/** SkillConfig with an "undecided" tier — used in the picker UI to surface
 * skills that the agent neither includes nor lists nor forbids (the
 * implicit DEFAULT bucket). */
export type SkillTier = "included" | "listed" | "forbidden" | "default";

/** Free-string per the wire contract, but these are the recognised values
 * for filtering / labelling. */
export type SkillType =
  | "render_block"
  | "convention"
  | "workflow"
  | "task"
  | "reference"
  | "mode"
  | "agent_behavior"
  | string; // tolerate unknown values from the backend

/** Local form draft used while a skill is being edited / created. Mirrors
 * SkillRow but the immutable identity fields collapse to single optional
 * id / skill_id slots. */
export interface SkillDraft {
  id?: string;
  skillId: string;
  label: string;
  description: string;
  skillType: SkillType;
  body: string;
  iconName: string | null;
  modelPreference: string | null;
  allowedTools: string[];
  triggerPatterns: string[];
  disableAutoInvocation: boolean;
  platformTargets: string[];
  version: string | null;
  config: Record<string, unknown>;
  categoryId: string | null;
  parentSkillId: string | null;
  isPublic: boolean;
  /** Admin-only: when the form is in admin mode, this toggle promotes
   * the row to `is_system=true`. Plumbing for the FE; rejected by the
   * backend if the caller isn't an admin. */
  isSystem: boolean;
}

// ---------------------------------------------------------------------------
// Status enum used by every async slot in the slice
// ---------------------------------------------------------------------------

export type AsyncStatus = "idle" | "loading" | "ready" | "error";
