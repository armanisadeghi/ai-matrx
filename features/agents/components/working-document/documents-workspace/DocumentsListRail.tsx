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
import {
  FileText,
  Loader2,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Search,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ItemRow } from "@/components/official/item/ItemRow";
import {
  listRecentUserDocuments,
  updateCxWorkingDocumentTitle,
  type CxWorkingDocumentSummary,
  type WorkingDocumentKind,
} from "@/features/agents/redux/execution-system/instance-working-document/cx-working-document.service";

export interface DocumentsRailSelection {
  conversationId: string;
  kind: WorkingDocumentKind;
  documentId: string;
  title: string;
}

function railTabKey(conversationId: string, kind: WorkingDocumentKind): string {
  return `${conversationId}:${kind}`;
}

interface DocumentsListRailProps {
  /** The conversation whose docs pin to the top. */
  currentConversationId?: string;
  /** The currently-viewed tab key (`conversationId:kind`) — highlighted. */
  activeKey?: string;
  /** Tab keys currently open in the workspace (marked as attached). */
  openKeys?: Set<string>;
  /** Open tab keys that can be detached (the conversation's own docs can't). */
  closableKeys?: Set<string>;
  /** Open a document as a tab (attach / swap to it). */
  onOpen: (sel: DocumentsRailSelection) => void;
  /** Detach (close) an open document tab by its key. */
  onDetach?: (key: string) => void;
  /** Collapse the rail. */
  onCollapse?: () => void;
  className?: string;
}

export function DocumentsListRail({
  currentConversationId,
  activeKey,
  openKeys,
  closableKeys,
  onOpen,
  onDetach,
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
  const filtered = (docs ?? []).filter(
    (d): d is CxWorkingDocumentSummary & { conversationId: string } => {
      if (!d.conversationId) return false; // conversation-scoped open only
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        d.preview.toLowerCase().includes(q)
      );
    },
  );
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
          const key = railTabKey(d.conversationId, d.kind);
          const isOpen = openKeys?.has(key) ?? false;
          const isActive = activeKey != null && key === activeKey;
          const canDetach = (closableKeys?.has(key) ?? false) && !!onDetach;
          const label =
            d.title?.trim() || (isScratch ? "Scratchpad" : "Working document");
          const open = () =>
            onOpen({
              conversationId: d.conversationId,
              kind: d.kind,
              documentId: d.id,
              title: d.title,
            });
          return (
            <ItemRow
              key={d.id}
              size="sm"
              active={isActive}
              label={label}
              leading={
                isScratch ? (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                )
              }
              trailing={
                isOpen ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-primary"
                    title="Attached"
                    aria-label="Attached"
                  />
                ) : undefined
              }
              onOpen={open}
              rename={{
                value: label,
                onCommit: async (next: string) => {
                  const trimmed = next.trim();
                  if (!trimmed || trimmed === label) return;
                  await updateCxWorkingDocumentTitle(d.id, trimmed);
                  setDocs(
                    (prev) =>
                      prev?.map((x) =>
                        x.id === d.id ? { ...x, title: trimmed } : x,
                      ) ?? prev,
                  );
                },
              }}
              menu={{
                sections: [
                  {
                    items: [
                      isOpen
                        ? {
                            id: "swap",
                            label: "Switch to",
                            icon: PanelLeftOpen,
                            onSelect: open,
                          }
                        : {
                            id: "open",
                            label: "Attach",
                            icon: PanelLeftOpen,
                            onSelect: open,
                          },
                      {
                        id: "rename",
                        label: "Rename",
                        icon: Pencil,
                        intent: "rename",
                        onSelect: () => {},
                      },
                      ...(canDetach
                        ? [
                            {
                              id: "detach",
                              label: "Detach",
                              icon: Unlink,
                              tone: "destructive" as const,
                              onSelect: () => onDetach?.(key),
                            },
                          ]
                        : []),
                    ],
                  },
                ],
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
