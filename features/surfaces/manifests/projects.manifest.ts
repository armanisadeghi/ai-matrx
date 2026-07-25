/**
 * Surface manifest — Projects (`matrx-user/projects`).
 *
 * Project management views (route `/projects`). The user browses projects in
 * the active organization (or personal space) and opens one to work on it.
 * The primary emitter is the project workspace (`ProjectWorkspace` at
 * `/projects/[projectId]`), which emits the active project's live state via
 * `buildProjectsContextData`
 * (`features/projects/agent-context/buildProjectsContextData.ts`).
 *
 * Agents bound here operate on the active project (draft a plan, summarize
 * status) or on the project list (prioritize, group).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "project_identity",
    label: "Project identity",
    sortOrder: 100,
    description:
      "Which project the user has open: its record fields and lifecycle standing.",
  },
  {
    key: "project_people",
    label: "People",
    sortOrder: 200,
    description: "Project membership and the viewer's own role.",
  },
  {
    key: "project_activity",
    label: "Activity & resources",
    sortOrder: 300,
    description:
      "What lives inside the project: task counts and attached resource counts.",
  },
  {
    key: "org_context",
    label: "Organization context",
    sortOrder: 400,
    description: "The organization (or personal space) the project belongs to.",
  },
  {
    key: "list_context",
    label: "List context",
    sortOrder: 500,
    description:
      "The surrounding project list. Multi-select only exists on list-level mounts.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Project identity ──────────────────────────────────────────────────
  {
    name: "active_project_id",
    label: "Active project ID",
    description:
      "UUID of the project the user has open. Empty when none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "project_identity",
  },
  {
    name: "active_project_name",
    label: "Active project name",
    description: "Name of the active project. Empty when none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 310,
    group: "project_identity",
  },
  {
    name: "active_project_slug",
    label: "Active project slug",
    description:
      "URL slug of the active project. Empty when the project has no slug or none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 315,
    group: "project_identity",
  },
  {
    name: "active_project_description",
    label: "Active project description",
    description:
      "Description of the active project — the primary body the user reads/edits on the workspace. Empty when unset or none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 320,
    group: "project_identity",
  },
  {
    name: "active_project_status",
    label: "Active project status",
    description:
      'Lifecycle status of the active project: "planning", "active", "paused", "completed", or "archived". Empty when none is selected.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 325,
    group: "project_identity",
  },
  {
    name: "active_project_priority",
    label: "Active project priority",
    description:
      '"low", "medium", "high", or empty. Empty when unset or none is selected.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 330,
    group: "project_identity",
  },
  {
    name: "active_project_start_date",
    label: "Active project start date",
    description:
      "ISO date (yyyy-mm-dd) the active project starts. Empty when unset or none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 335,
    group: "project_identity",
  },
  {
    name: "active_project_target_date",
    label: "Active project target date",
    description:
      "ISO date (yyyy-mm-dd) the active project is targeted to finish. Empty when unset or none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 340,
    group: "project_identity",
  },
  {
    name: "active_project_created_at",
    label: "Active project created at",
    description:
      "ISO timestamp when the active project was created. Empty when none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 345,
    group: "project_identity",
  },
  {
    name: "is_personal_project",
    label: "Is personal project",
    description:
      "True when the active project belongs to the user's personal space rather than an organization. False otherwise.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 350,
    group: "project_identity",
  },
  {
    name: "active_project",
    label: "Active project",
    description:
      "The composite active-project object: { id, name, slug, description, status, priority, start_date, target_date, is_personal, organization_id, organization_name, created_at }. Mirrors the individual identity values as one group value (completeness law). Empty when none is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 355,
    group: "project_identity",
  },

  // ── People ────────────────────────────────────────────────────────────
  {
    name: "member_count",
    label: "Member count",
    description:
      "Number of members on the active project. Zero while membership is loading or the project has no members recorded; empty when none is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 360,
    group: "project_people",
  },
  {
    name: "members",
    label: "Members",
    description:
      "Array of the active project's members as `{ user_id, role, display_name, email }`. Empty array while membership is loading or when none is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 365,
    group: "project_people",
  },
  {
    name: "viewer_role",
    label: "Viewer role",
    description:
      'The current user\'s role on the active project: "owner", "admin", or "member". Empty when the user is not a member or none is selected.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 370,
    group: "project_people",
  },

  // ── Activity & resources ──────────────────────────────────────────────
  {
    name: "open_task_count",
    label: "Open tasks",
    description:
      "Number of open (not completed) tasks in the active project. Zero when none (or while the task list is loading); empty when no project is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 380,
    group: "project_activity",
  },
  {
    name: "done_task_count",
    label: "Done tasks",
    description:
      "Number of completed tasks in the active project. Zero when none (or while the task list is loading); empty when no project is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 385,
    group: "project_activity",
  },
  {
    name: "resource_counts",
    label: "Resource counts",
    description:
      "Per-kind counts of catalogue resources attached to the active project (notes, files, conversations, …) as a `{ kind: count }` map, excluding tasks/projects (they have their own values). Empty while the inventory is loading or none is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 390,
    group: "project_activity",
  },
  {
    name: "total_resource_count",
    label: "Total resources",
    description:
      "Total number of catalogue resources attached to the active project (sum of resource_counts). Zero when nothing is attached; empty while loading or none is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 395,
    group: "project_activity",
  },

  // ── Organization context ──────────────────────────────────────────────
  {
    name: "active_organization_id",
    label: "Active organization ID",
    description:
      "UUID of the organization context the projects are scoped to. Empty when in personal space.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 400,
    group: "org_context",
  },
  {
    name: "active_organization_name",
    label: "Active organization name",
    description:
      "Name of the active organization. Empty when in personal space.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 410,
    group: "org_context",
  },

  // ── List context ──────────────────────────────────────────────────────
  {
    name: "selected_project_ids",
    label: "Selected project IDs",
    description:
      "Array of UUIDs of multi-selected projects. Only populated by list-level mounts with multi-select; the single-project workspace never emits it. Empty array when nothing is multi-selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 360,
    sortOrder: 500,
    group: "list_context",
  },
  {
    name: "project_count",
    label: "Project count",
    description:
      "Total number of projects visible to the user in the current context. Zero when none.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 510,
    group: "list_context",
  },
];

export const projectsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/projects",
  readiness: "verified",
  label: "Projects",
  urlPattern: "/projects",
  intro: `<surface_intro>
You are on the Projects surface: the user's project workspaces and project list. The primary mount is a single project's workspace — the active_project_* values describe the ONE project the user has open, with its people (members, viewer_role), its activity (open/done task counts, attached resource counts), and its organization context.
The baseline content value is the project's description — the primary body the user reads and edits here; selection is whatever page text the user has highlighted.
is_personal_project distinguishes personal-space projects from organization projects. List-level values (selected_project_ids) only appear on list mounts — when absent, you are on a single project workspace.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

/** One member as the surface emits it in `members`. */
export interface ProjectsScopeMember {
  user_id: string;
  role: string;
  display_name?: string;
  email?: string;
}

export function createProjectsScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  active_project_id?: string;
  active_project_name?: string;
  active_project_slug?: string;
  active_project_description?: string;
  active_project_status?: string;
  active_project_priority?: string;
  active_project_start_date?: string;
  active_project_target_date?: string;
  active_project_created_at?: string;
  is_personal_project?: boolean;
  active_project?: Record<string, unknown>;
  member_count?: number;
  members?: ProjectsScopeMember[];
  viewer_role?: string;
  open_task_count?: number;
  done_task_count?: number;
  resource_counts?: Record<string, number>;
  total_resource_count?: number;
  active_organization_id?: string;
  active_organization_name?: string;
  selected_project_ids?: string[];
  project_count?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
