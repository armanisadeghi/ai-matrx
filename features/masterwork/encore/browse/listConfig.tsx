"use client";

import type { EntityListConfig } from "@/lib/entity-list/config";
import type { ListScopeKind } from "@/lib/list-scope/types";
import { ENCORE_COLUMNS } from "./columns";
import {
  fetchEncoreCounts,
  fetchEncoreFacets,
  fetchEncorePage,
} from "./service";
import { EncoreBrowseCards } from "./EncoreBrowseCards";
import { useEncoreRowActions } from "./useEncoreRowActions";
import type { EncoreListRow } from "./types";

const ENCORE_SCOPES: ListScopeKind[] = ["mine", "orgs", "public"];

export const encoreListConfig: EntityListConfig<EncoreListRow> = {
  surfaceKey: "masterwork-encore",
  entityLabel: { singular: "Masterwork", plural: "Masterworks" },
  scopes: ENCORE_SCOPES,
  service: {
    fetchPage: fetchEncorePage,
    fetchCounts: fetchEncoreCounts,
    fetchFacets: fetchEncoreFacets,
  },
  columns: ENCORE_COLUMNS,
  prefsVersion: 1,
  prefsDefaults: { sort: "updated_at", direction: "desc" },
  urlState: true,
  getRowId: (row) => row.id,
  getRowName: (row) => row.name,
  door: { hrefFor: (row) => `/masterwork/encore/${row.id}` },
  sourceFeature: "masterwork",
  getRowEntity: (row) => ({
    type: "workflow",
    id: row.id,
    title: row.name,
    resourceType: "workflow",
  }),
  useRowActions: useEncoreRowActions,
  views: {
    cards: (props) => (
      <EncoreBrowseCards
        rows={props.rows}
        density={props.density}
        menuFor={props.actions.menuFor}
        hrefFor={props.hrefFor}
      />
    ),
    rows: (props) => (
      <EncoreBrowseCards
        rows={props.rows}
        density="compact"
        menuFor={props.actions.menuFor}
        hrefFor={props.hrefFor}
      />
    ),
  },
  supportsArchived: false,
  facetSections: [],
  emptyState: {
    title: "No released Masterworks here",
    description:
      "Released Masterworks appear here when they are ready for you to run.",
  },
};
