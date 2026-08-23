"use client";

import { Badge } from "@/components/ui/badge";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import type { ShapeBrowseRow } from "./types";

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const SHAPE_COLUMNS: EntityColumnSpec<ShapeBrowseRow>[] = [
  {
    id: "label",
    label: "Shape",
    locked: true,
    column: {
      id: "label",
      accessorKey: "label",
      header: "Shape",
      filter: "text",
      cell: (row) => (
        <span className="block min-w-0 truncate font-medium">{row.label}</span>
      ),
    },
  },
  {
    id: "kind",
    label: "Kind",
    column: {
      id: "kind",
      accessorKey: "kind",
      header: "Kind",
      filter: "text",
      width: 220,
      cell: (row) => (
        <code className="block truncate font-mono text-xs text-muted-foreground">
          {row.kind}
        </code>
      ),
    },
  },
  {
    id: "status",
    label: "Status",
    facet: "status",
    formatFacetValue: titleCase,
    column: {
      id: "status",
      accessorKey: "is_active",
      header: "Status",
      filter: "select",
      width: 90,
      cell: (row) => (
        <Badge
          variant="outline"
          className={
            row.is_active
              ? "border-primary/30 bg-primary/10 py-0 text-[11px] text-primary"
              : "py-0 text-[11px] text-muted-foreground"
          }
        >
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  },
  {
    id: "component",
    label: "Renderer",
    facet: "component",
    formatFacetValue: (value) =>
      value === "custom" ? "Custom renderer" : "Generic renderer",
    column: {
      id: "component",
      accessorKey: "has_component",
      header: "Renderer",
      filter: "select",
      width: 120,
      cell: (row) => <Muted>{row.has_component ? "Custom" : "Generic"}</Muted>,
    },
  },
  {
    id: "family",
    label: "Family",
    facet: "family",
    column: {
      id: "family",
      accessorKey: "family",
      header: "Family",
      filter: "select",
      width: 140,
      cell: (row) => <Muted>{row.family ? titleCase(row.family) : "—"}</Muted>,
    },
  },
  {
    id: "origin",
    label: "Origin",
    facet: "origin",
    formatFacetValue: titleCase,
    column: {
      id: "origin",
      accessorKey: "origin",
      header: "Origin",
      filter: "select",
      width: 110,
      cell: (row) => <Muted>{titleCase(row.origin)}</Muted>,
    },
  },
  {
    id: "visibility",
    label: "Visibility",
    facet: "visibility",
    formatFacetValue: titleCase,
    defaultHidden: true,
    column: {
      id: "visibility",
      accessorKey: "visibility",
      header: "Visibility",
      filter: "select",
      width: 110,
      cell: (row) => <Muted>{titleCase(row.visibility)}</Muted>,
    },
  },
  {
    id: "authoring_owner",
    label: "Schema owner",
    facet: "authoring_owner",
    formatFacetValue: (value) => (value === "ts" ? "Web" : "Python"),
    defaultHidden: true,
    column: {
      id: "authoring_owner",
      accessorKey: "authoring_owner",
      header: "Schema owner",
      filter: "select",
      width: 120,
      cell: (row) => (
        <Muted>{row.authoring_owner === "ts" ? "Web" : "Python"}</Muted>
      ),
    },
  },
  {
    id: "version",
    label: "Version",
    facet: "version",
    defaultHidden: true,
    column: {
      id: "version",
      accessorKey: "version",
      header: "Version",
      filter: "select",
      width: 80,
      align: "center",
      cell: (row) => <span className="tabular-nums">v{row.version}</span>,
    },
  },
  {
    id: "organization_name",
    label: "Organization",
    scopedToShared: true,
    defaultHidden: true,
    column: {
      id: "organization_name",
      accessorKey: "organization_name",
      header: "Organization",
      filter: "text",
      cell: (row) => <Muted>{row.organization_name ?? "—"}</Muted>,
    },
  },
  {
    id: "owner_email",
    label: "Owner",
    scopedToShared: true,
    defaultHidden: true,
    column: {
      id: "owner_email",
      accessorKey: "owner_email",
      header: "Owner",
      filter: "text",
      cell: (row) => <Muted>{row.owner_email ?? "System"}</Muted>,
    },
  },
  {
    id: "access_level",
    label: "Access",
    facet: "access_level",
    formatFacetValue: titleCase,
    scopedToShared: true,
    defaultHidden: true,
    column: {
      id: "access_level",
      accessorKey: "access_level",
      header: "Access",
      filter: "select",
      width: 100,
      cell: (row) => <Muted>{titleCase(row.access_level)}</Muted>,
    },
  },
  {
    id: "updated",
    label: "Updated",
    column: {
      id: "updated",
      accessorKey: "updated_at",
      header: "Updated",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      width: 110,
      cell: (row) => timeCell(row.updated_at),
    },
  },
  {
    id: "created",
    label: "Created",
    defaultHidden: true,
    column: {
      id: "created",
      accessorKey: "created_at",
      header: "Created",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      width: 110,
      cell: (row) => timeCell(row.created_at),
    },
  },
];
