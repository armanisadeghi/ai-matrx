"use client";

import { useMemo } from "react";
import { Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ListDetailClient } from "@/features/user-lists/components/ListDetailClient";
import type { ToolRendererProps } from "../../types";
import { parsePicklist } from "./parsePicklist";
import { usePicklistDetail } from "./usePicklistDetail";

/**
 * Overlay renderer for the `picklist` tool — the full interactive list editor
 * (`ListDetailClient`, the same component the `/lists/[id]` route uses), so the
 * owner can edit items right from the expanded tool view.
 */
export function PicklistOverlay({ entry }: ToolRendererProps) {
  const summary = useMemo(() => parsePicklist(entry), [entry]);
  const listId = summary.listId;
  const userId = useAppSelector(selectUserId);
  const { list, loading } = usePicklistDetail(listId);

  if (!listId) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        {summary.message ?? "No picklist to display"}
      </div>
    );
  }

  if (loading && !list) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading list…
      </div>
    );
  }

  if (!list) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <AlertTriangle className="h-6 w-6 text-warning" />
        <span>{summary.message ?? "Couldn't load this list."}</span>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a
            href={`/lists/${listId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in new tab
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ListDetailClient list={list} userId={userId} />
    </div>
  );
}
