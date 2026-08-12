"use client";

// features/canvas/maps/listConfig.tsx
//
// /maps expressed as an entity-list config — the THIRD consumer of the generic
// shell (lib/entity-list), after /agents/all and /transcripts. Writing a
// bespoke grid here would have been a fourth list implementation for rows that
// sort, filter, page and favourite exactly like every other list.

import type { EntityListConfig } from "@/lib/entity-list/config";
import { relativeTime } from "@/lib/entity-list/columns";
import { MAP_COLUMNS } from "./columns";
import {
  fetchMapFacets,
  fetchMapListPage,
  fetchMapScopeCounts,
  saveMapRowEdit,
} from "./service";
import { useMapRowActions } from "./useMapRowActions";
import { MAP_LIST_SCOPES, mapHref, type MapListRow } from "./types";

export const mapListConfig: EntityListConfig<MapListRow> = {
  surfaceKey: "canvas-maps-browse",
  entityLabel: { singular: "map", plural: "maps" },
  sourceFeature: "canvas",
  scopes: MAP_LIST_SCOPES,
  service: {
    fetchPage: fetchMapListPage,
    fetchCounts: fetchMapScopeCounts,
    fetchFacets: fetchMapFacets,
  },
  columns: MAP_COLUMNS,
  prefsVersion: 1,
  getRowId: (row) => row.id,
  getRowName: (row) => row.title,
  door: { hrefFor: mapHref },
  useRowActions: useMapRowActions,
  favorite: {
    isFavorite: (row) => row.is_favorited,
    canToggle: () => true,
  },
  edit: {
    save: (row, edit) => saveMapRowEdit(row, edit),
  },
  // No facets: a personal map library has no finite dimension worth faceting
  // yet, and a section fed by an empty facet is a control that does nothing.
  facetSections: [],
  copy: {
    label: "Map",
    listLabel: "Maps",
    location: "/maps",
    rowKind: "map",
    listKind: "map-list",
    humanRow: (row) =>
      `${row.title} — ${row.box_count} boxes, ${row.arrow_count} arrows, edited ${relativeTime(row.updated_at)}`,
    showRow: false,
    showToolbar: false,
  },
  emptyState: {
    title: "No maps yet",
    description:
      "A map is a picture of how something works — steps, people, or parts, with arrows between them. Make one and drag it into shape.",
  },
};
