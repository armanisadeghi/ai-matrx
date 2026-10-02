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
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdminPerson } from "@/lib/redux/selectors/userSelectors";
import { visibleSources, type NoticeSource } from "../sources/registry";

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
  const state = source.useState();
  const Icon = source.icon;
  const loud = source.bucket === "needs_you" || source.bucket === "direct";
  return (
    <button
      type="button"
      data-notice-source={source.key}
      onClick={() => {
        source.open(dispatch);
        onOpened?.();
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
      {state.hidden ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">{state.hidden} snoozed</span>
      ) : null}
      {state.error ? (
        <span className="shrink-0 text-[11px] text-muted-foreground" title="Count unavailable">
          —
        </span>
      ) : state.count !== null && state.count > 0 && source.bucket !== "quiet" ? (
        <span
          className={cn(
            "inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
            loud ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {state.count > 99 ? "99+" : state.count}
        </span>
      ) : null}
      {source.opensIn === "tab" ? (
        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
    </button>
  );
}

export function PlacesStrip({ onOpened, columns = 2 }: { onOpened?: () => void; columns?: 1 | 2 }) {
  const isAdmin = useAppSelector(selectIsAdminPerson);
  const sources = visibleSources(Boolean(isAdmin));
  const [more, setMore] = useState(false);
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
      {sources.length > FOLD_AT ? (
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          className="flex h-7 w-full items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-[var(--matrx-glass-bg-hover)] hover:text-foreground"
          aria-expanded={more}
        >
          {more ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {more ? "Fewer" : `More · ${sources.length - FOLD_AT}`}
        </button>
      ) : null}
    </section>
  );
}
