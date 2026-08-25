"use client";

/**
 * Shared primitives for the RAG retrieval + citation kind family
 * (RAG Kinds Run, Stage B).
 *
 * INVENTORY LAW (survey 2026-08-24, verified path-by-path before use). This
 * repo had already built RAG hit cards and citation chips several times, and a
 * fourth would be a defect. Nothing here re-implements any of them:
 *
 *  - the hit card is `features/rag/components/hit-card/RagHitCard.tsx` — THE
 *    declared canonical card (800 lines, compact + expanded, score tiers, rank
 *    breakdown, entity chips, copy-for-AI). `RetrievedChunkBlock` adapts the
 *    kind value to `RagHitView` and renders it; it draws no card of its own.
 *  - the citation chip is `components/official/citation-chip/CitationChip.tsx`
 *    — shape-agnostic by design, consumed verbatim for the inline `source_ref`.
 *  - opening a cited source is `features/rag/components/source-inspector/
 *    useOpenCitation.ts` (the canonical open-at-the-exact-page behaviour) over
 *    `citationHrefFor` from `features/rag/api/search.ts`.
 *  - favicon / domain chrome is the search family's `search-kind-shared.tsx`,
 *    which is itself the convergence of the canonical `parseSearch.ts`.
 *  - score tiers and per-kind glyphs are `hit-card/scoreTier.ts` +
 *    `hit-card/kindGlyph.ts`; source-name normalisation is
 *    `hit-card/adapters.ts::normalizeSourceName`.
 *
 * What genuinely did not exist before, and is therefore here: the IN-FORCE
 * disclosure (`authority` / `version` / `effective_from` / `effective_to`), the
 * locator line that reads a page range, a timecode, a character span or a named
 * section from ONE shape, and the retrieval-diagnostics panel.
 *
 * 🚨 THE IN-FORCE DISCLOSURE IS THE POINT OF `source_ref`. For a regulation,
 * "which version, and is it still in force?" IS the question — a citation that
 * shows a title and hides the edition invites the reader to act on a superseded
 * rule. `effective_to: null` means STILL CURRENT and is rendered as such, never
 * as a blank.
 */

import React from "react";
import {
  BadgeCheck,
  CircleSlash,
  Clock,
  FileText,
  Globe,
  Info,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RagSearchHit } from "@/features/rag/api/search";
import { citationHrefFor } from "@/features/rag/api/search";
import type { CitationInput } from "@/features/rag/components/source-inspector/useOpenCitation";
import { normalizeSourceName } from "@/features/rag/components/hit-card/adapters";
import { text, num, isRecord } from "../search-kinds/search-kind-data";

// ---------------------------------------------------------------------------
// source_kind vocabulary — ONE mapping, used by every opener in this family
// ---------------------------------------------------------------------------

/**
 * `source_ref.source_kind` speaks the PORTABLE vocabulary (`file`, `web_page`,
 * `library_doc`, …); the platform's citation openers speak the RETRIEVAL
 * vocabulary (`cld_file`, `scraped`, …). This is a value-vocabulary mapping in
 * the sense of THE MERGE + TRANSLATION LAW, and it lives in exactly one place
 * so a chip, a card and an answer never disagree about where a source opens.
 */
export function retrievalSourceKind(sourceKind: string | null | undefined): string {
  switch (sourceKind) {
    case "file":
      return "cld_file";
    case "web_page":
      return "scraped";
    default:
      return sourceKind ?? "unknown";
  }
}

/**
 * The canonical deep-link for a `source_ref`. An external `url` IS the
 * destination when the source is not ours; anything internal routes through
 * `citationHrefFor`, the platform's one href builder, via the minimal synthetic
 * hit it reads (the same technique `knowledge-search/parseRag.ts` uses).
 */
export function sourceRefHref(
  source: { source_kind?: string; source_id?: string | null; url?: string | null },
  chunkId?: string | null,
  pageNumber?: number | null,
): string | null {
  const url = text(source.url);
  const sourceId = text(source.source_id);
  const kind = retrievalSourceKind(text(source.source_kind));
  if (!sourceId) return url;
  const synthetic = {
    chunk_id: chunkId ?? "",
    source_kind: kind,
    source_id: sourceId,
    metadata: pageNumber != null ? { page_number: pageNumber } : {},
  } as unknown as RagSearchHit;
  return citationHrefFor(synthetic);
}

