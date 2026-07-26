"use client";

import { useMemo, useState } from "react";
import {
  FileText,
  Maximize2,
  PanelRight,
  SquareArrowOutUpRight,
  AlertCircle,
} from "lucide-react";
import type { ToolRendererProps } from "../../types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { isTerminal, resultAsObject } from "../_shared";
import { EntityCard, type EntityAction } from "../_shared-entity/EntityCard";
import { useFileNode } from "@/features/files/hooks/useFileNode";
import { normalizeSourceName } from "@/features/rag/components/hit-card/adapters";
import { useOpenCitation } from "@/features/rag/components/source-inspector/useOpenCitation";
import { citationHrefFor, type RagSearchHit } from "@/features/rag/api/search";

/**
 * Inline renderer for `knowledge_browse(action="chunk")` — the FULL text of one retrieved chunk
 * as a readable passage card (source name, pages, token count), with the
 * parent chunk's context behind one quiet toggle and a click-through to the
 * source inspector. Same visual family as the `knowledge_search` source cards.
 */

interface ParsedChunk {
  chunkId: string;
  sourceKind: string;
  sourceId: string;
  chunkKind: string | null;
  content: string;
  tokenCount: number | null;
  pageNumbers: number[];
  parent: { content: string; tokenCount: number | null } | null;
  metadata: Record<string, unknown>;
}

function parseChunk(entry: ToolLifecycleEntry): ParsedChunk | null {
  const r = resultAsObject(entry);
  if (!r || typeof r.chunk_id !== "string") return null;
  const parentRaw =
    r.parent && typeof r.parent === "object"
      ? (r.parent as Record<string, unknown>)
      : null;
  return {
    chunkId: r.chunk_id,
    sourceKind: typeof r.source_kind === "string" ? r.source_kind : "unknown",
    sourceId: typeof r.source_id === "string" ? r.source_id : "",
    chunkKind: typeof r.chunk_kind === "string" ? r.chunk_kind : null,
    content: typeof r.content_text === "string" ? r.content_text : "",
    tokenCount: typeof r.token_count === "number" ? r.token_count : null,
    pageNumbers: Array.isArray(r.page_numbers)
      ? (r.page_numbers as unknown[]).filter(
          (p): p is number => typeof p === "number" && Number.isFinite(p),
        )
      : [],
    parent: parentRaw
      ? {
          content:
            typeof parentRaw.content_text === "string"
              ? parentRaw.content_text
              : "",
          tokenCount:
            typeof parentRaw.token_count === "number"
              ? parentRaw.token_count
              : null,
        }
      : null,
    metadata:
      r.metadata && typeof r.metadata === "object"
        ? (r.metadata as Record<string, unknown>)
        : {},
  };
}

function formatPages(pages: number[]): string | null {
  if (!pages.length) return null;
  if (pages.length === 1) return `Page ${pages[0]}`;
  const sorted = [...pages].sort((a, b) => a - b);
  return `Pages ${sorted[0]}–${sorted[sorted.length - 1]}`;
}

export function KnowledgeChunkInline({
  entry,
  onOpenOverlay,
  onOpenWindowPanel,
  expanded,
  onToggleExpanded,
}: ToolRendererProps) {
  const chunk = useMemo(() => parseChunk(entry), [entry]);
  const [showParent, setShowParent] = useState(false);

  const isFile = chunk?.sourceKind === "cld_file";
  const { file } = useFileNode(chunk?.sourceId ?? "");
  const openCitation = useOpenCitation();

  // While streaming, the shell's slim line carries it.
  if (!isTerminal(entry) && !chunk) return null;

  if (entry.status === "error" || !chunk) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">Couldn&apos;t load the passage</div>
          {entry.errorMessage ? (
            <div className="text-[11px] text-muted-foreground">
              {entry.errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const resolvedName = isFile
    ? normalizeSourceName(file?.fileName, chunk.sourceId)
    : null;
  const title = resolvedName ?? "Retrieved passage";
  const pages = formatPages(chunk.pageNumbers);

  const subtitleParts: string[] = [];
  if (pages) subtitleParts.push(pages);
  if (chunk.chunkKind) subtitleParts.push(chunk.chunkKind.replaceAll("_", " "));
  if (chunk.tokenCount != null)
    subtitleParts.push(`${chunk.tokenCount.toLocaleString()} tokens`);

  const synth: RagSearchHit = {
    chunk_id: chunk.chunkId,
    source_kind: chunk.sourceKind,
    source_id: chunk.sourceId,
    field_id: null,
    parent_chunk_id: null,
    chunk_kind: chunk.chunkKind ?? "",
    snippet: chunk.content.slice(0, 300),
    score: 0,
    vector_rank: null,
    lexical_rank: null,
    rerank_score: null,
    entity_rank: null,
    entities: [],
    metadata:
      chunk.pageNumbers.length && chunk.metadata["page_number"] === undefined
        ? { ...chunk.metadata, page_number: chunk.pageNumbers[0] }
        : chunk.metadata,
  };
  const href = citationHrefFor(synth);

  const actions: EntityAction[] = [
    ...(chunk.sourceId
      ? [
          {
            label: "Open source",
            icon: SquareArrowOutUpRight,
            onSelect: () =>
              openCitation({
                sourceKind: chunk.sourceKind,
                sourceId: chunk.sourceId,
                chunkId: chunk.chunkId,
                pageNumber: chunk.pageNumbers[0] ?? null,
                pageNumbers: chunk.pageNumbers.length
                  ? chunk.pageNumbers
                  : null,
                snippet: chunk.content.slice(0, 300),
                fileName: resolvedName,
                href,
              }),
          } satisfies EntityAction,
        ]
      : []),
    ...(onOpenWindowPanel
      ? [
          {
            label: "Open in window",
            icon: PanelRight,
            onSelect: () => onOpenWindowPanel(),
            separatorBefore: chunk.sourceId !== "",
          } satisfies EntityAction,
        ]
      : []),
    ...(onOpenOverlay
      ? [
          {
            label: "Fullscreen",
            icon: Maximize2,
            onSelect: () => onOpenOverlay(),
          } satisfies EntityAction,
        ]
      : []),
  ];

  return (
    <EntityCard
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      icon={FileText}
      accent="cyan"
      title={title}
      subtitle={subtitleParts.join(" · ") || null}
      actions={actions}
    >
      <div className="max-h-[440px] overflow-y-auto p-3">
        <div className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
          {chunk.content || (
            <span className="text-muted-foreground">Empty chunk.</span>
          )}
        </div>
        {chunk.parent?.content ? (
          <div className="mt-3 border-t border-border pt-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowParent((v) => !v);
              }}
              className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {showParent ? "Hide surrounding context" : "Show surrounding context"}
              {chunk.parent.tokenCount != null
                ? ` (${chunk.parent.tokenCount.toLocaleString()} tokens)`
                : ""}
            </button>
            {showParent ? (
              <div className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                {chunk.parent.content}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </EntityCard>
  );
}
