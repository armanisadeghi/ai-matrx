"use client";

// features/mandates/record-next/RecordTabStrip.tsx
//
// ONE ROW OF TABS, ALWAYS (register 6b: "Tabs must fit on one row"). The window
// has no header slot for a mode pill, so it gets the same measured collapse the
// page header's RouteModeNav uses — full labels → icons (the active tab keeps
// its label) → one menu — instead of wrapping to a second row. Built on the
// canonical Tabs primitive; nothing else sits in this row.

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { RecordTab, RecordTabId } from "./record-tabs";

type Variant = "full" | "icons" | "menu";

export function RecordTabStrip({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: readonly RecordTab[];
  value: RecordTabId;
  onChange: (tab: RecordTabId) => void;
  className?: string;
}) {
  const cellRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const iconsRef = useRef<HTMLDivElement>(null);
  const [variant, setVariant] = useState<Variant>("full");
  const tabsKey = tabs.map((t) => t.id).join("|");

  useLayoutEffect(() => {
    const cell = cellRef.current;
    if (!cell) return;
    const compute = () => {
      const avail = cell.clientWidth;
      const fullW = fullRef.current?.scrollWidth ?? 0;
      const iconsW = iconsRef.current?.scrollWidth ?? 0;
      if (fullW <= avail) setVariant("full");
      else if (iconsW <= avail) setVariant("icons");
      else setVariant("menu");
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(cell);
    return () => observer.disconnect();
  }, [tabsKey, value]);

  const current = tabs.find((t) => t.id === value) ?? tabs[0];

  const list = (mode: "full" | "icons") => (
    <TabsList className="h-7 gap-0 bg-muted/60 p-0.5">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const showLabel = mode === "full" || tab.id === value;
        return (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            aria-label={tab.label}
            title={showLabel ? undefined : tab.label}
            className="h-6 gap-1 px-2 text-[11px]"
          >
            <Icon className="h-3 w-3" />
            {showLabel ? tab.label : null}
          </TabsTrigger>
        );
      })}
    </TabsList>
  );

  return (
    <div ref={cellRef} className={cn("relative min-w-0", className)}>
      {/* Hidden measurers — the real widths of each variant. */}
      <div
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex whitespace-nowrap"
      >
        <Tabs value={value}>
          <div ref={fullRef} className="inline-flex">
            {list("full")}
          </div>
        </Tabs>
        <Tabs value={value}>
          <div ref={iconsRef} className="inline-flex">
            {list("icons")}
          </div>
        </Tabs>
      </div>
      {variant === "menu" ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-md bg-muted/60 px-2 text-[11px] font-medium text-foreground"
            >
              {current ? <current.icon className="h-3 w-3" /> : null}
              {current?.label}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {tabs.map((tab) => (
              <DropdownMenuItem
                key={tab.id}
                onSelect={() => onChange(tab.id)}
                className={cn("gap-2 text-xs", tab.id === value && "bg-accent")}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Tabs
          value={value}
          onValueChange={(next) => {
            const found = tabs.find((t) => t.id === next);
            if (found) onChange(found.id);
          }}
        >
          {list(variant)}
        </Tabs>
      )}
    </div>
  );
}
