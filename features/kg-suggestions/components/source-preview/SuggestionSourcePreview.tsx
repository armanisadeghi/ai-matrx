// features/kg-suggestions/components/source-preview/SuggestionSourcePreview.tsx
//
// The READ surface behind a suggestion: shows the actual source document the
// suggestion was derived from, with the exact `context_snippet` highlighted IN
// CONTEXT and scrolled into view — so a user can verify the evidence before
// accepting/rejecting, instead of trusting an opaque kind + id.
//
// Presentational only (no panel chrome). It's wrapped by `SourcePreviewPanel`
// for the floating non-blocking surface, and can be embedded directly anywhere
// a read-only source view is wanted. Loads the body via `useSourcePreviewDoc`
// (per-kind direct-Supabase + ingested-doc fallback). The verbatim snippet is
// ALWAYS shown at the top (the guaranteed "at least one good snippet"), even
// when the full body can't be loaded or the snippet can't be located in it.

"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  AudioLines,
  Code2,
  ExternalLink,
  FileText,
  FolderKanban,
  Globe,
  ListTodo,
  Loader2,
  MessagesSquare,
  Quote,
  StickyNote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";
import { useSourcePreviewDoc } from "@/features/kg-suggestions/hooks/useSourcePreviewDoc";
import {
  sourceKindLabel,
  type SourcePreviewDoc,
} from "@/features/kg-suggestions/service/sourcePreviewService";

export interface SuggestionSourcePreviewProps {
  kind: string;
  id: string;
  /** The excerpt the suggestion was derived from — highlighted in the body. */
  snippet: string | null;
  /** Pre-resolved title (shows instantly while the body loads). */
  title?: string | null;
  className?: string;
}

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  note: StickyNote,
  task: ListTodo,
  project: FolderKanban,
  transcript: AudioLines,
  conversation: MessagesSquare,
  cx_message: MessagesSquare,
  cld_file: FileText,
  code_file: Code2,
  scraped: Globe,
};

function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = KIND_ICON[kind] ?? FileText;
  return <Icon className={className} />;
}

export function SuggestionSourcePreview({
  kind,
  id,
  snippet,
  title,
  className,
}: SuggestionSourcePreviewProps) {
  const { doc, loading } = useSourcePreviewDoc(kind, id);
  const kindLabel = sourceKindLabel(kind);
  const displayTitle =
    doc?.title ??
    title ??
    (loading ? "Resolving source…" : `Untitled ${kindLabel}`);

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card", className)}>
      {/* Header */}
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <div className="flex items-start gap-2">
          <KindIcon
            kind={kind}
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {kindLabel}
              </span>
            </div>
            <h3 className="truncate text-sm font-semibold text-foreground">
              {displayTitle}
            </h3>
          </div>
          {doc?.href ? (
            <a
              href={doc.href}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground hover:bg-accent transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
          ) : null}
        </div>

        {doc && doc.meta.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {doc.meta.map((m) => (
              <span key={m.label} className="inline-flex items-center gap-1">
                <span className="text-muted-foreground/70">{m.label}:</span>
                <span className="text-foreground/80">{m.value}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Snippet callout — the guaranteed evidence, always visible */}
      {snippet ? (
        <div className="shrink-0 border-b border-border bg-primary/[0.04] px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
            <Quote className="h-3 w-3" />
            Where this came from
          </div>
          <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-primary/50 pl-2 text-[12px] leading-snug text-foreground/90">
            {snippet}
          </p>
        </div>
      ) : null}

      {/* Body */}
      <div className="min-h-0 flex-1">
        <PreviewBody doc={doc} loading={loading} snippet={snippet} />
      </div>
    </div>
  );
}

function PreviewBody({
  doc,
  loading,
  snippet,
}: {
  doc: SourcePreviewDoc | null;
  loading: boolean;
  snippet: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markRef = useRef<HTMLElement | null>(null);

  const body = doc?.body ?? null;
  const range = useMemo(() => findSnippet(body, snippet), [body, snippet]);

  // Bring the highlighted snippet into view inside the scroll container only
  // (never scroll the whole page).
  useEffect(() => {
    const c = containerRef.current;
    const m = markRef.current;
    if (!c || !m) return;
    c.scrollTop = Math.max(0, m.offsetTop - c.clientHeight / 2);
  }, [body, range]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (body) {
    const mono = doc?.bodyKind === "code";
    return (
      <div
        ref={containerRef}
        className="relative h-full overflow-y-auto px-3 py-2.5"
      >
        <div
          className={cn(
            "whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground/90",
            mono && "font-mono text-[11px]",
          )}
        >
          {range ? (
            <>
              {body.slice(0, range.start)}
              <mark
                ref={markRef}
                className="rounded-sm bg-primary/25 px-0.5 text-foreground"
              >
                {body.slice(range.start, range.end)}
              </mark>
              {body.slice(range.end)}
            </>
          ) : (
            body
          )}
        </div>
        {doc?.truncated ? (
          <div className="mt-3 border-t border-border/60 pt-2 text-[11px] italic text-muted-foreground">
            Preview truncated. Open the source to see the full document.
          </div>
        ) : null}
      </div>
    );
  }

  // No readable body — degrade gracefully (the snippet callout above still
  // shows the evidence).
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <FileText className="h-6 w-6 text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground">
        {doc?.notFound
          ? "This source couldn't be loaded. It may have been deleted or isn't readable."
          : snippet
            ? "No inline preview for this source yet. The excerpt above is what the suggestion was drawn from."
            : "No preview available for this source."}
      </p>
      {doc?.href ? (
        <a
          href={doc.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground hover:bg-accent transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Open source
        </a>
      ) : null}
    </div>
  );
}

// ── Snippet matching ─────────────────────────────────────────────────────────
//
// RAG snippets are usually a contiguous slice of the source text, so a
// case-insensitive substring match lands most of the time. We strip leading /
// trailing ellipses + quotes the snippet pipeline adds, and if the full snippet
// isn't found, retry with a long leading run of words (handles trailing "…"
// truncation mid-sentence). Failing both, we render the body unhighlighted —
// the verbatim snippet callout still stands above it.

interface MatchRange {
  start: number;
  end: number;
}

function findSnippet(
  body: string | null,
  snippet: string | null,
): MatchRange | null {
  if (!body || !snippet) return null;
  const clean = snippet.replace(/^[\s.…"'`]+|[\s.…"'`]+$/g, "").trim();
  if (clean.length < 8) return null;

  const lb = body.toLowerCase();

  const ls = clean.toLowerCase();
  const direct = lb.indexOf(ls);
  if (direct >= 0) return { start: direct, end: direct + clean.length };

  // Fall back to a long leading run of words (snippet often ends in "…").
  const words = clean.split(/\s+/);
  if (words.length >= 6) {
    const sub = words.slice(0, Math.min(14, words.length)).join(" ");
    const idx = lb.indexOf(sub.toLowerCase());
    if (idx >= 0) return { start: idx, end: idx + sub.length };
  }

  return null;
}

export default SuggestionSourcePreview;
