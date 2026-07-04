"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { formatTitleCase } from "@/utils/text/text-case-converter";
import { ArrowRight } from "lucide-react";
import type { RouteDisplayProps } from "./types";

export default function DataTableDisplay({ data }: RouteDisplayProps) {
  const { routes, groups, basePath } = data;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = routes.map((route) => {
    const parts = route.split("/");
    const segment = parts[parts.length - 1];
    const category = parts.length > 1 ? formatTitleCase(parts[0]) : "Root";
    const depth = parts.length;
    return {
      route,
      label: formatTitleCase(segment),
      category,
      depth,
      path: `${basePath}/${route}`,
    };
  });

  const filtered = rows;

  useEffect(() => {
    setSelectedIndex(0);
  }, [routes.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((p) => Math.min(p + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((p) => Math.max(p - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        window.location.href = filtered[selectedIndex].path;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered, selectedIndex]);

  return (
    <div className="flex flex-col border border-border rounded-lg overflow-hidden bg-card">
      <div className="grid grid-cols-[1.5fr_1fr_60px] gap-2 px-3 py-1.5 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        <div>Route</div>
        <div>Category</div>
        <div className="text-right">Depth</div>
      </div>

      <div ref={listRef} className="max-h-[calc(100dvh-16rem)] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No routes to display.
          </div>
        ) : (
          filtered.map((row, index) => {
            const isSelected = index === selectedIndex;
            return (
              <Link key={row.route} href={row.path}>
                <div
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`grid grid-cols-[1.5fr_1fr_60px] gap-2 px-3 py-1.5 items-center text-sm border-l-2 transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-primary/10 border-l-primary text-foreground"
                      : "border-l-transparent hover:bg-accent/30 text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ArrowRight
                      className={`w-3 h-3 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground/40"}`}
                    />
                    <span className="truncate font-medium">{row.label}</span>
                    <span
                      className={`text-xs font-mono truncate ${isSelected ? "text-primary/70" : "text-muted-foreground/50"}`}
                    >
                      {row.route}
                    </span>
                  </div>
                  <div className="truncate text-muted-foreground">
                    {row.category}
                  </div>
                  <div className="text-right font-mono text-xs text-muted-foreground">
                    {row.depth}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border text-xs text-muted-foreground">
        <span>{routes.length} total routes</span>
        <span className="text-muted-foreground/40">&middot;</span>
        <span>{Object.keys(groups).length} groups</span>
        <span className="text-muted-foreground/40">&middot;</span>
        <span className="ml-auto">
          <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">
            &uarr;&darr;
          </kbd>{" "}
          navigate{" "}
          <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">
            Enter
          </kbd>{" "}
          open
        </span>
      </div>
    </div>
  );
}
