/**
 * Surface manifest — Education Library (`matrx-user/education-library`).
 *
 * `/education/library` exactly: the person's study items — flashcard sets,
 * assessments (quizzes, practice tests), study media (audio studies,
 * summaries, mind maps, memory aids) and notes — in one scoped list with
 * three tabs (Mine / Shared with me / Public), search, a filter panel (type,
 * format, status, visibility) and a sort. Rendered by the shared
 * `EntityListPage` shell from `features/education/library/listConfig.tsx`;
 * one row set per page from `edu_library_list_scoped`.
 *
 * Its two child routes are DIFFERENT PAGES, each with its own surface:
 * `/education/library/community` (public decks, `education-library-community`)
 * and `/education/library/suggestions` (the deck owner's suggestion inbox,
 * `education-library-suggestions`). They share no component or state with
 * this list, so they are not tabs of it.
 *
 * Write half: ONE target, `library_view` (mode `ui`, `ask`) — the search box,
 * tab, filter panel, sort and page as one object, applied through the list's
 * own query/view setters. NO record targets, on purpose: the library's own UI
 * offers no save, rename, archive or delete for any of its four record types
 * (the row menu is Open / Study / Attach / Share; "Create kit" leaves for
 * /education/start). Each record's edits live on its own page, which has its
 * own surface; a library target would be a parallel write path the page does
 * not have.
 *
 * Emitter: `features/education/library/librarySurface.ts`, passed to
 * `EntityListPage` as `surface` from `EducationLibraryPage.tsx`.
 */

import { INLINE_TIER } from "@/features/surfaces/types";
import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const EDUCATION_LIBRARY_SURFACE_NAME = "matrx-user/education-library";

/** Sort fields the library's server sort accepts (`edu_library_list_scoped`). */
export const EDUCATION_LIBRARY_SORT_FIELDS = [
  "updated",
  "created",
  "title",
  "kind",
  "subtype",
  "status",
  "visibility",
  "organization_name",
  "owner_email",
] as const;

export const EDUCATION_LIBRARY_TABS = ["mine", "shared", "public"] as const;

const groups: SurfaceValueGroup[] = [
  {
    key: "library",
    label: "Library",
    sortOrder: 100,
    description:
      "The study items the list shows in the current tab, search, filters and sort, and how many there are.",
  },
  {
    key: "view",
    label: "View",
    sortOrder: 200,
    description:
      "How the list is narrowed right now: tab, search, filters, sort, page — and the filter options the library offers.",
  },
];

const ROW_SCAN_SHAPE =
  '{ id, title, kind, format, items, due, accuracy_pct, last_studied, mine }';

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "library_state",
    label: "List state",
    description:
      'Whether the list has loaded: "loading", "ready", or "failed" (library_error says why). While "loading" or "failed" every list value is absent — never read that as an empty library. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 100,
    group: "library",
  },
  {
    name: "library_error",
    label: "Load error",
    description:
      "The list's own failure sentence when library_state is \"failed\". Absent otherwise.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 105,
    group: "library",
  },
  {
    name: "library_list",
    label: "Library list",
    description: `What the page lists, in its current tab, search, filters and sort: the first 25 rows of the current page, each ${ROW_SCAN_SHAPE}. kind is "fc_set" (flashcards), "assessment", "study_media" or "note"; format is the subtype ("flashcards", "quiz", "practice_test", "audio", "summary", "mind_map", "memory_aid", "notes"); items is the card/question count (null for formats without one); due is how many items are due for review now; accuracy_pct is 0-100, null until studied; last_studied is an ISO time or null; mine is true when the person owns it. library_total is how many match in all; library_rows has every field. Absent unless library_state is "ready"; [] when nothing matches.`,
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    inlineUpTo: INLINE_TIER.list,
    sortOrder: 110,
    group: "library",
  },
  {
    name: "library_total",
    label: "Matching items",
    description:
      "How many study items match the current tab, search and filters, across every page. Absent unless library_state is \"ready\".",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 120,
    group: "library",
  },
  {
    name: "library_rows",
    label: "Library rows (full)",
    description:
      'Every row on the current page with all its fields: { id, title, description, kind, format, status, visibility, mine, access_level, topic, difficulty, items, studied, accuracy_pct, due, last_studied, duration_seconds, source_title, organization_name, owner_email, created_at, updated_at, href }. href is the row\'s own page. Same rows and order as library_list. Absent unless library_state is "ready".',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 9000,
    sortOrder: 130,
    group: "library",
  },
  {
    name: "tab_counts",
    label: "Tab counts",
    description:
      'Items per tab for the current search and filters: { mine, shared, public }. Absent while the counts load or when they failed.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 140,
    group: "library",
  },
  {
    name: "active_tab",
    label: "Tab",
    description:
      '"mine" (the person\'s own items), "shared" (shared with them) or "public" (anyone\'s public items). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 200,
    group: "view",
  },
  {
    name: "search_query",
    label: "Search",
    description:
      'The search box text ("" when empty). A search orders results by relevance before the sort. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 210,
    group: "view",
  },
  {
    name: "active_sort",
    label: "Sort",
    description:
      'The sort as "<field> <asc|desc>", e.g. "updated desc". Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 14,
    sortOrder: 220,
    group: "view",
  },
  {
    name: "active_filters",
    label: "Filters",
    description:
      'The filter panel\'s active filters, keyed by filter: { kind?: string[], subtype?: string[], status?: string[], visibility?: string[], … } (a text filter is a string). {} when nothing is filtered. Always present.',
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 230,
    group: "view",
  },
  {
    name: "list_page",
    label: "Page",
    description: "{ page, page_size } — which page of results is shown. Always present.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 30,
    sortOrder: 240,
    group: "view",
  },
  {
    name: "filter_options",
    label: "Filter options",
    description:
      'The values the filter panel offers in the current tab, with counts: { kind: [{ value, count }], subtype: […], status: […], visibility: […] }. The values library_view accepts for kinds / formats / statuses / visibilities. Absent while loading or when they failed.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 250,
    group: "view",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "library_view",
    label: "Library view",
    description:
      'Changes what the library list shows — the same controls as the search box, the tabs, the filter panel, the sort and the pager. NOTHING is saved or changed on any study item. Value is a JSON OBJECT with ONLY the keys you want to change: { search_query?: string ("" clears it), tab?: "mine" | "shared" | "public", kinds?: string[] ("fc_set" | "assessment" | "study_media" | "note"), formats?: string[] (e.g. "quiz", "flashcards", "summary"), statuses?: string[], visibilities?: string[], sort_by?: "updated" | "created" | "title" | "kind" | "subtype" | "status" | "visibility" | "organization_name" | "owner_email", sort_direction?: "asc" | "desc", page?: number (1 or more) }. Each array REPLACES that filter; [] clears it. formats, statuses and visibilities must come from filter_options. A change of tab, search or filter goes back to page 1 unless you send page. An unknown key or value refuses the whole change. Example: { "tab": "mine", "kinds": ["assessment"], "sort_by": "title", "sort_direction": "asc" }.',
    valueType: "object",
    updatesValue: "active_filters",
    mode: "ui",
    applyPolicy: "ask",
    group: "view",
    sortOrder: 200,
  },
];

