"use client";

import { Badge } from "@/components/ui/badge";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import {
  SEVERITY_LABELS,
  STATUS_LABELS,
  type ExpertisePackListRow,
} from "../types";

void SEVERITY_LABELS;

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const VISIBILITY_OPTIONS = [
  { value: "personal", label: "Personal" },
  { value: "internal", label: "Organization" },
  { value: "public", label: "Public" },
];

function statusBadge(status: ExpertisePackListRow["status"]) {
  const tone =
    status === "active"
      ? "bg-accent text-accent-foreground"
      : status === "draft"
        ? "bg-muted text-muted-foreground"
        : "bg-muted text-muted-foreground opacity-70";
  return (
    <Badge variant="outline" className={`px-1.5 py-0 text-[11px] ${tone}`}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export const EXPERTISE_COLUMNS: EntityColumnSpec<ExpertisePackListRow>[] = [
  {
    id: "name",
    label: "Name",
    locked: true,
    column: {
      id: "name",
      accessorKey: "name",
      header: "Name",
      filter: "text",
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{row.name}</div>
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
    id: "author",
    label: "Source",
    column: {
      id: "author",
      accessorFn: (row) => row.source.author ?? "",
      header: "Source",
      filter: "text",
      sortable: false,
      cell: (row) =>
        row.source.author ? (
          <span className="truncate text-sm">
            {row.source.author}
            {row.source.year ? (
              <Muted> · {String(row.source.year)}</Muted>
            ) : null}
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "principle_count",
    label: "Rules",
    column: {
      id: "principle_count",
      accessorKey: "principle_count",
      header: "Rules",
      sortable: false,
      filter: false,
      cell: (row) => (
        <span className="tabular-nums">{row.principle_count}</span>
      ),
    },
  },
  {
    id: "version",
    label: "Version",
    column: {
      id: "version",
      accessorKey: "version",
      header: "Version",
      filter: false,
      cell: (row) => <span className="tabular-nums">v{row.version}</span>,
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
      filterOptions: STATUS_OPTIONS,
      cell: (row) => statusBadge(row.status),
    },
  },
  {
    id: "visibility",
    label: "Visibility",
    defaultHidden: true,
    column: {
      id: "visibility",
      accessorKey: "visibility",
      header: "Visibility",
      filter: "select",
      filterOptions: VISIBILITY_OPTIONS,
      cell: (row) => <Muted>{String(row.visibility)}</Muted>,
    },
  },
  {
    id: "updated_at",
    label: "Updated",
    column: {
      id: "updated_at",
      accessorKey: "updated_at",
      header: "Updated",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      cell: (row) => timeCell(row.updated_at),
    },
  },
  {
    id: "created_at",
    label: "Created",
    defaultHidden: true,
    column: {
      id: "created_at",
      accessorKey: "created_at",
      header: "Created",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      cell: (row) => timeCell(row.created_at),
    },
  },
];
