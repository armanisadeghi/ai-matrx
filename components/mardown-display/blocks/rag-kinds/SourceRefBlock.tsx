"use client";

/**
 * `source_ref` — THE canonical component for the platform's cited-source
 * primitive (RAG Kinds Run, Stage B).
 *
 * 🚨 THIS ONE MATTERS MORE THAN THE REST OF THE FAMILY. `source_ref` will be
 * nested by document extraction, by legal, by every grounded answer and by
 * every future kind that says "here is where this came from". So it has to read
 * well in BOTH postures, and both are the SAME component (THE CANONICAL
 * COMPONENT LAW — a variant prop, never a second renderer):
 *
 *   variant="card"   — standalone: the full record. Title, opener, authority,
 *                      the in-force disclosure, locator, excerpt, provenance.
 *   variant="inline" — nested inside another kind's prose or chip row. The
 *                      platform's ONE citation chip (`CitationChip`), with the
 *                      popover carrying the same facts the card shows.
 *
 * `variant` defaults to "card" because a standalone dispatch (block registry,
 * admin kind preview, a persisted instance) has no parent to ask.
 *
 * WHAT IT MUST MAKE LEGIBLE, and why: for a regulation, "which version, and is
 * it still in force?" is the whole question. `authority`, `version`,
 * `effective_from` and `effective_to` are rendered as a disclosure line, and
 * `effective_to: null` reads as STILL IN FORCE — never as blank space. Stage A
 * measured that the live citation builder threw all of it away along with the
 * short code and the URL.
 *
 * Consumed, never forked: `CitationChip` (the one chip), `useOpenCitation` (the
 * one opener, which lands on the exact page), `SearchFavicon` (the one favicon
 * ladder), `kindGlyph`, `normalizeSourceName`. See `rag-kind-shared.tsx`.
 */

import React from "react";
import { ExternalLink, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpenCitation } from "@/features/rag/components/source-inspector/useOpenCitation";
import { readSearchKindValue, text } from "../search-kinds/search-kind-data";
import { SearchFavicon } from "../search-kinds/search-kind-shared";
import { CitationChip } from "@/components/official/citation-chip/CitationChip";
import {
  AuthorityBadge,
  InForceLine,
  RagChip,
  citationInputForSourceRef,
  locatorFirstPage,
  locatorLabel,
  shortDate,
  sourceKindIcon,
  sourceRefHref,
  sourceRefLabel,
} from "./rag-kind-shared";

export type SourceRefVariant = "card" | "inline";

export interface SourceRefBlockProps {
  serverData?: unknown;
  className?: string;
  /** Card (standalone) or chip (nested in prose / a chip row). */
  variant?: SourceRefVariant;
  /** 1-based badge on the inline chip, for a numbered Sources row. */
  number?: number;
  /** The chunk this reference was cited from — lets the opener land exactly. */
  chunkId?: string | null;
  /** The query, threaded to the inspector for in-document highlighting. */
  query?: string | null;
}

const SOURCE_KIND_LABELS: Record<string, string> = {
  web_page: "Web page",
  library_doc: "Library document",
  file: "File",
  note: "Note",
  message: "Message",
  transcript: "Transcript",
  dataset_row: "Dataset row",
  opinion: "Court opinion",
  docket: "Docket",
  unknown: "Unknown source",
};

const ORIGIN_LABELS: Record<string, string> = {
  retrieval: "Found by retrieval",
  model_citation: "Cited by the model",
  user_supplied: "Supplied by the user",
};

export function SourceRefBlock({
  serverData,
  className,
  variant = "card",
  number,
  chunkId,
  query,
}: SourceRefBlockProps) {
  const { value } = readSearchKindValue<"source_ref">(serverData);
  const openCitation = useOpenCitation();

  const label = sourceRefLabel(value);
  const url = text(value.url);
  const sourceKind = text(value.source_kind);
  const shortCode = text(value.short_code);
  const siteName = text(value.site_name);
  const excerpt = text(value.excerpt);
  const locator = locatorLabel(value.locator);
  const page = locatorFirstPage(value.locator);
  const author = text(value.author);
  const publisher = text(value.publisher);
  const published = shortDate(value.published_at);
  const origin = text(value.origin);
  const Icon = sourceKindIcon(sourceKind);

  // Nothing has arrived yet — a half-arrived value is a NORMAL state, and an
  // empty box is worse than nothing.
  if (!text(value.source_kind) && !text(value.title) && !url) return null;

  const citationInput = citationInputForSourceRef(value, {
    chunkId,
    pageNumber: page,
    query,
  });
  const href = sourceRefHref(value, chunkId, page);
  const onOpen = citationInput ? () => openCitation(citationInput) : undefined;

  // ── inline: the platform's ONE citation chip ────────────────────────────
  if (variant === "inline") {
    const locatorParts = [
      shortCode,
      SOURCE_KIND_LABELS[sourceKind ?? ""] ?? sourceKind,
      locator,
      siteName,
      published,
    ].filter((part): part is string => Boolean(part));
    return (
      <CitationChip
        number={number}
        icon={Icon}
        label={label}
        locator={locatorParts.join(" · ") || null}
        excerpt={excerpt}
        clampExcerpt
        chipSuffix={locator}
        chipTitle={label}
        chipClassName={className}
        onOpen={onOpen}
        openLabel={url && !text(value.source_id) ? "Open web source" : "Open source"}
      />
    );
  }

  // ── card: the full record ───────────────────────────────────────────────
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card p-3",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <SearchFavicon
          iconUrl={text(value.favicon)}
          url={url}
          className="mt-0.5 h-4 w-4 shrink-0 rounded-sm"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {href ? (
              <a
                href={href}
                onClick={(event) => {
                  if (!onOpen || event.metaKey || event.ctrlKey || event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  onOpen();
                }}
                className="truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
              >
                {label}
              </a>
            ) : (
              <span className="truncate text-sm font-medium text-foreground">{label}</span>
            )}
            {shortCode && (
              <RagChip
                className="font-mono text-foreground"
                title="Canonical short handle for this source"
              >
                {shortCode}
              </RagChip>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            {sourceKind && (
              <span>{SOURCE_KIND_LABELS[sourceKind] ?? sourceKind}</span>
            )}
            {siteName && <span>{siteName}</span>}
            {locator && <span className="text-foreground">{locator}</span>}
            {published && <span>{published}</span>}
          </div>
        </div>
        <AuthorityBadge authority={value.authority} className="shrink-0" />
      </div>

      {/* 🚨 which version, still in force — the reason this primitive exists */}
      <InForceLine
        version={value.version}
        effectiveFrom={value.effective_from}
        effectiveTo={value.effective_to}
        jurisdiction={value.jurisdiction}
      />

      {excerpt && (
        <blockquote className="flex gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          <Quote className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{excerpt}</span>
        </blockquote>
      )}

      {(author || publisher || origin || href) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {author && <RagChip title="Author">{author}</RagChip>}
          {publisher && <RagChip title="Publisher">{publisher}</RagChip>}
          {origin && (
            <RagChip title="How we came to cite this source">
              {ORIGIN_LABELS[origin] ?? origin}
            </RagChip>
          )}
          {href && onOpen && (
            <button
              type="button"
              onClick={onOpen}
              className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              Open source
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default SourceRefBlock;
