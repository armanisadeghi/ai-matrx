"use client";

// features/unified-data/home/dataHomeColumns.tsx — LANE DATA-HOME-3A
//
// THE DATA HOME'S COLUMNS (DATA-HOME-3-SPEC §2.3): Name · Kind · Organization · Records · Updated ·
// Owner · Access, with Changed by, Details and Link one click away in the column picker. Every
// column sorts and filters over the whole in-hand set (dataHomeService.ts reads the same ids).

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import {
  Bell,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Inbox,
  Layers,
  LayoutDashboard,
  Link2,
  List,
  ListChecks,
  Send,
  Star,
  Table2,
  TriangleAlert,
  SlidersHorizontal,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SyncedBadge } from "@/features/unified-data/connect-database/SyncedBadge";
import { DATE_FILTER_OPTIONS, Muted, TextCell, timeCell, type EntityColumnSpec } from "@/lib/entity-list/columns";
import type { RecordCountStore } from "./dataHomeRecordCounts";
import { ACCESS_WHY, ACCESS_WORD, dataHomeKindWord, type DataHomeAccess, type DataHomeRow } from "./dataHomeRows";

const KIND_ICON: Record<string, LucideIcon> = {
  table: Table2,
  // A List and a Scope are Tables too, but must not read as one at a glance (VERIFY-DATA-HOME-3 W7).
  list: List,
  scope: Layers,
  form: FileText,
  booking: CalendarClock,
  portal: Inbox,
  dashboard: LayoutDashboard,
  digest: Bell,
  checklist: ListChecks,
  automation: Workflow,
  share: Send,
  view: BookOpen,
  custom_fields: SlidersHorizontal,
  page: FileText,
  action: ClipboardCheck,
};

export function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = KIND_ICON[kind] ?? Table2;
  return <Icon aria-hidden className={className ?? "h-3.5 w-3.5 shrink-0 text-muted-foreground"} />;
}

/** The name cell: kind icon, the name (the row's door), `in <table>` when different, the trouble mark. */
/** "Matched in field: Furnace model" — a row only the server search found says why (≤ 60 chars). */
export function matchedLine(row: DataHomeRow): string | null {
  if (!row.matched) return null;
  if (row.matched.in === "field") return `Matched in field: ${row.matched.field ?? "a field"}`.slice(0, 60);
  if (row.matched.in === "description") return "Matched in description";
  return null;
}

export function DataHomeName({ row }: { row: DataHomeRow }) {
  const why = matchedLine(row);
  if (why) {
    return (
      <div className="min-w-0">
        <DataHomeNameLine row={row} />
        <div className="truncate text-xs text-muted-foreground" data-data-home-matched="">
          {why}
        </div>
      </div>
    );
  }
  return <DataHomeNameLine row={row} />;
}

function DataHomeNameLine({ row }: { row: DataHomeRow }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5" data-data-home-name={row.name}>
      <KindIcon kind={row.kind} />
      <span className="truncate font-medium text-foreground" title={row.name}>
        {row.name}
      </span>
      {row.foundation ? <FoundationBadge /> : null}
      {row.syncedFrom ? <SyncedBadge provider={row.syncedFrom} /> : null}
      {row.parentName ? (
        <span className="truncate text-xs text-muted-foreground" title={`in ${row.parentName}`}>
          in {row.parentName}
        </span>
      ) : null}
      {row.trouble ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span role="img" aria-label={row.trouble} className="inline-flex shrink-0" data-data-home-trouble="">
              <TriangleAlert className="h-3.5 w-3.5 text-amber-600" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{row.trouble}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

/**
 * LANE 10 FD: the one small mark on a Foundation table — the business's day-one data. Same chip as
 * Access, so the row reads as one family; the meaning lives in the tooltip, never on the row.
 */
export function FoundationBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          data-data-home-foundation=""
          className="inline-flex h-5 shrink-0 items-center rounded-full border border-border px-2 text-[11px] text-muted-foreground"
        >
          Foundation
        </span>
      </TooltipTrigger>
      <TooltipContent>Day-one data your business is built on.</TooltipContent>
    </Tooltip>
  );
}

