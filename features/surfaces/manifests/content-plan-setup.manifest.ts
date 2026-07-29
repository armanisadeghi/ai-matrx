/**
 * Surface manifest — Content Plan Setup (`matrx-user/content-plan-setup`).
 *
 * The Site Setup view (`/marketing/content-plan/[siteId]?view=setup`): the
 * persistent readiness surface that takes a site from nothing (or half a
 * plan) to a structured plan — archetype library, family counts + names, the
 * exact route preview (create/exists/conflict), the readiness checklist, and
 * the "Make it real" bridge rungs. A distinct page with distinct agents: an
 * agent here reasons about SHAPE and WORK ORDER, not individual briefs.
 *
 * Inherits `matrx-user/content-plan` (site identity + live plan tree are
 * loaded and true here). Declares writeTargets so an agent's shape
 * recommendation can stage straight into the view (pick an archetype, set
 * counts, paste real names) — always staged, the user commits.
 *
 * Runtime emitter + write handlers: `SetupView.tsx` mounts a nested
 * `SurfaceRuntimeProvider` (deepest wins while the view is active).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "setup_shape",
    label: "Site shape",
    sortOrder: 100,
    description:
      "The archetype library and the shape currently selected/committed.",
  },
  {
    key: "setup_work_order",
    label: "Work order",
    sortOrder: 200,
    description:
      "Counts, names, and the exact routes the commit would create.",
  },
  {
    key: "setup_readiness",
    label: "Readiness",
    sortOrder: 300,
    description: "The foundation checklist and structural lint findings.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Site shape (100-199) ──────────────────────────────────────────────
  {
    name: "archetype_options",
    label: "Archetype library",
    description:
      "Compact list of the available site shapes (platform builtins merged with the org's own): key, label, per-family summary, and what each shape deliberately omits. Empty while the library loads.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 100,
    group: "setup_shape",
  },
  {
    name: "selected_archetype_key",
    label: "Selected archetype",
    description:
      "Key of the shape currently selected in the Shape column. Empty only while the library loads (the view auto-selects the committed or first shape).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 110,
    group: "setup_shape",
  },
  {
    name: "committed_archetype",
    label: "Committed archetype",
    description:
      "The work order already committed on the site ({key, counts, instantiated_at} from web.site.settings.content_plan.archetype). Empty when the site has never committed a shape.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 120,
    group: "setup_shape",
  },
  {
    name: "expansion_error",
    label: "Expansion error",
    description:
      "The archetype expander's error message when the selected shape fails to expand (bad config, unknown concept). Empty when expansion succeeds.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 130,
    group: "setup_shape",
    autoContext: false,
  },

  // ── Work order (200-299) ──────────────────────────────────────────────
  {
    name: "family_counts",
    label: "Family counts",
    description:
      "Object mapping each count-bearing family key to its effective count (user override, committed value, or the shape's default). Empty while nothing is expanded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 200,
    group: "setup_work_order",
  },
  {
    name: "family_names",
    label: "Family names",
    description:
      "Object mapping family keys to the real page names in effect (adopted from the live plan, overridden by the user's paste). A name list SETS the family count. Empty when no names are known.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 210,
    group: "setup_work_order",
  },
  {
    name: "route_preview_summary",
    label: "Route preview summary",
    description:
      "Counts from the commit preview: {create, exists, conflict} — how many exact routes would be created, already exist (adopted), or collide with a page under a different parent. Empty until a shape expands.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 220,
    group: "setup_work_order",
  },
  {
    name: "route_preview_conflicts",
    label: "Conflicting routes",
    description:
      "The routes the preview flags as `conflict` (a page already lives at that route under a DIFFERENT parent — the commit would be rejected there). Empty when there are none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 230,
    group: "setup_work_order",
  },

  // ── Readiness (300-399) ───────────────────────────────────────────────
  {
    name: "readiness_checklist",
    label: "Readiness checklist",
    description:
      "The foundation checklist rows (plan coverage, brand, CMS link, theme, nav…) each with its current pass/fail state and detail line. Empty until a shape expands.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 300,
    group: "setup_readiness",
  },
];

/** Staged writes only — the user always sees the preview and commits. */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "select_archetype",
    label: "Select archetype",
    description:
      "Selects a shape from the archetype library by key (must exist in archetype_options). UI state only — nothing is committed.",
    valueType: "string",
    updatesValue: "selected_archetype_key",
    mode: "ui",
    group: "setup_shape",
    sortOrder: 100,
  },
  {
    name: "set_family_counts",
    label: "Set family counts",
    description:
      "Stages count overrides for the selected shape: an object mapping family keys to numbers. The route preview updates live; the user commits.",
    valueType: "object",
    updatesValue: "family_counts",
    mode: "draft",
    group: "setup_work_order",
    sortOrder: 200,
  },
  {
    name: "set_family_names",
    label: "Set family names",
    description:
      "Stages real page names for count-bearing families: an object mapping family keys to string arrays. A name list SETS that family's count and rewrites the previewed slugs. The user commits.",
    valueType: "object",
    updatesValue: "family_names",
    mode: "draft",
    group: "setup_work_order",
    sortOrder: 210,
  },
];

export const contentPlanSetupManifest: SurfaceManifest = {
  surfaceName: "matrx-user/content-plan-setup",
  label: "Content Plan Setup",
  readiness: "partial",
  readinessNote:
    "Emitter + write handlers wired in SetupView; bridge-rung state (CMS link, fill job) not yet declared; write targets code-only (not mirrored to DB).",
  urlPattern: "/marketing/content-plan/[siteId]?view=setup",
  inheritsFrom: "matrx-user/content-plan",
  intro: `<surface_intro>
You are on Site Setup — the readiness view of the content plan: pick a site shape (archetype), set how many pages each family gets and what they are really called, see the EXACT routes a commit would create (create / exists / conflict), and check the foundation checklist. The user never commits a page they have not seen previewed.
Read archetype_options and selected_archetype_key for the shape being considered, committed_archetype for what the site is already on, family_counts/family_names for the work order, and route_preview_summary (+ route_preview_conflicts) for what a commit would do. The inherited plan_tree is the LIVE plan this preview diffs against.
This surface can be WRITTEN TO: select_archetype switches the shape, set_family_counts / set_family_names stage the work order. All writes are staged — the preview updates and the USER commits; never claim pages were created.
A "conflict" route means a page already lives at that route under a different parent — the DB would reject it; flag it, don't work around it.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "site_shaper",
      label: "Site shaper",
      description:
        "Recommends the site's shape and work order — which archetype, which counts, which real page names — grounded in the brand, vertical, and any existing plan. Results stage via this surface's write targets.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
  ],
};

/** Type-safe payload helper — inherited `view` is the only guarantee. */
export function createContentPlanSetupScope(values: {
  view: "tree" | "table" | "map" | "entities" | "setup";
  archetype_options?: Array<Record<string, unknown>>;
  selected_archetype_key?: string;
  committed_archetype?: Record<string, unknown>;
  expansion_error?: string;
  family_counts?: Record<string, number>;
  family_names?: Record<string, string[]>;
  route_preview_summary?: Record<string, number>;
  route_preview_conflicts?: Array<Record<string, unknown>>;
  readiness_checklist?: Array<Record<string, unknown>>;
  site_id?: string;
  site_domain?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
