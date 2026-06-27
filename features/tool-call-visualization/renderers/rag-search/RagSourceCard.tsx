"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ToolGlyph } from "../_shared-entity/ToolGlyph";
import { PartPeekPopover } from "../_shared-entity/PartPeekPopover";
import { kindGlyph, hrefForNormalized, type NormalizedHit } from "./parseRag";

/**
 * One RAG hit as a beautiful SOURCE card. The list answer is only as trustworthy
 * as its sources, so hovering the card opens a part-peek with the FULL retrieved
 * chunk + the score breakdown — confirm the source without leaving chat — and
 * "open" deep-links the real document via the canonical citation router.
 */

function RagPeekBody({ hit }: { hit: NormalizedHit }) {
  return (
    <div className="space-y-2">
      <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground">
        {hit.snippet}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-1.5 text-[10px] tabular-nums text-muted-foreground">
        <span>score {hit.score.toFixed(3)}</span>
        {hit.vector_rank != null ? <span>vector #{hit.vector_rank}</span> : null}
        {hit.lexical_rank != null ? <span>lexical #{hit.lexical_rank}</span> : null}
        {hit.rerank_score != null ? (
          <span>rerank {hit.rerank_score.toFixed(3)}</span>
        ) : null}
        {hit.page_number != null ? <span>page {hit.page_number}</span> : null}
      </div>
    </div>
  );
}

export function RagSourceCard({ hit }: { hit: NormalizedHit }) {
  const g = kindGlyph(hit.source_kind);
  const Icon = g.icon;
  const href = hrefForNormalized(hit);
  const label = hit.file_name ?? `${g.label} · ${hit.source_id.slice(0, 8)}`;

  return (
    <PartPeekPopover
      className="w-[420px]"
      header={
        <span className="flex items-center gap-1.5">
          <Icon className="h-3 w-3" />
          <span className="truncate normal-case">{label}</span>
          {hit.page_number != null ? <span>· p.{hit.page_number}</span> : null}
        </span>
      }
      body={<RagPeekBody hit={hit} />}
    >
      <div className="rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:bg-muted/40">
        <div className="flex items-center gap-2">
          <ToolGlyph icon={Icon} accent={g.accent} size="sm" />
          <span className="truncate text-sm font-medium text-foreground">
            {label}
          </span>
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {g.label}
          </span>
          {hit.page_number != null ? (
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              p.{hit.page_number}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground">
            {hit.score.toFixed(2)}
          </span>
          <Link
            href={href}
            prefetch={false}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-primary hover:underline"
          >
            open
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs leading-snug text-muted-foreground">
          {hit.snippet}
        </p>
      </div>
    </PartPeekPopover>
  );
}
