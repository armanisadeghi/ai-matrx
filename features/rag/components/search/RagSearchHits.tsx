/**
 * features/rag/components/search/RagSearchHits.tsx
 *
 * Render a list of RAG search hits with rich citations. Each row:
 *   - shows the snippet
 *   - labels the source (file name / note / code-file)
 *   - links to the right viewer with chunk + page deep-links
 *
 * The component is presentational. The caller fetches (via `ragSearch`
 * or any other path) and passes the `hits` array. We resolve labels for
 * `cld_file` / virtual sources from the Redux file map when possible —
 * the cloud-files tree is loaded eagerly into Redux, so most hits
 * already have a friendly file name without an extra fetch.
 *
 * Used from:
 *   - `/files` omnibox / search results panel (when wired)
 *   - chat citations (when wired into MessageItem)
 *   - admin RAG library audit pages
 */

"use client";

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAllFilesMap } from "@/features/files/redux/selectors";
import { cn } from "@/lib/utils";
import { citationHrefFor, type RagSearchHit } from "@/features/rag/api/search";
import { useOpenCitation } from "@/features/rag/components/source-inspector/useOpenCitation";
import { RagHitCard } from "@/features/rag/components/hit-card/RagHitCard";
import { hitViewFromSearchHit } from "@/features/rag/components/hit-card/adapters";

export interface RagSearchHitsProps {
  hits: RagSearchHit[];
  /** Optional query string; rendered above the list when present. */
  query?: string;
  /** Latency / candidate count meta from the response. */
  latencyMs?: number;
  totalCandidates?: number;
  /**
   * Track which surface invoked this — analytics + url-prefix for
   * unknown hit kinds. Defaults to "files" (the cloud-files omnibox).
   */
  origin?: "files" | "chat" | "admin";
  className?: string;
  /** Render fewer rows; use for a compact preview in chat. */
  maxRows?: number;
  /**
   * Called when the user clicks a hit. Default: `Link` navigates via
   * `citationHrefFor(hit)`. Pass a custom handler to e.g. open in a side
   * panel inside chat without leaving the conversation.
   */
  onHitClick?: (hit: RagSearchHit) => void;
}

export function RagSearchHits({
  hits,
  query,
  latencyMs,
  totalCandidates,
  origin = "files",
  className,
  maxRows,
  onHitClick,
}: RagSearchHitsProps) {
  const filesById = useAppSelector(selectAllFilesMap);

  const rows = useMemo(
    () => (maxRows ? hits.slice(0, maxRows) : hits),
    [hits, maxRows],
  );

  if (hits.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        {query
          ? `No results for "${query}". Try broader keywords or process more files for RAG first.`
          : "No results."}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {(query !== undefined || latencyMs !== undefined) && (
        <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
          <span>
            {hits.length}
            {totalCandidates ? ` of ${totalCandidates}` : ""} hit
            {hits.length === 1 ? "" : "s"}
            {query ? ` for "${query}"` : ""}
          </span>
          {latencyMs !== undefined ? <span>{latencyMs} ms</span> : null}
        </div>
      )}
      <ol className="flex flex-col gap-2">
        {rows.map((hit, i) => (
          <RagSearchHitRow
            key={`${hit.chunk_id}-${i}`}
            hit={hit}
            origin={origin}
            label={resolveSourceLabel(hit, filesById)}
            query={query}
            topScore={hits[0]?.score}
            onClick={onHitClick}
          />
        ))}
      </ol>
      {maxRows && hits.length > maxRows ? (
        <div className="px-1 text-[11px] text-muted-foreground">
          +{hits.length - maxRows} more hits not shown.
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single hit row
// ---------------------------------------------------------------------------

function RagSearchHitRow({
  hit,
  origin,
  label,
  query,
  topScore,
  onClick,
}: {
  hit: RagSearchHit;
  origin: "files" | "chat" | "admin";
  label: string;
  query?: string;
  topScore?: number;
  onClick?: (hit: RagSearchHit) => void;
}) {
  const view = hitViewFromSearchHit(hit, { name: label });
  const href = citationHrefFor(hit);
  const openCitation = useOpenCitation();

  // An explicit onClick handler (a caller wiring a custom side-panel) wins;
  // otherwise the card's open control routes to the source's in-app window.
  const onOpen = onClick
    ? () => onClick(hit)
    : () =>
        openCitation({
          sourceKind: hit.source_kind,
          sourceId: hit.source_id,
          href,
          chunkId: hit.chunk_id,
          pageNumber: view.pageNumber,
          pageNumbers: view.pageNumbers,
          snippet: view.snippet,
          fileName: view.title,
          score: view.score,
          query: query ?? null,
        });

  return (
    <li data-rag-origin={origin}>
      <RagHitCard
        view={view}
        variant="compact"
        topScore={topScore}
        href={href}
        onOpen={onOpen}
      />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Friendly label for a hit. Cloud-files reads from the Redux map (the
 * tree is loaded once, so most hits have a name immediately). Notes and
 * code-files don't have their slices loaded by default; we fall back to
 * the source id truncated. The metadata dict often carries a
 * `source_label` set during ingest — prefer that when present.
 */
function resolveSourceLabel(
  hit: RagSearchHit,
  filesById: Record<string, { fileName: string }>,
): string {
  const fromMeta = hit.metadata?.["source_label"];
  if (typeof fromMeta === "string" && fromMeta) return fromMeta;

  if (hit.source_kind === "cld_file") {
    const f = filesById[hit.source_id];
    if (f?.fileName) return f.fileName;
  }
  // Generic fallback — first 8 chars of the id is usually unique enough
  // to disambiguate when the row hasn't been hydrated client-side.
  return `${hit.source_kind} · ${hit.source_id.slice(0, 8)}`;
}

export default RagSearchHits;
