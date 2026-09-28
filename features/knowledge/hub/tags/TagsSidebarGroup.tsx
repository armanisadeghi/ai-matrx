"use client";

/** The sidebar's Tags group: every tag with how many things are filed under it. */

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useState } from "react";
import { ChevronDown, ChevronRight, Hash, RotateCw } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/utils/cn";
import type { HubTagsState } from "./useHubTags";
import type { HubTag } from "./tagApi";

/**
 * A tag is a name: "#rulebook" in two organizations is two scope rows but ONE
 * tag to the person. Rows merge by name (case and spacing ignored), counts
 * add up, and a merged tag filters by its name across every organization.
 */
export interface MergedTag {
  key: string;
  name: string;
  count: number;
  ids: string[];
}

export function mergeTagsByName(items: HubTag[]): MergedTag[] {
  const byKey = new Map<string, MergedTag>();
  for (const t of items) {
    const key = t.name.trim().replace(/\s+/g, " ").toLowerCase();
    const m = byKey.get(key);
    if (m) {
      m.count += t.count;
      m.ids.push(t.id);
    } else byKey.set(key, { key, name: t.name.trim(), count: t.count, ids: [t.id] });
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

const PREVIEW = 8;
const ROW =
  "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground/90 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TagsSidebarGroup({
  tags,
  activeScopeId,
  onSelect,
  onSelectName,
}: {
  tags: HubTagsState;
  activeScopeId: string | null;
  onSelect: (scopeId: string) => void;
  /** A tag that lives in several organizations filters by its name across all of them. */
  onSelectName?: (name: string) => void;
}) {
  const merged = mergeTagsByName(tags.items);
  const hasActive = Boolean(activeScopeId && tags.items.some((t) => t.id === activeScopeId));
  const [open, setOpen] = useState(hasActive);
  const [all, setAll] = useState(false);
  const rows = all ? merged : merged.slice(0, PREVIEW);
  return (
    <div data-testid="sidebar-tags">
      <button type="button" className={ROW} aria-expanded={open || hasActive} onClick={() => setOpen((o) => !o)}>
        {open || hasActive ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">Tags</span>
        {tags.status === "ready" ? (
          <span className="text-xs tabular-nums text-muted-foreground">{merged.length}</span>
        ) : null}
      </button>
      {open || hasActive ? (
        <div>
          {tags.status === "loading" ? (
            <div className="space-y-1.5 px-2 py-1 pl-7" aria-label="Loading tags">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : tags.status === "error" ? (
            <div className="px-2 py-1 pl-7 text-xs text-destructive">
              <p>
                {tags.error}
                <ErrorAlchemyMenu error={tags.error} size="xs" />
              </p>
              <button
                type="button"
                className="mt-1 inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
                onClick={tags.retry}
              >
                <RotateCw className="h-3 w-3" /> Try again
              </button>
            </div>
          ) : merged.length === 0 ? (
            <p className="px-2 py-1 pl-7 text-xs text-muted-foreground">No tags yet</p>
          ) : null}
          {rows.map((t) => (
            <button
              key={t.key}
              type="button"
              className={cn(ROW, "pl-7", activeScopeId && t.ids.includes(activeScopeId) && "bg-accent font-medium text-foreground")}
              aria-current={activeScopeId && t.ids.includes(activeScopeId) ? "page" : undefined}
              onClick={() => (t.ids.length > 1 && onSelectName ? onSelectName(t.name) : onSelect(t.ids[0]))}
            >
              <span className="min-w-0 flex-1 truncate">#{t.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t.count}</span>
            </button>
          ))}
          {!all && merged.length > PREVIEW ? (
            <button
              type="button"
              className="px-2 py-1 pl-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setAll(true)}
            >
              Show all {merged.length}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
