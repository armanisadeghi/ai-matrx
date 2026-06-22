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
 * Layout:
 *   - Left sidebar (`EntrySidebar`)  — one row per entry, dense list with
 *     status dot. Hidden by default for single-entry groups.
 *   - Main pane                       — browser-style tab strip (top) +
 *     active tab body (below). Tabs are assembled from
 *     `getOverlayTabs(toolName)` for the selected entry, falling back to
 *     `[Results, Input, Raw]` when no custom tabs are registered (or on
 *     entry error / multi-tool view).
 *
 * Window registration:
 *   - `ephemeral: true` — never persisted; live tool data can't survive
 *     a reload.
 *   - `instanceMode: "multi"` — multiple side-by-side windows allowed.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

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

// ─── Tab descriptor used by the browser-tab strip ─────────────────────────────

interface ToolTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

// ─── Entry sidebar ────────────────────────────────────────────────────────────

const EntrySidebar: React.FC<{
  entries: ToolLifecycleEntry[];
  selectedCallId: string;
  onSelect: (callId: string) => void;
}> = ({ entries, selectedCallId, onSelect }) => {
  return (
    <div className="flex flex-col h-full overflow-y-auto py-1.5">
      {entries.length === 0 ? (
        <div className="px-3 py-4 text-xs text-muted-foreground italic">
          No tool entries
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
                "flex items-center gap-2 px-2.5 py-1.5 mx-1 rounded-md text-left text-xs transition-colors border",
                isActive
                  ? "bg-primary/10 text-foreground border-primary/30"
                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              title={`${label} — ${entry.status}`}
            >
              <span className="flex-shrink-0 opacity-60 font-mono w-4 text-right">
                {idx + 1}.
              </span>
              <span className="flex-1 truncate font-medium">{label}</span>
              <span className="flex-shrink-0">
                {isError ? (
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                ) : isRunning ? (
                  <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                ) : isComplete ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <span className="block w-2 h-2 rounded-full bg-muted-foreground/40" />
                )}
              </span>
            </button>
          );
        })
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
      className="flex items-stretch h-[34px] min-h-[34px] overflow-x-auto overflow-y-hidden bg-gray-100 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700 shrink-0"
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
              "relative flex items-center gap-1.5 px-3 h-full border-r border-gray-300 dark:border-gray-700 shrink-0 cursor-pointer select-none transition-colors",
              isActive
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                : "bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60",
            )}
          >
            {isActive && (
              <span className="absolute inset-x-0 top-0 h-[2px] bg-blue-500 rounded-b-none" />
            )}
            <span className="text-xs font-medium truncate max-w-[160px] leading-none">
              {tab.label}
            </span>
          </div>
        );
      })}
      <div className="flex-1 min-w-0" />
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
}

// ─── Inner body — receives the resolved entries (live or snapshot) ────────────

const ToolCallWindowPanelBody: React.FC<{
  instanceId: string;
  onClose: () => void;
  entries: ToolLifecycleEntry[];
  initialCallId: string | null;
  initialTab: string | null;
}> = ({ instanceId, onClose, entries, initialCallId, initialTab }) => {
  // Selected entry — initialised from prop, falls back to last entry, kept
  // valid when entries shift (new entries arrive on the live stream).
  const [selectedCallId, setSelectedCallId] = useState<string>(() => {
    if (initialCallId && entries.some((e) => e.callId === initialCallId)) {
      return initialCallId;
    }
    return entries[entries.length - 1]?.callId ?? "";
  });

  // Re-focus when the parent re-dispatches openOverlay with a new
  // `initialCallId` (e.g. user clicked the window button on a different
  // tool while the same per-request window is already open). We only
  // honour it when the requested entry is actually present.
  const lastFocusedRef = useRef<string | null>(initialCallId);
  useEffect(() => {
    if (!initialCallId) return;
    if (initialCallId === lastFocusedRef.current) return;
    if (entries.some((e) => e.callId === initialCallId)) {
      lastFocusedRef.current = initialCallId;
      setSelectedCallId(initialCallId);
    }
  }, [initialCallId, entries]);

  useEffect(() => {
    if (entries.length === 0) {
      if (selectedCallId !== "") setSelectedCallId("");
      return;
    }
    if (!entries.some((e) => e.callId === selectedCallId)) {
      setSelectedCallId(entries[entries.length - 1].callId);
    }
  }, [entries, selectedCallId]);

  const selectedEntry = useMemo(
    () =>
      entries.find((e) => e.callId === selectedCallId) ?? entries[0] ?? null,
    [entries, selectedCallId],
  );

  // Custom tabs only when:
  //   1. The group contains exactly one entry.
  //   2. That entry is not in error state.
  //   3. The tool's registry record provides OverlayTabs.
  const customOverlayTabs: ToolOverlayTabSpec[] | null = useMemo(() => {
    if (entries.length !== 1) return null;
    if (!selectedEntry) return null;
    if (selectedEntry.status === "error") return null;
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

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    if (initialTab && tabs.some((t) => t.id === initialTab)) return initialTab;
    return tabs[0]?.id ?? "results";
  });

  // Keep activeTabId valid as the tab list changes (e.g. selected entry
  // toggles between custom-tabs and the default Results tab).
  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTabId)) {
      setActiveTabId(tabs[0]?.id ?? "results");
    }
  }, [tabs, activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const title = useMemo(() => {
    if (!selectedEntry) {
      if (entries.length > 1) return `${entries.length} Tools`;
      return "Tool Results";
    }
    return getToolDisplayName(selectedEntry.toolName);
  }, [entries.length, selectedEntry]);

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
      sidebar={
        <EntrySidebar
          entries={entries}
          selectedCallId={selectedCallId}
          onSelect={setSelectedCallId}
        />
      }
      sidebarDefaultSize={140}
      sidebarMinSize={80}
      defaultSidebarOpen={true}
      bodyClassName="p-0 overflow-hidden"
    >
      <div className="flex flex-col h-full overflow-hidden">
        <ToolBrowserTabBar
          tabs={tabs}
          activeTabId={activeTab?.id ?? ""}
          onTabClick={setActiveTabId}
        />
        <div className="flex-1 min-h-0 overflow-auto">
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
}) => {
  if (!isOpen) return null;

  // Live mode is selected by `requestId` ALONE — the opener signals "show every
  // tool in this request" with `callIds: []` (LiveEntriesProvider returns all
  // when callIds is empty). Requiring `callIds.length > 0` here was the
  // window-panel-empty bug: the opener's `callIds: []` fell through to snapshot
  // mode with `entries: null`. If the live store has been pruned (e.g. after
  // reload — observability rehydrate drops `toolLifecycle`), fall back to the
  // snapshot `entries` the opener now always passes.
  if (requestId) {
    return (
      <LiveEntriesProvider
        requestId={requestId}
        callIds={callIds}
        render={(liveEntries) => (
          <ToolCallWindowPanelBody
            instanceId={instanceId}
            onClose={onClose}
            entries={liveEntries.length > 0 ? liveEntries : (entries ?? [])}
            initialCallId={initialCallId}
            initialTab={initialTab}
          />
        )}
      />
    );
  }

  return (
    <ToolCallWindowPanelBody
      instanceId={instanceId}
      onClose={onClose}
      entries={entries ?? []}
      initialCallId={initialCallId}
      initialTab={initialTab}
    />
  );
};

export default ToolCallWindowPanel;
