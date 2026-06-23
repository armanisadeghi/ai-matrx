"use client";

import { useMemo } from "react";
import {
  ListChecks,
  ExternalLink,
  PanelRight,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOpenPicklistManagerV2Window } from "@/features/overlays/openers/picklistManagerV2Window";
import { GroupSection } from "@/features/user-lists/components/GroupSection";
import type { GroupedItem } from "@/features/user-lists/types";
import type { ToolRendererProps } from "../../types";
import { parsePicklist } from "./parsePicklist";
import { usePicklistDetail } from "./usePicklistDetail";

/**
 * Inline renderer for the `picklist` tool. Shows the REAL stored list — loaded
 * by id and rendered with the canonical `GroupSection`/`ListItem` components —
 * plus the two ways to take it further: open it in the picklist window panel,
 * or open its route in a new tab. Read-only here (isOwner=false); editing
 * happens in the window/route.
 */

function orderedGroups(
  grouped: Record<string, GroupedItem[]> | null | undefined,
): Array<[string, GroupedItem[]]> {
  return Object.entries(grouped ?? {})
    .filter(([, items]) => (items?.length ?? 0) > 0)
    .sort(([a], [b]) =>
      a === "Ungrouped" ? 1 : b === "Ungrouped" ? -1 : a.localeCompare(b),
    );
}

export function PicklistInline({ entry }: ToolRendererProps) {
  const summary = useMemo(() => parsePicklist(entry), [entry]);
  const listId = summary.listId;
  const { list, loading } = usePicklistDetail(listId);
  const openWindow = useOpenPicklistManagerV2Window();

  const groups = useMemo(
    () => (list ? orderedGroups(list.items_grouped) : []),
    [list],
  );

  // Actions without a list id (list / update_item / batch_update) — just the
  // server message; there is nothing to render as a list.
  if (!listId) {
    return summary.message ? (
      <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
        {summary.message}
      </div>
    ) : null;
  }

  const href = `/lists/${listId}`;
  const name = summary.listName ?? list?.list_name ?? "Picklist";
  const count =
    summary.itemCount ??
    (list ? groups.reduce((acc, [, items]) => acc + items.length, 0) : null);

  return (
    <div className="space-y-2">
      {/* Identity + the two "take it further" affordances */}
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
        {count != null ? (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {count} {count === 1 ? "item" : "items"}
          </span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => openWindow({ forcedListId: listId, title: name })}
          >
            <PanelRight className="h-3.5 w-3.5" />
            Open in window
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={href} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              New tab
            </a>
          </Button>
        </div>
      </div>

      {summary.alreadyExisted ? (
        <p className="text-xs text-muted-foreground">
          A list with this name already existed — showing the current version.
        </p>
      ) : null}

      {/* The real list, rendered with the canonical components — capped + scrollable */}
      <div className="max-h-[440px] overflow-y-auto rounded-lg border border-border bg-card p-2">
        {loading && !list ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading list…
          </div>
        ) : list && groups.length ? (
          <div className="space-y-2">
            {groups.map(([groupName, items], i) => (
              <GroupSection
                key={groupName}
                groupName={groupName}
                items={items}
                listId={listId}
                listName={name}
                isOwner={false}
                defaultOpen={i === 0}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <span>{summary.message ?? "Couldn't load this list's items."}</span>
            <Button asChild variant="outline" size="sm" className="mt-1 gap-1.5">
              <a href={href} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Open in new tab
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
