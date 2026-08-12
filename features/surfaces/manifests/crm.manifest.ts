/**
 * Surface manifest — CRM (`matrx-user/crm`).
 *
 * The canonical people-and-companies manager. The route and its floating
 * manager twin emit the exact list state the user can currently see.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import type { PartyListFilters, PartyListRow } from "@/features/crm/types";
import {
  DATE_BUCKET_ENUM_TEXT,
  PARTY_COLUMN_FILTER_KEY_ENUM_TEXT,
  PARTY_KIND_ENUM_TEXT,
  PARTY_KIND_FILTER_ENUM_TEXT,
  PARTY_SORT_DIRECTION_ENUM_TEXT,
  PARTY_SORT_KEY_ENUM_TEXT,
} from "@/features/crm/types";
import type { EntityScopeCounts } from "@/lib/entity-list/types";
import type { ListScopeKind } from "@/lib/list-scope/types";

export const CRM_SURFACE_NAME = "matrx-user/crm";

const groups: SurfaceValueGroup[] = [
  {
    key: "list_view",
    label: "List view",
    sortOrder: 100,
    description: "The active CRM scope, filters, sorting, and paging.",
  },
  {
    key: "visible_records",
    label: "Visible records",
    sortOrder: 200,
    description: "The people and companies visible on the current result page.",
  },
  {
    key: "workspace",
    label: "Workspace",
    sortOrder: 300,
    description: "Organizations and loading state available to this CRM view.",
  },
];

const values: SurfaceValue[] = [
  {
    name: "scope_kind",
    label: "List scope",
    description:
      "Active CRM list scope: mine, orgs, or public. Always populated while the manager is mounted.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "list_view",
    sortOrder: 100,
  },
  {
    name: "selected_organization_id",
    label: "Selected organization ID",
    description:
      "UUID of the organization selected inside the My Orgs scope. Empty when the scope spans every organization or is not My Orgs.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "list_view",
    sortOrder: 110,
  },
  {
    name: "search_query",
    label: "Search query",
    description:
      "Live CRM search text. Empty string when the user is not searching.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    group: "list_view",
    sortOrder: 120,
  },
  {
    name: "party_kind_filter",
    label: "Record kind filter",
    description:
      "Active record-kind filter: all, person, or organization. Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    group: "list_view",
    sortOrder: 130,
  },
  {
    name: "column_filters",
    label: "Column filters",
    description:
      "Structured server-side filters currently applied to CRM columns. Empty object when no column filters are active.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 240,
    group: "list_view",
    sortOrder: 140,
  },
  {
    name: "sort_key",
    label: "Sort field",
    description: "Database field currently sorting the list. Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    group: "list_view",
    sortOrder: 150,
  },
  {
    name: "sort_direction",
    label: "Sort direction",
    description: "Current sort direction, asc or desc. Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "list_view",
    sortOrder: 160,
  },
  {
    name: "page_number",
    label: "Page number",
    description: "One-based current result page. Always populated.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "list_view",
    sortOrder: 170,
  },
  {
    name: "page_size",
    label: "Page size",
    description:
      "Maximum records requested for the current page. Always populated.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "list_view",
    sortOrder: 180,
  },
  {
    name: "visible_records",
    label: "Visible CRM records",
    description:
      "Complete CRM party rows visible on the current page, including the resolved primary employer. Empty array when nothing matches.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 12000,
    autoContext: false,
    group: "visible_records",
    sortOrder: 200,
  },
  {
    name: "visible_record_ids",
    label: "Visible record IDs",
    description:
      "UUIDs of the people and companies visible on the current page, in display order. Empty array when nothing matches.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1500,
    group: "visible_records",
    sortOrder: 210,
  },
  {
    name: "visible_record_count",
    label: "Visible record count",
    description:
      "Number of records visible on the current page. Always populated.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "visible_records",
    sortOrder: 220,
  },
  {
    name: "total_record_count",
    label: "Total matching records",
    description:
      "Exact total matching the active scope and filters across every page. Always populated.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "visible_records",
    sortOrder: 230,
  },
  {
    name: "scope_counts",
    label: "Scope counts",
    description:
      "Server-derived CRM counts for Mine, My Orgs, and Public plus per-organization narrowing counts. Always populated.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 500,
    group: "workspace",
    sortOrder: 300,
  },
  {
    name: "available_organizations",
    label: "Available organizations",
    description:
      "Organizations the signed-in user can choose in the CRM scope selector, as id and name pairs. Empty until memberships load or when none exist.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 800,
    group: "workspace",
    sortOrder: 310,
  },
  {
    name: "is_loading",
    label: "List is loading",
    description:
      "True while the initial CRM page or a changed query is loading. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "workspace",
    sortOrder: 320,
  },
  {
    name: "load_error",
    label: "Load error",
    description:
      "Current CRM list error message. Empty when the list loaded successfully.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "workspace",
    sortOrder: 330,
  },
];

/**
 * WRITE DOCTRINE — the write half of the CRM list.
 *
 * This is a FIND-AND-SURFACE surface, not an authoring one. Nothing on this
 * page is authored copy an agent could draft; every control shapes WHICH
 * records the user is looking at. So the adoption is modelled on the shipped
 * `matrx-user/images` library (query + filter targets, `mode:"ui"`) rather
 * than on `tasks` or `marketing-page` (draft-into-editor). The useful agent
 * job here is exactly "find and put the records matching this description in
 * front of me", and the four targets below are the whole of that job:
 * `search_query`, `party_kind_filter`, `column_filters`, `list_sort`.
 *
 * Every handler lands through the SAME setter the human control calls —
 * `usePartyList.setQuery` for the first three (the toolbar search box, the
 * People/Companies facet, the per-column filter popovers) and
 * `useListViewPrefs.setPrefs` for the sort (a column-header click). There is
 * no parallel write path, so an agent write and a user click are
 * indistinguishable downstream.
 *
 * NO SELECTION TARGET, deliberately. `images` earns its `image_selection`
 * because tiles carry bulk checkboxes; this table renders none — it mounts
 * `MatrxDataTable` with `detail`/`window` disabled and no selection model, so
 * there is no selection state to move. Declaring one would have wired a
 * target to nothing, which the skill names as a runtime defect by design.
 *
 * ALL FOUR ARE `mode:"ui"`, with one honest caveat. Three of them move pure
 * query state that always starts clean on a fresh visit. `list_sort` moves
 * view STYLE, which `useListViewPrefs` remembers for the CRM list across
 * visits — still not an entity write and still nothing to save, so `ui` is
 * the right mode, but the description says plainly that it sticks.
 *
 * WHY `ask` AND NOT `auto`, even though all four are `ui`. `auto` is
 * defensible for merely cosmetic `ui` state; this is not that. Every row
 * carries a "…" menu whose Delete item acts on THAT row, so re-filtering or
 * re-sorting the list moves which record sits under a user's cursor. An agent
 * silently reordering the table under someone reaching for a row menu is
 * precisely the surprise `ask` exists to prevent — the same call `images`
 * made for `search_query`/`recents_only`, and `markdown-studio` for
 * `view_mode`.
 *
 * DELIBERATELY NOT TARGETS:
 *  - `scope_kind` and `selected_organization_id` — the ownership/visibility
 *    axis (Mine / My Orgs / Public). The judgment bar puts identity and
 *    ownership fields on the NO side, and this pair is that axis: it changes
 *    WHOSE records are in play, not which of the user's records match. Left
 *    to the human who knows which book they meant to open.
 *  - `page_number` / `page_size` — pagination mechanics nobody asks an agent
 *    to flip. They also move for free: any narrowing write resets to page 1.
 *  - The trash view — `view` is not even a declared read value, so a target
 *    would have no read twin, and the destructive neighbourhood is the line
 *    the skill draws.
 *  - Creating, deleting, restoring, purging or merging a party. Delete stays
 *    human. An agent's reach here stops at proposing WHICH records; the row
 *    menu is still pressed by a person.
 *
 * BOTH MOUNTS GET THESE. `CrmListPage` is rendered by the `/crm` route and by
 * the floating `CrmManagerWindow`, with the same state, the same setters and
 * the same registered handlers — only the `surfaceName` prop differs. Write
 * targets are resolved per-manifest and are NOT inherited across
 * `inheritsFrom` (`findDeclaredTarget` reads `getManifest(name).writeTargets`
 * directly), so `crm-manager.manifest.ts` re-exports this array to make the
 * window mount writable too. That is the opposite call from
 * `rag-data-stores`, where two mounts own genuinely DIFFERENT state and each
 * registers its own handlers; here there is one component and one contract,
 * so splitting them would be a lie.
 *
 * STALE READS AFTER A WRITE — say this in every description. A surface scope
 * is sampled when the user presses ▶, so `visible_records`,
 * `visible_record_ids`, `visible_record_count` and `total_record_count`
 * describe the list as it was AT LAUNCH. Any of the four targets re-queries
 * the server, so those values are stale the instant one lands. There is no id
 * to validate here (no selection target), so nothing throws — which makes it
 * more important, not less, that the agent is told never to report specific
 * rows as still-visible after filtering. The user can see the real list; the
 * agent cannot.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "search_query",
    label: "Search query",
    description: [
      "Sets the text in the CRM toolbar search box, narrowing the list to records matching it.",
      "Value is a PLAIN STRING — not JSON and not JSON-encoded — e.g. \"acme\"; pass an empty string to clear the search and show the whole scope again.",
      "The match is a case-insensitive SUBSTRING across four columns — display_name, legal_name, primary_domain and job_title — run server-side. It is not semantic and it does not search notes, addresses or contact points, so send a literal fragment of a name, domain or job title rather than a description of the person. Commas and parentheses are stripped from the term before it is sent.",
      "Combines with the kind facet and the column filters: they AND together, so a search plus a filter shows only records matching BOTH. Applying this resets the list to page 1.",
      "Ephemeral view state; nothing is saved and no record is changed. NOTE: the visible_records / visible_record_ids / total_record_count you read were captured when this run started, so they go STALE the moment this lands — after filtering, do not claim a particular record is or is not on screen.",
    ].join(" "),
    valueType: "string",
    updatesValue: "search_query",
    mode: "ui",
    applyPolicy: "ask",
    group: "list_view",
    sortOrder: 400,
  },
  {
    name: "party_kind_filter",
    label: "Record kind filter",
    description: [
      `Sets the People / Companies facet above the table. Value is exactly one of: ${PARTY_KIND_FILTER_ENUM_TEXT}.`,
      `"all" clears the facet and shows both kinds; either of the other values narrows the list to just that kind (the record kinds are ${PARTY_KIND_ENUM_TEXT}). Anything else is REJECTED, never corrected to the nearest match.`,
      "CAREFUL — there are two ways to filter by kind and they AND together: this facet, and the party_kind key inside column_filters. Setting this facet to one kind while column_filters.party_kind names the OTHER matches nothing at all. Use this facet for the simple case, and leave column_filters.party_kind alone unless you are deliberately combining it with other column filters.",
      "Applying this resets the list to page 1. Ephemeral view state; nothing is saved and no record is changed. The visible-record values you read go stale the moment this lands.",
    ].join(" "),
    valueType: "string",
    updatesValue: "party_kind_filter",
    mode: "ui",
    applyPolicy: "ask",
    group: "list_view",
    sortOrder: 410,
  },
  {
    name: "column_filters",
    label: "Column filters",
    description: [
      "Replaces the ENTIRE set of per-column filters — the same popovers the user opens from the column headers — with the one you send.",
      `Value is an OBJECT (send it as an object, not as a JSON string) with any of these keys: ${PARTY_COLUMN_FILTER_KEY_ENUM_TEXT}. Send {} to clear every column filter.`,
      `Shapes: display_name, job_title and primary_domain take a string matched as a case-insensitive substring server-side; party_kind takes an ARRAY of ${PARTY_KIND_ENUM_TEXT}; do_not_contact takes a boolean (true lists only records flagged do-not-contact); updated_at and created_at take ONE relative bucket from ${DATE_BUCKET_ENUM_TEXT}, meaning "changed/created at least that recently".`,
      "It REPLACES rather than merges, so include every filter you want kept — read the column_filters value first and send it back with your change folded in. An empty string, or an empty party_kind array, means \"no filter on that column\" and is the same as omitting the key. An unrecognised key or a bad shape is REJECTED WHOLE and the existing filters are left completely untouched.",
      "All column filters AND together with each other, with the kind facet and with the search box. Applying this resets the list to page 1.",
      "Ephemeral view state; nothing is saved and no record is changed. The visible-record values you read go stale the moment this lands.",
    ].join(" "),
    valueType: "object",
    updatesValue: "column_filters",
    mode: "ui",
    applyPolicy: "ask",
    group: "list_view",
    sortOrder: 420,
  },
  {
    name: "list_sort",
    label: "List sort",
    description: [
      "Re-sorts the table, exactly as clicking a column header does. Both halves of the sort are set together here because one header click sets both.",
      `Value is an OBJECT (not a JSON string) with either or both of: key — one of ${PARTY_SORT_KEY_ENUM_TEXT} — and direction — one of ${PARTY_SORT_DIRECTION_ENUM_TEXT}. Send only the half you mean to change; the other keeps its current value. Sending neither, or any other key, is rejected.`,
      "These are DB columns, not rendered cells, which is why Employer is not sortable — it is a joined embed. An unrecognised key is REJECTED rather than silently falling back.",
      'Dates sort by timestamp, so "most recently updated first" is {"key":"updated_at","direction":"desc"}; names sort alphabetically, so A-Z is {"key":"display_name","direction":"asc"}.',
      "Unlike the three narrowing targets this changes ORDER only — the same records stay in the result set, though which of them land on page 1 changes. This one preference IS remembered for the CRM list across visits (sort is saved view style, not query state); no record is changed. The visible-record values you read go stale the moment this lands.",
    ].join(" "),
    valueType: "object",
    updatesValue: "sort_key",
    mode: "ui",
    applyPolicy: "ask",
    group: "list_view",
    sortOrder: 430,
  },
];

/** Shared with `crm-manager.manifest.ts` — see BOTH MOUNTS GET THESE above. */
export const crmWriteTargets = writeTargets;

