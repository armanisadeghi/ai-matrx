"use client";

// features/workflow-runtime/browse/columns.tsx
//
// EVERY column a workflow row can show, declared once.
//
// APP POLICY: every column sorts AND filters. No exceptions. Both are served by
// `wfx_list_scoped`, so they apply to the whole result set, never to the loaded
// page. Where a column has a finite value set (category, tags, status, steps,
// runs, visibility, access, version, org, owner, favorite, archived) the filter
// offers real OPTIONS with counts from `wfx_list_facets` — not a bare text box.
//
// Sorting is on the DATABASE column, never the rendered cell.
//
// `defaultHidden` is a starting point, never a restriction — anything here is
// one click away in the column picker, and the choice is persisted per user.

import { Archive, Star } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { cleanMarkdownPreview } from "@/utils/markdown-processors/clean-markdown-to-text";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  relativeTime,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import { RunStatusChip, runStatusLabel } from "../run-status";
import type { WorkflowBrowseRow } from "./types";

/**
 * A count column's finite value set is "how many". Buckets keep Steps and Runs
 * filterable like every other column; the SQL half is `wfx_bucket_matches`.
 */
const COUNT_FILTER_OPTIONS = [
  { value: "0", label: "None" },
  { value: "1-5", label: "1–5" },
  { value: "6-20", label: "6–20" },
  { value: "gt20", label: "More than 20" },
];

/** Facet values are raw run statuses; the panel must show them as words. */
const formatStatusFacet = (value: string) =>
  value === "__none__" ? "Never run" : runStatusLabel(value);

