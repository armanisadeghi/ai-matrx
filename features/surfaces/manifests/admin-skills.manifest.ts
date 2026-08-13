/**
 * Surface manifest — Skills Admin (`matrx-admin/skills`).
 *
 * ADMIN SURFACE. Drives `/administration/agents/skills/**` — the super-admin
 * console over `skill.definition`: the skills browser/editor (mode-switched
 * list/detail/create), the category tree editor, and the filesystem ingest
 * panel that bulk-loads `SKILL.md` files into the registry.
 *
 * Distinct from `matrx-user/connections-skills` (`/agent-connections/skills`)
 * — that is the end-user vertical of the Agent Connections hub, scoped to a
 * user's own skills with agent-writable draft fields. This is the
 * super-admin registry console: it can see and edit EVERY skill (system,
 * public, and personal), and it owns the category tree and the ingest
 * pipeline, neither of which the user-facing surface has.
 *
 * What an agent bound here may safely do: read the loaded skill/category
 * list or the ingest report and help find, compare, or explain — e.g.
 * "which skills have no category", "summarize what the last ingest run
 * changed", "does a skill like this already exist". Nothing on this surface
 * has a write target yet — see readinessNote.
 *
 * NO EMITTER WIRED (readiness: stub). `SkillDetailEditor` already supports
 * agent-writable draft fields via `useSurfaceWriteHandlers`, but only when
 * mounted with a `surfaceName` prop; the admin page currently mounts it with
 * none, so wiring this surface's provider is real follow-up work, not a
 * one-line change.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_SKILLS_SURFACE_NAME = "matrx-admin/skills";

const groups: SurfaceValueGroup[] = [
  {
    key: "navigation",
    label: "Skills admin navigation",
    sortOrder: 100,
    description: "Which mode of the skills admin console is active.",
  },
  {
    key: "skills_registry",
    label: "Skills registry",
    sortOrder: 200,
    description:
      "The loaded skill list, its summary stats, and the browser's search/scope/category filters.",
  },
  {
    key: "skill_selection",
    label: "Selected skill",
    sortOrder: 300,
    description: "The skill the admin drilled into, when any.",
  },
  {
    key: "skill_categories",
    label: "Skill categories",
    sortOrder: 400,
    description: "The category tree used to group skills.",
  },
  {
    key: "skill_ingest",
    label: "Skill ingest",
    sortOrder: 500,
    description:
      "The filesystem ingest panel's input paths and the last dry-run/apply report.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Navigation ───────────────────────────────────────────────────────
  {
    name: "skills_section",
    label: "Skills admin mode",
    description:
      'Which mode the skills admin page is in: "list" (browser), "detail" (viewing a skill), "create" (new skill form), "ingest", or "categories". Always present — each emitter declares which one it is.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 100,
    group: "navigation",
  },

  // ── Skills registry ──────────────────────────────────────────────────
  {
    name: "skills_list",
    label: "Skills list",
    description:
      "Every loaded skill (id, skillId, label, description, skillType, iconName, allowedTools, triggerPatterns, platformTargets, version, categoryId, isActive, isSystem, isPublic, sortOrder). Present on skills_section=list.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    sortOrder: 200,
    group: "skills_registry",
  },
  {
    name: "skills_stats",
    label: "Skills stats",
    description:
      "Summary counts over skills_list: { total, system, public, personal }. Present on skills_section=list.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 210,
    group: "skills_registry",
  },
  {
    name: "skills_search",
    label: "Skills search",
    description:
      "The browser's search text, matched against label/skillId/description client-side. Empty string when unset. Present on skills_section=list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 220,
    group: "skills_registry",
  },
  {
    name: "skills_scope_filter",
    label: "Skills scope filter",
    description:
      '"all", "system", "public", or "personal" — the browser\'s visibility filter. Present on skills_section=list.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 230,
    group: "skills_registry",
  },
  {
    name: "skills_category_filter",
    label: "Skills category filter",
    description:
      'The category id the browser is filtered to, or "all". Present on skills_section=list.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 240,
    group: "skills_registry",
  },

  // ── Selected skill ───────────────────────────────────────────────────
  {
    name: "selected_skill_id",
    label: "Selected skill ID",
    description:
      "id of the skill being viewed/edited, from ?open=<skillId> or a browser row click. Absent on skills_section=list before any selection, and on ingest/categories.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "skill_selection",
  },
  {
    name: "selected_skill",
    label: "Selected skill",
    description:
      "The full saved skill record for selected_skill_id: { skillId, label, description, skillType, body, allowedTools, triggerPatterns, disableAutoInvocation, platformTargets, version, categoryId, isActive, isSystem, isPublic }. Absent when skills_section=create (nothing saved yet) or no skill is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    sortOrder: 310,
    group: "skill_selection",
  },

  // ── Skill categories ─────────────────────────────────────────────────
  {
    name: "skill_categories",
    label: "Skill categories",
    description:
      "The full category tree (id, categoryKey, label, parentCategoryId, sortOrder, isActive, userId — null userId means a system category). Present on skills_section=categories, and used to label skills_list's categoryId elsewhere.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 400,
    group: "skill_categories",
  },

  // ── Skill ingest ─────────────────────────────────────────────────────
  {
    name: "ingest_paths_text",
    label: "Ingest paths",
    description:
      "The multiline textarea of filesystem paths (one per line, #-comments stripped) the admin is about to dry-run or apply. Empty string before anything is typed. Present on skills_section=ingest.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 500,
    group: "skill_ingest",
  },
  {
    name: "ingest_status",
    label: "Ingest status",
    description:
      '"idle", "loading", "ready", or "error" — the state of the last dry-run/apply call. Present on skills_section=ingest.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 510,
    group: "skill_ingest",
  },
  {
    name: "ingest_report",
    label: "Ingest report",
    description:
      "The last dry-run or apply result: { parsed, created, updated, unchanged, errors, roots, skills: [{ skillId, sourcePath, category, status, id }] }. Absent before the first dry-run/apply of the session.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 520,
    group: "skill_ingest",
  },
];

export const adminSkillsManifest: SurfaceManifest = {
  surfaceName: ADMIN_SKILLS_SURFACE_NAME,
  readiness: "stub",
  readinessNote:
    "Manifest-only — vocabulary audited against the live pages, no runtime emitter wired yet. SkillDetailEditor already has agent-writable draft fields behind useSurfaceWriteHandlers, but only when mounted with a surfaceName prop; the admin page mounts it without one today.",
  label: "Skills Admin",
  urlPattern: "/administration/agents/skills",
  intro: `<surface_intro>
This is an ADMIN surface: the super-admin skills registry console at /administration/agents/skills, over skill.definition. It sees and edits every skill (system, public, personal) — distinct from matrx-user/connections-skills, the end-user vertical scoped to one user's own skills.

skills_section tells you which mode is active: "list" (the full browser with search/scope/category filters), "detail" (a saved skill's full record), "create" (an unsaved new-skill form), "ingest" (bulk-load SKILL.md files from the filesystem, with a dry-run/apply report), or "categories" (the category tree used to group skills).

Only the values matching the current skills_section are populated — everything else is absent, not stale. This surface has no write targets yet.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
};

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminSkillsScope(values: {
  // alwaysAvailable: true → required
  skills_section: "list" | "detail" | "create" | "ingest" | "categories";
  // alwaysAvailable: false → optional
  context?: Record<string, unknown>;
  skills_list?: unknown[];
  skills_stats?: Record<string, unknown>;
  skills_search?: string;
  skills_scope_filter?: "all" | "system" | "public" | "personal";
  skills_category_filter?: string;
  selected_skill_id?: string;
  selected_skill?: Record<string, unknown>;
  skill_categories?: unknown[];
  ingest_paths_text?: string;
  ingest_status?: "idle" | "loading" | "ready" | "error";
  ingest_report?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
