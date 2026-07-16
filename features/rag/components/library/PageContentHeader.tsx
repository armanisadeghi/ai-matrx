"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  GitCompareArrows,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuEntry } from "@/components/official/item/types";
import { PageJumperTapGroup } from "@/features/pdf/components/PageJumperTapGroup";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const GAP_PX = 4;
/** Max control segments that can appear in the page-text header. */
const MAX_SEGMENTS = 4;

type SegmentId = "jumper" | "match" | "tabs" | "compare";

export interface PageContentHeaderProps {
  pageLabel: string;
  loading?: boolean;
  pageIndex: number;
  totalPages: number;
  onPageChange: (idx: number) => void;
  query: string;
  matchesCount: number;
  activeMatch: number;
  onStepMatch: (dir: 1 | -1) => void;
  tab: "cleaned" | "raw";
  onTabChange: (tab: "cleaned" | "raw") => void;
  canCompare: boolean;
  onCompare: () => void;
}

function CompareIconButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label="Compare raw vs cleaned"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent"
        >
          <GitCompareArrows className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        Compare raw vs cleaned
      </TooltipContent>
    </Tooltip>
  );
}

function TextModeTabs({
  tab,
  onTabChange,
}: {
  tab: "cleaned" | "raw";
  onTabChange: (tab: "cleaned" | "raw") => void;
}) {
  return (
    <div className="matrx-glass-thin-border flex h-6 shrink-0 items-center rounded-full p-px">
      {(["cleaned", "raw"] as const).map((value) => {
        const active = tab === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onTabChange(value)}
            className={cn(
              "inline-flex h-full items-center rounded-full px-2 text-[10px] font-medium leading-none capitalize transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}

function MatchStepper({
  query,
  matchesCount,
  activeMatch,
  onStepMatch,
}: {
  query: string;
  matchesCount: number;
  activeMatch: number;
  onStepMatch: (dir: 1 | -1) => void;
}) {
  if (!query) return null;
  return (
    <div className="flex h-6 shrink-0 items-center gap-0.5 rounded-md border border-border bg-card px-0.5">
      {matchesCount > 0 ? (
        <>
          <button
            type="button"
            onClick={() => onStepMatch(-1)}
            title="Previous match on this page"
            className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <span className="px-0.5 text-[10px] tabular-nums leading-none text-muted-foreground">
            {activeMatch + 1}/{matchesCount}
          </span>
          <button
            type="button"
            onClick={() => onStepMatch(1)}
            title="Next match on this page"
            className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </>
      ) : (
        <span className="whitespace-nowrap px-1.5 text-[10px] leading-none text-muted-foreground">
          0 on page
        </span>
      )}
    </div>
  );
}

function OverflowTrigger() {
  return (
    <button
      type="button"
      aria-label="More page controls"
      title="More"
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent"
    >
      <MoreHorizontal className="h-3.5 w-3.5" />
    </button>
  );
}

export function PageContentHeader({
  pageLabel,
  loading,
  pageIndex,
  totalPages,
  onPageChange,
  query,
  matchesCount,
  activeMatch,
  onStepMatch,
  tab,
  onTabChange,
  canCompare,
  onCompare,
}: PageContentHeaderProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(MAX_SEGMENTS);

  const activePage = pageIndex + 1;

  const segments = useMemo(() => {
    const list: SegmentId[] = ["jumper"];
    if (query) list.push("match");
    list.push("tabs");
    if (canCompare) list.push("compare");
    return list;
  }, [query, canCompare]);

  const signature = [
    segments.join(","),
    pageIndex,
    totalPages,
    tab,
    query,
    matchesCount,
    activeMatch,
    canCompare,
    pageLabel,
  ].join("|");

  useLayoutEffect(() => {
    const row = rowRef.current;
    const ghost = ghostRef.current;
    const title = titleRef.current;
    if (!row || !ghost) return undefined;

    const compute = () => {
      const titleW = title?.offsetWidth ?? 0;
      const available = Math.max(0, row.clientWidth - titleW - GAP_PX);
      const children = Array.from(ghost.children) as HTMLElement[];
      const n = segments.length;
      const itemW = (i: number) => children[i]?.offsetWidth ?? 0;
      const kebabW = children[n]?.offsetWidth ?? 24;

      let totalAll = 0;
      for (let i = 0; i < n; i++) {
        totalAll += itemW(i) + (i > 0 ? GAP_PX : 0);
      }
      if (totalAll <= available) {
        setVisibleCount(n);
        return;
      }

      let used = 0;
      let count = 0;
      for (let i = 0; i < n; i++) {
        const add = itemW(i) + (count > 0 ? GAP_PX : 0);
        if (used + add + GAP_PX + kebabW <= available) {
          used += add;
          count += 1;
        } else break;
      }
      setVisibleCount(count);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(row);
    return () => ro.disconnect();
  }, [signature, segments]);

  const renderSegment = (id: SegmentId) => {
    switch (id) {
      case "jumper":
        return (
          <PageJumperTapGroup
            compact
            activePage={activePage}
            totalPages={totalPages}
            onJumpToPage={(pageNumber) => onPageChange(pageNumber - 1)}
          />
        );
      case "match":
        return (
          <MatchStepper
            query={query}
            matchesCount={matchesCount}
            activeMatch={activeMatch}
            onStepMatch={onStepMatch}
          />
        );
      case "tabs":
        return <TextModeTabs tab={tab} onTabChange={onTabChange} />;
      case "compare":
        return <CompareIconButton onClick={onCompare} />;
      default:
        return null;
    }
  };

  const menuEntriesFor = (id: SegmentId): ItemMenuEntry[] => {
    switch (id) {
      case "jumper":
        return [
          {
            id: "page-readout",
            label: `Page ${activePage} / ${totalPages.toLocaleString()}`,
            disabled: true,
          },
          {
            id: "page-prev",
            label: "Previous page",
            disabled: activePage <= 1,
            onSelect: () => onPageChange(pageIndex - 1),
          },
          {
            id: "page-next",
            label: "Next page",
            disabled: activePage >= totalPages,
            onSelect: () => onPageChange(pageIndex + 1),
          },
        ];
      case "match":
        if (!query) return [];
        if (matchesCount === 0) {
          return [
            {
              id: "match-none",
              label: "No matches on this page",
              disabled: true,
            },
          ];
        }
        return [
          {
            id: "match-prev",
            label: `Previous match (${activeMatch + 1}/${matchesCount})`,
            onSelect: () => onStepMatch(-1),
          },
          {
            id: "match-next",
            label: `Next match (${activeMatch + 1}/${matchesCount})`,
            onSelect: () => onStepMatch(1),
          },
        ];
      case "tabs":
        return (["cleaned", "raw"] as const).map((value) => ({
          id: `tab-${value}`,
          label: value === "cleaned" ? "Cleaned text" : "Raw text",
          icon: tab === value ? Check : undefined,
          onSelect: () => onTabChange(value),
        }));
      case "compare":
        return [
          {
            id: "compare",
            label: "Compare raw vs cleaned",
            icon: GitCompareArrows,
            onSelect: onCompare,
          },
        ];
      default:
        return [];
    }
  };

  const shown = segments.slice(0, visibleCount);
  const hidden = segments.slice(visibleCount);

  const overflowConfig = useMemo(() => {
    const entries = hidden.flatMap((id) => menuEntriesFor(id));
    return entries.length > 0
      ? { sections: [{ id: "overflow", items: entries }] }
      : null;
    // menuEntriesFor closes over live header state — keep deps explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hidden.join(","),
    activePage,
    totalPages,
    pageIndex,
    tab,
    query,
    matchesCount,
    activeMatch,
    canCompare,
  ]);

  return (
    <div
      ref={rowRef}
      className="flex h-9 shrink-0 flex-nowrap items-center gap-1 border-b px-2"
    >
      <span
        ref={titleRef}
        className="min-w-0 flex-1 truncate text-[10px] font-medium leading-none text-foreground"
        title={pageLabel}
      >
        {loading ? "Loading…" : pageLabel}
      </span>

      <div className="relative min-w-0 shrink">
        <div
          ref={ghostRef}
          aria-hidden
          className="pointer-events-none absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0"
        >
          {segments.map((id) => (
            <div key={id} className="shrink-0">
              {renderSegment(id)}
            </div>
          ))}
          <OverflowTrigger />
        </div>

        <div className="flex items-center justify-end gap-1">
          {shown.map((id) => (
            <div key={id} className="shrink-0">
              {renderSegment(id)}
            </div>
          ))}
          {overflowConfig && (
            <ItemMenu config={overflowConfig} align="end">
              <OverflowTrigger />
            </ItemMenu>
          )}
        </div>
      </div>
    </div>
  );
}