/** The `useOpenCitation` argument for a `source_ref`. One builder, every surface. */
export function citationInputForSourceRef(
  source: {
    source_kind?: string;
    source_id?: string | null;
    url?: string | null;
    title?: string | null;
    excerpt?: string | null;
  },
  extras?: { chunkId?: string | null; pageNumber?: number | null; query?: string | null },
): CitationInput | null {
  const sourceId = text(source.source_id) ?? text(source.url);
  if (!sourceId) return null;
  const href = sourceRefHref(source, extras?.chunkId, extras?.pageNumber);
  if (!href) return null;
  return {
    sourceKind: retrievalSourceKind(text(source.source_kind)),
    sourceId,
    href,
    chunkId: extras?.chunkId ?? null,
    pageNumber: extras?.pageNumber ?? null,
    snippet: text(source.excerpt),
    fileName: text(source.title),
    query: extras?.query ?? null,
  };
}

/** Best human label for a source, without inventing one. */
export function sourceRefLabel(source: {
  title?: string | null;
  short_code?: string | null;
  site_name?: string | null;
  url?: string | null;
  source_id?: string | null;
}): string {
  const title = text(source.title);
  if (title) {
    return normalizeSourceName(title, text(source.source_id) ?? "") ?? title;
  }
  return (
    text(source.short_code) ??
    text(source.site_name) ??
    text(source.url) ??
    "Untitled source"
  );
}

// ---------------------------------------------------------------------------
// Locator — one shape, four kinds of "where"
// ---------------------------------------------------------------------------

/**
 * The locator as a person reads it. Deliberately ONE function over the whole
 * locator: a PDF cites pages, a video cites seconds, a long document cites a
 * character span, and a consumer should not have to know which kind of source
 * it is holding to render "where".
 */
export function locatorLabel(locator: unknown): string | null {
  if (!isRecord(locator)) return null;
  const display = text(locator.display);
  if (display) return display;

  const parts: string[] = [];
  const first = num(locator.first_page);
  const last = num(locator.last_page);
  if (first != null) {
    parts.push(last != null && last !== first ? `Pages ${first}–${last}` : `Page ${first}`);
  }
  const start = num(locator.start_seconds);
  const end = num(locator.end_seconds);
  if (start != null) {
    parts.push(end != null && end !== start ? `${clock(start)}–${clock(end)}` : clock(start));
  }
  const startIndex = num(locator.start_index);
  const endIndex = num(locator.end_index);
  if (startIndex != null && parts.length === 0) {
    parts.push(
      endIndex != null ? `Characters ${startIndex}–${endIndex}` : `Character ${startIndex}`,
    );
  }
  const section = text(locator.section);
  if (section) parts.push(section);
  const subtype = text(locator.section_subtype);
  if (subtype) parts.push(subtype);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The first page a locator points at — what an inspector opens on. */
export function locatorFirstPage(locator: unknown): number | null {
  return isRecord(locator) ? num(locator.first_page) : null;
}

function clock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// The in-force disclosure
// ---------------------------------------------------------------------------

/** Short date, or the verbatim value when it does not parse. */
export function shortDate(value?: string | null): string | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const AUTHORITY_TONE: Record<string, string> = {
  official: "border-success/40 bg-success/10 text-success",
  primary: "border-success/40 bg-success/10 text-success",
  regulatory: "border-success/40 bg-success/10 text-success",
  secondary: "border-border bg-muted/40 text-muted-foreground",
  commentary: "border-border bg-muted/40 text-muted-foreground",
  unofficial: "border-warning/40 bg-warning/10 text-warning",
};

/** How authoritative the corpus says this source is. Free text by design. */
export const AuthorityBadge: React.FC<{
  authority?: string | null;
  className?: string;
}> = ({ authority, className }) => {
  const label = text(authority);
  if (!label) return null;
  return (
    <span
      title={`The corpus declares this source's authority as "${label}".`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        AUTHORITY_TONE[label.toLowerCase()] ??
          "border-border bg-muted/40 text-muted-foreground",
        className,
      )}
    >
      <ShieldCheck className="h-3 w-3" />
      {label}
    </span>
  );
};

