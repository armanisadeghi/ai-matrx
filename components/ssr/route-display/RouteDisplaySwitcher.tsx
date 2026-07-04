"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown } from "lucide-react";
import {
  groupRoutes as groupRoutePaths,
  sortGroupKeys as sortKeys,
} from "@/utils/route-discovery/shared";
import {
  buildRouteSearchRows,
  filterRouteSearchRows,
} from "@/utils/route-discovery/filter-routes";
import RouteSearchBar from "./RouteSearchBar";
import type { RouteDisplayData, RouteDisplayVariant } from "./types";
import { VARIANT_LABELS } from "./types";

const variants: Record<
  RouteDisplayVariant,
  ReturnType<typeof dynamic<{ data: RouteDisplayData }>>
> = {
  "grouped-cards": dynamic(() => import("./GroupedCardsDisplay"), {
    ssr: false,
  }),
  "data-table": dynamic(() => import("./DataTableDisplay"), { ssr: false }),
  "expandable-sections": dynamic(() => import("./ExpandableSectionsDisplay"), {
    ssr: false,
  }),
  "flat-list": dynamic(() => import("./FlatListDisplay"), { ssr: false }),
};

interface RouteDisplaySwitcherProps {
  data: RouteDisplayData;
  defaultVariant?: RouteDisplayVariant;
}

export default function RouteDisplaySwitcher({
  data,
  defaultVariant = "grouped-cards",
}: RouteDisplaySwitcherProps) {
  const [variant, setVariant] = useState<RouteDisplayVariant>(defaultVariant);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredData = useMemo((): RouteDisplayData => {
    const q = searchQuery.trim();
    if (!q) return data;

    const rows = buildRouteSearchRows(data.routes, data.basePath);
    const filteredRoutes = filterRouteSearchRows(rows, q).map(
      (row) => row.route,
    );
    const groups = groupRoutePaths(filteredRoutes);
    const sortedGroupKeys = sortKeys(Object.keys(groups));
    const hasGroups = sortedGroupKeys.length > 1 || !groups["__root__"];

    return {
      ...data,
      routes: filteredRoutes,
      groups,
      sortedGroupKeys,
      hasGroups,
    };
  }, [data, searchQuery]);

  const resultCount = filteredData.routes.length;
  const Display = variants[variant];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
        <RouteSearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          resultCount={resultCount}
          totalCount={data.routes.length}
          className="flex-1"
        />

        <div className="relative shrink-0 self-end sm:self-auto">
          <button
            onClick={() => setOpen((p) => !p)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md border border-border hover:border-border/80 bg-card"
          >
            <span>View: {VARIANT_LABELS[variant]}</span>
            <ChevronDown
              className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                {(Object.keys(VARIANT_LABELS) as RouteDisplayVariant[]).map(
                  (key) => (
                    <button
                      key={key}
                      onClick={() => {
                        setVariant(key);
                        setOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        key === variant
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-accent/50"
                      }`}
                    >
                      {VARIANT_LABELS[key]}
                    </button>
                  ),
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {resultCount === 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          No routes match &ldquo;{searchQuery}&rdquo;
        </div>
      ) : (
        <Display data={filteredData} />
      )}
    </div>
  );
}
