"use client";

/**
 * Step 1 of "Add a reference": choose the TYPE. The common tier (a knob) first,
 * every other visible type behind "All types", grouped by THE ONE group rule
 * (`features/scopes/utils/referenceTypeGroups.ts`). Split out of
 * `ReferencePickerBody.tsx` so the step renders in a test without the rest of
 * the picker.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Input, Skeleton } from "@ai-matrx/design-system";
import { allTypesToggleLabel } from "./referencePickerTypes";

export interface TypeOption {
  token: string;
  label: string;
  family: string;
  Icon: React.ComponentType<{ className?: string }>;
}

export function TypeStep({
  all,
  common,
  commonLoading,
  allSettled,
  commonUnavailable,
  onChoose,
  onCancel,
}: {
  all: TypeOption[];
  common: TypeOption[];
  /** The curated tier is still being read from the knob. */
  commonLoading: boolean;
  /** The hidden-types knob has answered, so `all.length` is final. */
  allSettled: boolean;
  /** The knob is missing/malformed: run uncurated, with everything expanded. */
  commonUnavailable: boolean;
  onChoose: (option: TypeOption) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  // Uncurated (no knob) means there is no shortcut to collapse BEHIND, so the
  // full grouped list opens by default instead of hiding behind "All types".
  const [showAll, setShowAll] = useState(commonUnavailable);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const matches = q
    ? all.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.token.includes(q) ||
          o.family.toLowerCase().includes(q),
      )
    : null;

  const grouped = useMemo(() => {
    const map = new Map<string, TypeOption[]>();
    for (const o of all) (map.get(o.family) ?? map.set(o.family, []).get(o.family)!).push(o);
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([family, options]) => ({
        family,
        options: [...options].sort((a, b) => a.label.localeCompare(b.label)),
      }));
  }, [all]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you want to reference?"
          className="h-9 pl-8 text-base"
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches && matches[0]) onChoose(matches[0]);
            if (e.key === "Escape") onCancel();
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {matches ? (
          matches.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">
              No type matches "{query.trim()}".
            </p>
          ) : (
            <TypeList options={matches} onChoose={onChoose} />
          )
        ) : (
          <>
            {commonLoading ? (
              <CommonTierSkeleton />
            ) : (
              <TypeGrid options={common} onChoose={onChoose} />
            )}
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 flex w-full items-center gap-1 rounded-md px-1 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {showAll ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {allTypesToggleLabel(all.length, allSettled)}
            </button>
            {showAll &&
              grouped.map((g) => (
                <div key={g.family} className="mt-2">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.family}
                  </p>
                  <TypeList options={g.options} onChoose={onChoose} showGroup={false} />
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The curated tier is one cached knob read (60s TTL), so this is usually a
 * single frame — but it is a real loading state, never a layout jump and never
 * a flash of the uncurated list pretending to be the curated one.
 */
function CommonTierSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
      aria-busy="true"
      aria-label="Loading the types offered first"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-[38px] w-full rounded-md" />
      ))}
    </div>
  );
}

function TypeGrid({
  options,
  onChoose,
}: {
  options: TypeOption[];
  onChoose: (option: TypeOption) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {options.map((o) => (
        <button
          key={o.token}
          type="button"
          onClick={() => onChoose(o)}
          className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <o.Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-foreground">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * One row per type. The group name sits on the right only where nothing else
 * names it — search results, which mix groups. Under a group heading it would
 * repeat that heading on every row (G6B review, 2026-10-02).
 */
export function TypeList({
  options,
  onChoose,
  showGroup = true,
}: {
  options: TypeOption[];
  onChoose: (option: TypeOption) => void;
  showGroup?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      {options.map((o) => (
        <button
          key={o.token}
          type="button"
          onClick={() => onChoose(o)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <o.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-foreground">{o.label}</span>
          {showGroup && (
            <span className="ml-auto truncate text-[11px] text-muted-foreground">
              {o.family}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