/**
 * 🚨 WHICH VERSION, STILL IN FORCE? A citation that shows only a title lets a
 * reader act on a superseded rule. `effective_to === null` means STILL CURRENT
 * and says so in words; a present `effective_to` is a SUPERSEDED banner, not a
 * quiet date. Renders nothing when the source declares none of it — most
 * sources are not regulations.
 */
export const InForceLine: React.FC<{
  version?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  jurisdiction?: string | null;
  className?: string;
}> = ({ version, effectiveFrom, effectiveTo, jurisdiction, className }) => {
  const versionLabel = text(version);
  const from = shortDate(effectiveFrom);
  const to = shortDate(effectiveTo);
  const place = text(jurisdiction);
  if (!versionLabel && !from && !to && !place) return null;

  const superseded = to !== null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2 py-1 text-[11px]",
        superseded
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-border bg-muted/30 text-muted-foreground",
        className,
      )}
    >
      {superseded ? (
        <CircleSlash className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-success" />
      )}
      {versionLabel && (
        <span className="font-medium text-foreground">Version {versionLabel}</span>
      )}
      {superseded ? (
        <span className="font-medium">No longer in force — superseded {to}</span>
      ) : (
        <span>
          <span className="font-medium text-success">Still in force</span>
          {from ? ` · effective ${from}` : ""}
        </span>
      )}
      {place && (
        <span className="inline-flex items-center gap-1">
          <Globe className="h-3 w-3" />
          {place}
        </span>
      )}
    </div>
  );
};

/** Neutral outline chip — the family's one small-fact affordance. */
export const RagChip: React.FC<{
  children: React.ReactNode;
  className?: string;
  title?: string;
}> = ({ children, className, title }) => (
  <span
    title={title}
    className={cn(
      "inline-flex max-w-full items-center gap-1 truncate rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground",
      className,
    )}
  >
    {children}
  </span>
);

/** Icon for a portable `source_kind` value. */
export function sourceKindIcon(sourceKind?: string | null) {
  switch (text(sourceKind)) {
    case "web_page":
      return Globe;
    case "transcript":
      return Clock;
    default:
      return FileText;
  }
}

// ---------------------------------------------------------------------------
// Retrieval diagnostics — "why these results, and how hard we looked"
// ---------------------------------------------------------------------------

const RERANK_TONE: Record<string, { tone: string; note: string }> = {
  applied: {
    tone: "text-success",
    note: "The reranker ran and its ordering was used.",
  },
  low_confidence: {
    tone: "text-warning",
    note: "The reranker ran, every candidate scored below the floor, and the fusion order was kept.",
  },
  failed: {
    tone: "text-destructive",
    note: "The reranker errored; the fusion order was kept. Results are un-reranked.",
  },
  off: {
    tone: "text-muted-foreground",
    note: "Reranking was not requested for this search.",
  },
};

/**
 * The panel that answers "why didn't it find my document?".
 *
 * Every number here exists in the live retrieval envelope today and reaches NO
 * consumer at all — measured during Stage A. `lexical_candidates: 0` is
 * frequently the whole answer, and nobody could see it.
 */
