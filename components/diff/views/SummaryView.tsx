"use client";

import { cn } from "@/lib/utils";
import type { DiffNode, DiffResult } from "../engine/types";
import type { AdapterRegistry, EnrichmentContext } from "../adapters/types";
import { DefaultFieldAdapter } from "../adapters/defaults";

const changeColors: Record<DiffNode["changeType"], string> = {
  added: "text-green-600 dark:text-green-400",
  removed: "text-red-600 dark:text-red-400",
  modified: "text-amber-600 dark:text-amber-400",
  reordered: "text-blue-600 dark:text-blue-400",
  unchanged: "text-muted-foreground",
};

const changeBg: Record<DiffNode["changeType"], string> = {
  added: "bg-green-500/10",
  removed: "bg-red-500/10",
  modified: "bg-amber-500/10",
  reordered: "bg-blue-500/10",
  unchanged: "bg-transparent",
};

const changeLabels: Record<DiffNode["changeType"], string> = {
  added: "Added",
  removed: "Removed",
  modified: "Modified",
  reordered: "Reordered",
  unchanged: "Unchanged",
};

interface SummaryViewProps {
  diffResult: DiffResult;
  adapters: AdapterRegistry;
  enrichment?: EnrichmentContext;
}

export function SummaryView({
  diffResult,
  adapters,
  enrichment,
}: SummaryViewProps) {
  const changedNodes = diffResult.root.filter(
    (n) => n.changeType !== "unchanged",
  );

  if (changedNodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No changes detected
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 py-2 border-b border-border text-xs text-muted-foreground">
        {changedNodes.length} field{changedNodes.length !== 1 ? "s" : ""}{" "}
        changed
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-left px-4 py-2 font-medium w-[180px]">Field</th>
            <th className="text-left px-4 py-2 font-medium w-[90px]">Status</th>
            <th className="text-left px-4 py-2 font-medium">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {changedNodes.map((node) => {
            const adapter = adapters.get(node.key) ?? DefaultFieldAdapter;
            const Icon = adapter.icon;
            const summaryText = adapter.toSummaryText
              ? adapter.toSummaryText(node, enrichment)
              : changeLabels[node.changeType];

            return (
              <tr
                key={node.key}
                className={cn(
                  "hover:bg-muted/20 transition-colors",
                  changeBg[node.changeType],
                )}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    {Icon && (
                      <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="font-medium">
                      {adapter.label || node.key}
                    </span>
                  </div>
                </td>
                <td
                  className={cn(
                    "px-4 py-2 font-medium",
                    changeColors[node.changeType],
                  )}
                >
                  {changeLabels[node.changeType]}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {summaryText}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
