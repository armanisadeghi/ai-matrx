"use client";

import type { EntityListConfig } from "@/lib/entity-list/config";
import { relativeTime } from "@/lib/entity-list/columns";
import { shapeDetailHref } from "@/features/content-ir/studio/constants";
import { SHAPE_COLUMNS } from "./columns";
import {
  fetchShapeFacets,
  fetchShapePage,
  fetchShapeScopeCounts,
} from "./service";
import { SHAPE_LIST_SCOPES, type ShapeBrowseRow } from "./types";
import { useShapeRowActions } from "./useShapeRowActions";

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const shapeListConfig: EntityListConfig<ShapeBrowseRow> = {
  surfaceKey: "shapes-browse",
  entityLabel: { singular: "shape", plural: "shapes" },
  sourceFeature: "udt",
  scopes: SHAPE_LIST_SCOPES,
  service: {
    fetchPage: fetchShapePage,
    fetchCounts: fetchShapeScopeCounts,
    fetchFacets: fetchShapeFacets,
  },
  columns: SHAPE_COLUMNS,
  prefsVersion: 1,
  prefsDefaults: { sort: "updated", direction: "desc", pageSize: 25 },
  getRowId: (row) => row.id,
  getRowName: (row) => row.label,
  door: {
    token: "content_ir_kind",
    hrefFor: (row) => shapeDetailHref(row.kind),
  },
  getRowEntity: (row) => ({
    type: "content_ir_kind",
    id: row.id,
    title: row.label,
  }),
  useRowActions: useShapeRowActions,
  supportsArchived: false,
  urlState: true,
  facetSections: [
    {
      facet: "origin",
      filterId: "origin",
      label: "Origin",
      noneLabel: "Unknown origin",
      formatValue: titleCase,
    },
    {
      facet: "status",
      filterId: "status",
      label: "Status",
      noneLabel: "Unknown status",
      formatValue: titleCase,
    },
    {
      facet: "component",
      filterId: "component",
      label: "Renderer",
      noneLabel: "Unknown renderer",
      formatValue: (value) =>
        value === "custom" ? "Custom renderer" : "Generic renderer",
    },
    {
      facet: "family",
      filterId: "family",
      label: "Family",
      noneLabel: "No family",
      formatValue: titleCase,
    },
    {
      facet: "authoring_owner",
      filterId: "authoring_owner",
      label: "Schema owner",
      noneLabel: "Unknown owner",
      formatValue: (value) => (value === "ts" ? "Web" : "Python"),
    },
    {
      facet: "visibility",
      filterId: "visibility",
      label: "Visibility",
      noneLabel: "No visibility",
      formatValue: titleCase,
    },
    {
      facet: "access_level",
      filterId: "access_level",
      label: "Access",
      noneLabel: "No access level",
      formatValue: titleCase,
    },
  ],
  noneLabels: {
    family: "No family",
    organization_name: "No organization",
    owner_email: "System",
  },
  copy: {
    label: "Shape",
    listLabel: "Shapes",
    location: "/shapes/all",
    rowKind: "content-ir-kind",
    listKind: "content-ir-kind-list",
    humanRow: (row) =>
      `${row.label} (${row.kind}) — ${row.is_active ? "active" : "inactive"}, updated ${relativeTime(row.updated_at)}`,
    showRow: false,
    showToolbar: false,
  },
  emptyState: {
    title: "No shapes here",
    description:
      "Nothing matches this scope yet. Create a shape, or switch to the public library.",
  },
};