/**
 * Also shared with `crm-manager.manifest.ts`. A write target must reference a
 * group DECLARED ON ITS OWN MANIFEST — groups are no more inherited through
 * `inheritsFrom` than write targets are, and `check:surface-drift` enforces
 * it — so the window mount re-declares these rather than re-typing them.
 */
export const crmGroups = groups;

export const crmManifest: SurfaceManifest = {
  surfaceName: CRM_SURFACE_NAME,
  readiness: "verified",
  readinessNote:
    "Read vocabulary verified against CrmListPage. Write targets (search_query / party_kind_filter / column_filters / list_sort) are live on both the /crm route and the CrmManagerWindow mount, and verified against a real agent run. DB mirror sync still pending.",
  label: "CRM",
  urlPattern: "/crm",
  intro: `<surface_intro>
You are in the CRM manager, the canonical workspace for people and companies known to the user's organization. The list view values describe the exact server-side scope, search, filters, sort, and page in view. Visible records contains the complete current result page; use the ID list when full row payloads are unnecessary. Workspace values explain which organizations can be selected and whether the list is still loading.

YOU CAN SHAPE THIS LIST, NOT ACT ON IT. Four controls are writable: the search
box (search_query), the People/Companies facet (party_kind_filter), the
per-column filter popovers (column_filters), and the column sort (list_sort).
Putting the records the user described in front of them is the useful work
here. Everything else is deliberately not writable — you cannot create,
delete, restore or merge a party, you cannot change who owns one, and you
cannot switch which scope (Mine / My Orgs / Public) is being browsed. Propose
WHICH records; the user presses the buttons.

Search, the kind facet and the column filters all AND together, so add them up
before concluding the user's records are missing — an empty list usually means
two narrowings stacked, not an empty CRM.

ONE THING YOU MUST NOT GET WRONG: the visible-record values you were given
(visible_records, visible_record_ids, visible_record_count,
total_record_count) were captured when this run started. Any write above
re-queries the server, so they are STALE the moment one lands. After filtering
or sorting, describe what you ASKED FOR, never which specific records are now
on screen — the user can see the real list and you cannot.
</surface_intro>`,
  groups,
  values,
  writeTargets,
  skipBaselineValues: true,
};

export function createCrmScope(values: {
  scope_kind: ListScopeKind;
  selected_organization_id?: string;
  search_query: string;
  party_kind_filter: "all" | "person" | "organization";
  column_filters: PartyListFilters;
  sort_key: string;
  sort_direction: "asc" | "desc";
  page_number: number;
  page_size: number;
  visible_records: PartyListRow[];
  visible_record_ids: string[];
  visible_record_count: number;
  total_record_count: number;
  scope_counts: EntityScopeCounts;
  available_organizations: Array<{ id: string; name: string }>;
  is_loading: boolean;
  load_error?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
