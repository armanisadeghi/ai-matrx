/**
 * Surface manifest — Organizations (`matrx-user/organizations`).
 *
 * Drives `/organizations` (the launcher listing the user's personal workspace
 * and team orgs) and the `/organizations/[orgId]` workspace subtree (org home:
 * identity, members, Context & Scopes, resource grid, contributions — plus the
 * per-resource tabs: projects, scopes, shortcuts, files, notes, tasks,
 * workflows, tables).
 *
 * One surface, two modes — `current_view` says which:
 *   - "list": the launcher. NO active org, so every org_identity /
 *     membership / resources value is absent; instead `organizations_summary`
 *     carries the user's whole org list.
 *   - "workspace": one org is open ([orgId] routes — the route param is a
 *     slug OR a UUID, resolved to the org row client-side). org_identity,
 *     membership, and resources values populate once the workspace loads.
 *
 * Because the SAME surface covers both modes, `org_id` is honestly
 * `alwaysAvailable: false` — the list route has none, and even on [orgId]
 * routes the org resolves asynchronously from the slug-or-id param.
 *
 * Runtime emitters:
 *   - `features/organizations/components/OrgWorkspace.tsx` (workspace mode)
 *   - `app/(core)/organizations/page.tsx` (list mode)
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

/** Canonical `ui_surface.name` for this surface. */
export const ORGANIZATIONS_SURFACE_NAME = "matrx-user/organizations";

