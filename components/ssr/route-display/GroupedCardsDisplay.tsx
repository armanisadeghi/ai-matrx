"use client";

import Link from "next/link";
import { formatTitleCase } from "@ai-matrx/kit/text-case";
import { ChevronRight, FolderOpen } from "lucide-react";
import { getRouteLabel } from "@/utils/route-discovery/shared";
import type { RouteDisplayProps } from "./types";

export default function GroupedCardsDisplay({ data }: RouteDisplayProps) {
  const {
    groups,
    sortedGroupKeys,
    basePath,
    hasGroups,
    routes,
    faviconDataUri,
    faviconColor,
  } = data;

  if (hasGroups) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sortedGroupKeys.map((groupKey) => {
          const groupItems = groups[groupKey];
          const isRoot = groupKey === "__root__";
          const groupLabel = isRoot ? "General" : formatTitleCase(groupKey);

          return (
            <div
              key={groupKey}
              className="bg-card border border-border rounded-lg overflow-hidden"
              style={
                faviconColor
                  ? { borderLeftColor: faviconColor, borderLeftWidth: "3px" }
                  : undefined
              }
            >
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
                {faviconDataUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={faviconDataUri}
                    alt=""
                    aria-hidden="true"
                    className="w-3.5 h-3.5 rounded shrink-0"
                  />
                ) : (
                  <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {groupLabel}
                </span>
                <span className="ml-auto text-xs text-muted-foreground/60">
                  {groupItems.length}
                </span>
              </div>
              <div className="divide-y divide-border/60">
                {groupItems.map((route) => (
                  <Link key={route} href={`${basePath}/${route}`}>
                    <div className="flex items-center justify-between px-3 py-2 hover:bg-accent/50 transition-colors group">
                      <span className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                        {getRouteLabel(route, groupKey)}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {routes.map((route) => (
        <Link key={route} href={`${basePath}/${route}`}>
          <div
            className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent/50 transition-colors group"
            style={
              faviconColor
                ? { borderLeftColor: faviconColor, borderLeftWidth: "3px" }
                : undefined
            }
          >
            <div className="flex items-center gap-3">
              {faviconDataUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={faviconDataUri}
                  alt=""
                  aria-hidden="true"
                  className="h-4 w-4 rounded shrink-0"
                />
              ) : (
                <div className="h-2 w-2 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
              )}
              <span className="text-sm font-medium group-hover:text-primary transition-colors">
                {formatTitleCase(route)}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
          </div>
        </Link>
      ))}
    </div>
  );
}
