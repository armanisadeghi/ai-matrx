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
import {
  SourceActions,
  SourceIndicatorView,
  visibleSources,
  type NoticeSource,
  type SourceState,
} from "../sources/registry";

/** A place the host read nothing for: no number, nothing to clear. */
export const NO_STATE: SourceState = { count: null, hidden: null, loading: false, error: false };
import { useInboxMemory } from "../useInboxMemory";

const FOLD_AT = 4;

export function SourceItem({
  source,
  state,
  onOpened,
  layout,
  active = false,
}: {
  source: NoticeSource;
  state: SourceState;
  onOpened?: () => void;
  layout: "strip" | "rail";
  active?: boolean;
}) {
  const dispatch = useAppDispatch();
  const Icon = source.icon;
  // A plain row holding two buttons side by side — the place itself, and its ⋯ — never a button
  // inside a button. The ⋯ shows on hover/focus (always on touch) over the row's right edge, so a
  // long name keeps the full width.
  return (
    <div
      data-notice-source={source.key}
      className={cn(
        "group relative flex w-full items-center rounded-md text-xs transition-colors hover:bg-[var(--matrx-glass-bg-hover)]",
        active ? "bg-accent" : undefined,
      )}
    >
      <button
        type="button"
        onClick={() => {
          source.open(dispatch);
          onOpened?.();
        }}
        className={cn(
          "flex h-8 min-w-0 flex-1 items-center gap-2 text-left",
          layout === "strip" ? "px-2" : "px-2.5",
        )}
        title={source.opensIn === "tab" ? `${source.label} (opens in a new tab)` : source.label}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-foreground">{source.label}</span>
        <SourceIndicatorView state={state} bucket={source.bucket} sourceKey={source.key} />
        {source.opensIn === "tab" ? (
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
      </button>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md bg-[var(--matrx-glass-bg,var(--background))] opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:static [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100">
        <SourceActions sourceKey={source.key} state={state} />
      </div>
    </div>
  );
}

export function PlacesStrip({
  states,
  onOpened,
  columns = 2,
}: {
  /** Every place's state, read once by the host (`usePlaceStates`). */
  states: Readonly<Record<string, SourceState>>;
  onOpened?: () => void;
  columns?: 1 | 2;
}) {
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
          <SourceItem
            key={source.key}
            source={source}
            state={states[source.key] ?? NO_STATE}
            layout="strip"
            onOpened={onOpened}
          />
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
                  onClick={() => memory.saveHidden(memory.hiddenSources.filter((key) => key !== source.key))}
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