export const WORKFLOW_BROWSE_COLUMNS: EntityColumnSpec<WorkflowBrowseRow>[] = [
  {
    id: "favorite",
    label: "Favorite",
    facet: "favorite",
    locked: true,
    column: {
      id: "favorite",
      accessorKey: "is_favorite",
      header: <Star className="h-3.5 w-3.5" aria-hidden />,
      filter: "boolean",
      // `compact` collapses the header's sort button + filter funnel into the
      // star; without it an icon column measures ~106px.
      compact: true,
      width: 40,
      align: "center",
      // The interactive star is injected by EntityListTable, which owns the
      // toggle handler. Declared here so it sorts and filters like any other.
    },
  },
  {
    id: "name",
    label: "Name",
    locked: true,
    column: {
      id: "name",
      accessorKey: "name",
      header: "Name",
      filter: "text",
      editable: "string",
      // Rename is the hover pencil ONLY. The name itself is an anchor to
      // /workflows/[id] (applied by the shell from `door` in listConfig), so
      // clicking the name runs the workflow's own page and cmd-click opens a
      // tab; clicking anywhere else on the row opens the action chooser.
      editTrigger: "pencil",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.name}</span>
          {row.is_archived && (
            <Badge variant="outline" className="shrink-0 py-0 text-[10px]">
              <Archive className="mr-1 h-2.5 w-2.5" />
              Archived
            </Badge>
          )}
        </div>
      ),
    },
  },
  {
    id: "description",
    label: "Description",
    column: {
      id: "description",
      accessorKey: "description",
      header: "Description",
      filter: "text",
      editable: "string",
      editTrigger: "pencil",
      // Cap the column: some workflow descriptions run long, and without a
      // bound the table sizes to min-content and scrolls forever sideways.
      width: 320,
      className: "max-w-[20rem] overflow-hidden",
      cell: (row) => {
        const preview = cleanMarkdownPreview(row.description);
        return (
          <span
            className="block truncate text-muted-foreground"
            title={preview || undefined}
          >
            {preview || "—"}
          </span>
        );
      },
    },
  },
  {
    id: "steps",
    label: "Steps",
    facet: "steps",
    column: {
      id: "steps",
      accessorKey: "step_count",
      header: "Steps",
      filter: "select",
      filterOptions: COUNT_FILTER_OPTIONS,
      width: 80,
      align: "right",
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {row.step_count ?? 0}
        </span>
      ),
    },
  },
  {
    id: "runs",
    label: "Runs",
    facet: "runs",
    column: {
      id: "runs",
      accessorKey: "run_count",
      header: "Runs",
      filter: "select",
      filterOptions: COUNT_FILTER_OPTIONS,
      width: 80,
      align: "right",
      // NOT a link, deliberately. THE DOOR LAW says a count is a door — but
      // there is no per-workflow run-history surface to open yet, and pointing
      // "4 runs" at the single most recent run would be a door that lands
      // somewhere the number did not promise. The Last run cell beside it IS a
      // real door to a real record. The missing history surface is tracked
      // rather than faked (see ../FEATURE.md § Known limits).
      cell: (row) => {
        const n = Number(row.run_count ?? 0);
        return n > 0 ? (
          <span className="tabular-nums text-muted-foreground">{n}</span>
        ) : (
          <Muted>—</Muted>
        );
      },
    },
  },
  {
    id: "status",
    label: "Last run status",
    facet: "status",
    formatFacetValue: formatStatusFacet,
    column: {
      id: "status",
      accessorKey: "last_run_status",
      header: "Status",
      filter: "select",
      width: 150,
      cell: (row) =>
        row.last_run_status ? (
          <RunStatusChip status={row.last_run_status} />
        ) : (
          <Muted>Never run</Muted>
        ),
    },
  },
  {
    id: "last_run",
    label: "Last run",
    column: {
      id: "last_run",
      accessorKey: "last_run_at",
      header: "Last run",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      width: 130,
      align: "right",
      // THE DOOR LAW: the run is a record with an identity and a permalink, so
      // the cell that names it opens it. `wfx_list_scoped` already returns the
      // id — rendering the timestamp as inert text would be throwing away a
      // relationship we resolved.
      cell: (row) => {
        if (!row.last_run_at) return <Muted>—</Muted>;
        const when = relativeTime(row.last_run_at);
        if (!row.last_run_id) {
          return (
            <span
              className="tabular-nums text-muted-foreground"
              title={new Date(row.last_run_at).toLocaleString()}
            >
              {when}
            </span>
          );
        }
        return (
          <Link
            href={`/workflows/runs/${row.last_run_id}`}
            onClick={(e) => e.stopPropagation()}
            className="tabular-nums text-muted-foreground hover:text-foreground hover:underline"
            title={`Open the run from ${new Date(row.last_run_at).toLocaleString()}`}
          >
            {when}
          </Link>
        );
      },
    },
  },
  {
    id: "category",
    label: "Category",
    facet: "category",
    column: {
      id: "category",
      accessorKey: "category",
      header: "Category",
      filter: "select",
      editable: "select",
      width: 160,
      cell: (row) =>
        row.category ? (
          <Badge variant="secondary" className="py-0 text-[10px] font-normal">
            {row.category}
          </Badge>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "tags",
    label: "Tags",
    facet: "tag",
    column: {
      id: "tags",
      accessorKey: "tags",
      header: "Tags",
      filter: "select",
      editable: "tags",
      width: 190,
      cell: (row) =>
        row.tags?.length ? (
          // nowrap: wrapping tags makes one row three times the height of its
          // neighbours and breaks the scan line down the table.
          <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
            {row.tags.slice(0, 2).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="max-w-[84px] shrink-0 truncate py-0 text-[10px] font-normal"
                title={tag}
              >
                {tag}
              </Badge>
            ))}
            {row.tags.length > 2 && (
              <span
                className="shrink-0 text-[10px] text-muted-foreground"
                title={row.tags.join(", ")}
              >
                +{row.tags.length - 2}
              </span>
            )}
          </div>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "organization_name",
    label: "Organization",
    scopedToShared: true,
    facet: "organization_name",
    column: {
      id: "organization_name",
      accessorKey: "organization_name",
      header: "Organization",
      filter: "text",
      width: 170,
      // THE DOOR LAW: the RPC returns organization_id beside the name, so the
      // org is a relationship we RESOLVED. EntityRef gives Open + new tab +
      // peek from the registries.
      cell: (row) =>
        row.organization_name && row.organization_id ? (
          <EntityRef
            token="organization"
            id={row.organization_id}
            name={row.organization_name}
            className="text-muted-foreground"
          />
        ) : row.organization_name ? (
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
    facet: "owner_email",
    column: {
      id: "owner_email",
      accessorKey: "owner_email",
      header: "Owner",
      filter: "text",
      width: 190,
      cell: (row) => (
        <span className="truncate text-muted-foreground">
          {row.owner_email ?? "—"}
        </span>
      ),
    },
  },
  {
    id: "access_level",
    label: "Access",
    scopedToShared: true,
    facet: "access_level",
    column: {
      id: "access_level",
      accessorKey: "access_level",
      header: "Access",
      filter: "select",
      width: 110,
      cell: (row) => (
        <Badge variant="outline" className="py-0 text-[10px] capitalize">
          {row.access_level}
        </Badge>
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
      width: 120,
      align: "right",
      cell: (row) => timeCell(row.updated_at),
    },
  },
  // ── Off by default. Present, one click away, never a code change. ────────
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
      width: 120,
      align: "right",
      cell: (row) => timeCell(row.created_at),
    },
  },
  {
    id: "version",
    label: "Version",
    defaultHidden: true,
    facet: "version",
    column: {
      id: "version",
      accessorKey: "version",
      header: "Ver",
      filter: "select",
      width: 80,
      align: "right",
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">
          v{row.version ?? 1}
        </span>
      ),
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
      width: 120,
      cell: (row) => (
        <Badge variant="outline" className="py-0 text-[10px] capitalize">
          {row.visibility}
        </Badge>
      ),
    },
  },
  {
    id: "archived",
    label: "Archived",
    defaultHidden: true,
    facet: "archived",
    column: {
      id: "archived",
      accessorKey: "is_archived",
      header: "Archived",
      filter: "boolean",
      width: 90,
      align: "center",
      cell: (row) =>
        row.is_archived ? (
          <Archive className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
];
