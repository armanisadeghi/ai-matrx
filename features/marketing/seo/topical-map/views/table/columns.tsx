"use client";

/**
 * features/marketing/seo/topical-map/views/table/columns.tsx — the ten
 * columns of the map table (PLAN §6 B), as `MatrxColumnDef`s.
 *
 * Every column sorts AND filters (CLAUDE.md § List pages). The topic column is
 * the door: it carries the indent, the expand chevron, the status mark and the
 * name; a row click opens the topic panel and the pencil edits the name in
 * place. The three counts and the two convergence columns render NOTHING when
 * their number was never loaded — a `title` on the empty cell says why — and a
 * real zero renders as "0". Printing a zero for "we did not ask" is the lie
 * this feature exists to kill.
 */

import { ChevronDown, ChevronRight } from "lucide-react";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";

import { cn } from "@/lib/utils";

import type { MapIntentColors } from "../../knobs";
import { FacetChip } from "../../ui/FacetChip";
import { IntentDot } from "../../ui/IntentDot";
import { TopicStatusMark } from "../../ui/TopicStatusMark";
import {
  TABLE_COLUMN_LABELS,
  type MapTableRow,
  type TableColumnId,
} from "./tableRows";

export interface MapTableColumnContext {
  /** Indent + chevrons in hierarchy mode; a muted ancestor path in flat mode. */
  hierarchy: boolean;
  /** `map_tree` was read with `include: ["counts"]`. */
  countsLoaded: boolean;
  /** `seo.list_page_intents` has been read into the workspace. */
  intentsLoaded: boolean;
  /**
   * The intents read is a first page of a larger set — the rollups are over
   * part of the map's pages. Said in the header, never hidden.
   */
  intentsPartial: { loaded: number; total: number } | null;
  intentColors: MapIntentColors;
  /** Every status the loaded tree carries, with how many topics hold it. */
  statusOptions: { value: string; label: string }[];
  /** Every `key:value` facet pair the loaded tree carries. */
  facetOptions: { value: string; label: string }[];
  readOnly: boolean;
  onToggleExpand: (slug: string) => void;
}

const INDENT_PX = 16;

/** An absent number renders an empty, titled span; a real number renders itself. */
function CountCell({
  value,
  loaded,
  absentTitle,
}: {
  value: number | undefined;
  loaded: boolean;
  absentTitle: string;
}) {
  if (!loaded || value === undefined) {
    return <span className="inline-block" title={absentTitle} data-count-absent="true" />;
  }
  return (
    <span className={cn("tabular-nums", value === 0 && "text-muted-foreground/60")}>
      {value}
    </span>
  );
}

