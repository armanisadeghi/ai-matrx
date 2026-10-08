"use client";

/**
 * FirstPlusMore — one table cell holding a LIST of doors on one line: the first
 * item, then "+N" opening the rest in a popover. Rows stay single-line however
 * many mandates, agents or models a row has (owner, 2026-10-08).
 */
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";

export function FirstPlusMore<T>({
  items,
  render,
  getKey,
  empty = "—",
  label,
}: {
  items: readonly T[];
  render: (item: T) => ReactNode;
  getKey: (item: T) => string;
  empty?: string;
  /** Names the list for the "+N" button ("mandates", "agents"). */
  label: string;
}) {
  if (items.length === 0) return <span className="text-xs text-muted-foreground">{empty}</span>;
  const [first, ...rest] = items;
  return (
    <div className="flex min-w-0 items-center gap-1 whitespace-nowrap text-xs">
      <div className="min-w-0 truncate">{render(first!)}</div>
      {rest.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded px-1 tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`${rest.length} more ${label}`}
              onClick={(e) => e.stopPropagation()}
            >
              {`+${rest.length}`}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" onClick={(e) => e.stopPropagation()}>
            <div className="flex max-h-72 flex-col gap-1 overflow-auto text-xs">
              {items.map((item) => (
                <div key={getKey(item)} className="min-w-0 truncate">
                  {render(item)}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
