"use client";

// features/applets/browse/columns.tsx — the /applets column registry.
// Status is THE state (`appletState`): Draft / Published / Suspended / Archived — the same word the
// manage header and the builder show for the row.

import { Badge } from "@ai-matrx/design-system/controls";
import { DATE_SORT_WORDS, Muted, timeCell, type EntityColumnSpec } from "@/lib/entity-list/columns";
import { appletRowHref, type AppletListRow } from "./service";

export const APPLET_COLUMNS: EntityColumnSpec<AppletListRow>[] = [
  {
    id: "name",
    label: "Name",
    locked: true,
    column: {
      id: "name",
      accessorKey: "name",
      header: "Name",
      filter: "text",
      // THE DOOR LAW: the name is a real link (keyboard, new tab).
      href: (row) => (row.archived ? undefined : appletRowHref(row)),
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.name}</span>
          {row.build_open ? <Badge tone="info">Building</Badge> : row.unbuilt ? <Badge tone="warning">Not built</Badge> : null}
        </div>
      ),
    },
  },
  {
    id: "tagline",
    label: "About",
    column: {
      id: "tagline",
      accessorKey: "tagline",
      header: "About",
      filter: "text",
      cell: (row) => (row.tagline ? <span className="truncate">{row.tagline}</span> : <Muted>—</Muted>),
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
      cell: (row) => <Badge tone={row.state.tone}>{row.state.label}</Badge>,
    },
  },
  {
    id: "published_to_web",
    label: "On the web",
    column: {
      id: "published_to_web",
      accessorKey: "published_to_web",
      header: "On the web",
      filter: "boolean",
      cell: (row) => (row.published_to_web ? <span>Yes</span> : <Muted>No</Muted>),
    },
  },
  {
    id: "total_executions",
    label: "Runs",
    sortWords: { asc: "fewest first", desc: "most first" },
    column: {
      id: "total_executions",
      accessorKey: "total_executions",
      header: "Runs",
      filter: false,
      cell: (row) => <span className="tabular-nums">{row.total_executions}</span>,
    },
  },
  {
    id: "last_execution_at",
    label: "Last run",
    sortWords: DATE_SORT_WORDS,
    column: {
      id: "last_execution_at",
      accessorKey: "last_execution_at",
      header: "Last run",
      filter: false,
      cell: (row) => (row.last_execution_at ? timeCell(row.last_execution_at) : <Muted>Never</Muted>),
    },
  },
  {
    id: "updated_at",
    label: "Last edited",
    sortWords: DATE_SORT_WORDS,
    column: {
      id: "updated_at",
      accessorKey: "updated_at",
      header: "Last edited",
      filter: false,
      cell: (row) => timeCell(row.updated_at),
    },
  },
];
