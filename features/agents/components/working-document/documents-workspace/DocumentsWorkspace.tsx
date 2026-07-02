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

import { useCallback, useEffect, useState } from "react";
import { FileText, Lock, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { WorkingDocumentKind } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import { selectWorkingDocBinding } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import {
  detachWorkspaceDocumentThunk,
  listAttachedDocumentTabsThunk,
  openWorkspaceDocumentThunk,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
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
  /** The durable document id (attached tabs — needed to detach the edge). */
  documentId?: string;
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
  /** Which base tab is active on mount. Defaults to the working document. */
  initialKind?: WorkingDocumentKind;
  /** Host page context carried into each current-conversation tab's surface. */
  surfaceContext?: WorkingDocumentSurfaceContext;
  /** Show the recent-docs rail by default. */
  defaultRailOpen?: boolean;
  className?: string;
}

export function DocumentsWorkspace({
  conversationId,
  initialKind = "working",
  surfaceContext,
  defaultRailOpen = false,
  className,
}: DocumentsWorkspaceProps) {
  const dispatch = useAppDispatch();
  const [tabs, setTabs] = useState<DocTab[]>(() => [
    { conversationId, kind: "working", closable: false },
    { conversationId, kind: "scratch", closable: false },
  ]);
  const [activeKey, setActiveKey] = useState(() =>
    tabKey({ conversationId, kind: initialKind }),
  );
  const [railOpen, setRailOpen] = useState(defaultRailOpen);

  // Restore this conversation's ATTACHED documents (persisted association
  // edges) as tabs on mount — the thunk also loads each one's content into its
  // origin slice entry so the tab renders.
  useEffect(() => {
    let cancelled = false;
    void dispatch(listAttachedDocumentTabsThunk({ conversationId }))
      .unwrap()
      .then((restored) => {
        if (cancelled || restored.length === 0) return;
        setTabs((prev) => {
          const open = new Set(prev.map(tabKey));
          const added = restored
            .filter((r) => !open.has(tabKey(r)))
            .map((r) => ({
              conversationId: r.conversationId,
              kind: r.kind,
              label: r.title?.trim() || kindLabel(r.kind),
              closable: true,
              documentId: r.documentId,
            }));
          return added.length ? [...prev, ...added] : prev;
        });
      })
      .catch((err: unknown) => {
        console.error("[documents-workspace] attached-tab restore failed", {
          conversationId,
          err,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, conversationId]);

  // The base tabs' current bindings — a rail doc that IS the conversation's
  // primary (linked/adopted) doc activates its base tab instead of opening the
  // same document under a second tab.
  const workingBinding = useAppSelector(
    selectWorkingDocBinding(conversationId, "working"),
  );
  const scratchBinding = useAppSelector(
    selectWorkingDocBinding(conversationId, "scratch"),
  );

  const openDoc = useCallback(
    (sel: DocumentsRailSelection) => {
      const boundKind =
        workingBinding.kind === "cx_working_document" &&
        workingBinding.id === sel.documentId
          ? "working"
          : scratchBinding.kind === "cx_working_document" &&
              scratchBinding.id === sel.documentId
            ? "scratch"
            : null;
      if (boundKind) {
        setActiveKey(tabKey({ conversationId, kind: boundKind }));
        return;
      }
      const key = tabKey(sel);
      const alreadyOpen = tabs.some((t) => tabKey(t) === key);
      if (!alreadyOpen) {
        // Cross-conversation doc: load its content into its origin slice entry
        // and persist the attach edge so the tab restores on the next mount.
        // (Idempotent — safe if the edge already exists.)
        if (sel.conversationId !== conversationId) {
          void dispatch(
            openWorkspaceDocumentThunk({
              documentId: sel.documentId,
              attachTo: conversationId,
            }),
          );
        }
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
                  documentId: sel.documentId,
                },
              ],
        );
      }
      setActiveKey(key);
    },
    [tabs, conversationId, dispatch, workingBinding, scratchBinding],
  );

  const closeTab = useCallback(
    (key: string) => {
      // Closing an attached tab also removes its persisted edge (keeps the
      // doc) — otherwise it silently reappears on the next mount.
      const target = tabs.find((t) => tabKey(t) === key);
      if (target?.closable && target.documentId) {
        void dispatch(
          detachWorkspaceDocumentThunk({
            conversationId,
            documentId: target.documentId,
          }),
        );
      }
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
    [tabs, conversationId, dispatch],
  );

  const active = tabs.find((t) => tabKey(t) === activeKey) ?? tabs[0];

  // What the rail needs to render attach/detach/swap state: which docs are open
  // (so it can mark them active + offer Detach), and which of those can close
  // (the conversation's own working + scratch are permanent, never detachable).
  const openKeys = new Set(tabs.map(tabKey));
  const closableKeys = new Set(tabs.filter((t) => t.closable).map(tabKey));

  return (
    <div className={cn("flex h-full min-h-0", className)}>
      {railOpen && (
        <DocumentsListRail
          currentConversationId={conversationId}
          activeKey={activeKey}
          openKeys={openKeys}
          closableKeys={closableKeys}
          onOpen={openDoc}
          onDetach={closeTab}
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
