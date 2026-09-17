"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppWindow, Eye, Loader2, Pencil, Trash2 } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import {
  tierFor,
  readinessBucketOf,
  type SurfaceWithStats,
} from "@/features/surfaces/services/surfaces.service";
import { SurfaceReadinessBadge } from "@/features/surfaces/components/SurfaceReadinessBadge";
import {
  checkAgeLabel,
  checkSortWeight,
  surfaceCheckState,
} from "@/features/surfaces/utils/surface-check-ledger";
import { cn } from "@/lib/utils";

const READINESS_SORT_WEIGHT: Record<string, number> = {
  verified: 0,
  partial: 1,
  stub: 2,
  unregistered: 3,
};

interface Props {
  rows: SurfaceWithStats[];
  isLoading: boolean;
  selectedName: string | null;
  manifestedSurfaceNames: Set<string>;
  onSelect: (row: SurfaceWithStats) => void;
  onEdit: (row: SurfaceWithStats) => void;
  onPeek: (row: SurfaceWithStats) => void;
  onDelete: (row: SurfaceWithStats) => void;
  navigatingName: string | null;
}

function checkedBadge(row: SurfaceWithStats) {
  const state = surfaceCheckState(row);
  const title = row.last_checked_at
    ? `Full UI surface check completed ${new Date(row.last_checked_at).toLocaleString()}${row.last_checked_by ? ` by ${row.last_checked_by}` : ""}`
    : "The full UI surface check has never completed on this surface";
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn(
        "text-[10px]",
        state === "never" && "bg-muted text-muted-foreground border-border",
        state === "stale" &&
          "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
        state === "fresh" &&
          "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
      )}
    >
      {checkAgeLabel(row)}
    </Badge>
  );
}

function surfaceColumns(
  manifestedSurfaceNames: Set<string>,
  navigatingName: string | null,
): MatrxColumnDef<SurfaceWithStats>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      width: 300,
      filterValue: (row) => `${row.label ?? ""} ${row.name}`,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-1.5">
          {row.label ? (
            <span className="min-w-0 max-w-[280px]">
              <span className="block truncate font-medium text-foreground">
                {row.label}
              </span>
              <span className="block truncate font-mono text-[10px] text-muted-foreground">
                {row.name}
              </span>
            </span>
          ) : (
            <span className="max-w-[260px] truncate font-mono text-foreground">
              {row.name}
            </span>
          )}
          {row.overlay_id && (
            <Badge
              variant="outline"
              className="shrink-0 gap-1 text-[10px]"
              title={row.overlay_id}
            >
              <AppWindow className="h-3 w-3" /> overlay
            </Badge>
          )}
          {row.name === navigatingName && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Opening…
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "client_name",
      header: "Client",
      width: 150,
      cell: (row) => (
        <span className="font-mono text-muted-foreground">
          {row.client_name}
        </span>
      ),
    },
    {
      accessorKey: "executor_name",
      header: "Executor",
      width: 180,
      cell: (row) =>
        row.executor_name ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {row.executor_name}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "parent_surface_name",
      header: "Parent",
      width: 180,
      cell: (row) =>
        row.parent_surface_name ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {row.parent_surface_name}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "sort_order",
      header: "Tier",
      width: 110,
      cell: (row) => {
        const tier = tierFor(row.sort_order);
        return (
          <>
            <Badge variant="outline" className="text-[10px]">
              {tier.label}
            </Badge>
            <span className="ml-1 text-[10px] tabular-nums text-muted-foreground">
              {row.sort_order}
            </span>
          </>
        );
      },
    },
    {
      id: "surfaceValueCount",
      header: "Values",
      accessorFn: (row) => row.surfaceValueCount,
      align: "right",
      width: 90,
      cell: (row) =>
        manifestedSurfaceNames.has(row.name) ? (
          <Badge
            variant={row.surfaceValueCount > 0 ? "default" : "outline"}
            className="text-[10px] tabular-nums"
          >
            {row.surfaceValueCount}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "agentCount",
      header: "Agents",
      accessorFn: (row) => row.agentCount,
      align: "right",
      width: 80,
      cell: (row) => (row.agentCount > 0 ? row.agentCount : "—"),
    },
    {
      id: "toolCount",
      header: "Tools",
      accessorFn: (row) => row.toolCount,
      align: "right",
      width: 80,
      cell: (row) => (row.toolCount > 0 ? row.toolCount : "—"),
    },
    {
      id: "readiness",
      header: "Readiness",
      accessorFn: (row) => readinessBucketOf(row),
      sortValue: (row) => READINESS_SORT_WEIGHT[readinessBucketOf(row)],
      width: 110,
      cell: (row) => <SurfaceReadinessBadge row={row} />,
    },
    {
      id: "lastChecked",
      header: "Checked",
      accessorFn: checkAgeLabel,
      sortValue: (row) =>
        `${String(checkSortWeight(row)).padStart(4, "0")}:${row.name}`,
      defaultSortDirection: "desc",
      width: 100,
      cell: checkedBadge,
    },
    {
      accessorKey: "is_active",
      header: "Active",
      filter: "boolean",
      width: 90,
      cell: (row) =>
        row.is_active ? (
          <Badge
            variant="outline"
            className="text-[10px] bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
          >
            active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            inactive
          </Badge>
        ),
    },
  ];
}

export function SurfacesTable({
  rows,
  isLoading,
  selectedName,
  manifestedSurfaceNames,
  onSelect,
  onEdit,
  onPeek,
  onDelete,
  navigatingName,
}: Props) {
  return (
    <MatrxDataTable<SurfaceWithStats>
      data={rows}
      columns={surfaceColumns(manifestedSurfaceNames, navigatingName)}
      getRowId={(row) => row.name}
      searchText={(row) => `${row.label ?? ""} ${row.name}`}
      isLoading={isLoading}
      defaultSort={{ id: "sort_order", direction: "asc" }}
      selectedId={selectedName}
      onRowOpen={onSelect}
      rowClassName={(row) =>
        cn(
          row.is_active ? undefined : "opacity-60",
          row.name === navigatingName && "opacity-60",
        )
      }
      toolbar={{
        search: true,
        searchPlaceholder: "Search surfaces by label or name…",
      }}
      rowActions={(row) => (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => onPeek(row)}
            aria-label={`Peek ${row.name}`}
            title="Peek (side panel)"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            disabled={row.name === navigatingName}
            onClick={() => onEdit(row)}
            aria-label={`Open editor for ${row.name}`}
            title="Open editor"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(row)}
            aria-label={`Delete ${row.name}`}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      emptyState={{ title: "No surfaces match these filters" }}
    />
  );
}
