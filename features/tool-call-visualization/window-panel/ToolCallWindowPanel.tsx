"use client";

/**
 * ToolCallWindowPanel
 *
 * Generic, draggable WindowPanel surface for any tool call group. Mounted
 * via the `toolCallWindow` registry entry — driven entirely by the same
 * v3 OverlayTabs contract `ToolUpdatesOverlay` consumes.
 *
 * Two data modes:
 *   - LIVE (preferred): props carry `requestId` + `callIds[]`. The panel
 *     subscribes to ordered tool lifecycle entries for the request and
 *     filters down to the listed callIds — preserves emission order and
 *     keeps updating as new events stream in.
 *   - SNAPSHOT: props carry an `entries` array (post-stream / persisted
 *     callers without an active request). No live subscription.
 *
 * Sidebar scope:
 *   - Current — tools for the current request / snapshot (default).
 *   - All — every tool call in the conversation (cached + paged).
 *
 * Layout:
 *   - Left sidebar (`EntrySidebar`)  — scope toggle + one row per entry.
 *   - Main pane                       — browser-style tab strip + body.
 *   - Header actions                  — Copy / Copy for AI for ALL listed tools.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  LoaderCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { upsertToolCall } from "@/features/agents/redux/execution-system/observability/observability.slice";
import {
  EMPTY_TOOL_CALLS,
  selectToolCallsForConversation,
} from "@/features/agents/redux/execution-system/observability/observability.selectors";
import { selectLiveToolLifecycleByConversation } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { RootState } from "@/lib/redux/store";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

import { getOverlayTabs, getToolDisplayName } from "../registry/registry";
import type { ToolOverlayTabSpec } from "../types";
import {
  CustomOverlayBody,
  EntryResultsBody,
  InputView,
  RawDataView,
} from "../components/ToolTabBodies";
import { useOrderedToolLifecycles } from "../redux/hooks";
import { cxToolCallToLifecycleEntry } from "../utils/cxToolCallToLifecycleEntry";
import {
  buildToolEntriesSummary,
  entryHasError,
  toolEntriesSummaryToHuman,
} from "../utils/toolEntryBundle";
import {
  CONVERSATION_TOOL_CALL_PAGE_SIZE,
  fetchConversationToolCallsPage,
} from "../service/fetchConversationToolCalls";

// ─── Tab descriptor used by the browser-tab strip ─────────────────────────────

interface ToolTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

type SidebarScope = "message" | "conversation";

// ─── Entry sidebar ────────────────────────────────────────────────────────────

const EntrySidebar: React.FC<{
  entries: ToolLifecycleEntry[];
  selectedCallId: string;
  onSelect: (callId: string) => void;
  scope: SidebarScope;
  onScopeChange: (scope: SidebarScope) => void;
  conversationScopeAvailable: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}> = ({
  entries,
  selectedCallId,
  onSelect,
  scope,
  onScopeChange,
  conversationScopeAvailable,
  loadingMore,
  hasMore,
  onLoadMore,
}) => {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {conversationScopeAvailable && (
        <div className="flex-shrink-0 border-b border-border p-2">
          <ToggleGroup
            type="single"
            value={scope}
            onValueChange={(v) => {
              if (v === "message" || v === "conversation") onScopeChange(v);
            }}
            className="grid w-full grid-cols-2 gap-1 rounded-md bg-muted/60 p-0.5"
          >
            <ToggleGroupItem
              value="message"
              className="h-7 whitespace-nowrap rounded px-2 text-xs font-medium data-[state=on]:bg-background data-[state=on]:shadow-sm"
            >
              Current
            </ToggleGroupItem>
            <ToggleGroupItem
              value="conversation"
              className="h-7 whitespace-nowrap rounded px-2 text-xs font-medium data-[state=on]:bg-background data-[state=on]:shadow-sm"
            >
              All
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {entries.length === 0 ? (
          <div className="px-3 py-4 text-xs italic text-muted-foreground">
            {loadingMore ? "Loading tool calls…" : "No tool entries"}
          </div>
        ) : (
          entries.map((entry, idx) => {
            const isActive = entry.callId === selectedCallId;
            const label = getToolDisplayName(entry.toolName);
            const isError = entry.status === "error";
            const isRunning =
              entry.status === "started" ||
              entry.status === "progress" ||
              entry.status === "step";
            const isComplete = entry.status === "completed";
            return (
              <button
                key={entry.callId}
                type="button"
                onClick={() => onSelect(entry.callId)}
                className={cn(
                  "mx-1 flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                  isActive
                    ? "border-primary/30 bg-primary/10 text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                title={`${label} — ${entry.status}`}
              >
                <span className="w-4 flex-shrink-0 text-right font-mono opacity-60">
                  {idx + 1}.
                </span>
                <span className="flex-1 truncate font-medium">{label}</span>
                <span className="flex-shrink-0">
                  {isError ? (
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                  ) : isRunning ? (
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  ) : isComplete ? (
                    <CheckCircle className="h-3 w-3 text-success" />
                  ) : (
                    <span className="block h-2 w-2 rounded-full bg-muted-foreground/40" />
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>

      {scope === "conversation" && (hasMore || loadingMore) && (
        <div className="flex-shrink-0 border-t border-border p-1.5">
          <button
            type="button"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            {loadingMore ? (
              <>
                <LoaderCircle className="h-3 w-3 animate-spin" />
                Loading…
              </>
            ) : (
              `Load older (${CONVERSATION_TOOL_CALL_PAGE_SIZE})`
            )}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Browser-style tab bar ────────────────────────────────────────────────────

const ToolBrowserTabBar: React.FC<{
  tabs: ToolTab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
}> = ({ tabs, activeTabId, onTabClick }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current || !activeTabId) return;
    const el = scrollRef.current.querySelector<HTMLElement>(
      "[data-active='true']",
    );
    el?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTabId]);

  if (tabs.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      role="tablist"
      aria-label="Tool result views"
      className="flex h-[34px] min-h-[34px] shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-border bg-muted/40"
      style={{ scrollbarWidth: "none" }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            data-active={isActive}
            onClick={() => onTabClick(tab.id)}
            className={cn(
              "relative flex h-full shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-border px-3 transition-colors",
              isActive
                ? "bg-background text-foreground"
                : "bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {isActive && (
              <span className="absolute inset-x-0 top-0 h-[2px] bg-primary" />
            )}
            <span className="max-w-[160px] truncate text-xs font-medium leading-none">
              {tab.label}
            </span>
          </div>
        );
      })}
      <div className="min-w-0 flex-1" />
    </div>
  );
};

// ─── Live entries shell (only mounted when requestId is present) ──────────────

const LiveEntriesProvider: React.FC<{
  requestId: string;
  callIds: string[];
  render: (entries: ToolLifecycleEntry[]) => React.ReactNode;
}> = ({ requestId, callIds, render }) => {
  const all = useOrderedToolLifecycles(requestId);
  const filtered = useMemo(() => {
    if (callIds.length === 0) return all;
    const allowed = new Set(callIds);
    return all.filter((e) => allowed.has(e.callId));
  }, [all, callIds]);
  return <>{render(filtered)}</>;
};

// ─── Conversation-wide entries (All Messages) ─────────────────────────────────

function useConversationToolEntries(
  conversationId: string | null,
  enabled: boolean,
): {
  entries: ToolLifecycleEntry[];
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
} {
  const dispatch = useAppDispatch();

  // Factory selectors — memoize the instance so createSelector's cache survives
  // across dispatches (inline factory() inside useAppSelector recreates it every
  // call → new array/Map refs → Reselect stability warnings + wasted rerenders).
  const selectPersisted = useMemo(
    () =>
      conversationId
        ? selectToolCallsForConversation(conversationId)
        : (_state: RootState) => EMPTY_TOOL_CALLS,
    [conversationId],
  );
  const persisted = useAppSelector(selectPersisted);

  // Live overlays: any in-flight toolLifecycle for this conversation wins
  // over the persisted row for the same callId.
  const selectLiveByCallId = useMemo(
    () =>
      conversationId && enabled
        ? selectLiveToolLifecycleByConversation(conversationId)
        : (_state: RootState) => null as Map<string, ToolLifecycleEntry> | null,
    [conversationId, enabled],
  );
  const liveByCallId = useAppSelector(selectLiveByCallId);

  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const fetchedOnceRef = useRef<string | null>(null);

  // Initial page when switching to All Messages — fill gaps beyond the
  // conversation-bundle cache (which is message-page scoped).
  useEffect(() => {
    if (!enabled || !conversationId) return;
    if (fetchedOnceRef.current === conversationId) return;
    fetchedOnceRef.current = conversationId;

    let cancelled = false;
    setLoadingMore(true);
    void fetchConversationToolCallsPage(conversationId, {
      limit: CONVERSATION_TOOL_CALL_PAGE_SIZE,
    })
      .then((page) => {
        if (cancelled) return;
        if (page.records.length > 0) {
          // upsert (not merge) — mergeToolCalls skips existing ids and would
          // leave incomplete stream stubs forever even after the DB has the
          // final output/error. Live in-flight entries still win at display
          // time via liveByCallId overlay below.
          for (const record of page.records) {
            dispatch(upsertToolCall(record));
          }
        }
        setHasMore(page.hasMore);
        setOldestCursor(page.oldestStartedAt);
      })
      .catch(() => {
        if (!cancelled) setHasMore(false);
      })
      .finally(() => {
        if (!cancelled) setLoadingMore(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, conversationId, dispatch]);

  const loadMore = () => {
    if (!conversationId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    void fetchConversationToolCallsPage(conversationId, {
      limit: CONVERSATION_TOOL_CALL_PAGE_SIZE,
      beforeStartedAt: oldestCursor,
    })
      .then((page) => {
        if (page.records.length > 0) {
          // upsert (not merge) — mergeToolCalls skips existing ids and would
          // leave incomplete stream stubs forever even after the DB has the
          // final output/error. Live in-flight entries still win at display
          // time via liveByCallId overlay below.
          for (const record of page.records) {
            dispatch(upsertToolCall(record));
          }
        }
        setHasMore(page.hasMore);
        if (page.oldestStartedAt) setOldestCursor(page.oldestStartedAt);
      })
      .catch((err) => {
        console.error("[ToolCallWindowPanel] loadMore failed", err);
      })
      .finally(() => setLoadingMore(false));
  };

  const entries = useMemo(() => {
    if (!enabled) return [] as ToolLifecycleEntry[];
    const byCallId = new Map<string, ToolLifecycleEntry>();
    for (const rec of persisted) {
      byCallId.set(rec.callId, cxToolCallToLifecycleEntry(rec));
    }
    if (liveByCallId) {
      for (const [callId, entry] of liveByCallId) {
        byCallId.set(callId, entry);
      }
    }
    const list = Array.from(byCallId.values());
    list.sort((a, b) => {
      if (a.startedAt < b.startedAt) return -1;
      if (a.startedAt > b.startedAt) return 1;
      return 0;
    });
    return list;
  }, [enabled, persisted, liveByCallId]);

  return { entries, loadingMore, hasMore, loadMore };
}

// ─── Public props ─────────────────────────────────────────────────────────────

interface ToolCallWindowPanelProps {
  isOpen: boolean;
  instanceId: string;
  onClose: () => void;
  requestId: string | null;
  callIds: string[];
  entries: ToolLifecycleEntry[] | null;
  initialCallId: string | null;
  initialTab: string | null;
  conversationId: string | null;
}

// ─── Inner body — receives the resolved entries (live or snapshot) ────────────

const ToolCallWindowPanelBody: React.FC<{
  instanceId: string;
  onClose: () => void;
  messageEntries: ToolLifecycleEntry[];
  initialCallId: string | null;
  initialTab: string | null;
  conversationId: string | null;
}> = ({
  instanceId,
  onClose,
  messageEntries,
  initialCallId,
  initialTab,
  conversationId,
}) => {
  const [scope, setScope] = useState<SidebarScope>("message");
  const conversationScopeAvailable = Boolean(conversationId);

  const {
    entries: conversationEntries,
    loadingMore,
    hasMore,
    loadMore,
  } = useConversationToolEntries(
    conversationId,
    scope === "conversation" && conversationScopeAvailable,
  );

  const entries =
    scope === "conversation" && conversationScopeAvailable
      ? conversationEntries
      : messageEntries;

  // User pick (null = follow initialCallId, else last entry).
  const [userSelectedCallId, setUserSelectedCallId] = useState<string | null>(
    null,
  );
  const [boundInitialCallId, setBoundInitialCallId] = useState(initialCallId);
  if (initialCallId !== boundInitialCallId) {
    setBoundInitialCallId(initialCallId);
    setUserSelectedCallId(null);
  }

  const selectedCallId = useMemo(() => {
    if (
      userSelectedCallId &&
      entries.some((e) => e.callId === userSelectedCallId)
    ) {
      return userSelectedCallId;
    }
    if (initialCallId && entries.some((e) => e.callId === initialCallId)) {
      return initialCallId;
    }
    return entries[entries.length - 1]?.callId ?? "";
  }, [entries, userSelectedCallId, initialCallId]);

  const selectedEntry = useMemo(
    () =>
      entries.find((e) => e.callId === selectedCallId) ?? entries[0] ?? null,
    [entries, selectedCallId],
  );

  const customOverlayTabs: ToolOverlayTabSpec[] | null = useMemo(() => {
    if (entries.length !== 1) return null;
    if (!selectedEntry) return null;
    if (entryHasError(selectedEntry)) return null;
    return getOverlayTabs(selectedEntry.toolName);
  }, [entries.length, selectedEntry]);

  const tabs: ToolTab[] = useMemo(() => {
    const adminTabs: ToolTab[] = [
      {
        id: "input",
        label: "Input",
        content: selectedEntry ? (
          <InputView entry={selectedEntry} />
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-sm">No tool data available</p>
          </div>
        ),
      },
      {
        id: "raw",
        label: "Raw",
        content: selectedEntry ? (
          <RawDataView entry={selectedEntry} />
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-sm">No tool data available</p>
          </div>
        ),
      },
    ];

    if (customOverlayTabs && selectedEntry) {
      const customTabDefs: ToolTab[] = customOverlayTabs.map((spec) => ({
        id: spec.id,
        label: spec.label,
        content: (
          <CustomOverlayBody entry={selectedEntry} Component={spec.Component} />
        ),
      }));
      return [...customTabDefs, ...adminTabs];
    }

    return [
      {
        id: "results",
        label: "Results",
        content: <EntryResultsBody entry={selectedEntry} />,
      },
      ...adminTabs,
    ];
  }, [customOverlayTabs, selectedEntry]);

  const [userTabId, setUserTabId] = useState<string | null>(initialTab);
  const activeTabId = useMemo(() => {
    if (userTabId && tabs.some((t) => t.id === userTabId)) return userTabId;
    if (initialTab && tabs.some((t) => t.id === initialTab)) return initialTab;
    return tabs[0]?.id ?? "results";
  }, [userTabId, tabs, initialTab]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const title = useMemo(() => {
    if (!selectedEntry) {
      if (entries.length > 1) return `${entries.length} Tools`;
      return "Tool Results";
    }
    return getToolDisplayName(selectedEntry.toolName);
  }, [entries.length, selectedEntry]);

  const copyAllActions =
    entries.length > 0 ? (
      <CopyButtons
        label={
          scope === "conversation"
            ? `All ${entries.length} tools in conversation`
            : `All ${entries.length} tools in this message`
        }
        size="sm"
        human={() => toolEntriesSummaryToHuman(entries)}
        agent={() => ({
          kind: "tool-results",
          location: "AI Matrx — Tool call window",
          description:
            scope === "conversation"
              ? `Every tool call in conversation ${conversationId ?? ""}.`
              : "Every tool call in this message / request.",
          data: buildToolEntriesSummary(entries),
          attributes: {
            count: String(entries.length),
            scope,
            ...(conversationId ? { conversationId } : {}),
          },
        })}
      />
    ) : null;

  return (
    <WindowPanel
      id={`tool-call-window-${instanceId}`}
      overlayId="toolCallWindow"
      title={title}
      onClose={onClose}
      minWidth={720}
      minHeight={460}
      width={1100}
      height={700}
      actionsRight={copyAllActions}
      sidebar={
        <EntrySidebar
          entries={entries}
          selectedCallId={selectedCallId}
          onSelect={setUserSelectedCallId}
          scope={scope}
          onScopeChange={(next) => {
            setScope(next);
            setUserSelectedCallId(null);
          }}
          conversationScopeAvailable={conversationScopeAvailable}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />
      }
      sidebarDefaultSize={168}
      sidebarMinSize={120}
      defaultSidebarOpen={true}
      bodyClassName="p-0 overflow-hidden"
    >
      <div className="flex h-full flex-col overflow-hidden">
        <ToolBrowserTabBar
          tabs={tabs}
          activeTabId={activeTab?.id ?? ""}
          onTabClick={setUserTabId}
        />
        <div className="min-h-0 flex-1 overflow-auto">
          {activeTab?.content ?? null}
        </div>
      </div>
    </WindowPanel>
  );
};

// ─── Default export — branches on live vs snapshot mode ───────────────────────

const ToolCallWindowPanel: React.FC<ToolCallWindowPanelProps> = ({
  isOpen,
  instanceId,
  onClose,
  requestId,
  callIds,
  entries,
  initialCallId,
  initialTab,
  conversationId,
}) => {
  if (!isOpen) return null;

  if (requestId) {
    return (
      <LiveEntriesProvider
        requestId={requestId}
        callIds={callIds}
        render={(liveEntries) => (
          <ToolCallWindowPanelBody
            instanceId={instanceId}
            onClose={onClose}
            messageEntries={
              liveEntries.length > 0 ? liveEntries : (entries ?? [])
            }
            initialCallId={initialCallId}
            initialTab={initialTab}
            conversationId={conversationId}
          />
        )}
      />
    );
  }

  return (
    <ToolCallWindowPanelBody
      instanceId={instanceId}
      onClose={onClose}
      messageEntries={entries ?? []}
      initialCallId={initialCallId}
      initialTab={initialTab}
      conversationId={conversationId}
    />
  );
};

export default ToolCallWindowPanel;