export function AccessChip({ access }: { access: DataHomeAccess | null }) {
  if (!access) return <Muted>—</Muted>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex h-5 items-center rounded-full border border-border px-2 text-[11px] text-muted-foreground"
        >
          {ACCESS_WORD[access]}
        </span>
      </TooltipTrigger>
      <TooltipContent>{ACCESS_WHY[access]}</TooltipContent>
    </Tooltip>
  );
}

export function OrganizationCell({ row }: { row: DataHomeRow }) {
  if (row.organizationId && row.organizationName) {
    return (
      <EntityRef
        token="organization"
        id={row.organizationId}
        name={row.organizationName}
        showIcon={false}
        className="text-muted-foreground"
      />
    );
  }
  return <TextCell value={row.organizationName} muted />;
}

/** Owner, in the person's words: "You" for the viewer's own rows, else the maker's name, else none. */
export function ownerLabel(row: DataHomeRow): string | null {
  if (row.mine) return "You";
  const name = row.createdByName?.trim();
  return name ? name : null;
}

export interface DataHomeColumnContext {
  organizationName: (id: string) => string;
  /** The lazy counter for the Records column; absent = every cell shows `—`. */
  recordCounts?: RecordCountStore | undefined;
}

/**
 * Records: `—` until the count arrives, never 0. A Table's cell on screen asks the lazy counter
 * (one batched `custom.table_row_counts` call per organization). Only the home's Table rows (any
 * Table kind: list, scope, form …) are counted; a form, portal or digest row is not a Table.
 */
/**
 * A row's Records count from the ONE lazy store — the table's cell and the cards view both read it
 * here, so the two never disagree (VERIFY-DATA-HOME-3 W5: a card read `row.records`, `—`, while the
 * table counted 5). A mounted row on screen asks; `undefined` until the answer arrives.
 */
export function useRecordCount(row: DataHomeRow, store: RecordCountStore | undefined): number | undefined {
  const { organizationId, tableId } = row;
  // The count is read THROUGH the subscription (a snapshot of this Table's own count), never from
  // a mutable store read in render: the compiler caches a render-time read on its (unchanged) inputs.
  const counted = useSyncExternalStore(
    store?.subscribe ?? NO_SUBSCRIBE,
    () => (store && tableId ? store.get(tableId) : undefined),
    () => undefined,
  );
  const asks = Boolean(store) && row.itemId === tableId && Boolean(organizationId) && Boolean(tableId);
  useEffect(() => {
    if (asks && store && organizationId && tableId) store.want(organizationId, tableId);
  }, [asks, store, organizationId, tableId]);
  return row.records ?? counted;
}

export function RecordsCell({ row, store }: { row: DataHomeRow; store: RecordCountStore | undefined }) {
  const known = useRecordCount(row, store);
  if (known === undefined || known === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="text-muted-foreground" aria-label="Not counted yet.">
            —
          </span>
        </TooltipTrigger>
        <TooltipContent>Not counted yet.</TooltipContent>
      </Tooltip>
    );
  }
  return <span className="tabular-nums">{known.toLocaleString()}</span>;
}

const NO_SUBSCRIBE = () => () => undefined;

