"use client";

import { useMemo } from "react";
import {
  BookOpenText,
  FileText,
  Maximize2,
  PanelRight,
  SquareArrowOutUpRight,
  AlertCircle,
} from "lucide-react";
import type { ToolRendererProps } from "../../types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { getArg, isTerminal, resultAsObject } from "../_shared";
import { EntityCard, type EntityAction } from "../_shared-entity/EntityCard";
import { useFileSrc } from "@/features/files";

/**
 * Inline renderer for `document_content` — random access into a processed
 * document. Dispatches on the `representation` the agent asked for:
 *
 *   - clean / raw        → the page text as one readable sheet
 *   - pages              → the document's page index (number · section · size)
 *   - pdf                → a compact extract card (page map + Open PDF)
 *   - knowledge_assets   → asset summary rows
 *
 * Never a raw JSON dump.
 */

interface PageIndexRow {
  page_number?: number;
  section_title?: string | null;
  section_kind?: string | null;
  is_continuation?: boolean;
  clean_chars?: number;
}

function docTitle(
  result: Record<string, unknown> | null,
  entry: ToolLifecycleEntry,
): string {
  const name = typeof result?.name === "string" ? result.name : null;
  if (name) return name;
  const id =
    (typeof result?.document_id === "string" && result.document_id) ||
    getArg<string>(entry, "document_id") ||
    "";
  return id ? `Document · ${id.slice(0, 8)}` : "Document";
}

function humanize(s: string): string {
  return s.replaceAll("_", " ");
}

// ─── representation: clean / raw ─────────────────────────────────────────────

function TextBody({ result }: { result: Record<string, unknown> }) {
  const text = typeof result.text === "string" ? result.text : "";
  const hasMore = result.has_more === true;
  return (
    <div className="max-h-[440px] overflow-y-auto p-3">
      <div className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
        {text || <span className="text-muted-foreground">No text on these pages.</span>}
      </div>
      {hasMore ? (
        <div className="mt-2 text-[11px] text-muted-foreground">
          More content available beyond this excerpt.
        </div>
      ) : null}
    </div>
  );
}

// ─── representation: pages ───────────────────────────────────────────────────

