/**
 * features/skills/redux/skillsConverters.ts
 *
 * Wire ↔ view-model converters. Snake_case lives at the network edge;
 * camelCase lives everywhere else. One converter per direction, per shape.
 */

import type {
  SkillCreateWire,
  SkillDraft,
  SkillPatchWire,
  SkillRow,
} from "../types";

// Inbound converters (wire / Supabase rows → view models) live in the agent core; re-exported so
// every existing importer keeps its path.
export {
  PLATFORM_SKILL_CATEGORY_SELECT,
  platformCategoryToSklRow,
  supabaseRowToCategoryRow,
  supabaseRowToSkillRow,
  wireToCategoryRow,
  wireToIngestReport,
  wireToSkillRow,
  type PlatformCategorySelectRow,
  type SklCategoryRow,
} from "@ai-matrx/agents/skills";

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
