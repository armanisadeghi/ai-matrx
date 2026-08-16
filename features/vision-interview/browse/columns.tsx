"use client";

// features/vision-interview/browse/columns.tsx
//
// EVERY column the /vision-interview list row can show, declared once.
// APP POLICY: every column sorts AND filters server-side (ivw_list_scoped);
// finite value sets (stage, visibility) get real options with counts from
// ivw_list_facets; dates filter by relative bucket.

import { Badge } from "@/components/ui/badge";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import { STAGES } from "../types";
import type { SessionListRow } from "./types";

export const SESSION_COLUMNS: EntityColumnSpec<SessionListRow>[] = [
  {
    id: "title",
    label: "Title",
    locked: true,
    column: {
      id: "title",
      accessorKey: "title",
      header: "Title",
      filter: "text",
      editable: "string",
      editTrigger: "pencil",
      cell: (row) => (
        <span className="block min-w-0 truncate font-medium">{row.title}</span>
      ),
    },
  },
  {
    id: "stage",
    label: "Stage",
    facet: "stage",
    column: {
      id: "stage",
      accessorKey: "stage",
      header: "Stage",
      filter: "select",
      width: 110,
      cell: (row) => (
        <Badge variant="outline" className="py-0 text-[11px]">
          {STAGES[row.stage]?.label ?? row.stage}
        </Badge>
      ),
    },
  },
  {
    id: "current_round",
    label: "Round",
    column: {
      id: "current_round",
      accessorKey: "current_round",
      header: "Round",
      filter: "text",
      width: 80,
      align: "center",
      cell: (row) => (
        <span className="tabular-nums">{row.current_round}</span>
      ),
    },
  },
  {
    id: "open_questions",
    label: "Open questions",
    column: {
      id: "open_questions",
      accessorKey: "open_questions",
      header: "Open Qs",
      filter: "text",
      width: 90,
      align: "center",
      cell: (row) =>
        row.open_questions > 0 ? (
          <span className="tabular-nums font-medium">{row.open_questions}</span>
        ) : (
          <Muted>0</Muted>
        ),
    },
  },
  {
    id: "vision_statement",
    label: "Vision",
    defaultHidden: true,
    column: {
      id: "vision_statement",
      accessorKey: "vision_statement",
      header: "Vision",
      filter: "text",
      width: 320,
      className: "max-w-[20rem] overflow-hidden",
      cell: (row) => (
        <span
          className="block truncate text-muted-foreground"
          title={row.vision_statement || undefined}
        >
          {row.vision_statement || "—"}
        </span>
      ),
    },
  },
  {
    id: "visibility",
    label: "Visibility",
    facet: "visibility",
    defaultHidden: true,
    column: {
      id: "visibility",
      accessorKey: "visibility",
      header: "Visibility",
      filter: "select",
      width: 100,
      cell: (row) => <Muted>{row.visibility}</Muted>,
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
      cell: (row) => <Muted>{row.owner_email ?? "—"}</Muted>,
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
