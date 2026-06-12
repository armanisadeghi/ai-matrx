"use client";

import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  Eye,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  tierFor,
  type SurfaceWithStats,
} from "@/features/surfaces/services/surfaces.service";

type SortKey =
  | "name"
  | "client_name"
  | "executor_name"
  | "parent_surface_name"
  | "sort_order"
  | "surfaceValueCount"
  | "agentCount"
  | "toolCount"
  | "is_active";
type SortDir = "asc" | "desc";

interface Props {
  rows: SurfaceWithStats[];
  isLoading: boolean;
  selectedName: string | null;
  /** Surface names that have a code-side manifest registered. */
  manifestedSurfaceNames: Set<string>;
  /** Row / pencil click — navigates to the full-screen editor. */
  onSelect: (row: SurfaceWithStats) => void;
  onEdit: (row: SurfaceWithStats) => void;
  /** Eye click — opens the lightweight side panel without leaving the list. */
  onPeek: (row: SurfaceWithStats) => void;
  onDelete: (row: SurfaceWithStats) => void;
  /** Name of the row currently navigating (shows a loader, guards re-clicks). */
  navigatingName: string | null;
}

const cellClass = "px-2 py-1.5 text-xs align-middle";
const headerClass =
  "px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground bg-muted/40 select-none";

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right" | "center";
}) {
  const justify =
    align === "right"
      ? "justify-end"
      : align === "center"
        ? "justify-center"
        : "justify-start";
  return (
    <button
      onClick={onClick}
      className={`${headerClass} flex w-full items-center gap-1 ${justify} hover:text-foreground`}
    >
      <span>{label}</span>
      {active ? (
        dir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-30" />
      )}
    </button>
  );
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
  const [sortKey, setSortKey] = useState<SortKey>("sort_order");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey];
      const bv = (b as unknown as Record<string, unknown>)[sortKey];
      const sign = sortDir === "asc" ? 1 : -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * sign;
      }
      const as = String(av ?? "");
      const bs = String(bv ?? "");
      return as.localeCompare(bs) * sign;
    });
    return out;
  }, [rows, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "client_name" ? "asc" : "desc");
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              <th className={headerClass}>
                <SortHeader
                  label="Name"
                  active={sortKey === "name"}
                  dir={sortDir}
                  onClick={() => handleSort("name")}
                />
              </th>
              <th className={headerClass}>
                <SortHeader
                  label="Client"
                  active={sortKey === "client_name"}
                  dir={sortDir}
                  onClick={() => handleSort("client_name")}
                />
              </th>
              <th className={headerClass}>
                <SortHeader
                  label="Executor"
                  active={sortKey === "executor_name"}
                  dir={sortDir}
                  onClick={() => handleSort("executor_name")}
                />
              </th>
              <th className={headerClass}>
                <SortHeader
                  label="Parent"
                  active={sortKey === "parent_surface_name"}
                  dir={sortDir}
                  onClick={() => handleSort("parent_surface_name")}
                />
              </th>
              <th className={headerClass}>
                <SortHeader
                  label="Tier"
                  active={sortKey === "sort_order"}
                  dir={sortDir}
                  onClick={() => handleSort("sort_order")}
                />
              </th>
              <th className={headerClass}>
                <SortHeader
                  label="Values"
                  active={sortKey === "surfaceValueCount"}
                  dir={sortDir}
                  onClick={() => handleSort("surfaceValueCount")}
                  align="right"
                />
              </th>
              <th className={headerClass}>
                <SortHeader
                  label="Agents"
                  active={sortKey === "agentCount"}
                  dir={sortDir}
                  onClick={() => handleSort("agentCount")}
                  align="right"
                />
              </th>
              <th className={headerClass}>
                <SortHeader
                  label="Tools"
                  active={sortKey === "toolCount"}
                  dir={sortDir}
                  onClick={() => handleSort("toolCount")}
                  align="right"
                />
              </th>
              <th className={headerClass}>
                <SortHeader
                  label="Active"
                  active={sortKey === "is_active"}
                  dir={sortDir}
                  onClick={() => handleSort("is_active")}
                  align="center"
                />
              </th>
              <th className={`${headerClass} w-[140px] text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && sorted.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Loading surfaces…
                </td>
              </tr>
            )}
            {!isLoading && sorted.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No surfaces match these filters.
                </td>
              </tr>
            )}
            {sorted.map((row) => {
              const tier = tierFor(row.sort_order);
              const isSelected = row.name === selectedName;
              const hasManifest = manifestedSurfaceNames.has(row.name);
              const isNavigating = row.name === navigatingName;
              return (
                <tr
                  key={row.name}
                  onClick={() => {
                    if (navigatingName) return;
                    onSelect(row);
                  }}
                  className={`border-b border-border group cursor-pointer hover:bg-accent/40 ${
                    isSelected ? "bg-primary/10" : ""
                  } ${row.is_active ? "" : "opacity-60"} ${
                    isNavigating ? "opacity-60" : ""
                  }`}
                >
                  <td className={cellClass}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-foreground truncate max-w-[260px]">
                        {row.name}
                      </span>
                      {isNavigating && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void navigator.clipboard.writeText(row.name).then(
                                () => toast.success("Surface name copied"),
                                () => toast.error("Copy failed"),
                              );
                            }}
                            className="opacity-0 group-hover:opacity-100 hover:text-foreground text-muted-foreground transition-opacity"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Copy surface name</TooltipContent>
                      </Tooltip>
                    </div>
                  </td>
                  <td className={cellClass}>
                    <span className="font-mono text-muted-foreground">
                      {row.client_name}
                    </span>
                  </td>
                  <td className={cellClass}>
                    {row.executor_name ? (
                      <span className="font-mono text-muted-foreground text-[10px]">
                        {row.executor_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={cellClass}>
                    {row.parent_surface_name ? (
                      <span className="font-mono text-muted-foreground text-[10px]">
                        {row.parent_surface_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={cellClass}>
                    <Badge variant="outline" className="text-[10px]">
                      {tier.label}
                    </Badge>
                    <span className="ml-1 tabular-nums text-[10px] text-muted-foreground">
                      {row.sort_order}
                    </span>
                  </td>
                  <td className={`${cellClass} text-right`}>
                    {hasManifest ? (
                      <Badge
                        variant={
                          row.surfaceValueCount > 0 ? "default" : "outline"
                        }
                        className="text-[10px] tabular-nums"
                      >
                        {row.surfaceValueCount}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={`${cellClass} text-right tabular-nums`}>
                    {row.agentCount > 0 ? row.agentCount : "—"}
                  </td>
                  <td className={`${cellClass} text-right tabular-nums`}>
                    {row.toolCount > 0 ? row.toolCount : "—"}
                  </td>
                  <td className={`${cellClass} text-center`}>
                    {row.is_active ? (
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
                    )}
                  </td>
                  <td className={`${cellClass} text-right`}>
                    <div className="inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            disabled={!!navigatingName}
                            onClick={(e) => {
                              e.stopPropagation();
                              onPeek(row);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Peek (side panel)</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            disabled={!!navigatingName}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(row);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open editor</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(row);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
