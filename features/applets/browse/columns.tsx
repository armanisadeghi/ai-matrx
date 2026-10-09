"use client";

// features/applets/browse/columns.tsx — the /applets column registry.
// Status is THE state (`appletState`): Draft / Published / Suspended / Archived — the same word the
// manage header and the builder show for the row. It is the ONLY publication column: a second "On the
// web" column read the raw flag and said "Yes" beside "Draft" (live audit 2026-10-09, L6).

import { Badge } from "@ai-matrx/design-system/controls";
import { DATE_SORT_WORDS, Muted, TextCell, timeCell, type EntityColumnSpec } from "@/lib/entity-list/columns";
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
      // A fixed, truncating column (audit L2): an unbounded About took ~65% of the table at 1280, pushed
      // Status, Runs and the dates off-screen, and its text bled through the pinned Actions column. The
      // whole sentence rides in the cell's title; About leaves first when the list is too narrow.
      width: 320,
      maxWidth: 360,
      // Nobody orders Applets by their description (audit L9: "About (A→Z)" was an engineer's sort).
      sortable: false,
      cell: (row) => <TextCell value={row.tagline} muted />,
    },
    priority: 3,
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
    id: "total_executions",
    label: "Runs",
    priority: 2,
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
    priority: 2,
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
