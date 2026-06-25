"use client";

import { useMemo } from "react";
import {
  ListChecks,
  PanelRight,
  ExternalLink,
  Maximize2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { GroupSection } from "@/features/user-lists/components/GroupSection";
import type { GroupedItem } from "@/features/user-lists/types";
import { useOpenPicklistManagerV2Window } from "@/features/overlays/openers/picklistManagerV2Window";
import type { ToolRendererProps } from "../../types";
import { parsePicklist } from "./parsePicklist";
import { usePicklistDetail } from "./usePicklistDetail";
import { EntityCard, type EntityAction } from "../_shared-entity/EntityCard";

/**
 * Inline renderer for the `picklist` tool — a polished entity card (glossy
 * glyph · name · count · "Open in" menu) wrapping the REAL stored list rendered
 * with the canonical `GroupSection`/`ListItem`.
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

export function PicklistInline({ entry, onOpenOverlay }: ToolRendererProps) {
  const summary = useMemo(() => parsePicklist(entry), [entry]);
  const listId = summary.listId;
  const { list, loading } = usePicklistDetail(listId);
  const openWindow = useOpenPicklistManagerV2Window();

  const groups = useMemo(
    () => (list ? orderedGroups(list.items_grouped) : []),
    [list],
  );

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

  const actions: EntityAction[] = [
    {
      label: "Open in window",
      icon: PanelRight,
      onSelect: () => openWindow({ forcedListId: listId, title: name }),
    },
    { label: "Open in new tab", icon: ExternalLink, href },
    ...(onOpenOverlay
      ? [
          {
            label: "Expand",
            icon: Maximize2,
            onSelect: () => onOpenOverlay(),
            separatorBefore: true,
          } satisfies EntityAction,
        ]
      : []),
  ];

  return (
    <EntityCard
      icon={ListChecks}
      accent="violet"
      title={name}
      subtitle={
        count != null
          ? `${count} ${count === 1 ? "item" : "items"}${summary.alreadyExisted ? " · already existed" : ""}`
          : "Picklist"
      }
      actions={actions}
    >
      <div className="max-h-[440px] overflow-y-auto p-2">
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
          </div>
        )}
      </div>
    </EntityCard>
  );
}
