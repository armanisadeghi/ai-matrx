/**
 * features/skills/redux/skillsConverters.ts
 *
 * Wire ↔ view-model converters. Snake_case lives at the network edge;
 * camelCase lives everywhere else. One converter per direction, per shape.
 */

import type { Database } from "@/types/database.types";
import type {
  CategoryRow,
  CategoryRowWire,
  IngestReport,
  IngestReportWire,
  SkillCreateWire,
  SkillDraft,
  SkillPatchWire,
  SkillRow,
  SkillRowWire,
  SkillType,
} from "../types";

/** Supabase-generated Row shape for skl_categories — used when reads
 * go direct via the Supabase client (vs. the Python `/api/skills/
 * categories` GET which strips `user_id`). */
type SklCategoryRow = Database["public"]["Tables"]["skl_categories"]["Row"];

// ---------------------------------------------------------------------------
// Wire → view model (inbound)
// ---------------------------------------------------------------------------

export function wireToSkillRow(wire: SkillRowWire): SkillRow {
  return {
    id: wire.id,
    skillId: wire.skill_id,
    label: wire.label,
    description: wire.description,
    skillType: (wire.skill_type ?? "reference") as SkillType,
    body: wire.body ?? null,
    iconName: wire.icon_name ?? null,
    modelPreference: wire.model_preference ?? null,
    allowedTools: wire.allowed_tools ?? [],
    triggerPatterns: wire.trigger_patterns ?? [],
    disableAutoInvocation: Boolean(wire.disable_auto_invocation),
    platformTargets: wire.platform_targets ?? [],
    version: wire.version ?? null,
    config: wire.config ?? {},
    categoryId: wire.category_id ?? null,
    parentSkillId: wire.parent_skill_id ?? null,
    isActive: Boolean(wire.is_active),
    isSystem: Boolean(wire.is_system),
    isPublic: Boolean(wire.is_public),
    sortOrder: wire.sort_order ?? 0,
    userId: wire.user_id ?? null,
    organizationId: wire.organization_id ?? null,
    projectId: wire.project_id ?? null,
    projectIds: wire.project_ids ?? [],
  };
}

export function wireToCategoryRow(wire: CategoryRowWire): CategoryRow {
  return {
    id: wire.id,
    categoryKey: wire.category_key,
    label: wire.label,
    description: wire.description ?? null,
    iconName: wire.icon_name ?? null,
    color: wire.color ?? null,
    parentCategoryId: wire.parent_category_id ?? null,
    sortOrder: wire.sort_order ?? 0,
    isActive: Boolean(wire.is_active),
    // user_id may be absent on Python wire shape; preserve when present.
    userId: wire.user_id === undefined ? undefined : wire.user_id ?? null,
  };
}

/** Adapter for rows read straight off `skl_categories` via Supabase
 * (`.from('skl_categories').select(...)`). Accepts the Supabase-
 * generated Row type — no double-cast. */
export function supabaseRowToCategoryRow(row: SklCategoryRow): CategoryRow {
  return {
    id: row.id,
    categoryKey: row.category_key,
    label: row.label,
    description: row.description ?? null,
    iconName: row.icon_name ?? null,
    color: row.color ?? null,
    parentCategoryId: row.parent_category_id ?? null,
    sortOrder: row.sort_order ?? 0,
    isActive: Boolean(row.is_active),
    userId: row.user_id ?? null,
  };
}

export function wireToIngestReport(wire: IngestReportWire): IngestReport {
  return {
    parsed: wire.parsed,
    created: wire.created,
    updated: wire.updated,
    unchanged: wire.unchanged,
    errors: wire.errors ?? [],
    skills: (wire.skills ?? []).map((s) => ({
      skillId: s.skill_id,
      sourcePath: s.source_path,
    })),
    roots: wire.roots ?? [],
  };
}

// ---------------------------------------------------------------------------
// View model → wire (outbound)
// ---------------------------------------------------------------------------

/** SkillDraft → POST /api/skills body. Drops empty optional strings so
 * the server-side `extra="forbid"` Pydantic model is happy. */
export function draftToCreateBody(draft: SkillDraft): SkillCreateWire {
  const body: SkillCreateWire = {
    skill_id: draft.skillId,
    label: draft.label,
    description: draft.description,
    skill_type: draft.skillType,
    body: draft.body,
    allowed_tools: draft.allowedTools,
    trigger_patterns: draft.triggerPatterns,
    disable_auto_invocation: draft.disableAutoInvocation,
    platform_targets: draft.platformTargets,
    config: draft.config,
    is_public: draft.isPublic,
  };
  if (draft.iconName) body.icon_name = draft.iconName;
  if (draft.modelPreference) body.model_preference = draft.modelPreference;
  if (draft.version) body.version = draft.version;
  if (draft.categoryId) body.category_id = draft.categoryId;
  if (draft.parentSkillId) body.parent_skill_id = draft.parentSkillId;
  return body;
}

/** Partial edit — only fields the user changed go on the wire. The picker
 * passes a `changed` set; we map that to the snake_case keys. */
export function draftToPatchBody(
  draft: SkillDraft,
  changed: Set<keyof SkillDraft>,
): SkillPatchWire {
  const out: SkillPatchWire = {};
  if (changed.has("label")) out.label = draft.label;
  if (changed.has("description")) out.description = draft.description;
  if (changed.has("skillType")) out.skill_type = draft.skillType;
  if (changed.has("body")) out.body = draft.body;
  if (changed.has("iconName")) out.icon_name = draft.iconName;
  if (changed.has("modelPreference"))
    out.model_preference = draft.modelPreference;
  if (changed.has("allowedTools")) out.allowed_tools = draft.allowedTools;
  if (changed.has("triggerPatterns"))
    out.trigger_patterns = draft.triggerPatterns;
  if (changed.has("disableAutoInvocation"))
    out.disable_auto_invocation = draft.disableAutoInvocation;
  if (changed.has("platformTargets"))
    out.platform_targets = draft.platformTargets;
  if (changed.has("version")) out.version = draft.version;
  if (changed.has("config")) out.config = draft.config;
  if (changed.has("categoryId")) out.category_id = draft.categoryId;
  if (changed.has("parentSkillId")) out.parent_skill_id = draft.parentSkillId;
  if (changed.has("isPublic")) out.is_public = draft.isPublic;
  return out;
}

/** Seed a draft from an existing skill row. */
export function skillRowToDraft(row: SkillRow): SkillDraft {
  return {
    id: row.id,
    skillId: row.skillId,
    label: row.label,
    description: row.description,
    skillType: row.skillType,
    body: row.body ?? "",
    iconName: row.iconName,
    modelPreference: row.modelPreference,
    allowedTools: [...row.allowedTools],
    triggerPatterns: [...row.triggerPatterns],
    disableAutoInvocation: row.disableAutoInvocation,
    platformTargets: [...row.platformTargets],
    version: row.version,
    config: { ...row.config },
    categoryId: row.categoryId,
    parentSkillId: row.parentSkillId,
    isPublic: row.isPublic,
    isSystem: row.isSystem,
  };
}

/** Empty draft for the "+ New skill" form. */
export function emptySkillDraft(): SkillDraft {
  return {
    skillId: "",
    label: "",
    description: "",
    skillType: "reference",
    body: "",
    iconName: null,
    modelPreference: null,
    allowedTools: [],
    triggerPatterns: [],
    disableAutoInvocation: false,
    platformTargets: [],
    version: null,
    config: {},
    categoryId: null,
    parentSkillId: null,
    isPublic: false,
    isSystem: false,
  };
}
