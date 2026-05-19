"use client";

/**
 * StreamDebugHistoryWindow
 *
 * Layout:
 *   LEFT SIDEBAR — scrollable list of every conversation that ever had a request.
 *                  Click one to make it active.
 *   MAIN AREA    — the selected conversation's requests shown as tabs (#1, #2, …).
 *                  Each tab shows the full stream debug detail for that request
 *                  (Timeline, Raw, Text, Tools, Blocks, etc.).
 *
 * All request-level rendering is done inline here so we control the tab paradigm.
 * We reuse the tab-content sub-components from StreamDebugPanel via a re-export.
 */

import React, { useCallback, useState } from "react";
import { Activity, MessageSquare, Copy, Check, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { StreamDebugPanel } from "@/features/agents/components/debug/StreamDebugPanel";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceStatus } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectConversationRequestIds } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { cn } from "@/lib/utils";
import { shallowEqual } from "react-redux";

// ─── Copy helper ──────────────────────────────────────────────────────────────

function useCopyText(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return { copied, copy };
}

// ─── Status badge colours (mirrors StreamDebugPanel) ─────────────────────────

const INSTANCE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-400",
  ready: "bg-cyan-500/20 text-cyan-400",
  running: "bg-yellow-500/20 text-yellow-400",
  streaming: "bg-blue-500/20 text-blue-400 animate-pulse",
  paused: "bg-orange-500/20 text-orange-400",
  complete: "bg-green-500/20 text-green-400",
  error: "bg-red-500/20 text-red-400",
};

const REQUEST_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-500/20 text-gray-400",
  connecting: "bg-yellow-500/20 text-yellow-400",
  streaming: "bg-blue-500/20 text-blue-400 animate-pulse",
  "awaiting-tools": "bg-orange-500/20 text-orange-400",
  complete: "bg-green-500/20 text-green-400",
  error: "bg-red-500/20 text-red-400",
  timeout: "bg-red-500/20 text-red-400",
};

// ─── Sidebar row for one conversation ────────────────────────────────────────

