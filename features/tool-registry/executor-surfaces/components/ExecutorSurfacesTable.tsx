"use client";

import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Network, Server } from "lucide-react";
import type { ExecutorWithStats } from "@/features/tool-registry/executor-surfaces/services/executor-surfaces.service";

interface Props {
  rows: ExecutorWithStats[];
  isLoading: boolean;
  selectedName: string | null;
  onSelect: (row: ExecutorWithStats) => void;
}

function groupKey(row: ExecutorWithStats): "mcp" | "other" {
  if (row.isMcp || row.name.startsWith("mcp.")) return "mcp";
  return "other";
}

const GROUP_LABELS: Record<string, string> = {
  mcp: "MCP-backed executors",
  other: "Executors",
};

const GROUP_ORDER: Array<"other" | "mcp"> = ["other", "mcp"];

function GroupIcon({ kind }: { kind: ReturnType<typeof groupKey> }) {
  if (kind === "mcp") return <Network className="h-3 w-3" />;
  return <Server className="h-3 w-3" />;
}

export function ExecutorSurfacesTable({
  rows,
  isLoading,
  selectedName,
  onSelect,
}: Props) {
  const grouped = useMemo(() => {
    const buckets = new Map<string, ExecutorWithStats[]>();
    for (const row of rows) {
      const key = groupKey(row);
      const arr = buckets.get(key) ?? [];
      arr.push(row);
      buckets.set(key, arr);
    }
    return buckets;
  }, [rows]);

  if (isLoading && rows.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-xs text-muted-foreground">
        Loading executors…
      </div>
    );
  }

  if (!isLoading && rows.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-xs text-muted-foreground">
        No executors match these filters.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
      {GROUP_ORDER.map((key) => {
        const groupRows = grouped.get(key);
        if (!groupRows || groupRows.length === 0) return null;
        return (
          <div key={key} className="border-b border-border">
            <div className="sticky top-0 z-10 bg-muted/60 backdrop-blur px-2 py-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <GroupIcon kind={key} />
              <span>{GROUP_LABELS[key]}</span>
              <span className="ml-auto tabular-nums">{groupRows.length}</span>
            </div>
            <div className="divide-y divide-border">
              {groupRows.map((row) => {
                const isSelected = row.name === selectedName;
                return (
                  <button
                    key={row.name}
                    type="button"
                    onClick={() => onSelect(row)}
                    className={`w-full min-w-0 text-left px-2 py-1.5 hover:bg-accent/40 transition-colors flex items-center gap-2 ${
                      isSelected ? "bg-primary/10" : ""
                    } ${row.is_active ? "" : "opacity-60"}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-foreground truncate">
                        {row.name}
                      </div>
                      {row.parent_executor_name && (
                        <div className="font-mono text-[10px] text-muted-foreground truncate">
                          parent: {row.parent_executor_name}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <Badge
                        variant="default"
                        className="text-[10px] tabular-nums h-4 px-1.5"
                        title="Active bindings"
                      >
                        {row.boundCount - row.inactiveBindingCount} active
                      </Badge>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {row.boundCount} bound
                      </span>
                    </div>
                    {!row.is_active && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        off
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
