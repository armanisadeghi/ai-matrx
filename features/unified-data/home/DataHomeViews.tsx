"use client";

// features/unified-data/home/DataHomeViews.tsx — LANE DATA-HOME-3A
//
// The Cards and Rows views of the data home (the shell's `views.cards` / `views.rows`). The same
// rows, the same door (`hrefFor`), the same star and the same row menu as the table — a layout,
// never a second idea of a row. A card: kind icon + name, `<Organization> · <Kind>`, Updated,
// Records, star. No description (law).

import Link from "next/link";
import { MoreVertical, Star } from "lucide-react";

import { ItemMenu } from "@/components/official/item/ItemMenu";
import { MatrxTableRowAlchemyProvider } from "@ai-matrx/design-system/data-table";
import type { MatrxDataTableRecordControls } from "@ai-matrx/design-system/data-table";
import type { ComponentProps } from "react";

/** The row copy the provider takes (its type is not a public export of the package). */
type RowCopy = ComponentProps<typeof MatrxTableRowAlchemyProvider>["copy"];
import { cn } from "@/lib/utils";
import { formatCount, formatRelativeTime } from "@ai-matrx/kit/format";
import type { EntityAltViewProps } from "@/lib/entity-list/config";
import { dataHomeKindWord, type DataHomeRow } from "./dataHomeRows";
import { FoundationBadge, KindIcon, useRecordCount } from "./dataHomeColumns";
import type { RecordCountStore } from "./dataHomeRecordCounts";

/** A card has no side panel, window or in-place edit: the row scope's controls do nothing. */
const NOTHING = () => {};
const NO_ROW_CONTROLS: MatrxDataTableRecordControls = {
  closeDetail: NOTHING,
  openDetail: NOTHING,
  openWindow: NOTHING,
  closeWindow: NOTHING,
  hasPendingEdits: false,
  discardPendingEdits: NOTHING,
};

export type DataHomeViewProps = EntityAltViewProps<DataHomeRow> & {
  isStarred: (row: DataHomeRow) => boolean;
  /** A row was opened by its link (Recent); the link itself navigates. */
  onOpened: (row: DataHomeRow) => void;
  /** The ONE lazy Records counter the table's cells read too (dataHomeRecordCounts.ts). */
  recordCounts?: RecordCountStore | undefined;
};

/** A card's Records: the same store as the table's Records cell; `—` until counted, never 0. */
function CardRecords({ row, store }: { row: DataHomeRow; store: RecordCountStore | undefined }) {
  const known = useRecordCount(row, store);
  return (
    <span data-data-home-card-records="">{known === undefined || known === null ? "—" : `${formatCount(known)} records`}</span>
  );
}

function StarButton({
  row,
  starred,
  onToggle,
}: {
  row: DataHomeRow;
  starred: boolean;
  onToggle?: ((row: DataHomeRow) => void) | undefined;
}) {
  if (!onToggle) return null;
  return (
    <button
      type="button"
      // The shell's own words for its star (EntityListTable's favorite cell).
      aria-label={starred ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={starred}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(row);
      }}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground/50 hover:text-amber-500 sm:h-7 sm:w-7"
    >
      <Star className={cn("h-3.5 w-3.5", starred && "fill-amber-400 text-amber-500")} />
    </button>
  );
}

/**
 * THE ROW'S ALCHEMY, ON EVERY LAYOUT (lane TABLE-ACTIONS wave 1 fix: the table row's ⋯ carried an
 * "Alchemy" entry the card and compact-row ⋯ did not). The table gets it from MatrxDataTable's
 * per-row `MatrxTableRowAlchemyProvider` (placement "menu"), which `ItemMenu` reads to inject the
 * entry; the cards and rows put the same provider around the same `ItemMenu`, so one thing has one
 * menu on every surface.
 */
export function dataHomeRowCopy(row: DataHomeRow): RowCopy {
  return {
    sourceId: `data-home:row:${row.id}`,
    label: dataHomeKindWord(row.kind),
    human: () => [row.name, subtitle(row)].filter(Boolean).join("\n"),
    json: () => row,
  };
}

export function RowMenu({ row, props }: { row: DataHomeRow; props: EntityAltViewProps<DataHomeRow> }) {
  return (
    <MatrxTableRowAlchemyProvider copy={dataHomeRowCopy(row)} placement="menu" controls={NO_ROW_CONTROLS}>
      <ItemMenu config={props.actions.menuFor(row)} align="end">
        <button
          type="button"
          aria-label={`Actions for ${row.name}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:h-7 sm:w-7"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </ItemMenu>
    </MatrxTableRowAlchemyProvider>
  );
}

function subtitle(row: DataHomeRow): string {
  return [row.organizationName, dataHomeKindWord(row.kind)].filter(Boolean).join(" · ");
}

export function DataHomeCards(props: DataHomeViewProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" data-data-home-cards="">
      {props.rows.map((row) => (
        <Link
          key={row.id}
          data-row-id={row.id}
          href={props.hrefFor(row) ?? row.href}
          onClick={() => props.onOpened(row)}
          className="group flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card p-3 hover:border-primary/40"
        >
          <div className="flex min-w-0 items-center gap-2">
            <KindIcon kind={row.kind} className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={row.name}>
              {row.name}
            </span>
            {row.foundation ? <FoundationBadge /> : null}
            <StarButton row={row} starred={props.isStarred(row)} onToggle={props.actions.onToggleFavorite} />
            <RowMenu row={row} props={props} />
          </div>
          <span className="truncate text-xs text-muted-foreground" title={subtitle(row)}>
            {subtitle(row)}
          </span>
          <span className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
            <span>{row.updatedAt ? formatRelativeTime(row.updatedAt) : "—"}</span>
            <span aria-hidden>·</span>
            <CardRecords row={row} store={props.recordCounts} />
          </span>
        </Link>
      ))}
    </div>
  );
}

export function DataHomeRows(props: DataHomeViewProps) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card" data-data-home-rows="">
      {props.rows.map((row) => (
        <li key={row.id} data-row-id={row.id} className="flex min-w-0 items-center gap-2 px-2 py-1">
          <StarButton row={row} starred={props.isStarred(row)} onToggle={props.actions.onToggleFavorite} />
          <Link
            href={props.hrefFor(row) ?? row.href}
            onClick={() => props.onOpened(row)}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <KindIcon kind={row.kind} />
            <span className="truncate text-sm" title={row.name}>
              {row.name}
            </span>
            {row.foundation ? <FoundationBadge /> : null}
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">{subtitle(row)}</span>
          </Link>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {row.updatedAt ? formatRelativeTime(row.updatedAt) : "—"}
          </span>
          <RowMenu row={row} props={props} />
        </li>
      ))}
    </ul>
  );
}
