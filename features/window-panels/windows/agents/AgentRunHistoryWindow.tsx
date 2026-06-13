"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  MessageSquare,
  Loader2,
  History,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentConversations } from "@/features/agents/redux/conversation-list/conversation-list.thunks";
import { makeSelectAgentConversations } from "@/features/agents/redux/conversation-list/conversation-list.selectors";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import { AgentConversationDisplay } from "@/features/agents/components/messages-display/AgentConversationDisplay";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import type { RootState } from "@/lib/redux/store";
import { useAppStore } from "@/lib/redux/hooks";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { ItemRow } from "@/components/official/item/ItemRow";
import { buildConversationMenu } from "@/features/agents/components/conversation-actions/conversationActionRegistry";
import { renameConversation } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";

const SURFACE_KEY = "agent-run-history-window";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VersionGroup {
  versionNumber: number;
  conversations: ConversationListItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function groupByVersion(conversations: ConversationListItem[]): VersionGroup[] {
  const map = new Map<number, ConversationListItem[]>();
  for (const conv of conversations) {
    const v = conv.agentVersionNumber ?? 0;
    if (!map.has(v)) map.set(v, []);
    map.get(v)!.push(conv);
  }
  // Sort: highest version first; within a version sort newest first
  return Array.from(map.entries())
    .sort(([a], [b]) => b - a)
    .map(([versionNumber, convs]) => ({
      versionNumber,
      conversations: [...convs].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    }));
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function VersionGroupRow({
  group,
  agentId,
  selectedId,
  onSelect,
  defaultOpen,
}: {
  group: VersionGroup;
  agentId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasActive = group.conversations.some(
    (c) => c.conversationId === selectedId,
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 w-full px-2 py-1.5 text-left transition-colors",
          "hover:bg-muted/40",
          hasActive && "text-primary",
        )}
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
        )}
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex-1 min-w-0 truncate">
          Version {group.versionNumber}
        </span>
        <span className="text-[10px] text-muted-foreground/60 shrink-0 ml-1">
          {group.conversations.length}
        </span>
      </button>

      {open && (
        <div className="pl-2">
          {group.conversations.map((conv) => (
            <VersionConversationRow
              key={conv.conversationId}
              conv={conv}
              agentId={agentId}
              isActive={conv.conversationId === selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VersionConversationRow({
  conv,
  agentId,
  isActive,
  onSelect,
}: {
  conv: ConversationListItem;
  agentId: string;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  const dispatch = useAppDispatch();
  const date = formatDate(conv.updatedAt);
  const href = `/agents/${agentId}/run?conversationId=${conv.conversationId}`;

  return (
    <ItemRow
      label={conv.title?.trim() || "Untitled"}
      active={isActive}
      size="sm"
      onOpen={() => onSelect(conv.conversationId)}
      menu={() =>
        buildConversationMenu({
          conversationId: conv.conversationId,
          title: conv.title,
          isFavorite: conv.isFavorite ?? false,
          isArchived: conv.status === "archived",
          excludeFromKg: conv.excludeFromKg ?? false,
          isOwner: true,
          href,
          dispatch,
        })
      }
      rename={{
        value: conv.title ?? "",
        emptyFallback: "Untitled",
        onCommit: (next) =>
          void dispatch(
            renameConversation({
              conversationId: conv.conversationId,
              title: next,
            }),
          ),
      }}
      trailing={
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
          <MessageSquare className="w-2.5 h-2.5 shrink-0" />
          {conv.messageCount}
          {date ? ` · ${date}` : ""}
        </span>
      }
    />
  );
}

function RunHistorySidebar({
  agentId,
  selectedConversationId,
  onSelect,
  onAgentSelect,
}: {
  agentId: string | null;
  selectedConversationId: string | null;
  onSelect: (id: string) => void;
  onAgentSelect: (id: string) => void;
}) {
  const dispatch = useAppDispatch();

  const agentName = useAppSelector((state: RootState) =>
    agentId ? (selectAgentById(state, agentId)?.name ?? null) : null,
  );

  const canonicalAgentId = useAppSelector((state: RootState) => {
    if (!agentId) return null;
    const agent = selectAgentById(state, agentId);
    return agent?.parentAgentId ?? agent?.id ?? agentId;
  });

  const selectConversations = useMemo(
    () =>
      canonicalAgentId
        ? makeSelectAgentConversations(canonicalAgentId, null)
        : null,
    [canonicalAgentId],
  );

  const conversationState = useAppSelector((state) =>
    selectConversations ? selectConversations(state) : null,
  );

  const status = conversationState?.status ?? "idle";
  const conversations = conversationState?.conversations ?? [];
  const error = conversationState?.error ?? null;

  useEffect(() => {
    if (canonicalAgentId && status === "idle") {
      dispatch(
        fetchAgentConversations({
          agentId: canonicalAgentId,
          versionFilter: null,
        }),
      );
    }
  }, [canonicalAgentId, status, dispatch]);

  const versionGroups = useMemo(
    () => groupByVersion(conversations),
    [conversations],
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Agent picker — always visible */}
      <div className="px-2 py-1.5 border-b border-border shrink-0">
        <AgentListDropdown
          onSelect={onAgentSelect}
          label={agentName ?? "Select agent…"}
          className="w-full"
        />
      </div>

      {/* Conversations header */}
      {agentId && (
        <div className="px-2 py-1 border-b border-border/50 shrink-0 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Conversations
          </span>
          {status === "loading" && (
            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
          )}
        </div>
      )}

      {/* Scrollable list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!agentId && (
          <div className="flex flex-col items-center justify-center py-10 px-3 text-center gap-2">
            <Clock className="w-6 h-6 text-muted-foreground opacity-25" />
            <p className="text-xs text-muted-foreground">
              Choose an agent above to see its run history
            </p>
          </div>
        )}

        {agentId && status === "failed" && (
          <p className="px-3 py-2 text-[10px] text-destructive">
            {error ?? "Failed to load"}
          </p>
        )}

        {agentId && status === "succeeded" && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
            <History className="w-6 h-6 text-muted-foreground mb-2 opacity-40" />
            <p className="text-xs text-muted-foreground">
              No conversations yet
            </p>
          </div>
        )}

        {agentId &&
          versionGroups.map((group, i) => (
            <VersionGroupRow
              key={group.versionNumber}
              group={group}
              agentId={agentId}
              selectedId={selectedConversationId}
              onSelect={onSelect}
              defaultOpen={i === 0}
            />
          ))}
      </div>
    </div>
  );
}

// ─── Main body ────────────────────────────────────────────────────────────────

function RunHistoryBody({
  agentId,
  selectedConversationId,
}: {
  agentId: string;
  selectedConversationId: string | null;
}) {
  if (!selectedConversationId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 text-muted-foreground">
        <Workflow className="w-10 h-10 mb-3 opacity-20" />
        <p className="text-sm font-medium">Select a conversation</p>
        <p className="text-xs opacity-60 mt-1">
          Choose a run from the sidebar to view the conversation
        </p>
      </div>
    );
  }

  return <AgentConversationDisplay conversationId={selectedConversationId} />;
}

// ─── Window ───────────────────────────────────────────────────────────────────

interface AgentRunHistoryWindowProps {
  isOpen: boolean;
  onClose: () => void;
  agentId?: string | null;
  initialSelectedConversationId?: string | null;
}

export default function AgentRunHistoryWindow({
  isOpen,
  onClose,
  agentId,
  initialSelectedConversationId,
}: AgentRunHistoryWindowProps) {
  if (!isOpen) return null;
  return (
    <AgentRunHistoryWindowInner
      onClose={onClose}
      agentId={agentId ?? null}
      initialSelectedConversationId={initialSelectedConversationId ?? null}
    />
  );
}

function AgentRunHistoryWindowInner({
  onClose,
  agentId: initialAgentId,
  initialSelectedConversationId,
}: {
  onClose: () => void;
  agentId: string | null;
  initialSelectedConversationId: string | null;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const [agentId, setAgentId] = useState<string | null>(initialAgentId);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(initialSelectedConversationId);

  const handleAgentSelect = useCallback((selectedId: string) => {
    setAgentId(selectedId);
    setSelectedConversationId(null);
  }, []);

  const handleSelect = useCallback(
    async (conversationId: string) => {
      setSelectedConversationId(conversationId);

      if (!agentId) return;

      const exists = !!(store.getState() as RootState).conversations
        ?.byConversationId?.[conversationId];

      if (!exists) {
        await dispatch(
          createManualInstance({
            agentId,
            conversationId,
            apiEndpointMode: "agent",
          }),
        );
      }

      dispatch(
        loadConversation({
          conversationId,
          surfaceKey: SURFACE_KEY,
        }),
      );
    },
    [agentId, dispatch, store],
  );

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      agentId,
      selectedConversationId,
    }),
    [agentId, selectedConversationId],
  );

  const agentName = useAppSelector((state: RootState) =>
    agentId ? (selectAgentById(state, agentId)?.name ?? "Agent") : null,
  );

  const titleSuffix = agentName ? ` — ${agentName}` : "";

  return (
    <WindowPanel
      id="agent-run-history-window"
      title={`Run History${titleSuffix}`}
      onClose={onClose}
      width={900}
      height={640}
      minWidth={520}
      minHeight={360}
      overlayId="agentRunHistoryWindow"
      onCollectData={collectData}
      sidebar={
        <RunHistorySidebar
          agentId={agentId}
          selectedConversationId={selectedConversationId}
          onSelect={handleSelect}
          onAgentSelect={handleAgentSelect}
        />
      }
      sidebarDefaultSize={220}
      sidebarMinSize={160}
      defaultSidebarOpen
    >
      {agentId ? (
        <RunHistoryBody
          agentId={agentId}
          selectedConversationId={selectedConversationId}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center text-muted-foreground">
          <Workflow className="w-12 h-12 opacity-15" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              No agent selected
            </p>
            <p className="text-xs opacity-60">
              Use the sidebar to pick an agent and browse its conversation
              history.
            </p>
          </div>
        </div>
      )}
    </WindowPanel>
  );
}
