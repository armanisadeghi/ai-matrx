"use client";

/**
 * views/outline/OutlineDiagnostics.tsx — `seo.map_diagnostics` in one dense
 * line under the tree. The outline is the map's index screen and the one that
 * OWNS this read (Phase 0 harness → here).
 *
 * The numbers are the function's own; nothing is derived client-side from the
 * tree, because `pages_on_no_topic` in particular means something the tree
 * cannot know (pages with no live coverage OF THIS MAP — round 22). While the
 * read is pending the footer is simply absent: it is a footer, not the screen,
 * and a spinner under a working tree would only claim the tree is waiting on it.
 */

import { AlertTriangle } from "lucide-react";

import { TopicalMapFailed } from "../../components/TopicalMapStates";
import { useMapDiagnostics } from "../../hooks";

export interface OutlineDiagnosticsProps {
  mapId: string;
  siteId: string | null;
}

export function OutlineDiagnostics({ mapId, siteId }: OutlineDiagnosticsProps) {
  const diagnostics = useMapDiagnostics(mapId, siteId);

  if (diagnostics.isPending) return null;
  if (diagnostics.isError) {
    return <TopicalMapFailed what="this map's diagnostics" error={diagnostics.error} />;
  }

  const d = diagnostics.data;
  const parts: { label: string; value: number; warn: boolean }[] = [
    { label: "empty", value: d.topics_empty, warn: d.topics_empty > 0 },
    { label: "crowded", value: d.topics_crowded.length, warn: d.topics_crowded.length > 0 },
    { label: "still proposed", value: d.topics_proposed.length, warn: false },
    { label: "pages on no topic", value: d.pages_on_no_topic, warn: d.pages_on_no_topic > 0 },
    {
      label: d.sites_using_map.length === 1 ? "site using this map" : "sites using this map",
      value: d.sites_using_map.length,
      warn: false,
    },
  ];
  const anyWarn = parts.some((part) => part.warn);

  return (
    <p
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-border pt-1.5 text-[11px] text-muted-foreground"
      aria-label="Map diagnostics"
    >
      {anyWarn ? (
        <AlertTriangle className="h-3 w-3 shrink-0 text-warning" aria-hidden />
      ) : null}
      {parts.map((part) => (
        <span key={part.label} className={part.warn ? "text-foreground" : undefined}>
          <span className="tabular-nums font-medium">{part.value}</span> {part.label}
        </span>
      ))}
      {siteId === null ? (
        <span className="italic">page numbers cover every site you can view</span>
      ) : null}
    </p>
  );
}
