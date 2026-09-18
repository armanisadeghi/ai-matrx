"use client";

/**
 * HISTORY — `seo.list_map_history`: what left the map, and who sent it there.
 * Moved out of `TopicalMapWorkspaceBody` unchanged (Phase 0). Lane G builds the
 * proposal and restore review on this same read.
 *
 * Rejecting NEVER deletes: the row stays and can be restored, which is why this
 * screen exists at all.
 */

import {
  TopicalMapEmpty,
  TopicalMapFailed,
  TopicalMapLoading,
} from "../components/TopicalMapStates";
import type { MapViewProps } from "../components/TopicalMapWorkspaceBody";
import { useMapHistory } from "../hooks";

export function HistoryView({ mapId }: MapViewProps) {
  const history = useMapHistory(mapId);

  if (history.isPending) return <TopicalMapLoading what="this map's history" />;
  if (history.isError)
    return <TopicalMapFailed what="this map's history" error={history.error} />;

  return (
    <>
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          History
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {history.data.total} topic(s) rejected or retired. Rejecting never
          deletes — the row stays and can be restored.
        </p>
      </section>

      {history.data.items.length === 0 ? (
        <TopicalMapEmpty
          title="Nothing has left this map"
          detail="No topic has been rejected or retired, so there is nothing to review or restore."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {history.data.items.map((entry) => (
            <li key={`${entry.slug}:${entry.changed_at}`} className="px-3 py-2 text-sm">
              <p className="truncate">
                {entry.name}{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  {entry.slug}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {entry.status} · {new Date(entry.changed_at).toLocaleString()}
                {entry.attachments ? " · still carries attachments" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
