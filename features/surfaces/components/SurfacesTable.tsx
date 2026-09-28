"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  MoreVertical,
} from "lucide-react";
import type { ComponentType } from "react";
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
import { getManifest } from "@/features/surfaces/manifests/registry";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";
import {
  checkAgeLabel,
  checkSortWeight,
  surfaceCheckState,
} from "@/features/surfaces/utils/surface-check-ledger";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  SurfacesFilterBar,
  type SurfacesFilterState,
} from "@/features/surfaces/components/SurfacesFilterBar";
import type { ReadOutcome } from "@/components/read-state/ReadGate";

const READINESS_SORT_WEIGHT: Record<string, number> = {
  verified: 0,
  partial: 1,
  stub: 2,
  unregistered: 3,
};

export interface RegistryAction {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge: number;
  disabled?: boolean;
  onClick: () => void;
}

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
  /** Peek side panel is open (desktop): keep only the columns that fit whole. */
  peeking?: boolean;
  /** Phone: the registry total shown on the toolbar row. */
  totalCount?: number;
  /** Phone: the registry actions, listed in the toolbar's one "…" menu. */
  registryActions?: RegistryAction[];
  /** The surfaces read these rows answer (the container owns it). */
  read?: ReadOutcome | undefined;
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
        "text-xs capitalize",
        state === "never" && "bg-muted text-muted-foreground border-border",
        state === "stale" && "border-warning/40 text-warning",
        state === "fresh" && "border-success/40 text-success",
      )}
    >
      {checkAgeLabel(row)}
    </Badge>
  );
}

/** The ONE empty marker in this table. */
const EMPTY = <span className="text-muted-foreground">—</span>;

/** A surface's human name: its registry label, or the label its key implies. */
export function surfaceRowTitle(row: SurfaceWithStats): string {
  return row.label?.trim() || getSurfaceDisplayLabel(row.name);
}

/**
 * Values declared in code (the manifest, with what it inherits) vs rows the
 * database mirror holds. `null` = no code manifest declares this surface.
 */
function declaredValueCount(name: string): number | null {
  const manifest = getManifest(name);
  return manifest ? manifest.values.length : null;
}

function ValuesCell({ row }: { row: SurfaceWithStats }) {
  const declared = declaredValueCount(row.name);
  if (declared === null) {
    return row.surfaceValueCount > 0 ? (
      <span
        className="tabular-nums text-muted-foreground"
        title={`No code manifest declares this surface; ${row.surfaceValueCount} values are saved in the database`}
      >
        {row.surfaceValueCount} in DB
      </span>
    ) : (
      EMPTY
    );
  }
  const inSync = declared === row.surfaceValueCount;
  return (
    <span
      className="whitespace-nowrap tabular-nums"
      title={`Declared in code: ${declared} · Saved in the database: ${row.surfaceValueCount}${inSync ? "" : " — Sync manifests brings the database up to date"}`}
    >
      {declared}
      {!inSync && (
        <span className="ml-1 text-xs text-warning">
          · {row.surfaceValueCount} in DB
        </span>
      )}
    </span>
  );
}

function NameCell({
  row,
  navigating,
}: {
  row: SurfaceWithStats;
  navigating: boolean;
}) {
  // Lines are <div>s so the right-click heading reads the title line alone.
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground" title={surfaceRowTitle(row)}>
          {surfaceRowTitle(row)}
        </div>
        <div
          className="truncate font-mono text-xs text-muted-foreground"
          title={row.name}
        >
          {row.name}
        </div>
      </div>
      {row.overlay_id && (
        <Badge
          variant="outline"
          className="shrink-0 gap-1 text-xs"
          title={`Window or dialog: ${row.overlay_id}`}
        >
          <AppWindow className="h-3 w-3" /> Window
        </Badge>
      )}
      {navigating && (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Opening…
        </span>
      )}
    </div>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  // Nearly every surface is active, so "Active" is quiet text; only the
  // exception (Inactive) is marked.
  return active ? (
    <span className="text-muted-foreground">Active</span>
  ) : (
    <Badge variant="outline" className="text-xs text-muted-foreground">
      Inactive
    </Badge>
  );
}

// Columns in triage order: what needs work (readiness, bindings, values,
// check age, active) first; where it lives (client, parent, tier) after.
// Executor is folded into Client (it only differs on a few rows) and starts
// hidden as its own column.
/**
 * While Peek is open the table gets what is left of the width, so it keeps
 * only the triage columns that fit whole beside the pinned Actions column
 * (a column half under Actions read as "4 in DI"). `wide` = the viewport
 * has room for Tools and Values too.
 */
