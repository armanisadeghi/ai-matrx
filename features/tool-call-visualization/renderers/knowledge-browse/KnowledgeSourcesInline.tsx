"use client";

import { useMemo } from "react";
import {
  LibraryBig,
  FileText,
  NotebookPen,
  AudioLines,
  Globe,
  AlertCircle,
  Maximize2,
  PanelRight,
  type LucideIcon,
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
 * Inline renderer for `knowledge_browse(action="sources")` — the user's indexed knowledge as a
 * polished source list (the same visual grammar as `knowledge_search`): one row per
 * source with a resolved name, chunk coverage, section-kind chips, and a
 * click-through to the source inspector. Never a raw id/JSON table.
 */

interface RawSource {
  source_kind?: string;
  source_id?: string;
  chunk_count?: number;
  parent_count?: number;
  short_code?: string | null;
  file_name?: string | null;
  title?: string | null;
  section_histogram?: Record<string, number> | null;
  last_updated?: string | null;
}

interface ParsedSource {
  sourceKind: string;
  sourceId: string;
  chunkCount: number;
  parentCount: number;
  name: string | null;
  sectionKinds: string[];
  lastUpdated: string | null;
}

function parseSources(entry: ToolLifecycleEntry): ParsedSource[] {
  const result = resultAsObject(entry);
  const raw = Array.isArray(result?.sources)
    ? (result.sources as RawSource[])
    : [];
  return raw
    .filter((s) => typeof s.source_id === "string" && s.source_id)
    .map((s) => ({
      sourceKind: s.source_kind ?? "unknown",
      sourceId: s.source_id as string,
      chunkCount: typeof s.chunk_count === "number" ? s.chunk_count : 0,
      parentCount: typeof s.parent_count === "number" ? s.parent_count : 0,
      name:
        (typeof s.title === "string" && s.title) ||
        (typeof s.file_name === "string" && s.file_name) ||
        null,
      sectionKinds: Object.keys(s.section_histogram ?? {}).filter(Boolean),
      lastUpdated: typeof s.last_updated === "string" ? s.last_updated : null,
    }));
}

const KIND_ICONS: Record<string, LucideIcon> = {
  cld_file: FileText,
  library_doc: LibraryBig,
  note: NotebookPen,
  transcript: AudioLines,
  scraped: Globe,
};

const KIND_LABELS: Record<string, string> = {
  cld_file: "File",
  library_doc: "Library doc",
  note: "Note",
  transcript: "Transcript",
  scraped: "Web page",
};

function humanizeKind(kind: string): string {
  return kind.replaceAll("_", " ");
}

function relativeDay(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function hrefForSource(s: ParsedSource): string {
  const synth: RagSearchHit = {
    chunk_id: "",
    source_kind: s.sourceKind,
    source_id: s.sourceId,
    field_id: null,
    parent_chunk_id: null,
    chunk_kind: "",
    snippet: "",
    score: 0,
    vector_rank: null,
    lexical_rank: null,
    rerank_score: null,
    entity_rank: null,
    entities: [],
    metadata: {},
  };
  return citationHrefFor(synth);
}

function SourceRow({ source }: { source: ParsedSource }) {
  const isFile = source.sourceKind === "cld_file";
  const { file } = useFileNode(source.sourceId);
  const resolvedName =
    normalizeSourceName(source.name, source.sourceId) ??
    (isFile ? normalizeSourceName(file?.fileName, source.sourceId) : null);
  const kindLabel = KIND_LABELS[source.sourceKind] ?? source.sourceKind;
  const displayName =
    resolvedName ?? `${kindLabel} · ${source.sourceId.slice(0, 8)}`;
  const Icon = KIND_ICONS[source.sourceKind] ?? FileText;
  const openCitation = useOpenCitation();
  const href = hrefForSource(source);
  const updated = relativeDay(source.lastUpdated);
  const shownKinds = source.sectionKinds.slice(0, 3);
  const moreKinds = source.sectionKinds.length - shownKinds.length;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openCitation({
          sourceKind: source.sourceKind,
          sourceId: source.sourceId,
          fileName: resolvedName,
          href,
        });
      }}
      className="group/row flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
    >
      <Icon className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-foreground group-hover/row:underline">
          {displayName}
        </div>
        {shownKinds.length ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {shownKinds.map((k) => (
              <span
                key={k}
                className="rounded bg-muted px-1.5 py-px text-[10px] leading-4 text-muted-foreground"
              >
                {humanizeKind(k)}
              </span>
            ))}
            {moreKinds > 0 ? (
              <span className="text-[10px] text-muted-foreground/70">
                +{moreKinds} more
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right text-[11px] leading-tight text-muted-foreground">
        <div>
          {source.chunkCount} {source.chunkCount === 1 ? "chunk" : "chunks"}
        </div>
        {updated ? <div className="text-muted-foreground/70">{updated}</div> : null}
      </div>
    </button>
  );
}

export function KnowledgeSourcesInline({
  entry,
  onOpenOverlay,
  onOpenWindowPanel,
  expanded,
  onToggleExpanded,
}: ToolRendererProps) {
  const sources = useMemo(() => parseSources(entry), [entry]);

  // While streaming, the shell's slim line carries it.
  if (!isTerminal(entry) && sources.length === 0) return null;

  if (entry.status === "error") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">Couldn&apos;t list indexed sources</div>
          {entry.errorMessage ? (
            <div className="text-[11px] text-muted-foreground">
              {entry.errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const totalChunks = sources.reduce((n, s) => n + s.chunkCount, 0);

  const subtitle = sources.length
    ? `${sources.length} ${sources.length === 1 ? "source" : "sources"} · ${totalChunks.toLocaleString()} chunks`
    : null;

  const actions: EntityAction[] = [
    ...(onOpenWindowPanel
      ? [
          {
            label: "Open in window",
            icon: PanelRight,
            onSelect: () => onOpenWindowPanel(),
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
      icon={LibraryBig}
      accent="cyan"
      title="Indexed knowledge"
      subtitle={subtitle}
      actions={actions}
    >
      {sources.length ? (
        <div className="max-h-[440px] space-y-0.5 overflow-y-auto p-1.5">
          {sources.map((s) => (
            <SourceRow key={`${s.sourceKind}-${s.sourceId}`} source={s} />
          ))}
        </div>
      ) : (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          Nothing is indexed yet.
        </div>
      )}
    </EntityCard>
  );
}
