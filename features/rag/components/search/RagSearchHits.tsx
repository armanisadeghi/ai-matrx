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
import { ExternalLink, PanelRight, FileText, NotebookText, Code2 } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAllFilesMap } from "@/features/files/redux/selectors";
import { cn } from "@/lib/utils";
import { citationHrefFor, type RagSearchHit } from "@/features/rag/api/search";
import {
  useOpenCitation,
  shouldOpenInNewTab,
  citationOpensInWindow,
} from "@/features/rag/components/source-inspector/useOpenCitation";

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
  onClick,
}: {
  hit: RagSearchHit;
  origin: "files" | "chat" | "admin";
  label: string;
  query?: string;
  onClick?: (hit: RagSearchHit) => void;
}) {
  const Icon = iconForSourceKind(hit.source_kind);
  const href = citationHrefFor(hit);
  const pageRaw = hit.metadata?.["page_number"];
  const pageNumber =
    typeof pageRaw === "number"
      ? pageRaw
      : typeof pageRaw === "string"
        ? Number.parseInt(pageRaw, 10)
        : null;

  const openCitation = useOpenCitation();
  const opensInWindow = citationOpensInWindow(hit.source_kind);
  const openInWindow = () =>
    openCitation({
      sourceKind: hit.source_kind,
      sourceId: hit.source_id,
      href,
      chunkId: hit.chunk_id,
      pageNumber,
      pageNumbers: pageNumber != null ? [pageNumber] : null,
      snippet: hit.snippet,
      fileName: label,
      score: hit.score,
      query: query ?? null,
    });

  const body = (
    <div className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent/40">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium truncate">{label}</span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
            {hit.source_kind}
            {hit.parent_chunk_id ? " · child" : " · parent"}
            {pageNumber ? ` · p${pageNumber}` : ""}
          </span>
        </div>
        <p className="text-xs text-foreground line-clamp-3 leading-snug whitespace-pre-wrap break-words">
          {hit.snippet}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span title="Hybrid score (vector + lexical, optionally re-ranked)">
            score {hit.score.toFixed(3)}
          </span>
          {hit.vector_rank != null ? (
            <span>· vec #{hit.vector_rank}</span>
          ) : null}
          {hit.lexical_rank != null ? (
            <span>· lex #{hit.lexical_rank}</span>
          ) : null}
          {hit.rerank_score != null ? (
            <span>· rerank {hit.rerank_score.toFixed(3)}</span>
          ) : null}
        </div>
      </div>
      {opensInWindow ? (
        <PanelRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
      ) : (
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
      )}
    </div>
  );

  // An explicit onClick handler (a caller wiring a custom side-panel, etc.)
  // always wins — we don't override it.
  if (onClick) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onClick(hit)}
          className="block w-full text-left"
          data-rag-origin={origin}
        >
          {body}
        </button>
      </li>
    );
  }

  // Default: plain click opens the source in its in-app window; keep the href
  // so modifier / middle click still opens the canonical viewer in a new tab.
  return (
    <li>
      <a
        href={href}
        onClick={(e) => {
          if (shouldOpenInNewTab(e)) return;
          e.preventDefault();
          openInWindow();
        }}
        className="block"
        data-rag-origin={origin}
      >
        {body}
      </a>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function iconForSourceKind(kind: string) {
  switch (kind) {
    case "cld_file":
      return FileText;
    case "note":
      return NotebookText;
    case "code_file":
      return Code2;
    default:
      return FileText;
  }
}

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