function PagesBody({ result }: { result: Record<string, unknown> }) {
  const pages = Array.isArray(result.pages)
    ? (result.pages as PageIndexRow[])
    : [];
  if (!pages.length) {
    return (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
        No page index available.
      </div>
    );
  }
  return (
    <div className="max-h-[440px] overflow-y-auto p-1.5">
      {pages.map((p, i) => (
        <div
          key={`${p.page_number ?? i}`}
          className="flex items-center gap-2.5 rounded-md px-2 py-1 text-xs hover:bg-muted/50"
        >
          <span className="w-9 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
            {p.page_number ?? i + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground">
            {p.section_title || (
              <span className="text-muted-foreground/70">Untitled</span>
            )}
            {p.is_continuation ? (
              <span className="ml-1.5 text-[10px] text-muted-foreground/70">
                cont.
              </span>
            ) : null}
          </span>
          {p.section_kind ? (
            <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[10px] leading-4 text-muted-foreground">
              {humanize(p.section_kind)}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ─── representation: pdf ─────────────────────────────────────────────────────

function PdfBody({ result }: { result: Record<string, unknown> }) {
  const mediaRef =
    result.media_ref && typeof result.media_ref === "object"
      ? (result.media_ref as { file_id?: string })
      : null;
  const fileId = typeof mediaRef?.file_id === "string" ? mediaRef.file_id : "";
  const source = useMemo(
    () =>
      fileId
        ? ({ kind: "file_id", fileId, mime: "application/pdf" } as const)
        : null,
    [fileId],
  );
  const src = useFileSrc(source);
  const sourcePages = Array.isArray(result.source_pages)
    ? (result.source_pages as unknown[]).filter(
        (p): p is number => typeof p === "number",
      )
    : [];
  const pagesLabel = sourcePages.length
    ? sourcePages.length === 1
      ? `page ${sourcePages[0]}`
      : `pages ${sourcePages[0]}–${sourcePages[sourcePages.length - 1]}`
    : null;
  return (
    <div className="flex items-center gap-3 p-3">
      <FileText className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
      <div className="min-w-0 flex-1 text-xs text-foreground">
        PDF extract{pagesLabel ? ` — ${pagesLabel} of the original` : ""}
        {result.pages_capped === true ? (
          <span className="ml-1 text-muted-foreground">(capped)</span>
        ) : null}
      </div>
      {src ? (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          Open PDF
        </a>
      ) : null}
    </div>
  );
}

// ─── representation: knowledge_assets ────────────────────────────────────────

function AssetsBody({ result }: { result: Record<string, unknown> }) {
  const assets = Array.isArray(result.knowledge_assets)
    ? (result.knowledge_assets as Array<Record<string, unknown>>)
    : [];
  if (!assets.length) {
    return (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
        No knowledge assets on these pages.
      </div>
    );
  }
  return (
    <div className="max-h-[440px] overflow-y-auto p-1.5">
      {assets.map((a, i) => {
        const kind =
          (typeof a.asset_kind === "string" && a.asset_kind) ||
          (typeof a.kind === "string" && a.kind) ||
          "asset";
        const title =
          (typeof a.title === "string" && a.title) ||
          (typeof a.name === "string" && a.name) ||
          null;
        return (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-md px-2 py-1 text-xs"
          >
            <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[10px] leading-4 text-muted-foreground">
              {humanize(kind)}
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground">
              {title ?? <span className="text-muted-foreground/70">Untitled</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── the card ────────────────────────────────────────────────────────────────

export function DocumentContentInline({
  entry,
  onOpenOverlay,
  onOpenWindowPanel,
  expanded,
  onToggleExpanded,
}: ToolRendererProps) {
  const result = useMemo(() => resultAsObject(entry), [entry]);

  // While streaming, the shell's slim line carries it.
  if (!isTerminal(entry) && !result) return null;

  if (entry.status === "error" || !result) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">Couldn&apos;t read the document</div>
          {entry.errorMessage ? (
            <div className="text-[11px] text-muted-foreground">
              {entry.errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const rep =
    (typeof result.representation === "string" && result.representation) ||
    getArg<string>(entry, "representation") ||
    "clean";

  const subtitleParts: string[] = [];
  if (rep === "pages") {
    const total =
      typeof result.total_pages === "number" ? result.total_pages : null;
    const returned =
      typeof result.pages_returned === "number" ? result.pages_returned : null;
    subtitleParts.push("Page index");
    if (total != null) subtitleParts.push(`${total.toLocaleString()} pages`);
    if (returned != null && total != null && returned < total)
      subtitleParts.push(`showing first ${returned.toLocaleString()}`);
  } else if (rep === "clean" || rep === "raw") {
    const pageRange =
      typeof result.page_range === "string" ? result.page_range : null;
    const chars =
      typeof result.chars_returned === "number" ? result.chars_returned : null;
    subtitleParts.push(rep === "clean" ? "Clean text" : "Raw text");
    if (pageRange) subtitleParts.push(`pages ${pageRange}`);
    if (chars != null) subtitleParts.push(`${chars.toLocaleString()} chars`);
  } else if (rep === "pdf") {
    subtitleParts.push("PDF extract");
  } else if (rep === "knowledge_assets") {
    const n = Array.isArray(result.knowledge_assets)
      ? (result.knowledge_assets as unknown[]).length
      : 0;
    subtitleParts.push(`${n} knowledge ${n === 1 ? "asset" : "assets"}`);
  }

  const docId =
    (typeof result.document_id === "string" && result.document_id) ||
    getArg<string>(entry, "document_id") ||
    null;
  const actions: EntityAction[] = [
    ...(docId
      ? [
          {
            label: "Open document viewer",
            icon: SquareArrowOutUpRight,
            href: `/rag/viewer/${encodeURIComponent(docId)}`,
          } satisfies EntityAction,
        ]
      : []),
    ...(onOpenWindowPanel
      ? [
          {
            label: "Open in window",
            icon: PanelRight,
            onSelect: () => onOpenWindowPanel(),
            separatorBefore: docId != null,
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
      icon={BookOpenText}
      accent="cyan"
      title={docTitle(result, entry)}
      subtitle={subtitleParts.join(" · ") || null}
      actions={actions}
    >
      {rep === "pages" ? (
        <PagesBody result={result} />
      ) : rep === "pdf" ? (
        <PdfBody result={result} />
      ) : rep === "knowledge_assets" ? (
        <AssetsBody result={result} />
      ) : (
        <TextBody result={result} />
      )}
    </EntityCard>
  );
}
