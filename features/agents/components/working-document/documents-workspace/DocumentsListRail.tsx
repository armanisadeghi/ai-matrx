"use client";

/**
 * DocumentsListRail — the recent-documents side rail of the DocumentsWorkspace.
 *
 * Lists the user's recent working documents AND scratchpads (newest-edited
 * first), the current conversation's two docs pinned on top. Clicking a row
 * opens that document as a tab. Collapsible; the workspace decides the default
 * (open in library use, collapsed in the tight chat window).
 */

import { useEffect, useState } from "react";
import { FileText, Loader2, Lock, PanelLeftClose, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listRecentUserDocuments,
  type CxWorkingDocumentSummary,
  type WorkingDocumentKind,
} from "@/features/agents/redux/execution-system/instance-working-document/cx-working-document.service";

export interface DocumentsRailSelection {
  conversationId: string;
  kind: WorkingDocumentKind;
  documentId: string;
  title: string;
}

interface DocumentsListRailProps {
  /** The conversation whose docs pin to the top. */
  currentConversationId?: string;
  /** Open a document as a tab. */
  onOpen: (sel: DocumentsRailSelection) => void;
  /** Collapse the rail. */
  onCollapse?: () => void;
  className?: string;
}

export function DocumentsListRail({
  currentConversationId,
  onOpen,
  onCollapse,
  className,
}: DocumentsListRailProps) {
  const [docs, setDocs] = useState<CxWorkingDocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listRecentUserDocuments(100);
        if (!cancelled) setDocs(rows);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not load documents");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (docs ?? []).filter((d) => {
    if (!d.conversationId) return false; // conversation-scoped open only
    if (!q) return true;
    return (
      d.title.toLowerCase().includes(q) || d.preview.toLowerCase().includes(q)
    );
  });
  // Current conversation's docs first, then the rest (already newest-first).
  const pinned = filtered.filter(
    (d) => d.conversationId === currentConversationId,
  );
  const rest = filtered.filter(
    (d) => d.conversationId !== currentConversationId,
  );
  const ordered = [...pinned, ...rest];

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-60 shrink-0 flex-col border-r border-border bg-card/60",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
        <span className="flex-1 text-xs font-medium text-muted-foreground">
          Documents
        </span>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse list"
            title="Collapse list"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="shrink-0 px-2 py-1.5">
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents…"
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin-auto px-1.5 pb-2">
        {docs === null && !error && (
          <div className="flex items-center justify-center gap-1.5 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        )}
        {error && (
          <div className="px-2 py-4 text-xs text-destructive">{error}</div>
        )}
        {docs !== null && ordered.length === 0 && (
          <div className="px-2 py-8 text-center text-xs text-muted-foreground">
            {q ? "Nothing matches." : "No documents yet."}
          </div>
        )}
        {ordered.map((d) => {
          const isScratch = d.kind === "scratch";
          const isCurrent = d.conversationId === currentConversationId;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() =>
                onOpen({
                  conversationId: d.conversationId!,
                  kind: d.kind,
                  documentId: d.id,
                  title: d.title,
                })
              }
              className={cn(
                "mb-0.5 flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent",
                isCurrent && "ring-1 ring-inset ring-border",
              )}
            >
              <span className="flex items-center gap-1.5">
                {isScratch ? (
                  <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate text-xs font-medium text-foreground">
                  {d.title?.trim() ||
                    (isScratch ? "Scratchpad" : "Working document")}
                </span>
              </span>
              {d.preview && (
                <span className="truncate pl-[18px] text-[11px] text-muted-foreground">
                  {d.preview}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