const PEEK_COLUMNS = {
  // Measured live on manage.aimatrx.com (header sort/filter icons make each
  // column wider than its declared width): at 1280 Checked was cut, at 1024
  // Tools was. The Peek's own tabs carry Values/Agents/Tools counts.
  wide: new Set(["name", "readiness", "agentCount", "toolCount", "surfaceValueCount"]),
  narrow: new Set(["name", "readiness", "agentCount"]),
};

function surfaceColumns(
  navigatingName: string | null,
  peek: "off" | "wide" | "narrow" = "off",
): MatrxColumnDef<SurfaceWithStats>[] {
  const all = allSurfaceColumns(navigatingName, peek !== "off");
  if (peek === "off") return all;
  const keep = PEEK_COLUMNS[peek];
  return all.filter((c) => keep.has(c.id ?? String(c.accessorKey)));
}

function allSurfaceColumns(
  navigatingName: string | null,
  peeking: boolean,
): MatrxColumnDef<SurfaceWithStats>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      width: peeking ? 200 : 260,
      filterValue: (row) => `${surfaceRowTitle(row)} ${row.name}`,
      sortValue: (row) => surfaceRowTitle(row).toLowerCase(),
      cell: (row) => (
        <NameCell row={row} navigating={row.name === navigatingName} />
      ),
    },
    {
      id: "readiness",
      header: "Readiness",
      accessorFn: (row) => readinessBucketOf(row),
      sortValue: (row) => READINESS_SORT_WEIGHT[readinessBucketOf(row)],
      width: 112,
      cell: (row) => <SurfaceReadinessBadge row={row} />,
    },
    {
      id: "agentCount",
      header: "Agents",
      accessorFn: (row) => row.agentCount,
      align: "right",
      width: 72,
      cell: (row) => (row.agentCount > 0 ? row.agentCount : EMPTY),
    },
    {
      id: "toolCount",
      header: "Tools",
      accessorFn: (row) => row.toolCount,
      align: "right",
      width: 68,
      cell: (row) => (row.toolCount > 0 ? row.toolCount : EMPTY),
    },
    {
      id: "surfaceValueCount",
      header: "Values",
      accessorFn: (row) => declaredValueCount(row.name) ?? row.surfaceValueCount,
      align: "right",
      width: 120,
      cell: (row) => <ValuesCell row={row} />,
    },
    {
      id: "lastChecked",
      header: "Checked",
      accessorFn: checkAgeLabel,
      sortValue: (row) =>
        `${String(checkSortWeight(row)).padStart(4, "0")}:${row.name}`,
      defaultSortDirection: "desc",
      width: 92,
      cell: checkedBadge,
    },
    {
      accessorKey: "is_active",
      header: "Active",
      filter: "boolean",
      width: 84,
      cell: (row) => <ActiveBadge active={row.is_active !== false} />,
    },
    {
      accessorKey: "client_name",
      header: "Client",
      width: 150,
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate text-muted-foreground">{row.client_name}</div>
          {row.executor_name && row.executor_name !== row.client_name && (
            <div
              className="truncate text-xs text-muted-foreground"
              title="Executor — the client whose tools run for this surface"
            >
              runs in {row.executor_name}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "parent_surface_name",
      header: "Parent",
      width: 160,
      // Off by default (column picker): at 1280 the triage columns come first.
      hidden: true,
      filterValue: (row) =>
        row.parent_surface_name
          ? `${getSurfaceDisplayLabel(row.parent_surface_name)} ${row.parent_surface_name}`
          : "",
      cell: (row) =>
        row.parent_surface_name ? (
          <span
            className="block truncate text-muted-foreground"
            title={row.parent_surface_name}
          >
            {getSurfaceDisplayLabel(row.parent_surface_name)}
          </span>
        ) : (
          EMPTY
        ),
    },
    {
      accessorKey: "sort_order",
      header: "Tier",
      width: 120,
      hidden: true,
      filterValue: (row) => tierFor(row.sort_order).label,
      cell: (row) => {
        const tier = tierFor(row.sort_order);
        return (
          <Badge
            variant="outline"
            className="whitespace-nowrap text-xs"
            title={`${tier.description} · position ${row.sort_order}`}
          >
            {tier.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "executor_name",
      header: "Executor",
      width: 150,
      hidden: true,
      cell: (row) =>
        row.executor_name ? (
          <span className="text-muted-foreground">{row.executor_name}</span>
        ) : (
          EMPTY
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
  read,
  peeking = false,
  totalCount,
  registryActions = [],
}: Props) {
  const isMobile = useIsMobile();
  const roomForValues = useMediaQuery("(min-width: 1200px)");
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
      columns={surfaceColumns(
        navigatingName,
        !peeking || isMobile ? "off" : roomForValues ? "wide" : "narrow",
      )}
      tableId="administration/ui/surfaces"
      // One view control: the saved-views menu. The working-view tab strip
      // repeated its name ("Default view" twice).
      viewTabs={false}
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
      read={read}
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
        ...(isMobile
          ? {
              // Phone: ONE row — count, saved view, Filters, one "…" holding
              // the table's tools and the registry actions; search below.
              ...(totalCount !== undefined
                ? { titleCount: { value: totalCount, label: "surfaces" } }
                : {}),
              columns: false,
              overflow: {
                mode: "menu" as const,
                pinned: (
                  <SurfacesFilterBar
                    state={filters}
                    onChange={onFilterChange}
                    clientNames={clientNames}
                    parentNames={parentNames}
                    compact
                    onClear={onClearFilters}
                  />
                ),
                sheetExtras: registryActions.map((a) => (
                  <Button
                    key={a.key}
                    variant="ghost"
                    size="sm"
                    disabled={a.disabled}
                    onClick={a.onClick}
                    className="h-9 w-full justify-start gap-2 px-2 font-normal"
                  >
                    <a.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{a.label}</span>
                    {a.badge > 0 && (
                      <span className="pl-3 tabular-nums text-muted-foreground">
                        {a.badge}
                      </span>
                    )}
                  </Button>
                )),
              },
            }
          : {
              leading: (
                <SurfacesFilterBar
                  state={filters}
                  onChange={onFilterChange}
                  clientNames={clientNames}
                  parentNames={parentNames}
                  onClear={onClearFilters}
                />
              ),
            }),
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
                // The menu's heading already names the row; the section is
                // just "Surface" so the row is named once.
                label: "Surface",
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
                          "Set by its code manifest — change it there; Sync manifests would undo a change made here.",
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
              content: surfaceRowTitle(row),
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
            ariaLabel={`Peek ${surfaceRowTitle(row)}`}
            tooltip="Peek"
          />
          <PencilTapButton
            variant="transparent"
            disabled={row.name === navigatingName}
            onClick={() => onEdit(row)}
            ariaLabel={`Open editor for ${surfaceRowTitle(row)}`}
            tooltip="Open editor"
          />
          <TrashTapButton
            variant="transparent"
            onClick={() => onDelete(row)}
            ariaLabel={`Delete ${surfaceRowTitle(row)}`}
            tooltip="Delete"
          />
        </>
      )}
      mobileCards={(row) => (
        <article
          className={cn(
            "space-y-1 rounded-md border p-2.5",
            row.name === selectedName
              ? "border-primary/40 bg-primary/5"
              : "border-border",
            row.is_active === false && "opacity-70",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => onSelect(row)}
            >
              <NameCell row={row} navigating={row.name === navigatingName} />
            </button>
            <SurfaceReadinessBadge row={row} className="mt-0.5 shrink-0" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-1 h-8 w-8 shrink-0"
                  aria-label={`Actions for ${surfaceRowTitle(row)}`}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="gap-2" onSelect={() => onPeek(row)}>
                  <Eye className="h-4 w-4" /> Peek
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onSelect={() => onEdit(row)}>
                  <Pencil className="h-4 w-4" /> Open editor
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-destructive"
                  onSelect={() => onDelete(row)}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{row.client_name}</span>
            <span>{tierFor(row.sort_order).label}</span>
            <span>
              Agents <span className="tabular-nums text-foreground">{row.agentCount}</span>
            </span>
            <span>
              Tools <span className="tabular-nums text-foreground">{row.toolCount}</span>
            </span>
            <span>
              Values <ValuesCell row={row} />
            </span>
            <span>Checked {checkedBadge(row)}</span>
            {row.is_active === false && <ActiveBadge active={false} />}
          </div>
        </article>
      )}
      emptyState={{ title: "No surfaces match these filters" }}
    />
  );
}
