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
  type RulebookListRow,
} from "../types";
import { formatSourceSummary } from "./sourceSummary";

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

function statusBadge(status: RulebookListRow["status"]) {
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

/**
 * What this Rulebook was built from, in one line.
 *
 * Three honest states and no fourth: the kept material named and counted; the
 * imported book's author when that is genuinely all this row has; and "we
 * couldn't read this" when the tally read failed — which is NOT the same fact
 * as "there is nothing here" and must never be drawn as the same dash (law 4).
 */
function SourceCell({ row }: { row: RulebookListRow }) {
  const summary = formatSourceSummary(row.sources);
  if (summary) {
    return <span className="truncate text-sm">{summary}</span>;
  }
  if (row.sources.state === "unavailable") {
    return (
      <span
        className="truncate text-xs text-muted-foreground"
        title="We couldn't read what this Rulebook was built from. The Rulebook itself is fine — reload the list to ask again."
      >
        Couldn&apos;t read this
      </span>
    );
  }
  if (row.source.author) {
    return (
      <span className="truncate text-sm">
        {row.source.author}
        {row.source.year ? <Muted> · {String(row.source.year)}</Muted> : null}
      </span>
    );
  }
  return <Muted>Nothing yet</Muted>;
}

export const RULEBOOK_COLUMNS: EntityColumnSpec<RulebookListRow>[] = [
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
    // 🚨 THE COLUMN CALLED SOURCE NAMES WHAT THIS WAS BUILT FROM (cold walk 16,
    // defect F — recorded unchanged by walks 14, 15 and 16).
    //
    // It used to be `id: "author"` and render `source.author`, a bibliographic
    // field only the book-import lane fills. So a Rulebook built from an
    // interview and five files — the way the product actually teaches people
    // to build one — printed `—` under a column headed SOURCE, and every row
    // on the page did too. The kept raw material now answers it, and the
    // book's author survives as the fallback for the rows that have one.
    //
    // Not sortable and not filterable, deliberately: the tally is computed in
    // the browser over the loaded page, so a sort or a filter would order or
    // narrow ONE page while the header implied it had done so over the set —
    // the lie a column header cannot tell (same reason as the kept-sources
    // rule-count column).
    id: "sources",
    label: "Source",
    column: {
      id: "sources",
      accessorFn: (row) =>
        formatSourceSummary(row.sources) ?? row.source.author ?? "",
      header: "Source",
      filter: false,
      sortable: false,
      cell: (row) => <SourceCell row={row} />,
    },
  },
  {
    id: "rule_count",
    label: "Rules",
    column: {
      id: "rule_count",
      accessorKey: "rule_count",
      header: "Rules",
      sortable: false,
      filter: false,
      cell: (row) => <span className="tabular-nums">{row.rule_count}</span>,
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
    // Status belongs on the phone card's face, above author and version.
    phone: "primary",
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
