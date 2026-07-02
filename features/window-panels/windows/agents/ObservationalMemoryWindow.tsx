"use client";

/**
 * ObservationalMemoryWindow
 *
 * Admin-only floating inspector for the Observational Memory feature.
 * Wraps `ObservationalMemoryCore` in the standard WindowPanel shell with a
 * sidebar listing every conversation the session has seen memory activity
 * for — that means either:
 *   - the conversation has a persisted `observational_memory` metadata block
 *     (hydrated on conversation load), OR
 *   - we have received at least one `memory_*` stream event for it this
 *     session, OR
 *   - an authoritative cost summary has been fetched for it.
 *
 * See `/window-panel-authoring` for the registration contract. This window is
 * persisted (NOT ephemeral) — admins get their last-selected conversation
 * back after a reload, matching the per-conversation nature of the feature.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Brain,
  MessageSquare,
  AlertCircle,
  Activity,
  Copy,
  Check,
  CircleDot,
  CircleOff,
} from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { ObservationalMemoryCore } from "@/features/agents/components/observational-memory/ObservationalMemoryCore";
import {
  selectAllObservationalMemoryConversations,
  selectIsMemoryEnabledForConversation,
  selectMemoryCounters,
  selectMemoryDegraded,
  selectMemoryMetadata,
} from "@/features/agents/redux/execution-system/observational-memory/observational-memory.selectors";
import { selectInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import type { RootState } from "@/lib/redux/store";

// =============================================================================
// Sidebar
// =============================================================================

interface SidebarRowData {
  conversationId: string;
  label: string;
  agentName: string | null;
  isEnabled: boolean;
  degraded: boolean;
  totalEvents: number;
  totalCost: number;
}

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

function SidebarRow({
  row,
  isSelected,
  onSelect,
}: {
  row: SidebarRowData;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { copied, copy } = useCopyText(row.conversationId);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={cn(
        "flex items-start gap-1.5 w-full px-2 py-1.5 cursor-pointer select-none transition-colors border-l-2 group",
        isSelected
          ? "border-primary bg-primary/8"
          : "border-transparent hover:bg-muted/40",
      )}
    >
      <div className="pt-[2px] shrink-0">
        {row.isEnabled ? (
          <CircleDot
            className={cn(
              "h-3 w-3",
              row.degraded ? "text-amber-500" : "text-emerald-500",
            )}
          />
        ) : (
          <CircleOff className="h-3 w-3 text-muted-foreground/60" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <MessageSquare
            className={cn(
              "h-3 w-3 shrink-0",
              isSelected ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span
            className={cn(
              "text-[11px] font-mono truncate flex-1 min-w-0",
              isSelected ? "text-primary" : "text-foreground",
            )}
          >
            {row.label}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              copy();
            }}
            className="opacity-0 group-hover:opacity-100 h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-all shrink-0"
            title="Copy conversation id"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
        {row.agentName && (
          <div className="text-[10px] text-muted-foreground truncate pl-4">
            {row.agentName}
          </div>
        )}
        <div className="flex items-center gap-2 pl-4 mt-0.5">
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Activity className="h-2.5 w-2.5" />
            {row.totalEvents}
          </span>
          {row.totalCost > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground">
              ${row.totalCost.toFixed(4)}
            </span>
          )}
          {row.degraded && (
            <span className="text-[10px] text-amber-500 font-medium">
              degraded
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MemorySidebarRowConnector({
  conversationId,
  isSelected,
  onSelect,
}: {
  conversationId: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const metadata = useAppSelector(selectMemoryMetadata(conversationId));
  const isEnabled = useAppSelector(
    selectIsMemoryEnabledForConversation(conversationId),
  );
  const degraded = useAppSelector(selectMemoryDegraded(conversationId));
  const counters = useAppSelector(selectMemoryCounters(conversationId));
  const instance = useAppSelector(selectInstance(conversationId));
  const agentName = useAppSelector((state: RootState) =>
    instance?.agentId
      ? (selectAgentById(state, instance.agentId)?.name ?? null)
      : null,
  );

  const row: SidebarRowData = {
    conversationId,
    label: conversationId.slice(0, 8) + "…",
    agentName,
    isEnabled,
    degraded,
    totalEvents: counters?.totalEvents ?? 0,
    totalCost: counters?.totalCost ?? 0,
  };
  void metadata; // subscription only

  return <SidebarRow row={row} isSelected={isSelected} onSelect={onSelect} />;
}

function MemorySidebar({
  selectedConversationId,
  onSelect,
}: {
  selectedConversationId: string | null;
  onSelect: (conversationId: string) => void;
}) {
  const byConversationId = useAppSelector(
    selectAllObservationalMemoryConversations,
  );

  const { enabled, inactive } = useMemo(() => {
    const enabledList: string[] = [];
    const inactiveList: string[] = [];
    for (const [cid, state] of Object.entries(byConversationId)) {
      if (state.isEnabled || state.metadata?.enabled) {
        enabledList.push(cid);
      } else {
        inactiveList.push(cid);
      }
    }
    const sortByRecent = (a: string, b: string) => {
      const ae = byConversationId[a]?.events ?? [];
      const be = byConversationId[b]?.events ?? [];
      const at = ae.at(-1)?.receivedAt ?? "";
      const bt = be.at(-1)?.receivedAt ?? "";
      return bt.localeCompare(at);
    };
    enabledList.sort(sortByRecent);
    inactiveList.sort(sortByRecent);
    return { enabled: enabledList, inactive: inactiveList };
  }, [byConversationId]);

  if (enabled.length === 0 && inactive.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-3">
        <AlertCircle className="h-6 w-6 opacity-20" />
        <span className="text-xs text-center">
          No conversations with memory yet.
        </span>
        <span className="text-[10px] text-center opacity-70">
          Enable Observational Memory on a conversation from the Creator Panel.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {enabled.length > 0 && (
        <>
          <div className="px-2 pt-2 pb-1 shrink-0">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Active ({enabled.length})
            </span>
          </div>
          <div
            className={cn(
              "overflow-y-auto shrink-0",
              inactive.length > 0 ? "max-h-[55%]" : "flex-1 min-h-0",
            )}
          >
            {enabled.map((cid) => (
              <MemorySidebarRowConnector
                key={cid}
                conversationId={cid}
                isSelected={selectedConversationId === cid}
                onSelect={() => onSelect(cid)}
              />
            ))}
          </div>
          {inactive.length > 0 && (
            <div className="border-t border-border/50 shrink-0" />
          )}
        </>
      )}
      {inactive.length > 0 && (
        <>
          <div className="px-2 pt-2 pb-1 shrink-0">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Inactive ({inactive.length})
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {inactive.map((cid) => (
              <MemorySidebarRowConnector
                key={cid}
                conversationId={cid}
                isSelected={selectedConversationId === cid}
                onSelect={() => onSelect(cid)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Empty state
// =============================================================================

function EmptyPane() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
      <Brain className="h-10 w-10 opacity-15" />
      <p className="text-sm font-medium text-foreground">
        No conversation selected
      </p>
      <p className="text-xs opacity-60 text-center max-w-xs">
        Pick a conversation from the sidebar to inspect its Observational Memory
        state, cost, and live activity.
      </p>
    </div>
  );
}

// =============================================================================
// Inner
// =============================================================================

function ObservationalMemoryWindowInner({
  onClose,
  initialSelectedConversationId,
}: {
  onClose: () => void;
  initialSelectedConversationId: string | null;
}) {
  const byConversationId = useAppSelector(
    selectAllObservationalMemoryConversations,
  );

  // If the persisted selection no longer exists in state (e.g. conversation
  // wiped from memory), fall back to the first available entry.
  const fallbackId = useMemo(() => {
    const keys = Object.keys(byConversationId);
    if (keys.length === 0) return null;
    // Prefer a conversation that is currently enabled.
    for (const k of keys) {
      const entry = byConversationId[k];
      if (entry?.isEnabled || entry?.metadata?.enabled) return k;
    }
    return keys[0] ?? null;
  }, [byConversationId]);

  const initialOrFallback =
    initialSelectedConversationId &&
    byConversationId[initialSelectedConversationId]
      ? initialSelectedConversationId
      : fallbackId;

  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(initialOrFallback);

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      selectedConversationId,
    }),
    [selectedConversationId],
  );

  const selectedMetadata = useAppSelector(
    selectMemoryMetadata(selectedConversationId),
  );
  const selectedDegraded = useAppSelector(
    selectMemoryDegraded(selectedConversationId),
  );

  const title = selectedConversationId
    ? `Memory — ${selectedConversationId.slice(0, 8)}…${selectedMetadata?.model ? ` · ${selectedMetadata.model}` : ""}${selectedDegraded ? " · degraded" : ""}`
    : "Memory Inspector";

  return (
    <WindowPanel
      id="observational-memory-window"
      title={title}
      onClose={onClose}
      width={1080}
      height={720}
      minWidth={680}
      minHeight={460}
      overlayId="observationalMemoryWindow"
      onCollectData={collectData}
      sidebar={
        <MemorySidebar
          selectedConversationId={selectedConversationId}
          onSelect={setSelectedConversationId}
        />
      }
      sidebarDefaultSize={240}
      sidebarMinSize={180}
      defaultSidebarOpen
    >
      {selectedConversationId ? (
        <ObservationalMemoryCore
          conversationId={selectedConversationId}
          layout="split"
        />
      ) : (
        <EmptyPane />
      )}
    </WindowPanel>
  );
}

// =============================================================================
// Shell
// =============================================================================

interface ObservationalMemoryWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialSelectedConversationId?: string | null;
}

export default function ObservationalMemoryWindow({
  isOpen,
  onClose,
  initialSelectedConversationId,
}: ObservationalMemoryWindowProps) {
  if (!isOpen) return null;
  return (
    <ObservationalMemoryWindowInner
      onClose={onClose}
      initialSelectedConversationId={initialSelectedConversationId ?? null}
    />
  );
}
