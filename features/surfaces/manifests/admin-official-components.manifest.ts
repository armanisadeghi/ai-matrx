/**
 * Surface manifest — Official Components (`matrx-admin/official-components`).
 *
 * ADMIN SURFACE. Adopts an EXISTING `ui_surface` row name — this manifest
 * must sync onto it, not create a new one. Drives
 * `/administration/ui/official-components` (the registry/gallery of the
 * official reusable component library):
 *
 *   - `app/(admin)/administration/ui/official-components/page.tsx`
 *     — the list/browse landing: a category sidebar (grouped via
 *     `categoryGroups`/`getCategoriesByGroup`) plus a filtered grid over the
 *     static `componentList` catalogue (`parts/component-list.tsx`). Search
 *     text and the selected category both live in the URL (`?q=`, `?category=`)
 *     — genuinely routed identity, so both are reliably knowable at any moment.
 *   - `app/(admin)/administration/ui/official-components/[componentId]/page.tsx`
 *     — the detail page for one catalogue entry: its name, categories, tags,
 *     description, source path, a live rendered demo (dynamically imported
 *     from `component-displays/<id>`), and a short "related components" list
 *     sharing a category.
 *
 * What an agent bound here may safely do: read which catalogue entry (or
 * search/filter state) the admin is looking at and reason about the component
 * library — explain a component, suggest related ones, help write copy for a
 * new catalogue entry. `componentList` itself is a static in-repo registry,
 * not a database — nothing here is live application data.
 *
 * Emitters: NONE wired yet (`readiness: "stub"`). Both pages are plain client
 * components with no `SurfaceRuntimeProvider`. Values below describe exactly
 * what each page's own state holds today, sourced from
 * `parts/component-list.tsx` (`ComponentEntry`, `componentList`,
 * `searchComponents`, `categoryNames`, `categoryGroups`) and the two page
 * components themselves.
 *
 * ── WRITE TARGETS: NONE, and this is a RULING, not an omission (2026-08-12) ──
 *
 * Assigned as a write-target campaign chip on the theory that
 * `current_component_description` / `_categories` / `_tags` are authored
 * catalogue metadata — the skill's YES class. They are not, because THIS
 * REGISTRY IS NOT EDITABLE ANYWHERE. The prerequisite question ("is it
 * editable, and where does an edit persist?") answers NO, so no amount of
 * emitter wiring would earn a target. Evidence, all re-verified against
 * this commit:
 *
 *   - `componentList` is a hardcoded literal — `export const componentList:
 *     ComponentEntry[] = [...]` at `parts/component-list.tsx:151`. Every one
 *     of its ~18 repo-wide references is a READ (`.find`, `.filter`,
 *     `.forEach`, `.some`, `.slice`, `.length`); nothing mutates it, and
 *     nothing outside this route directory even imports it.
 *   - `[componentId]/page.tsx` renders name/categories/tags/description/path
 *     straight off the found entry. No `useState`, no form, no `onSubmit`,
 *     no service call — the "Source" button does not even have an
 *     `onClick`. The list page's only local state is `expandedGroups` (the
 *     sidebar collapse), plus `?q=`/`?category=` in the URL.
 *   - No database behind it: `types/database.types.ts` has no
 *     `official_component*` table. `app/api/admin/tool-ui-components` is the
 *     tool-call-visualization renderer registry (`WEB_TOOL_UI_SURFACE`) and
 *     is unrelated. Nothing in `scripts/` or `package.json` generates
 *     `component-list.tsx`, so it is not a codegen artifact either.
 *
 * So editing a description or a tag here means editing a `.tsx` source
 * literal — a code change that lands through git, not a UI write path. There
 * is no canonical thunk/service to wire a handler to, and the skill is
 * explicit that a target whose handler cannot reach a canonical write path
 * must not be declared (a declared-but-unwired target is a loud runtime
 * defect by design). Staging such an edit into throwaway local state for the
 * admin to copy-paste into source would be inventing a write path, which is
 * the same prohibition.
 *
 * The rest of the surface fails the bar independently, so there is no
 * smaller target set hiding here either: `current_component_id` / `_name` /
 * `_path` are IDENTITY (a component's name and import path are what other
 * code depends on — renaming is a refactor, not a copy edit);
 * `search_query`, `selected_category` and `page_section` are view state and
 * the three counts are derived values, both squarely the skill's NO list.
 *
 * This surface is a READ-ONLY REPORT. If the library ever gains a real
 * backing store or an admin edit form, description/categories/tags become a
 * strong single composite target at that point — and only then.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_OFFICIAL_COMPONENTS_SURFACE_NAME =
  "matrx-admin/official-components";

const groups: SurfaceValueGroup[] = [
  {
    key: "gallery",
    label: "Component gallery",
    sortOrder: 100,
    description:
      "Which page of the library the admin is on, and — on the list page — the search/category filter and how many entries match.",
  },
  {
    key: "component_detail",
    label: "Component detail",
    sortOrder: 200,
    description:
      "The single catalogue entry open on the detail page: its identity, categorization, description, source path, and related entries.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Component gallery ───────────────────────────────────────────────────
  {
    name: "page_section",
    label: "Page section",
    description:
      '"list" when the admin is on the /administration/ui/official-components browse grid, "detail" when they are on a single component\'s /[componentId] page. Always present — each emitter declares which one it is.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 100,
    group: "gallery",
  },
  {
    name: "total_component_count",
    label: "Total component count",
    description:
      "Total number of entries in the static componentList catalogue, regardless of any filter. A constant of the registry — the same on both the list and detail pages.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 105,
    group: "gallery",
  },
  {
    name: "search_query",
    label: "Search query",
    description:
      'Text in the list page\'s search box (URL `?q=`), matched against component name/description/tags via searchComponents. Empty string when no search is active. Absent on the detail page.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 110,
    group: "gallery",
  },
  {
    name: "selected_category",
    label: "Selected category",
    description:
      'The category filter chip selected in the sidebar (URL `?category=`), one of the ComponentCategory slugs (e.g. "buttons", "inputs") or "all". Ignored while a search query is active. Absent on the detail page.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 14,
    sortOrder: 120,
    group: "gallery",
  },
  {
    name: "filtered_component_count",
    label: "Filtered component count",
    description:
      "Number of catalogue entries currently shown in the grid after applying the search query or category filter. Equals total_component_count when neither filter is active. Absent on the detail page.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 130,
    group: "gallery",
  },

  // ── Component detail ────────────────────────────────────────────────────
  {
    name: "current_component_id",
    label: "Open component id",
    description:
      "componentId route param of the entry open on the detail page — its catalogue key, e.g. \"matrx-data-table\". Absent on the list page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 200,
    group: "component_detail",
  },
  {
    name: "current_component_name",
    label: "Open component name",
    description:
      "Human display name of the open catalogue entry, e.g. \"Matrx Data Table\". Absent on the list page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 210,
    group: "component_detail",
  },
  {
    name: "current_component_description",
    label: "Open component description",
    description:
      "The catalogue entry's own description text, as authored in component-list.tsx. Absent on the list page; may be empty if the entry has none.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 220,
    group: "component_detail",
  },
  {
    name: "current_component_path",
    label: "Open component source path",
    description:
      "Repo-relative source path of the open component, shown as a code chip under the title. Absent on the list page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 230,
    group: "component_detail",
  },
  {
    name: "current_component_categories",
    label: "Open component categories",
    description:
      "The ComponentCategory slugs the open entry belongs to (a component may have several). Absent on the list page.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 240,
    group: "component_detail",
  },
  {
    name: "current_component_tags",
    label: "Open component tags",
    description:
      "Optional free-text tags on the open catalogue entry, used for search matching. Absent on the list page; empty array when the entry has none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 250,
    group: "component_detail",
  },
  {
    name: "related_component_count",
    label: "Related component count",
    description:
      "Number of other catalogue entries shown in the \"Related Components\" panel (entries sharing at least one category with the open one, capped at 3). Absent on the list page.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 1,
    sortOrder: 260,
    group: "component_detail",
  },
];

export const adminOfficialComponentsManifest: SurfaceManifest = {
  surfaceName: ADMIN_OFFICIAL_COMPONENTS_SURFACE_NAME,
  readiness: "stub",
  readinessNote:
    "Manifest-only — no SurfaceRuntimeProvider is mounted on either page yet. Values reflect real page/component state (component-list.tsx + the two page components) but nothing is emitted at runtime today. Write targets are ruled out permanently while the catalogue stays a hardcoded const array: the registry has no backing table, no edit form and no mutation path, so it is a read-only report — see the WRITE TARGETS section of this file's docblock before re-assigning it.",
  label: "Official Components",
  urlPattern: "/administration/ui/official-components",
  intro: `<surface_intro>
This is an ADMIN surface: the Official Component Library registry at /administration/ui/official-components — a gallery of every reusable component the platform ships as "official" (must work on import, never locally restyled).

page_section tells you which page you're on: "list" is the searchable/category-filtered grid over the static componentList catalogue; "detail" is one component's own page (its description, source path, live demo, and related components).

On the list page, search_query and selected_category describe the active filter and filtered_component_count / total_component_count give the counts. On the detail page, the current_component_* values describe exactly the one open entry.

What you may safely do: explain a component, suggest related ones from current_component_categories, or help draft catalogue metadata (name, description, tags) for a new entry. componentList is a static in-repo registry, not live application data.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminOfficialComponentsScope(values: {
  // alwaysAvailable: true → required
  page_section: "list" | "detail";
  total_component_count: number;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  search_query?: string;
  selected_category?: string;
  filtered_component_count?: number;
  current_component_id?: string;
  current_component_name?: string;
  current_component_description?: string;
  current_component_path?: string;
  current_component_categories?: string[];
  current_component_tags?: string[];
  related_component_count?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
