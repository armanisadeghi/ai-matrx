"use client";

import { Badge } from "@/components/ui/badge";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import {
  EDUCATION_LIBRARY_KIND_LABELS,
  EDUCATION_LIBRARY_SUBTYPE_LABELS,
  educationLibraryHref,
  type EducationLibraryKind,
  type EducationLibraryRow,
} from "./types";

function label(value: string): string {
  return EDUCATION_LIBRARY_SUBTYPE_LABELS[value] ?? value.replaceAll("_", " ");
}

export const EDUCATION_LIBRARY_COLUMNS: EntityColumnSpec<EducationLibraryRow>[] =
  [
    {
      id: "title",
      label: "Title",
      locked: true,
      column: {
        id: "title",
        accessorKey: "title",
        header: "Title",
        filter: "text",
        href: educationLibraryHref,
        cell: (row) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">
              {row.title}
            </div>
            {row.description ? (
              <div className="truncate text-xs text-muted-foreground">
                {row.description}
              </div>
            ) : null}
          </div>
        ),
      },
    },
    {
      id: "kind",
      label: "Type",
      locked: true,
      facet: "kind",
      formatFacetValue: (value) =>
        EDUCATION_LIBRARY_KIND_LABELS[value as EducationLibraryKind] ?? value,
      column: {
        id: "kind",
        accessorKey: "kind",
        header: "Type",
        filter: "select",
        cell: (row) => (
          <Badge variant="outline" className="py-0 text-[10px]">
            {EDUCATION_LIBRARY_KIND_LABELS[row.kind as EducationLibraryKind] ??
              row.kind}
          </Badge>
        ),
      },
    },
    {
      id: "subtype",
      label: "Format",
      facet: "subtype",
      formatFacetValue: label,
      column: {
        id: "subtype",
        accessorKey: "subtype",
        header: "Format",
        filter: "select",
        cell: (row) => (
          <span className="capitalize text-muted-foreground">
            {label(row.subtype)}
          </span>
        ),
      },
    },
    {
      id: "status",
      label: "Status",
      facet: "status",
      column: {
        id: "status",
        accessorKey: "status",
        header: "Status",
        filter: "select",
        cell: (row) => (
          <span className="capitalize text-muted-foreground">
            {row.status || "—"}
          </span>
        ),
      },
    },
    {
      id: "organization_name",
      label: "Organization",
      scopedToShared: true,
      column: {
        id: "organization_name",
        accessorKey: "organization_name",
        header: "Organization",
        filter: "text",
        cell: (row) =>
          row.organization_name ? (
            <span className="truncate text-muted-foreground">
              {row.organization_name}
            </span>
          ) : (
            <Muted>—</Muted>
          ),
      },
    },
    {
      id: "owner_email",
      label: "Owner",
      scopedToShared: true,
      column: {
        id: "owner_email",
        accessorKey: "owner_email",
        header: "Owner",
        filter: "text",
        cell: (row) => (
          <span className="truncate text-muted-foreground">
            {row.owner_email ?? "—"}
          </span>
        ),
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
        cell: (row) => timeCell(row.created_at),
      },
    },
    {
      id: "visibility",
      label: "Visibility",
      defaultHidden: true,
      facet: "visibility",
      column: {
        id: "visibility",
        accessorKey: "visibility",
        header: "Visibility",
        filter: "select",
        cell: (row) => (
          <Badge variant="outline" className="py-0 text-[10px] capitalize">
            {row.visibility}
          </Badge>
        ),
      },
    },
  ];
