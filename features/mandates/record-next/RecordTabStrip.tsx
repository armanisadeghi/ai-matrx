"use client";

// features/mandates/record-next/RecordTabStrip.tsx
//
// ONE ROW OF NAMED TABS (register 6b: "Tabs must fit on one row with shorter
// names"). Every tab shows its NAME — never a bare icon. When the row is too
// narrow for all of them, the tabs that fit stay named in the row (the active
// one always among them) and the rest go into a "More" menu that lists them by
// name. At desktop widths all eleven fit; the menu is a narrow-width fallback.
// Built on the canonical Tabs primitive; nothing else sits in this row.

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
import type { RecordTab, RecordTabCount, RecordTabId } from "./record-tabs";

/** A tab's optional badge ("2/3"), toned by what it counts. */
export function TabCount({ count }: { count: RecordTabCount }) {
  return (
    <span
      data-testid="record-tab-count"
      title={count.title}
      className={cn(
        "ml-0.5 rounded px-1 type-meta font-semibold tabular-nums leading-4",
        count.tone === "danger"
          ? "bg-destructive/15 text-destructive-ink"
          : count.tone === "warning"
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            : "bg-primary/10 text-primary-ink",
      )}
    >
      {count.value}
    </span>
  );
}

/** Room kept for the "More" trigger when the row overflows. */
const MORE_WIDTH = 72;

/**
 * Which tabs stay in the row: as many as fit, in order, with the active tab
 * swapped in for the last one when it would otherwise be hidden. Pure.
 */
export function tabsInRow(
  ids: readonly RecordTabId[],
  widths: readonly number[],
  available: number,
  active: RecordTabId,
): RecordTabId[] {
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (total <= available) return [...ids];
  const room = available - MORE_WIDTH;
  const shown: RecordTabId[] = [];
  let used = 0;
  for (let i = 0; i < ids.length; i += 1) {
    if (used + widths[i] > room) break;
    shown.push(ids[i]);
    used += widths[i];
  }
  if (!shown.includes(active)) {
    const activeWidth = widths[ids.indexOf(active)] ?? 0;
    while (shown.length > 0 && used + activeWidth > room) {
      const dropped = shown.pop() as RecordTabId;
      used -= widths[ids.indexOf(dropped)] ?? 0;
    }
    shown.push(active);
  }
  return shown;
}

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
  const measureRef = useRef<HTMLDivElement>(null);
  const [inRow, setInRow] = useState<RecordTabId[]>(() => tabs.map((t) => t.id));
  const tabsKey = tabs.map((t) => t.id).join("|");
  // A badge changes a tab's width, so the row is re-measured when one does.
  const countsKey = tabs.map((t) => t.count?.value ?? "").join("|");

  useLayoutEffect(() => {
    const cell = cellRef.current;
    const measure = measureRef.current;
    if (!cell || !measure) return;
    const compute = () => {
      const triggers = Array.from(
        measure.querySelectorAll<HTMLElement>("[data-tab-measure]"),
      );
      const widths = triggers.map((el) => el.offsetWidth);
      // The list's own padding (p-0.5 each side).
      const next = tabsInRow(
        tabsKey.split("|") as RecordTabId[],
        widths,
        cell.clientWidth - 6,
        value,
      );
      setInRow((prev) =>
        prev.length === next.length && prev.every((id, i) => id === next[i])
          ? prev
          : next,
      );
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(cell);
    return () => observer.disconnect();
  }, [tabsKey, countsKey, value]);

  const shown = tabs.filter((t) => inRow.includes(t.id));
  const hidden = tabs.filter((t) => !inRow.includes(t.id));

  const trigger = (tab: RecordTab, measuring = false) => {
    const Icon = tab.icon;
    return (
      <TabsTrigger
        key={tab.id}
        value={tab.id}
        data-tab-measure={measuring ? "" : undefined}
        className="flex-none"
      >
        <Icon className="h-3 w-3" />
        {tab.label}
        {tab.count ? <TabCount count={tab.count} /> : null}
      </TabsTrigger>
    );
  };

  return (
    <div ref={cellRef} className={cn("relative min-w-0", className)}>
      {/* Hidden measurer — the real width of every named tab. */}
      <div
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex whitespace-nowrap"
      >
        <Tabs value={value}>
          <div ref={measureRef} className="inline-flex">
            <TabsList>
              {tabs.map((tab) => trigger(tab, true))}
            </TabsList>
          </div>
        </Tabs>
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <Tabs
          value={value}
          onValueChange={(next) => {
            const found = tabs.find((t) => t.id === next);
            if (found) onChange(found.id);
          }}
        >
          <TabsList>
            {shown.map((tab) => trigger(tab))}
          </TabsList>
        </Tabs>
        {hidden.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-muted/60 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                More
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {hidden.map((tab) => (
                <DropdownMenuItem
                  key={tab.id}
                  onSelect={() => onChange(tab.id)}
                  className="gap-2 text-xs"
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {tab.count ? <TabCount count={tab.count} /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
