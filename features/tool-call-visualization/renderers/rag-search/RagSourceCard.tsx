"use client";

import { ExternalLink, PanelRight } from "lucide-react";
import { useFileNode } from "@/features/files";
import { useOpenCitation } from "@/features/rag/components/source-inspector/useOpenCitation";
import { cn } from "@/lib/utils";
import type { ToolAccent } from "../../types";
import { ToolGlyph } from "../_shared-entity/ToolGlyph";
import { PartPeekPopover } from "../_shared-entity/PartPeekPopover";
import { kindGlyph, hrefForNormalized, type NormalizedHit } from "./parseRag";
import { scoreTier, relativeStrength } from "./scoreTier";

/**
 * One RAG hit as a SOURCE card — modelled on the entity-card header it sits
 * under: a glossy kind glyph, a clean two-line title/subtitle, and a single
 * accent. We lean on the data we DO control (kind, page, relevance score)
 * rather than the raw snippet, which is rarely meaningful at a glance.
 *
 * The score becomes the card's splash of color (tier-coded), hovering opens a
 * colored part-peek with the full retrieved chunk + score breakdown + the
 * "why it ranked" entity signals, and the open control routes a file into the
 * non-blocking file-preview WINDOW (others deep-link via the citation router).
 */

/** A subtle per-kind wash for the popover header strip — light/dark safe. */
const HEADER_WASH: Record<ToolAccent, string> = {
  primary: "bg-primary/10",
  blue: "bg-blue-500/10",
  violet: "bg-violet-500/10",
  cyan: "bg-cyan-500/10",
  green: "bg-emerald-500/10",
  amber: "bg-amber-500/10",
  rose: "bg-rose-500/10",
  slate: "bg-slate-400/10",
};

function RagPeekBody({
  hit,
  href,
  topScore,
  onOpen,
}: {
  hit: NormalizedHit;
  href: string;
  topScore: number;
  onOpen: () => void;
}) {
  const isDoc =
    hit.source_kind === "cld_file" || hit.source_kind === "library_doc";
  const tier = scoreTier(hit.score);
  const rel = relativeStrength(hit.score, topScore);
  const entities = hit.entities.slice(0, 6);

  return (
    <div className="space-y-2.5">
      {/* Relevance — tier label, relative bar, absolute score */}
      <div className="flex items-center gap-2">
        <span className={cn("text-[11px] font-semibold", tier.text)}>
          {tier.label}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", tier.bar)}
            style={{ width: `${Math.round(rel * 100)}%` }}
          />
        </div>
        <span className={cn("text-xs font-semibold tabular-nums", tier.text)}>
          {hit.score.toFixed(2)}
        </span>
      </div>

      {/* The retrieved chunk */}
      <div className="max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground">
        {hit.snippet}
      </div>

      {/* Score breakdown */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-[10px] tabular-nums text-muted-foreground">
        {hit.vector_rank != null ? (
          <span>
            vector <span className="font-semibold text-foreground">#{hit.vector_rank}</span>
          </span>
        ) : null}
        {hit.lexical_rank != null ? (
          <span>
            lexical <span className="font-semibold text-foreground">#{hit.lexical_rank}</span>
          </span>
        ) : null}
        {hit.rerank_score != null ? (
          <span>
            rerank{" "}
            <span className="font-semibold text-foreground">
              {hit.rerank_score.toFixed(2)}
            </span>
          </span>
        ) : null}
        {hit.entity_rank != null ? (
          <span>
            entity <span className="font-semibold text-foreground">#{hit.entity_rank}</span>
          </span>
        ) : null}
        {hit.page_number != null ? (
          <span>
            page <span className="font-semibold text-foreground">{hit.page_number}</span>
          </span>
        ) : null}
      </div>

      {/* Why it ranked — KG entity mentions */}
      {entities.length ? (
        <div className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Mentions</span>{" "}
          {entities.join(", ")}
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-border pt-2">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <PanelRight className="h-3.5 w-3.5" />
          {isDoc && hit.page_number != null
            ? `Inspect page ${hit.page_number}`
            : "Open in window"}
        </button>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open source
        </a>
      </div>
    </div>
  );
}

export function RagSourceCard({
  hit,
  topScore,
  query,
}: {
  hit: NormalizedHit;
  /** Top score in the result set, for the relative relevance bar. */
  topScore: number;
  /** The originating search query — threaded into the source inspector. */
  query?: string | null;
}) {
  const g = kindGlyph(hit.source_kind);
  const Icon = g.icon;
  const href = hrefForNormalized(hit);
  const isFile = hit.source_kind === "cld_file";
  // Document-backed sources open the rich Source Inspector; every other kind
  // opens its own in-app window (note / transcript / scraper). Only kinds
  // without a window fall back to a new tab — all handled by useOpenCitation.
  const isDoc =
    hit.source_kind === "cld_file" || hit.source_kind === "library_doc";

  // Resolve a friendly name: the hit's own name → the eagerly-loaded cloud-files
  // record (so "File · e9868104" becomes the real filename) → a kind + id
  // fallback. useFileNode is a no-op read for non-file ids.
  const { file } = useFileNode(hit.source_id);
  const resolvedName = hit.file_name ?? (isFile ? file?.fileName ?? null : null);

  const openCitation = useOpenCitation();
  const open = () =>
    openCitation({
      sourceKind: hit.source_kind,
      sourceId: hit.source_id,
      chunkId: hit.chunk_id,
      pageNumber: hit.page_number,
      pageNumbers: hit.page_number != null ? [hit.page_number] : null,
      snippet: hit.snippet,
      fileName: resolvedName ?? hit.file_name ?? null,
      score: hit.score,
      query: query ?? null,
      href,
    });
  // Fallback title is a bare id ref — the kind is carried by the glyph + the
  // subtitle, so we never echo "File … / File · Page".
  const title = resolvedName ?? `#${hit.source_id.slice(0, 8)}`;
  const subtitle =
    hit.page_number != null ? `${g.label} · Page ${hit.page_number}` : g.label;

  const tier = scoreTier(hit.score);

  return (
    <PartPeekPopover
      className="w-[380px]"
      headerClassName={HEADER_WASH[g.accent] ?? "bg-muted/40"}
      header={
        <span className="flex items-center gap-1.5 normal-case">
          <ToolGlyph icon={Icon} accent={g.accent} size="sm" />
          <span className="truncate font-medium text-foreground">{title}</span>
        </span>
      }
      body={
        <RagPeekBody hit={hit} href={href} topScore={topScore} onOpen={open} />
      }
    >
      <div className="group/row flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:bg-muted/40">
        <ToolGlyph icon={Icon} accent={g.accent} size="md" />

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight text-foreground">
            {title}
          </div>
          <div className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
            {subtitle}
          </div>
        </div>

        {/* Relevance score — the card's splash of color, tier-coded */}
        <span
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset",
            tier.badge,
          )}
          title={`${tier.label} · score ${hit.score.toFixed(3)}`}
        >
          {hit.score.toFixed(2)}
        </span>

        {/* Open in the best in-app window: document → Source Inspector (lands on
            the cited page); note/transcript/scraped → their own windows; kinds
            without a window fall back to a new tab (all via useOpenCitation). */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
          title={
            isDoc && hit.page_number != null
              ? `Inspect page ${hit.page_number} of the source`
              : "Open source in a window"
          }
          aria-label="Open source"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </div>
    </PartPeekPopover>
  );
}
