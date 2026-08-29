"use client";

import { useState } from "react";
import Link from "next/link";
import { formatTitleCase } from "@ai-matrx/kit/text-case";
import { ChevronRight, ArrowRight, FolderClosed, FolderOpen } from "lucide-react";
import { getRouteLabel } from "@/utils/route-discovery/shared";
import type { RouteDisplayProps } from "./types";

export default function ExpandableSectionsDisplay({ data }: RouteDisplayProps) {
  const { groups, sortedGroupKeys, basePath, routes } = data;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    setExpanded(new Set(sortedGroupKeys.filter((k) => groups[k].length > 0)));
  };

  const collapseAll = () => setExpanded(new Set());

  const totalSubs = routes.length;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={expandAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:bg-accent/30"
        >
          Expand all
        </button>
        <button
          onClick={collapseAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:bg-accent/30"
        >
          Collapse
        </button>
        <span className="ml-auto text-xs text-muted-foreground">
          {sortedGroupKeys.length} sections &middot; {totalSubs} routes
        </span>
      </div>

      {sortedGroupKeys.map((groupKey) => {
        const items = groups[groupKey];
        const isRoot = groupKey === "__root__";
        const label = isRoot ? "General" : formatTitleCase(groupKey);
        const isExpanded = expanded.has(groupKey);
        const hasChildren = items.length > 0;

        return (
          <div
            key={groupKey}
            className={`rounded-lg border overflow-hidden transition-colors ${
              isExpanded ? "border-primary/30 bg-card" : "border-border bg-card"
            }`}
          >
            <button
              onClick={() => (hasChildren ? toggle(groupKey) : undefined)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                hasChildren ? "cursor-pointer hover:bg-accent/30" : "cursor-default"
              } ${isExpanded ? "bg-muted/30" : ""}`}
            >
              <div className="w-8 h-8 rounded-md bg-muted/50 border border-border/50 flex items-center justify-center shrink-0">
                {isExpanded ? (
                  <FolderOpen className="w-4 h-4 text-primary" />
                ) : (
                  <FolderClosed className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{label}</span>
                  {hasChildren && (
                    <span className="text-[10px] font-mono text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">
                      {items.length} sub
                    </span>
                  )}
                </div>
              </div>
              {hasChildren && (
                <ChevronRight
                  className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
              )}
            </button>

            {isExpanded && hasChildren && (
              <div className="border-t border-border/50 px-3 py-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {items.map((route) => (
                    <Link key={route} href={`${basePath}/${route}`}>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent/40 transition-colors group cursor-pointer">
                        <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary shrink-0 transition-colors" />
                        <span className="text-sm group-hover:text-primary transition-colors truncate">
                          {getRouteLabel(route, groupKey)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