const groups: SurfaceValueGroup[] = [
  {
    key: "org_identity",
    label: "Organization identity",
    sortOrder: 100,
    description:
      "Which organization is open: its ids, naming, and profile facts.",
  },
  {
    key: "membership",
    label: "Membership",
    sortOrder: 200,
    description:
      "The viewer's role in the open organization and who else belongs to it.",
  },
  {
    key: "resources",
    label: "Resources & scopes",
    sortOrder: 300,
    description:
      "What the open organization contains: attached resources, and its scope dimensions (the heart of context).",
  },
  {
    key: "navigation",
    label: "Navigation",
    sortOrder: 400,
    description:
      "Where the user is inside the Organizations feature, and the launcher's org list when no org is open.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Organization identity ─────────────────────────────────────────────
  {
    name: "org_id",
    label: "Organization ID",
    description:
      "UUID of the organization the user has open. Absent on the /organizations list route, and briefly absent on [orgId] routes while the slug-or-id param resolves to the org row.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "org_identity",
  },
  {
    name: "org_slug",
    label: "Organization slug",
    description:
      "URL slug of the open organization (e.g. acme-co) — the canonical [orgId] route segment. Absent when no org is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 310,
    group: "org_identity",
  },
  {
    name: "org_name",
    label: "Organization name",
    description:
      "Display name of the open organization. Absent when no org is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 320,
    group: "org_identity",
  },
  {
    name: "org_abbreviation",
    label: "Abbreviation",
    description:
      "The 2-3 letter compact label of the open organization (personal workspaces are always ME). Absent when no org is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 330,
    group: "org_identity",
  },
  {
    name: "org_description",
    label: "Description",
    description:
      "Free-text description of the open organization. Absent when no org is open or the org has no description.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 340,
    group: "org_identity",
  },
  {
    name: "org_website",
    label: "Website",
    description:
      "The open organization's website URL. Absent when no org is open or none is set.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 350,
    group: "org_identity",
  },
  {
    name: "org_is_personal",
    label: "Is personal workspace",
    description:
      "True when the open organization is the user's personal workspace rather than a team. Absent when no org is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 360,
    group: "org_identity",
  },
  {
    name: "org_created_at",
    label: "Created at",
    description:
      "ISO timestamp of when the open organization was created. Absent when no org is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 370,
    group: "org_identity",
  },
  {
    name: "org_summary",
    label: "Organization summary",
    description:
      "Composite of the open organization's identity as one object: { id, slug, name, abbreviation, description, website, is_personal, created_at }. Mirrors the individual org_identity values (completeness law). Absent when no org is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 380,
    group: "org_identity",
  },

  // ── Membership ────────────────────────────────────────────────────────
  {
    name: "viewer_role",
    label: "Your role",
    description:
      "The current user's role in the open organization: owner, admin, or member. Absent when no org is open or the role hasn't resolved yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 300,
    group: "membership",
  },
  {
    name: "can_manage",
    label: "Can manage org",
    description:
      "True when the viewer is an owner or admin of the open organization (can manage members, settings, and review contributions). Absent when no org is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 310,
    group: "membership",
  },
  {
    name: "member_count",
    label: "Member count",
    description:
      "Number of members in the open organization. Absent when no org is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 320,
    group: "membership",
  },
  {
    name: "members_summary",
    label: "Members",
    description:
      "One entry per member of the open organization: { user_id, email, display_name, role, joined_at }. Absent when no org is open; empty array while members are loading.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 330,
    group: "membership",
  },

  // ── Resources & scopes ────────────────────────────────────────────────
  {
    name: "resource_total_count",
    label: "Total resources",
    description:
      "How many entities are attached to the open organization via canonical platform.associations edges. Absent when no org is open or the count is still loading.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 300,
    group: "resources",
  },
  {
    name: "resource_counts",
    label: "Resource counts by kind",
    description:
      "Per-kind resource counts for the open organization keyed by catalogue key (agent, file, note, project, task, workflow, dataset, …); a null count means that kind is uncountable client-side. Absent when no org is open or the inventory is still loading.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 450,
    sortOrder: 310,
    group: "resources",
  },
  {
    name: "scope_type_count",
    label: "Scope dimension count",
    description:
      "Number of scope types (user-authored context dimensions like Client or Department) defined in the open organization. Absent when no org is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 320,
    group: "resources",
  },
  {
    name: "scope_count",
    label: "Scope count",
    description:
      "Total number of scope values across all scope types in the open organization. Absent when no org is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 330,
    group: "resources",
  },
  {
    name: "scope_types_summary",
    label: "Scope dimensions",
    description:
      "One entry per scope type in the open organization: { id, label_singular, label_plural, description, scope_count }. The org's context dimensions at a glance. Absent when no org is open; empty array when the org has none yet.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 340,
    group: "resources",
  },

  // ── Navigation ────────────────────────────────────────────────────────
  {
    name: "current_view",
    label: "Current view",
    description:
      '"list" on the /organizations launcher, "workspace" on an open organization\'s home ([orgId] routes). Always present — every emitter knows which view it is.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 300,
    group: "navigation",
  },
  {
    name: "organization_count",
    label: "Organization count",
    description:
      "How many organizations (personal + teams) the user belongs to. Emitted on the list view; absent inside a workspace.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 310,
    group: "navigation",
  },
  {
    name: "organizations_summary",
    label: "Your organizations",
    description:
      "One entry per organization the user belongs to: { id, name, slug, abbreviation, role, is_personal, member_count }. Emitted on the list view as the FULL list (the active search filter is not applied); absent inside a workspace.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 320,
    group: "navigation",
  },
  {
    name: "search_query",
    label: "Search query",
    description:
      "The launcher's live search filter text. Present only on the list view while the user has typed a filter; absent otherwise.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    autoContext: false,
    sortOrder: 330,
    group: "navigation",
  },
];

export const organizationsManifest: SurfaceManifest = {
  surfaceName: ORGANIZATIONS_SURFACE_NAME,
  readiness: "verified",
  label: "Organizations",
  urlPattern: "/organizations",
  intro: `<surface_intro>
You are on the Organizations surface: where the user manages their workspaces — a personal workspace plus any team organizations — and everything each one contains.
Read current_view first. On "list" the user is choosing between organizations: organizations_summary carries every org they belong to, and no single org is active (org_id and everything in the Organization identity, Membership, and Resources groups is absent). On "workspace" one organization is open: its identity, the viewer's role (viewer_role / can_manage), its members, its attached resources, and its scope dimensions are available once loaded.
Scope types are the organization's user-authored context dimensions (Client, Department, Case, …) — the most important part of the org's knowledge model. scope_types_summary tells you which dimensions exist and how many scope values each holds.
Respect viewer_role: only owners and admins (can_manage true) manage members, settings, and contribution review; never propose admin-only actions for plain members.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** One member entry as emitted in `members_summary`. */
export interface OrganizationsMemberEntry {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  joined_at: string;
}

/** One scope-type entry as emitted in `scope_types_summary`. */
export interface OrganizationsScopeTypeEntry {
  id: string;
  label_singular: string;
  label_plural: string;
  description: string;
  scope_count: number;
}

/** One organization entry as emitted in `organizations_summary` (list view). */
export interface OrganizationsOrgEntry {
  id: string;
  name: string;
  slug: string;
  abbreviation: string;
  role: string;
  is_personal: boolean;
  member_count: number | null;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys (no `?`) mirror every `alwaysAvailable: true` value above;
 * everything else is optional because the surface spans the org-less list
 * route and the async-resolving [orgId] workspace.
 */
export function createOrganizationsScope(values: {
  // alwaysAvailable: true → required
  current_view: "list" | "workspace";
  // alwaysAvailable: false → optional
  org_id?: string;
  org_slug?: string;
  org_name?: string;
  org_abbreviation?: string;
  org_description?: string;
  org_website?: string;
  org_is_personal?: boolean;
  org_created_at?: string;
  org_summary?: {
    id: string;
    slug: string;
    name: string;
    abbreviation: string;
    description: string | null;
    website: string | null;
    is_personal: boolean;
    created_at: string;
  };
  viewer_role?: string;
  can_manage?: boolean;
  member_count?: number;
  members_summary?: OrganizationsMemberEntry[];
  resource_total_count?: number;
  resource_counts?: Record<string, number | null>;
  scope_type_count?: number;
  scope_count?: number;
  scope_types_summary?: OrganizationsScopeTypeEntry[];
  organization_count?: number;
  organizations_summary?: OrganizationsOrgEntry[];
  search_query?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
