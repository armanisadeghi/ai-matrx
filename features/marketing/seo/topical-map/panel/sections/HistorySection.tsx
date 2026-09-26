"use client";

/**
 * History — what `seo.list_map_history` says about THIS slug, at every status
 * (the function's default lists only what LEFT the map; the panel asks for all
 * four so a proposed topic's own row shows too). Filtered client-side to the
 * slug: the function has no per-topic argument, and the whole map's history is
 * one read the History screen already makes, so the query is shared.
 *
 * `changed_by` is a bare uuid (no user entity token exists — types.ts), so it
 * is printed shortened with the full id in the title; `changed_by_tier` is
 * printed as the row says it, never invented.
 */

import SuspenseLoader from "@/components/loaders/SuspenseLoader";

import { topicalMapErrorText } from "../../errors";
import { useMapHistory } from "../../hooks";
import type { MapTopicStatus } from "../../types";
import { TopicStatusMark } from "../../ui/TopicStatusMark";
import { PanelEmptyLine, PanelSection } from "../PanelSection";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

const EVERY_STATUS: MapTopicStatus[] = ["proposed", "active", "retired", "rejected"];

export interface HistorySectionProps {
  mapId: string;
  slug: string;
}

export function HistorySection({ mapId, slug }: HistorySectionProps) {
  const history = useMapHistory(mapId, { status: EVERY_STATUS, limit: 1000 });
  const entries = (history.data?.items ?? []).filter((entry) => entry.slug === slug);

  return (
    <PanelSection title="History" count={history.data ? entries.length : undefined}>
      {history.isPending ? (
        <SuspenseLoader centered={false} message="Loading this topic's history…" />
      ) : history.isError ? (
        <ErrorNotice size="inline" className="whitespace-pre-wrap text-xs" message={topicalMapErrorText(history.error)} />
      ) : entries.length === 0 ? (
        <PanelEmptyLine>No recorded change for this topic.</PanelEmptyLine>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map((entry) => (
            <li
              key={`${entry.slug}:${entry.status}:${entry.changed_at}`}
              className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
            >
              <TopicStatusMark status={entry.status} />
              <span className="font-medium">{entry.status}</span>
              <time dateTime={entry.changed_at} className="text-muted-foreground">
                {new Date(entry.changed_at).toLocaleString()}
              </time>
              {entry.changed_by ? (
                <span className="font-mono text-muted-foreground" title={entry.changed_by}>
                  by {entry.changed_by.slice(0, 8)}
                  {entry.changed_by_tier ? ` (${entry.changed_by_tier})` : ""}
                </span>
              ) : null}
              {entry.version !== undefined ? (
                <span className="text-muted-foreground">v{entry.version}</span>
              ) : null}
              {entry.attachments ? (
                <span className="text-muted-foreground">
                  still attached:{" "}
                  {Object.entries(entry.attachments)
                    .map(([kind, count]) => `${count} ${kind}`)
                    .join(", ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </PanelSection>
  );
}
