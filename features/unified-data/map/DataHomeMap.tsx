"use client";

// features/unified-data/map/DataHomeMap.tsx — LANE TABLE-MAP
//
// THE MAP of a person's tables (Arman, 2026-10-09): cards for tables, lines for links, grouped by
// organization. Opened from the data home's header; follows the organization filter and "Show
// platform tables". A card opens its table.

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { RecordsDataSource } from "@ai-matrx/records";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import TableMapCanvas from "./TableMapCanvas";
import { useTableMap } from "./useTableMap";
import type { MapCard } from "./tableMapModel";

export interface DataHomeMapProps {
  dataSource: RecordsDataSource;
  organizationFilter: string | null;
  showPlatformTables: boolean;
  onOpened?: (card: MapCard) => void;
}

export function DataHomeMap({ dataSource, organizationFilter, showPlatformTables, onOpened }: DataHomeMapProps) {
  const router = useRouter();
  const { state, countOf, countsVersion } = useTableMap({ dataSource, organizationFilter, showPlatformTables });
  const open = useCallback(
    (card: MapCard) => {
      onOpened?.(card);
      router.push(card.href);
    },
    [router, onOpened],
  );
  // The canvas repaints when a count lands; the function identity carries the version.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const counter = useMemo(() => (id: string) => countOf(id), [countsVersion, state]);

  return (
    <div className="flex h-full min-h-0 flex-col" data-table-map="">
      {state.status === "failed" ? (
        <div role="status" className="flex items-center gap-1 p-4 text-sm text-amber-700 dark:text-amber-400">
          The map could not be drawn. {state.message}
          <ErrorAlchemyMenu error={state.message} />
        </div>
      ) : null}
      {state.status === "ready" && state.troubles.length > 0 ? (
        <div role="status" className="flex flex-col gap-1 px-4 pt-2 text-xs text-amber-700 dark:text-amber-400">
          {state.troubles.map((t) => (
            <span key={t} className="flex items-center gap-1">
              Some links could not be read. {t}
              <ErrorAlchemyMenu error={t} />
            </span>
          ))}
        </div>
      ) : null}
      {state.status === "ready" && state.map.groups.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground" data-table-map-empty="">
          No tables to map here.
        </p>
      ) : null}
      {/* The area is always the page's full height, so the loaded map never moves what is around it. */}
      <div className="min-h-0 flex-1">
        {state.status === "ready" && state.map.groups.length > 0 ? (
          <TableMapCanvas map={state.map} countOf={counter} onOpen={open} />
        ) : null}
        {state.status === "loading" ? (
          <p className="p-4 text-sm text-muted-foreground" data-table-map-loading="">
            Drawing your tables…
          </p>
        ) : null}
      </div>
    </div>
  );
}