function TopicCell({ row, ctx }: { row: MapTableRow; ctx: MapTableColumnContext }) {
  const status = row.topic.status ?? "active";
  return (
    <div
      className="flex min-w-0 items-center gap-1.5"
      style={ctx.hierarchy ? { paddingLeft: row.depth * INDENT_PX } : undefined}
    >
      {ctx.hierarchy ? (
        row.hasChildren ? (
          <button
            type="button"
            aria-label={row.expanded ? `Collapse ${row.name}` : `Expand ${row.name}`}
            aria-expanded={row.expanded}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              ctx.onToggleExpand(row.slug);
            }}
          >
            {row.expanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        ) : (
          <span className="inline-block h-4 w-4 shrink-0" aria-hidden />
        )
      ) : null}
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn("truncate text-sm", row.selected && "font-semibold")}>
            {row.name}
          </span>
          <TopicStatusMark status={status} compact />
        </span>
        {!ctx.hierarchy && row.ancestors.length > 0 ? (
          <span
            className="truncate text-[11px] text-muted-foreground"
            title={row.ancestors.join(" › ")}
          >
            {row.ancestors.join(" › ")}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function IntentCountCell({
  row,
  tone,
  ctx,
}: {
  row: MapTableRow;
  tone: "leaving" | "arriving";
  ctx: MapTableColumnContext;
}) {
  if (!ctx.intentsLoaded || row.rollup === undefined) {
    return (
      <span
        className="inline-block"
        title="Page destinations are not loaded for this view"
        data-count-absent="true"
      />
    );
  }
  const value = row.rollup[tone];
  if (value === 0) {
    return (
      <span
        className="tabular-nums text-muted-foreground/60"
        title={tone === "leaving" ? "No pages leaving this topic" : "No pages arriving here"}
      >
        0
      </span>
    );
  }
  return <IntentDot tone={tone} colors={ctx.intentColors} label={String(value)} />;
}

function IntentHeader({ id, ctx }: { id: "leaving" | "arriving"; ctx: MapTableColumnContext }) {
  const label = TABLE_COLUMN_LABELS[id];
  if (!ctx.intentsPartial) return <>{label}</>;
  const { loaded, total } = ctx.intentsPartial;
  return (
    <span
      className="inline-flex items-center gap-1"
      title={`Counted over the first ${loaded.toLocaleString()} of ${total.toLocaleString()} listed pages — the rest are not in this view yet.`}
    >
      {label}
      <span className="rounded-sm border border-warning/40 bg-warning/10 px-1 text-[10px] font-medium leading-none text-warning">
        partial
      </span>
    </span>
  );
}

function facetPairs(row: MapTableRow): string[] {
  return Object.entries(row.topic.facets ?? {}).map(([key, value]) => `${key}:${value}`);
}

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Builds every column; the caller filters to the visible ordered set. */
export function buildMapTableColumns(
  ctx: MapTableColumnContext,
): Record<TableColumnId, MatrxColumnDef<MapTableRow>> {
  const editable = ctx.readOnly ? false : ("string" as const);
  return {
    topic: {
      id: "topic",
      header: TABLE_COLUMN_LABELS.topic,
      label: TABLE_COLUMN_LABELS.topic,
      accessorFn: (row) => row.name,
      filter: "text",
      editable,
      // The row body is the door to the panel; the pencil starts the rename.
      editTrigger: "pencil",
      hideable: false,
      minWidth: 200,
      cell: (row) => <TopicCell row={row} ctx={ctx} />,
    },
    pages: {
      id: "pages",
      header: TABLE_COLUMN_LABELS.pages,
      accessorFn: (row) => (ctx.countsLoaded ? row.topic.pages : undefined),
      filter: "number",
      align: "right",
      width: 80,
      defaultSortDirection: "desc",
      cell: (row) => (
        <CountCell
          value={row.topic.pages}
          loaded={ctx.countsLoaded}
          absentTitle="Counts are not loaded for this view"
        />
      ),
    },
    planned: {
      id: "planned",
      header: TABLE_COLUMN_LABELS.planned,
      accessorFn: (row) => (ctx.countsLoaded ? row.topic.planned : undefined),
      filter: "number",
      align: "right",
      width: 90,
      defaultSortDirection: "desc",
      cell: (row) => (
        <CountCell
          value={row.topic.planned}
          loaded={ctx.countsLoaded}
          absentTitle="Counts are not loaded for this view"
        />
      ),
    },
    keywords: {
      id: "keywords",
      header: TABLE_COLUMN_LABELS.keywords,
      accessorFn: (row) => (ctx.countsLoaded ? row.topic.keywords : undefined),
      filter: "number",
      align: "right",
      width: 100,
      defaultSortDirection: "desc",
      cell: (row) => (
        <CountCell
          value={row.topic.keywords}
          loaded={ctx.countsLoaded}
          absentTitle="Counts are not loaded for this view"
        />
      ),
    },
    status: {
      id: "status",
      header: TABLE_COLUMN_LABELS.status,
      accessorFn: (row) => row.topic.status ?? "active",
      filter: "select",
      filterOptions: ctx.statusOptions,
      width: 110,
      cell: (row) => {
        const status = row.topic.status ?? "active";
        return status === "active" ? (
          <span className="text-xs text-muted-foreground">Active</span>
        ) : (
          <TopicStatusMark status={status} />
        );
      },
    },
    facets: {
      id: "facets",
      header: TABLE_COLUMN_LABELS.facets,
      accessorFn: (row) => facetPairs(row).join(", "),
      // Arrays are treated as sets by the select filter, so one topic with
      // two facets matches either value.
      filterValue: (row) => facetPairs(row),
      filter: "select",
      filterOptions: ctx.facetOptions,
      minWidth: 140,
      cell: (row) => {
        const entries = Object.entries(row.topic.facets ?? {});
        if (entries.length === 0) return null;
        return (
          <span className="flex flex-wrap gap-1">
            {entries.map(([key, value]) => (
              <FacetChip key={key} facetKey={key} valueSlug={value} />
            ))}
          </span>
        );
      },
    },
    leaving: {
      id: "leaving",
      header: <IntentHeader id="leaving" ctx={ctx} />,
      label: TABLE_COLUMN_LABELS.leaving,
      accessorFn: (row) => row.rollup?.leaving,
      filter: "number",
      align: "right",
      width: 90,
      defaultSortDirection: "desc",
      cell: (row) => <IntentCountCell row={row} tone="leaving" ctx={ctx} />,
    },
    arriving: {
      id: "arriving",
      header: <IntentHeader id="arriving" ctx={ctx} />,
      label: TABLE_COLUMN_LABELS.arriving,
      accessorFn: (row) => row.rollup?.arriving,
      filter: "number",
      align: "right",
      width: 90,
      defaultSortDirection: "desc",
      cell: (row) => <IntentCountCell row={row} tone="arriving" ctx={ctx} />,
    },
    updated: {
      id: "updated",
      header: TABLE_COLUMN_LABELS.updated,
      accessorFn: (row) => row.updatedAt,
      filter: "text",
      width: 120,
      defaultSortDirection: "desc",
      cell: (row) =>
        row.updatedAt === undefined ? (
          <span
            className="inline-block"
            title="The topic rows are not loaded for this view"
            data-count-absent="true"
          />
        ) : (
          <span className="text-xs text-muted-foreground" title={row.updatedAt}>
            {formatUpdated(row.updatedAt)}
          </span>
        ),
    },
    description: {
      id: "description",
      header: TABLE_COLUMN_LABELS.description,
      accessorFn: (row) => row.topic.description ?? "",
      filter: "text",
      editable,
      editTrigger: "pencil",
      minWidth: 220,
      cell: (row) =>
        row.topic.description ? (
          <span
            className="line-clamp-1 text-xs text-muted-foreground"
            title={row.topic.description}
          >
            {row.topic.description}
          </span>
        ) : null,
    },
  };
}
