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
} from "@/features/surfaces/types";
import type { PartyListFilters, PartyListRow } from "@/features/crm/types";
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

export const crmManifest: SurfaceManifest = {
  surfaceName: CRM_SURFACE_NAME,
  readiness: "verified",
  label: "CRM",
  urlPattern: "/crm",
  intro: `<surface_intro>
You are in the CRM manager, the canonical workspace for people and companies known to the user's organization. The list view values describe the exact server-side scope, search, filters, sort, and page in view. Visible records contains the complete current result page; use the ID list when full row payloads are unnecessary. Workspace values explain which organizations can be selected and whether the list is still loading.
</surface_intro>`,
  groups,
  values,
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