export const educationLibraryManifest: SurfaceManifest = {
  surfaceName: EDUCATION_LIBRARY_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "Education Library: the person's flashcards, assessments, study media and notes in Mine / Shared / Public tabs, with search, filters and sort (/education/library).",
  readiness: "partial",
  readinessNote:
    "Values and library_view built 2026-09-27; not yet stamped verified: no outside-helper binding test, and library_list reflects the page's own server query only (the table view's column sorting is the same server sort).",
  label: "Education Library",
  urlPattern: "/education/library",
  guide: "features/surfaces/guides/education-library.md",
  intro: `<surface_intro>
You are on the Education Library at /education/library: the person's study items — flashcard sets, quizzes and practice tests, study media (audio studies, summaries, mind maps, memory aids) and notes — in three tabs: Mine, Shared with me, Public.

library_list is what the page shows right now (current tab, search, filters and sort; first 25 rows) and library_total how many match in all. Answer "what's in my library" from library_list and tab_counts directly; library_rows has every field when you need descriptions or sources. If library_state is not "ready", the list has not loaded — say so instead of calling the library empty.

To narrow or re-sort what the person sees, use library_view (one object: search_query, tab, kinds, formats, statuses, visibilities, sort_by, sort_direction, page). Nothing on this page creates, renames, archives or deletes study items: send the person to the item's own page (library_rows[].href), or to /education/start to create a study kit. Do not use generic tools to change these records.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One `library_list` row — what a person scans. */
export interface EducationLibraryListRow {
  id: string;
  title: string;
  kind: string;
  format: string | null;
  items: number | null;
  due: number;
  accuracy_pct: number | null;
  last_studied: string | null;
  mine: boolean;
}

/** One `library_rows` row — every field the list loads. */
export interface EducationLibraryFullRow {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  format: string | null;
  status: string | null;
  visibility: string | null;
  mine: boolean;
  access_level: string | null;
  topic: string | null;
  difficulty: string | null;
  items: number | null;
  studied: number;
  accuracy_pct: number | null;
  due: number;
  last_studied: string | null;
  duration_seconds: number | null;
  source_title: string | null;
  organization_name: string | null;
  owner_email: string | null;
  created_at: string;
  updated_at: string;
  href: string;
}

/**
 * Type-safe payload helper. Required keys mirror `alwaysAvailable: true`;
 * optional keys mirror `alwaysAvailable: false`.
 */
export function createEducationLibraryScope(values: {
  library_state: "loading" | "ready" | "failed";
  active_tab: string;
  search_query: string;
  active_sort: string;
  active_filters: Record<string, string | string[] | boolean>;
  list_page: { page: number; page_size: number };
  selection?: string;
  context?: Record<string, unknown>;
  library_error?: string;
  library_list?: EducationLibraryListRow[];
  library_total?: number;
  library_rows?: EducationLibraryFullRow[];
  tab_counts?: { mine?: number; shared?: number; public?: number };
  filter_options?: Record<string, { value: string; count: number }[]>;
}): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}
