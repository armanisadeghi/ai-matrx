"use client";

// features/start/widgets/bodies/RecentWidget.tsx — the person's latest items of one kind, read from the
// search projection (`platform.search_items` via the Board's `searchItemsAsPerson`): an empty query
// answers recents, newest first, across every organization the person reaches. Each row opens the
// record's own page (the entity registry's `hrefFor`).
import { useQuery } from "@tanstack/react-query";
import { searchItemsAsPerson } from "@/features/board/tools/search-items";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { RECENT_KINDS } from "../catalog";
import type { StartWidgetBodyProps } from "../types";
import { WidgetList, slotRows } from "../frame";

function ago(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${Math.max(m, 1)}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function RecentWidget({ config, size }: StartWidgetBodyProps) {
  const token = config.kind ?? "conversation";
  const limit = slotRows("recent", size);
  const kind = RECENT_KINDS.find((k) => k.value === token);
  const info = tryGetEntityInfo(token);
  const query = useQuery({
    queryKey: ["start-recent", token, limit],
    staleTime: 30_000,
    queryFn: () => searchItemsAsPerson({ query: "", tokens: [token], limit }),
  });
  return (
    <WidgetList
      type="recent"
      size={size}
      loading={query.isLoading}
      error={query.error ? query.error.message : null}
      empty={`No ${kind?.label.toLowerCase() ?? token} yet`}
      rows={(query.data ?? []).map((r) => ({
        key: `${r.entity_token}:${r.entity_id}`,
        title: r.title || `Untitled ${kind?.one ?? token}`,
        href: info?.hrefFor?.(r.entity_id) ?? null,
        meta: ago(r.updated_at),
        icon: info?.Icon,
      }))}
    />
  );
}
