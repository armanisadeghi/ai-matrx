"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import type { DiffResult } from "../engine/types";
import type { AdapterRegistry, EnrichmentContext } from "../adapters/types";
import { DefaultFieldAdapter } from "../adapters/defaults";

interface ChangesOnlyViewProps {
  diffResult: DiffResult;
  adapters: AdapterRegistry;
  enrichment?: EnrichmentContext;
  oldLabel: string;
  newLabel: string;
}

export function ChangesOnlyView({
  diffResult,
  adapters,
  enrichment,
  oldLabel,
  newLabel,
}: ChangesOnlyViewProps) {
  const changedNodes = diffResult.root.filter(
    (n) => n.changeType !== "unchanged",
  );
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  );

  const allExpanded = collapsedSections.size === 0;

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (allExpanded) {
      setCollapsedSections(new Set(changedNodes.map((n) => n.key)));
    } else {
      setCollapsedSections(new Set());
    }
  };

  if (changedNodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No changes detected
      </div>
    );
  }

  return (
    <div>
      {/* Column headers */}
      <div className="sticky top-0 z-10 grid grid-cols-[200px_1fr_1fr] border-b-2 border-border bg-card">
        <div className="px-3 py-2.5 border-r border-border flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {changedNodes.length} changed
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[0.625rem] text-muted-foreground gap-1"
            onClick={toggleAll}
            title={allExpanded ? "Collapse all" : "Expand all"}
          >
            {allExpanded ? (
              <Minimize2 className="w-3 h-3" />
            ) : (
              <Maximize2 className="w-3 h-3" />
            )}
            {allExpanded ? "Collapse" : "Expand"}
          </Button>
        </div>
        <div className="px-3 py-2.5 border-r border-border">
          <span className="text-sm font-semibold text-foreground">
            {oldLabel}
          </span>
        </div>
        <div className="px-3 py-2.5">
          <span className="text-sm font-semibold text-foreground">
            {newLabel}
          </span>
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {changedNodes.map((node) => {
          const adapter = adapters.get(node.key) ?? DefaultFieldAdapter;
          const Icon = adapter.icon;
          const isCollapsed = collapsedSections.has(node.key);

          return (
            <div key={node.key}>
              <button
                className="w-full grid grid-cols-[200px_1fr] text-left hover:bg-muted/30 transition-colors"
                onClick={() => toggleSection(node.key)}
              >
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-r border-border">
                  {isCollapsed ? (
                    <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
                  )}
                  {Icon && (
                    <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium truncate">
                    {adapter.label || node.key}
                  </span>
                  <span className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500" />
                </div>
              </button>
              {!isCollapsed && (
                <div className="border-t border-border/50">
                  <adapter.renderDiff
                    node={node}
                    viewMode="changes-only"
                    enrichment={enrichment}
                    oldLabel={oldLabel}
                    newLabel={newLabel}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom padding */}
      <div className="h-[50dvh]" />
    </div>
  );
}