function ConversationSidebarRow({
  conversationId,
  isSelected,
  onSelect,
}: {
  conversationId: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const instanceStatus = useAppSelector(selectInstanceStatus(conversationId));
  const requestIds = useAppSelector(
    selectConversationRequestIds(conversationId),
  );
  const latestRequest = useAppSelector((state) => {
    const ids = state.activeRequests.byConversationId[conversationId];
    if (!ids || ids.length === 0) return undefined;
    return state.activeRequests.byRequestId[ids[ids.length - 1]];
  });

  const { copied, copy } = useCopyText(conversationId);
  const shortId = conversationId.slice(0, 8) + "…";
  const reqStatus = latestRequest?.status;
  const eventCount = latestRequest?.timeline.length ?? 0;
  const hasError = latestRequest?.error?.message != null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={cn(
        "flex items-start gap-1.5 w-full px-2 py-2 cursor-pointer select-none transition-colors border-l-2 group text-left",
        isSelected
          ? "border-primary bg-primary/8"
          : "border-transparent hover:bg-muted/40",
      )}
    >
      <MessageSquare
        className={cn(
          "h-3 w-3 shrink-0 mt-0.5",
          isSelected ? "text-primary" : "text-muted-foreground",
        )}
      />
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1 min-w-0">
          <span
            className={cn(
              "text-[11px] font-mono truncate flex-1",
              isSelected ? "text-primary font-medium" : "text-foreground",
            )}
          >
            {shortId}
          </span>
          {hasError && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0"
              title="Error"
            />
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {reqStatus && (
            <Badge
              variant="outline"
              className={cn(
                "text-[8px] px-1 py-0 h-3.5 border-0 shrink-0",
                REQUEST_STATUS_COLORS[reqStatus] ?? "",
              )}
            >
              {reqStatus}
            </Badge>
          )}
          {instanceStatus && (
            <Badge
              variant="outline"
              className={cn(
                "text-[8px] px-1 py-0 h-3.5 border-0 shrink-0",
                INSTANCE_STATUS_COLORS[instanceStatus] ?? "",
              )}
            >
              {instanceStatus}
            </Badge>
          )}
          {requestIds.length > 1 && (
            <span className="text-[9px] text-muted-foreground/60 font-mono shrink-0">
              {requestIds.length}req
            </span>
          )}
          {eventCount > 0 && (
            <span className="text-[9px] text-muted-foreground/50 font-mono shrink-0">
              {eventCount}ev
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          copy();
        }}
        className="opacity-0 group-hover:opacity-100 h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-all shrink-0 mt-0.5"
        title="Copy conversation ID"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function StreamDebugSidebar({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // Active (streaming/running) conversations first, then rest sorted by recency
  const sortedIds = useAppSelector((state) => {
    const byConv = state.activeRequests.byConversationId;
    const byReq = state.activeRequests.byRequestId;

    const withLatest = Object.keys(byConv).map((cid) => {
      const ids = byConv[cid];
      const latest = ids.length > 0 ? byReq[ids[ids.length - 1]] : undefined;
      return {
        cid,
        status: latest?.status,
        startedAt: latest?.startedAt ?? "",
      };
    });

    const active = withLatest
      .filter(
        (x) =>
          x.status === "streaming" ||
          x.status === "connecting" ||
          x.status === "pending",
      )
      .map((x) => x.cid);

    const rest = withLatest
      .filter((x) => !active.includes(x.cid))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((x) => x.cid);

    return [...active, ...rest];
  }, shallowEqual);

  const totalCount = sortedIds.length;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {sortedIds.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground px-3 text-center">
          <Radio className="h-6 w-6 opacity-20" />
          <span className="text-xs">No stream data yet</span>
          <span className="text-[11px] opacity-60">
            Run an agent to see stream debug data here
          </span>
        </div>
      ) : (
        <>
          <div className="px-2 pt-2 pb-0.5 shrink-0">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Conversations ({totalCount})
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {sortedIds.map((id) => (
              <ConversationSidebarRow
                key={id}
                conversationId={id}
                isSelected={selectedId === id}
                onSelect={() => onSelect(id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Window inner ─────────────────────────────────────────────────────────────

function StreamDebugHistoryWindowInner({
  onClose,
  initialConversationId,
}: {
  onClose: () => void;
  initialConversationId: string | null;
}) {
  // Seed with the most recent conversation if none specified
  const firstConversationId = useAppSelector((state) => {
    if (initialConversationId) return initialConversationId;
    const keys = Object.keys(state.activeRequests.byConversationId);
    return keys[keys.length - 1] ?? null;
  });

  const [activeId, setActiveId] = useState<string | null>(firstConversationId);

  const totalConversations = useAppSelector(
    (state) => Object.keys(state.activeRequests.byConversationId).length,
  );

  const collectData = useCallback(
    (): Record<string, unknown> => ({ initialConversationId: activeId }),
    [activeId],
  );

  return (
    <WindowPanel
      id="stream-debug-history-window"
      title="Stream History"
      actionsRight={
        totalConversations > 0 ? (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-4 font-mono mr-1"
          >
            {totalConversations}
          </Badge>
        ) : undefined
      }
      onClose={onClose}
      width={900}
      height={640}
      minWidth={560}
      minHeight={360}
      overlayId="streamDebugHistoryWindow"
      onCollectData={collectData}
      bodyClassName="p-0"
      sidebar={
        <StreamDebugSidebar selectedId={activeId} onSelect={setActiveId} />
      }
      sidebarDefaultSize={200}
      sidebarMinSize={150}
      defaultSidebarOpen
    >
      {activeId ? (
        // StreamDebugPanel already shows per-request tabs (#1, #2, …) internally.
        // It also shows the Timeline/Raw/Text/Tools tabs per request.
        // The sidebar is the conversation switcher — no extra tab layer needed here.
        <StreamDebugPanel conversationId={activeId} className="h-full" />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
          <Activity className="h-10 w-10 opacity-15" />
          <div className="space-y-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No conversation selected
            </p>
            <p className="text-xs opacity-60">
              Select a conversation from the sidebar to view its stream data.
            </p>
          </div>
        </div>
      )}
    </WindowPanel>
  );
}

// ─── Window shell ─────────────────────────────────────────────────────────────

interface StreamDebugHistoryWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialConversationId?: string | null;
}

export default function StreamDebugHistoryWindow({
  isOpen,
  onClose,
  initialConversationId,
}: StreamDebugHistoryWindowProps) {
  if (!isOpen) return null;
  return (
    <StreamDebugHistoryWindowInner
      onClose={onClose}
      initialConversationId={initialConversationId ?? null}
    />
  );
}
