"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  RefreshCw,
  Download,
  History,
  Loader2,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTopicContext, useStreamDebug } from "../../context/ResearchContext";
import { useResearchApi } from "../../hooks/useResearchApi";
import { useResearchDocument } from "../../hooks/useResearchState";
import { useResearchStream } from "../../hooks/useResearchStream";
import { VersionHistory } from "./VersionHistory";
import { VersionDiff } from "./VersionDiff";
import { DocumentSkeleton } from "../shared/Skeletons";
import type { ResearchDocument } from "../../types";
import { tokenUsageFromJson } from "../../types";
import MarkdownStream from "@/components/MarkdownStream";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";

export default function DocumentViewer() {
  const { topicId, progress, refresh } = useTopicContext();
  const api = useResearchApi();
  const isMobile = useIsMobile();
  const debug = useStreamDebug();
  const {
    data: docData,
    isLoading: docLoading,
    refresh: refetchDoc,
  } = useResearchDocument(topicId);
  const stream = useResearchStream();

  // Live streaming document text — accumulated chunk by chunk
  const [streamingDocText, setStreamingDocText] = useState("");
  // Guards the one-shot auto-generation so it never loops or double-charges.
  const autoGenAttempted = useRef(false);

  const [showHistory, setShowHistory] = useState(false);
  const [diffDocs, setDiffDocs] = useState<
    [ResearchDocument, ResearchDocument] | null
  >(null);

  const document = docData as ResearchDocument | null;

  // Prefer the persisted document; fall back to the just-streamed text so the
  // viewer never flashes the empty "No document yet" state during the refetch
  // gap between `document_complete` and the DB row becoming visible.
  const displayContent = document?.content || streamingDocText;

  const headings = useMemo(() => {
    if (!displayContent) return [];
    const matches = displayContent.match(/^#{1,3}\s+.+$/gm);
    return (matches ?? []).map((h) => {
      const level = h.match(/^#+/)?.[0].length ?? 1;
      const text = h.replace(/^#+\s+/, "");
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return { level, text, id };
    });
  }, [displayContent]);

  const handleRegenerate = useCallback(async () => {
    setStreamingDocText("");
    const response = await api.generateDocument(topicId);
    stream.startStream(response, {
      onChunk: (text) => setStreamingDocText((prev) => prev + text),
      onData: (payload: import("../../types").ResearchDataEvent) => {
        if (payload.type === "document_complete") {
          // Document assembled — refetch the saved row. We do NOT clear the
          // streamed text here: `displayContent` prefers `document.content`
          // once it lands, and keeping the streamed text avoids an empty flash
          // during the async refetch gap.
          refetchDoc();
          refresh();
        }
      },
      onEnd: () => {
        // Safety fallback: if document_complete wasn't caught, still refetch.
        refetchDoc();
        refresh();
      },
    });
    debug.pushEvents(stream.rawEvents, "document");
  }, [api, topicId, stream, refetchDoc, refresh, debug]);

  // Auto-generate the document the first time the topic is report-ready (a
  // project synthesis exists) but no document has been assembled yet — so the
  // user never has to manually click "Generate" after running the pipeline.
  // Fires at most once per mount, after the initial fetch resolves to no doc.
  const reportReady = (progress?.project_syntheses ?? 0) > 0;
  useEffect(() => {
    if (
      autoGenAttempted.current ||
      docLoading ||
      stream.isStreaming ||
      document ||
      !reportReady
    ) {
      return;
    }
    autoGenAttempted.current = true;
    // Defer out of the effect body so generation's initial setState doesn't run
    // synchronously during commit (react-hooks/set-state-in-effect).
    const t = setTimeout(() => {
      void handleRegenerate();
    }, 0);
    return () => clearTimeout(t);
  }, [docLoading, stream.isStreaming, document, reportReady, handleRegenerate]);

  const handleExport = useCallback(
    async (format: string) => {
      if (!document) return;
      try {
        if (format === "json") {
          const content = JSON.stringify(
            {
              title: document.title,
              content: document.content,
              version: document.version,
            },
            null,
            2,
          );
          const blob = new Blob([content], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = window.document.createElement("a");
          a.href = url;
          a.download = `research-${topicId}.${format}`;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          // For other formats, download as text for now
          const blob = new Blob([document.content], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = window.document.createElement("a");
          a.href = url;
          a.download = `research-${topicId}.txt`;
          a.click();
          URL.revokeObjectURL(url);
        }
      } catch {
        // fallback — download as text
      }
    },
    [document, topicId],
  );

  // Show the streaming in-progress state while generating, OR while we hold
  // just-streamed text waiting for the saved row to land (no empty flash).
  if (!document && (stream.isStreaming || streamingDocText)) {
    return (
      <div className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-4">
        <div className="flex items-center gap-2 rounded-full matrx-glass-thin-border px-3 py-1.5 mb-4">
          <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
          <span className="text-xs font-medium text-primary">
            {stream.isStreaming ? "Generating document…" : "Finalizing…"}
          </span>
          {stream.messages.length > 0 && (
            <span className="text-[10px] text-muted-foreground truncate">
              {stream.messages[stream.messages.length - 1].message}
            </span>
          )}
        </div>
        {streamingDocText && (
          <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:scroll-mt-4">
            <MarkdownStream content={streamingDocText} />
            <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-middle" />
          </article>
        )}
      </div>
    );
  }

  // Report-ready and about to auto-generate: show a calm "assembling" state
  // instead of flashing the manual "Generate" button.
  if (!document && !docLoading && reportReady) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[320px] gap-3 p-6 text-center">
        <Loader2 className="h-6 w-6 text-primary/50 animate-spin" />
        <p className="text-xs font-medium text-foreground/70">
          Assembling your research document…
        </p>
      </div>
    );
  }

  // Initial fetch still in flight — use the shared skeleton, never bare text.
  if (!document && docLoading) {
    return <DocumentSkeleton />;
  }

  if (!document) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[320px] gap-3 p-6 text-center">
        <div className="h-12 w-12 rounded-2xl bg-primary/8 flex items-center justify-center">
          <FileText className="h-6 w-6 text-primary/40" />
        </div>
        <div>
          <p className="text-xs font-medium text-foreground/70">
            No document yet
          </p>
          <p className="text-[10px] text-muted-foreground mt-1 max-w-[260px]">
            Generate a comprehensive research document from your sources,
            content, and syntheses.
          </p>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={stream.isStreaming}
          className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all min-h-[44px]"
        >
          <FileText className="h-3 w-3" />
          Generate Document
        </button>
      </div>
    );
  }

  if (document.status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[320px] gap-3 p-6 text-center">
        <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-destructive/50" />
        </div>
        <div>
          <p className="text-xs font-medium text-destructive/80">
            Generation failed
          </p>
          {document.error && (
            <p className="text-[10px] text-muted-foreground mt-1 max-w-[280px]">
              {document.error}
            </p>
          )}
        </div>
        <button
          onClick={handleRegenerate}
          disabled={stream.isStreaming}
          className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all min-h-[44px]"
        >
          {stream.isStreaming ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Retry
        </button>
      </div>
    );
  }

  if (diffDocs) {
    return (
      <VersionDiff
        oldDoc={diffDocs[0]}
        newDoc={diffDocs[1]}
        onClose={() => setDiffDocs(null)}
      />
    );
  }

  const docTokenUsage = tokenUsageFromJson(document.token_usage);

  return (
    <div className="flex h-full min-h-0">
      {/* TOC Sidebar — Desktop Only */}
      {!isMobile && headings.length > 2 && (
        <aside className="hidden lg:block w-48 shrink-0 border-r border-border overflow-y-auto py-4 px-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Contents
          </div>
          <nav className="space-y-1">
            {headings.map((h, i) => (
              <a
                key={i}
                href={`#${h.id}`}
                className="block text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
                style={{ paddingLeft: `${(h.level - 1) * 12}px` }}
              >
                {h.text}
              </a>
            ))}
          </nav>
        </aside>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-4">
        <div className="flex items-center gap-2 rounded-full matrx-glass-thin-border px-3 py-1.5 mb-4">
          <span className="text-xs font-medium text-foreground/80 truncate">
            {document.title ?? "Document"}
          </span>
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
            v{document.version}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {new Date(document.created_at).toLocaleDateString()}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <button
              onClick={handleRegenerate}
              disabled={stream.isStreaming}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-full matrx-glass-card text-[11px] font-medium text-primary disabled:opacity-50 transition-colors"
            >
              {stream.isStreaming ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              <span className="hidden sm:inline">Regen</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1 h-6 px-2 rounded-full matrx-glass-card text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                  <Download className="h-3 w-3" />
                  <span className="hidden sm:inline">Export</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport("json")}>
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  Export as PDF (coming soon)
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  Export as DOCX (coming soon)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={() => setShowHistory(true)}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-full matrx-glass-card text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <History className="h-3 w-3" />
              <span className="hidden sm:inline">History</span>
            </button>
          </div>
        </div>

        {/* Token usage */}
        {docTokenUsage && (
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground mb-4 pb-4 border-b border-border">
            {docTokenUsage.input_tokens != null && (
              <span>
                Input: {docTokenUsage.input_tokens.toLocaleString()} tokens
              </span>
            )}
            {docTokenUsage.output_tokens != null && (
              <span>
                Output: {docTokenUsage.output_tokens.toLocaleString()} tokens
              </span>
            )}
            {docTokenUsage.estimated_cost != null && (
              <span>Cost: ${docTokenUsage.estimated_cost.toFixed(4)}</span>
            )}
          </div>
        )}

        {/* Markdown Content — uses live streaming text while generating, DB content after */}
        <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:scroll-mt-4">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children, ...props }) => (
                <h1
                  id={String(children)
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")}
                  {...props}
                >
                  {children}
                </h1>
              ),
              h2: ({ children, ...props }) => (
                <h2
                  id={String(children)
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")}
                  {...props}
                >
                  {children}
                </h2>
              ),
              h3: ({ children, ...props }) => (
                <h3
                  id={String(children)
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")}
                  {...props}
                >
                  {children}
                </h3>
              ),
            }}
          >
            {displayContent}
          </ReactMarkdown>
          {stream.isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-middle" />
          )}
        </article>

        {/* Content actions — copy, TTS, full-screen viewer, save to notes/code/tasks, HTML preview, email, print. */}
        {!stream.isStreaming && document.content && (
          <div className="mt-6 pt-3 border-t border-border flex justify-end">
            <ContentActionBar
              content={document.content}
              title={document.title ?? "Research Document"}
              instanceKey={`research-document-${topicId}-${document.version}`}
              metadata={{
                topicId,
                documentId: document.id,
                version: document.version,
                title: document.title ?? null,
                created_at: document.created_at,
                ...(docTokenUsage ? { token_usage: docTokenUsage } : {}),
              }}
            />
          </div>
        )}
      </div>

      {/* Version History */}
      <VersionHistory
        open={showHistory}
        onOpenChange={setShowHistory}
        topicId={topicId}
        currentVersion={document.version}
        onCompare={(old, current) => {
          setDiffDocs([old, current]);
          setShowHistory(false);
        }}
      />
    </div>
  );
}
