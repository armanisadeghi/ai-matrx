"use client";

import { Badge } from "@/components/ui/badge";
import {
  PencilTapButton,
  TrashTapButton,
  ViewTapButton,
} from "@ai-matrx/tap-target/buttons";
import {
  AppWindow,
  Eye,
  Loader2,
  Pencil,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import {
  buildDefaultTableRowMenuDescriptor,
  createTableRowMenuDescriptor,
} from "@/features/context-menu-v3/table-row-context-registry";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
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
import {
  SurfacesFilterBar,
  type SurfacesFilterState,
} from "@/features/surfaces/components/SurfacesFilterBar";

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
  /** Activate / deactivate one surface (row right-click). */
  onToggleActive: (row: SurfaceWithStats) => void;
  navigatingName: string | null;
  filters: SurfacesFilterState;
  onFilterChange: (patch: Partial<SurfacesFilterState>) => void;
  onClearFilters: () => void;
  clientNames: string[];
  parentNames: string[];
  onRefresh: () => void | Promise<void>;
  onAdd: () => void | Promise<void>;
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
        "text-xs",
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
              <span className="block truncate font-mono text-xs text-muted-foreground">
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
              className="shrink-0 gap-1 text-xs"
              title={row.overlay_id}
            >
              <AppWindow className="h-3 w-3" /> overlay
            </Badge>
          )}
          {row.name === navigatingName && (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
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
          <span className="font-mono text-xs text-muted-foreground">
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
          <span className="font-mono text-xs text-muted-foreground">
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
            <Badge variant="outline" className="text-xs">
              {tier.label}
            </Badge>
            <span className="ml-1 text-xs tabular-nums text-muted-foreground">
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
            className="text-xs tabular-nums"
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
            className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
          >
            active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs">
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
  onToggleActive,
  navigatingName,
  filters,
  onFilterChange,
  onClearFilters,
  clientNames,
  parentNames,
  onRefresh,
  onAdd,
}: Props) {
  const hasSpecializedFilters =
    filters.client !== "__all__" ||
    filters.status !== "all" ||
    filters.manifest !== "all" ||
    filters.parent !== "__all__" ||
    filters.readiness !== "all" ||
    filters.checked !== "all";

  return (
    <MatrxDataTable<SurfaceWithStats>
      data={rows}
      columns={surfaceColumns(manifestedSurfaceNames, navigatingName)}
      tableId="administration/ui/surfaces"
      getRowId={(row) => row.name}
      searchText={(row) =>
        [
          row.name,
          row.label,
          row.description,
          row.client_name,
          row.executor_name,
          row.parent_surface_name,
        ]
          .filter(Boolean)
          .join(" ")
      }
      isLoading={isLoading}
      defaultSort={{ id: "sort_order", direction: "asc" }}
      selectedId={selectedName}
      onRowOpen={onSelect}
      detail={{ enabled: false }}
      rowClassName={(row) =>
        cn(
          row.is_active ? undefined : "opacity-60",
          row.name === navigatingName && "opacity-60",
        )
      }
      toolbar={{
        search: true,
        searchPlaceholder: "Search surfaces…",
        facets: [
          {
            type: "custom",
            id: "surface-source-filters",
            filter: {
              active: hasSpecializedFilters,
              onReset: onClearFilters,
            },
            render: () => null,
          },
        ],
        leading: (
          <SurfacesFilterBar
            state={filters}
            onChange={onFilterChange}
            clientNames={clientNames}
            parentNames={parentNames}
          />
        ),
        refresh: { onRefresh },
        add: { onAdd },
      }}
      // One right-click menu per row: the row's own actions first (primary),
      // then the table's universal rows; the page's provider + menu wrapper
      // around the whole page supply the surface and the Agents entries.
      contextMenu={{
        resolveRowContext: (row, controls) => {
          const descriptor = buildDefaultTableRowMenuDescriptor(
            { id: row.name },
            controls,
          );
          const manifested = manifestedSurfaceNames.has(row.name);
          const active = row.is_active !== false;
          return createTableRowMenuDescriptor({
            ...descriptor,
            extraSections: [
              {
                id: "surface-row",
                label: row.label ?? row.name,
                primary: true,
                anchor: "after-clipboard",
                items: [
                  { kind: "item", id: "open", label: "Open editor", icon: Pencil, onSelect: () => onEdit(row) },
                  { kind: "item", id: "peek", label: "Peek", icon: Eye, onSelect: () => onPeek(row) },
                  manifested
                    ? {
                        kind: "item",
                        id: "toggle-active",
                        label: active ? "Deactivate" : "Activate",
                        icon: active ? PowerOff : Power,
                        disabled: true,
                        description:
                          "Its code manifest sets this — Sync manifests would undo it. Change the manifest in code.",
                        onSelect: () => undefined,
                      }
                    : {
                        kind: "item",
                        id: "toggle-active",
                        label: active ? "Deactivate" : "Activate",
                        icon: active ? PowerOff : Power,
                        onSelect: () => onToggleActive(row),
                      },
                  { kind: "item", id: "delete", label: "Delete", icon: Trash2, destructive: true, onSelect: () => onDelete(row) },
                ],
              },
              ...descriptor.extraSections,
            ],
            context: {
              content: [row.label, row.name, row.description].filter(Boolean).join(" — "),
              context: { name: row.name },
              [CONTEXT_MENU_ENTITY_KEY]: null,
            },
          });
        },
      }}
      rowActions={(row) => (
        <>
          <ViewTapButton
            variant="transparent"
            onClick={() => onPeek(row)}
            ariaLabel={`Peek ${row.name}`}
            tooltip="Peek (side panel)"
          />
          <PencilTapButton
            variant="transparent"
            disabled={row.name === navigatingName}
            onClick={() => onEdit(row)}
            ariaLabel={`Open editor for ${row.name}`}
            tooltip="Open editor"
          />
          <TrashTapButton
            variant="transparent"
            onClick={() => onDelete(row)}
            ariaLabel={`Delete ${row.name}`}
          />
        </>
      )}
      emptyState={{ title: "No surfaces match these filters" }}
    />
  );
}