export function dataHomeColumns(ctx: DataHomeColumnContext): EntityColumnSpec<DataHomeRow>[] {
  return [
    {
      id: "favorite",
      label: "Favorite",
      locked: true,
      phone: "actions",
      column: {
        id: "favorite",
        accessorKey: "id",
        header: <Star className="h-3.5 w-3.5" aria-hidden />,
        filter: "boolean",
        compact: true,
        width: 40,
        align: "center",
      },
    },
    {
      id: "name",
      label: "Name",
      locked: true,
      phone: "title",
      column: {
        id: "name",
        accessorKey: "name",
        header: "Name",
        filter: "text",
        width: 300,
        frozen: true,
        cell: (row) => <DataHomeName row={row} />,
      },
    },
    {
      id: "kind",
      priority: 1,
      label: "What it is",
      facet: "kind",
      phone: "primary",
      formatFacetValue: dataHomeKindWord,
      column: {
        id: "kind",
        accessorKey: "kind",
        header: "What it is",
        filter: "select",
        width: 110,
        cell: (row) => <span className="text-muted-foreground">{dataHomeKindWord(row.kind)}</span>,
      },
    },
    {
      id: "organization",
      priority: 1,
      label: "Organization",
      facet: "organization",
      phone: "primary",
      formatFacetValue: ctx.organizationName,
      column: {
        id: "organization",
        accessorKey: "organizationName",
        header: "Organization",
        filter: "select",
        width: 150,
        cell: (row) => <OrganizationCell row={row} />,
      },
    },
    {
      id: "records",
      priority: 2,
      label: "Records",
      facet: "records",
      phone: "rest",
      formatFacetValue: (v) => v,
      column: {
        id: "records",
        accessorKey: "records",
        header: "Records",
        filter: "select",
        width: 80,
        align: "right",
        cell: (row) => <RecordsCell row={row} store={ctx.recordCounts} />,
      },
    },
    {
      id: "updated",
      priority: 3,
      label: "Updated",
      phone: "meta",
      sortWords: { asc: "oldest first", desc: "newest first" },
      column: {
        id: "updated",
        accessorKey: "updatedAt",
        header: "Updated",
        filter: "select",
        filterOptions: DATE_FILTER_OPTIONS,
        width: 90,
        cell: (row) => timeCell(row.updatedAt),
      },
    },
    {
      id: "owner",
      priority: 4,
      label: "Owner",
      defaultHidden: true,
      facet: "owner",
      phone: "rest",
      column: {
        id: "owner",
        accessorKey: "createdByName",
        header: "Owner",
        filter: "select",
        width: 100,
        cell: (row) => <TextCell value={ownerLabel(row)} muted />,
      },
    },
    {
      id: "access",
      priority: 5,
      label: "Access",
      defaultHidden: true,
      facet: "access",
      phone: "rest",
      formatFacetValue: (v) => ACCESS_WORD[v as DataHomeAccess] ?? v,
      column: {
        id: "access",
        accessorKey: "access",
        header: "Access",
        filter: "select",
        width: 90,
        className: "max-lg:hidden",
        headerClassName: "max-lg:hidden",
        cell: (row) => <AccessChip access={row.access} />,
      },
    },
    {
      id: "changed_by",
      label: "Changed by",
      defaultHidden: true,
      phone: "rest",
      column: {
        id: "changed_by",
        accessorKey: "changedBy",
        header: "Changed by",
        filter: "text",
        width: 150,
        cell: (row) => <TextCell value={row.changedBy} muted />,
      },
    },
    {
      id: "details",
      label: "Details",
      defaultHidden: true,
      phone: "rest",
      column: {
        id: "details",
        accessorKey: "details",
        header: "Details",
        filter: "text",
        width: 220,
        cell: (row) => <TextCell value={row.details.slice(0, 60)} muted />,
      },
    },
    {
      id: "link",
      label: "Link",
      defaultHidden: true,
      phone: "rest",
      column: {
        id: "link",
        accessorKey: "publicLabel",
        header: "Link",
        filter: "text",
        width: 200,
        cell: (row) =>
          row.publicHref ? (
            <Link
              href={row.publicHref}
              target="_blank"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex min-w-0 items-center gap-1 text-xs text-primary hover:underline"
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{row.publicLabel ?? "Public link"}</span>
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            </Link>
          ) : (
            <Muted>—</Muted>
          ),
      },
    },
  ];
}
