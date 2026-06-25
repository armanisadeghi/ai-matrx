"use client";

/**
 * DocumentsWorkspace — the unified working-document + scratchpad workspace.
 *
 * One surface that combines both document kinds: a collapsible recent-docs rail
 * + a tab strip, each tab an open document rendered by the existing
 * `WorkingDocumentPanel`. Opens with the active conversation's working +
 * scratch as two tabs; the rail opens any other document as a new tab so the
 * user flips between documents quickly.
 *
 * Reuses `WorkingDocumentPanel` wholesale (so every tab gets the Step-1 action
 * toolbar + the Step-2 highlight→agent surface menu) — this is the composition
 * shell, not a new editor.
 */

import { useCallback, useState } from "react";
import { FileText, Lock, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkingDocumentKind } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import { WorkingDocumentPanel } from "../WorkingDocumentPanel";
import type { WorkingDocumentSurfaceContext } from "../workingDocumentSurface";
import {
  DocumentsListRail,
  type DocumentsRailSelection,
} from "./DocumentsListRail";

interface DocTab {
  conversationId: string;
  kind: WorkingDocumentKind;
  /** Custom label (rail-opened docs); base tabs use the kind label. */
  label?: string;
  /** Base tabs (this conversation's working + scratch) can't be closed. */
  closable: boolean;
}

function tabKey(t: { conversationId: string; kind: WorkingDocumentKind }): string {
  return `${t.conversationId}:${t.kind}`;
}

function kindLabel(kind: WorkingDocumentKind): string {
  return kind === "scratch" ? "Scratchpad" : "Working document";
}

interface DocumentsWorkspaceProps {
  /** The active conversation — its working + scratch are the base tabs. */
  conversationId: string;
  /** Host page context carried into each current-conversation tab's surface. */
  surfaceContext?: WorkingDocumentSurfaceContext;
  /** Show the recent-docs rail by default. */
  defaultRailOpen?: boolean;
  className?: string;
}

export function DocumentsWorkspace({
  conversationId,
  surfaceContext,
  defaultRailOpen = false,
  className,
}: DocumentsWorkspaceProps) {
  const [tabs, setTabs] = useState<DocTab[]>(() => [
    { conversationId, kind: "working", closable: false },
    { conversationId, kind: "scratch", closable: false },
  ]);
  const [activeKey, setActiveKey] = useState(() =>
    tabKey({ conversationId, kind: "working" }),
  );
  const [railOpen, setRailOpen] = useState(defaultRailOpen);

  const openDoc = useCallback((sel: DocumentsRailSelection) => {
    const key = tabKey(sel);
    setTabs((prev) =>
      prev.some((t) => tabKey(t) === key)
        ? prev
        : [
            ...prev,
            {
              conversationId: sel.conversationId,
              kind: sel.kind,
              label: sel.title?.trim() || kindLabel(sel.kind),
              closable: true,
            },
          ],
    );
    setActiveKey(key);
  }, []);

  const closeTab = useCallback(
    (key: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => tabKey(t) !== key);
        return next.length ? next : prev;
      });
      setActiveKey((cur) => {
        if (cur !== key) return cur;
        const remaining = tabs.filter((t) => tabKey(t) !== key);
        return remaining.length ? tabKey(remaining[0]) : cur;
      });
    },
    [tabs],
  );

  const active = tabs.find((t) => tabKey(t) === activeKey) ?? tabs[0];

  return (
    <div className={cn("flex h-full min-h-0", className)}>
      {railOpen && (
        <DocumentsListRail
          currentConversationId={conversationId}
          onOpen={openDoc}
          onCollapse={() => setRailOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Tab strip */}
        <div className="flex shrink-0 items-center gap-0.5 border-b border-border bg-card/40 px-1 py-1">
          {!railOpen && (
            <button
              type="button"
              onClick={() => setRailOpen(true)}
              aria-label="Show document list"
              title="Show document list"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-none">
            {tabs.map((t) => {
              const key = tabKey(t);
              const isActive = key === activeKey;
              const isScratch = t.kind === "scratch";
              return (
                <div
                  key={key}
                  className={cn(
                    "group flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                    isActive
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setActiveKey(key)}
                    className="flex items-center gap-1"
                  >
                    {isScratch ? (
                      <Lock className="h-3 w-3 shrink-0" />
                    ) : (
                      <FileText className="h-3 w-3 shrink-0" />
                    )}
                    <span className="max-w-[140px] truncate">
                      {t.label ??
                        (isScratch ? "Scratchpad" : "Working document")}
                    </span>
                  </button>
                  {t.closable && (
                    <button
                      type="button"
                      onClick={() => closeTab(key)}
                      aria-label="Close tab"
                      className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Active document — the existing panel. The header keeps its action
            toolbar but DROPS its title: the tab strip already names the doc, so
            showing it again would be a third nested "Working document" heading. */}
        <div className="min-h-0 flex-1">
          <WorkingDocumentPanel
            key={tabKey(active)}
            conversationId={active.conversationId}
            kind={active.kind}
            showHeader
            showHeaderTitle={false}
            showOpenInWindow={false}
            showEnableToggle
            surfaceContext={
              active.conversationId === conversationId
                ? surfaceContext
                : undefined
            }
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}
