"use client";

/**
 * features/notifications/components/PlacesStrip.tsx — "All places" (ruling 3).
 *
 * One row per registered notice source (`../sources/registry`): its icon, its
 * label, its count when it has one, and "N snoozed" when anything of it is
 * hidden. A click opens the source's canonical list as a window over the page
 * (or a new tab for a route-bound list) — never a navigation. The strip shows
 * the first four sources and folds the rest under More.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdminPerson } from "@/lib/redux/selectors/userSelectors";
import { visibleSources, type NoticeSource } from "../sources/registry";
import { useInboxMemory } from "../useInboxMemory";

const FOLD_AT = 4;

export function SourceItem({
  source,
  onOpened,
  layout,
  active = false,
}: {
  source: NoticeSource;
  onOpened?: () => void;
  layout: "strip" | "rail";
  active?: boolean;
}) {
  const dispatch = useAppDispatch();
  const Icon = source.icon;
  const open = () => {
    source.open(dispatch);
    onOpened?.();
  };
  // A row, not a <button>: its count carries its own Clear / Hide menu, and a button may not
  // hold a button. Enter and Space open it like one.
  return (
    <div
      role="button"
      tabIndex={0}
      data-clickable
      data-notice-source={source.key}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-md text-left text-xs transition-colors hover:bg-[var(--matrx-glass-bg-hover)]",
        layout === "strip" ? "h-8 px-2" : "h-8 px-2.5",
        active ? "bg-accent" : undefined,
      )}
      title={source.opensIn === "tab" ? `${source.label} (opens in a new tab)` : source.label}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-foreground">{source.label}</span>
      <source.Indicator />
      {source.opensIn === "tab" ? (
        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
    </div>
  );
}

export function PlacesStrip({ onOpened, columns = 2 }: { onOpened?: () => void; columns?: 1 | 2 }) {
  const isAdmin = useAppSelector(selectIsAdminPerson);
  const memory = useInboxMemory();
  const all = visibleSources(Boolean(isAdmin));
  // "Hide from bell" takes a place out of the strip and the badge; it comes back from Hidden.
  const sources = all.filter((source) => !memory.hiddenSources.includes(source.key));
  const hidden = all.filter((source) => memory.hiddenSources.includes(source.key));
  const [more, setMore] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const shown = more ? sources : sources.slice(0, FOLD_AT);
  return (
    <section aria-label="All places" className="border-t border-border px-1 py-1">
      <div className="flex h-6 items-center px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        All places
      </div>
      <div className={cn("grid gap-x-1", columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
        {shown.map((source) => (
          <SourceItem key={source.key} source={source} layout="strip" onOpened={onOpened} />
        ))}
      </div>
      <div className="flex items-center">
        {sources.length > FOLD_AT ? (
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-[var(--matrx-glass-bg-hover)] hover:text-foreground"
            aria-expanded={more}
          >
            {more ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {more ? "Fewer" : `More · ${sources.length - FOLD_AT}`}
          </button>
        ) : null}
        {hidden.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="ml-auto flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-[var(--matrx-glass-bg-hover)] hover:text-foreground"
            aria-expanded={showHidden}
          >
            <EyeOff className="h-3 w-3" />
            Hidden · {hidden.length}
          </button>
        ) : null}
      </div>
      {showHidden
        ? hidden.map((source) => {
            const Icon = source.icon;
            return (
              <div key={source.key} className="flex h-8 items-center gap-2 px-2 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{source.label}</span>
                <button
                  type="button"
                  data-source-unhide={source.key}
                  onClick={() =>
                    memory.save({ hiddenSources: memory.hiddenSources.filter((key) => key !== source.key) })
                  }
                  className="h-6 rounded-md px-2 text-[11px] font-medium text-primary hover:bg-[var(--matrx-glass-bg-hover)]"
                >
                  Show in bell
                </button>
              </div>
            );
          })
        : null}
    </section>
  );
}
