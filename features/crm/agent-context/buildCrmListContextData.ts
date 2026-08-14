/**
 * Pure `contextData` builder for `matrx-user/crm` (and its floating twin
 * `matrx-user/crm-manager`).
 *
 * Mirrors `features/cms/agent-context/buildCmsPageContextData.ts`: ONE function
 * that turns live list state into the surface's `SurfaceScopePayload` via
 * `createCrmScope`, so the `SurfaceRuntimeProvider` on the route, the manager
 * WindowPanel, and any future menu `getApplicationScope` all emit byte-identical
 * values. Before this existed the payload was assembled inline inside
 * `CrmListPage`'s JSX — unreachable by any other consumer.
 */

import { createCrmScope } from "@/features/surfaces/manifests/crm.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { EntityScopeCounts } from "@/lib/entity-list/types";
import type { ListScopeKind } from "@/lib/list-scope/types";
import type {
  PartyKindFilter,
  PartyListFilters,
  PartyListRow,
  PartySortDirection,
} from "../types";

export interface BuildCrmListContextDataArgs {
  scopeKind: ListScopeKind;
  /** Only meaningful while the `orgs` scope is active. */
  scopeOrganizationId: string | null;
  search: string;
  partyKindFilter: PartyKindFilter;
  columnFilters: PartyListFilters;
  sortKey: string;
  sortDirection: PartySortDirection;
  page: number;
  pageSize: number;
  /** The current result page exactly as rendered. */
  rows: readonly PartyListRow[];
  totalCount: number;
  scopeCounts: EntityScopeCounts;
  /** `id → name` for every organization selectable in this view. */
  orgNames: Record<string, string>;
  isLoading: boolean;
  loadError?: string | null;
}

/** Canonical `contextData` for the CRM list surface. */
export function buildCrmListContextData(
  args: BuildCrmListContextDataArgs,
): SurfaceScopePayload {
  const rows = [...args.rows];

  return createCrmScope({
    scope_kind: args.scopeKind,
    selected_organization_id:
      args.scopeKind === "orgs"
        ? (args.scopeOrganizationId ?? undefined)
        : undefined,
    search_query: args.search,
    party_kind_filter: args.partyKindFilter,
    column_filters: args.columnFilters,
    sort_key: args.sortKey,
    sort_direction: args.sortDirection,
    page_number: args.page,
    page_size: args.pageSize,
    visible_records: rows,
    visible_record_ids: rows.map((row) => row.id),
    visible_record_count: rows.length,
    total_record_count: args.totalCount,
    scope_counts: args.scopeCounts,
    available_organizations: Object.entries(args.orgNames).map(
      ([id, name]) => ({ id, name }),
    ),
    is_loading: args.isLoading,
    load_error: args.loadError ?? undefined,
  });
}