export const RetrievalDiagnosticsPanel: React.FC<{
  diagnostics: unknown;
  /** Fallbacks from the collection's own legacy fields, when present. */
  fallback?: {
    totalCandidates?: number | null;
    embeddingModel?: string | null;
    rerankerModel?: string | null;
    latencyMs?: number | null;
  };
  className?: string;
}> = ({ diagnostics, fallback, className }) => {
  const d = isRecord(diagnostics) ? diagnostics : {};
  const rerankStatus = text(d.rerank_status);
  const tone = rerankStatus ? RERANK_TONE[rerankStatus] : undefined;

  const lanes: { label: string; value: number | null; hint: string }[] = [
    {
      label: "Semantic",
      value: num(d.vector_candidates),
      hint: "Candidates the embedding lane proposed.",
    },
    {
      label: "Keyword",
      value: num(d.lexical_candidates),
      hint: "Candidates the keyword lane proposed. Zero means the words never matched — usually the real answer to 'why didn't it find my document?'.",
    },
    {
      label: "Graph",
      value: num(d.entity_candidates),
      hint: "Candidates the knowledge-graph entity lane proposed.",
    },
  ];
  const totalCandidates = num(d.total_candidates) ?? fallback?.totalCandidates ?? null;
  const embedding = text(d.embedding_model) ?? text(fallback?.embeddingModel);
  const reranker = text(d.reranker_model) ?? text(fallback?.rerankerModel);
  const latency = num(d.latency_ms) ?? fallback?.latencyMs ?? null;
  const matched = Array.isArray(d.matched_entities)
    ? d.matched_entities.filter((e): e is string => typeof e === "string")
    : [];
  const entityMap = Array.isArray(d.entity_map) ? d.entity_map.filter(isRecord) : [];

  const anyLane = lanes.some((lane) => lane.value !== null);
  if (
    !anyLane &&
    !rerankStatus &&
    totalCandidates === null &&
    !embedding &&
    !reranker &&
    latency === null
  ) {
    return null;
  }

  return (
    <details className={cn("rounded-md border border-border bg-card", className)}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">Why these results</span>
        {anyLane && (
          <span className="tabular-nums">
            {lanes
              .filter((lane) => lane.value !== null)
              .map((lane) => `${lane.label} ${lane.value}`)
              .join(" · ")}
          </span>
        )}
        {rerankStatus && (
          <span className={cn("font-medium", tone?.tone ?? "text-muted-foreground")}>
            rerank: {rerankStatus}
          </span>
        )}
      </summary>
      <div className="space-y-2 px-3 pb-3 text-xs">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {lanes.map((lane) => (
            <div
              key={lane.label}
              title={lane.hint}
              className={cn(
                "rounded-md border px-2 py-1.5",
                lane.value === 0
                  ? "border-warning/40 bg-warning/5"
                  : "border-border bg-muted/30",
              )}
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {lane.label} lane
              </div>
              <div className="text-sm font-semibold tabular-nums text-foreground">
                {lane.value === null ? "—" : lane.value}
              </div>
              {lane.value === 0 && (
                <div className="text-[10px] text-warning">contributed nothing</div>
              )}
            </div>
          ))}
          <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Candidates
            </div>
            <div className="text-sm font-semibold tabular-nums text-foreground">
              {totalCandidates ?? "—"}
            </div>
          </div>
        </div>

        {tone && <p className={cn("text-[11px]", tone.tone)}>{tone.note}</p>}

        <div className="flex flex-wrap gap-1.5">
          {embedding && <RagChip title="Embedding model">{embedding}</RagChip>}
          {reranker && <RagChip title="Reranker model">{reranker}</RagChip>}
          {latency !== null && (
            <RagChip title="Wall-clock time for the retrieval">
              {Intl.NumberFormat().format(latency)} ms
            </RagChip>
          )}
        </div>

        {matched.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Entities the query matched
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {matched.map((entity) => (
                <RagChip key={entity}>{entity}</RagChip>
              ))}
            </div>
          </div>
        )}

        {entityMap.length > 0 && (
          <details>
            <summary className="cursor-pointer text-[11px] text-muted-foreground">
              The graph neighbourhood the query touched ({entityMap.length})
            </summary>
            <div className="mt-1 flex flex-wrap gap-1">
              {entityMap.map((entity, index) => {
                const name = text(entity.name) ?? text(entity.entity_id) ?? `#${index}`;
                const mentions = num(entity.mention_count);
                return (
                  <RagChip
                    key={`${name}-${index}`}
                    title={
                      entity.is_concept === true
                        ? "Concept node"
                        : text(entity.entity_kind) ?? undefined
                    }
                  >
                    {name}
                    {mentions !== null && (
                      <span className="tabular-nums text-muted-foreground">×{mentions}</span>
                    )}
                  </RagChip>
                );
              })}
            </div>
          </details>
        )}
      </div>
    </details>
  );
};
