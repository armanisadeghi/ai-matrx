"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Loader2,
  History,
  SquareStack,
} from "lucide-react";
import { ItemRow } from "@/components/official/item/ItemRow";
import { buildConversationMenu } from "@/features/agents/components/conversation-actions/conversationActionRegistry";
import { renameConversation } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentConversations } from "@/features/agents/redux/conversation-list/conversation-list.thunks";
import { makeSelectAgentConversations } from "@/features/agents/redux/conversation-list/conversation-list.selectors";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import { AgentConversationDisplay } from "@/features/agents/components/messages-display/AgentConversationDisplay";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import type { RootState } from "@/lib/redux/store";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";

const SURFACE_KEY = "agent-advanced-editor-history-tab";

interface VersionGroup {
  versionNumber: number;
  conversations: ConversationListItem[];
}

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
    const group = map.get(v);
    if (group) {
      group.push(conv);
    } else {
      map.set(v, [conv]);
    }
  }
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
          href: `/agents/${agentId}/run?conversationId=${conv.conversationId}`,
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
          <MessageSquare className="w-2.5 h-2.5 text-muted-foreground/70 shrink-0" />
          {conv.messageCount}
          {date ? ` · ${date}` : ""}
        </span>
      }
    />
  );
}

interface AgentContentHistoryPanelProps {
  /** Initial agent whose history to show. May be changed by the in-panel picker. */
  agentId: string;
  /**
   * Render an agent picker above the conversation list so the user can browse
   * a different agent's history without leaving the panel. Default `true` —
   * pass `false` to lock the panel to `agentId` (rare; useful when the host
   * already owns the agent picker).
   */
  allowAgentSwitching?: boolean;
  /**
   * Optional. Called when the user picks a different agent from the dropdown.
   * If omitted, the panel manages the selected agent in internal state — i.e.
   * the embedded History tab can switch agents without coordinating with its
   * parent.
   */
  onAgentChange?: (agentId: string) => void;
}

export function AgentContentHistoryPanel({
  agentId: initialAgentId,
  allowAgentSwitching = true,
  onAgentChange,
}: AgentContentHistoryPanelProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);

  // When the caller provides `onAgentChange`, treat it as controlled — the
  // displayed agent always tracks `initialAgentId`. Otherwise manage it
  // ourselves so the embedded History tab can switch agents independently
  // from its host editor.
  const [internalAgentId, setInternalAgentId] = useState(initialAgentId);
  const agentId = onAgentChange ? initialAgentId : internalAgentId;

  // Keep internal state in sync if the caller flips the initial id (e.g. user
  // switches agents in the host editor before the History tab tracks its own).
  useEffect(() => {
    if (!onAgentChange) setInternalAgentId(initialAgentId);
  }, [initialAgentId, onAgentChange]);

  const handleAgentSelect = useCallback(
    (next: string) => {
      if (onAgentChange) onAgentChange(next);
      else setInternalAgentId(next);
      setSelectedConversationId(null);
    },
    [onAgentChange],
  );

  const canonicalAgentId = useAppSelector((state: RootState) => {
    const agent = selectAgentById(state, agentId);
    return agent?.parentAgentId ?? agent?.id ?? agentId;
  });

  const agentName = useAppSelector((state: RootState) => {
    const agent = selectAgentById(state, agentId);
    return agent?.name ?? null;
  });

  const selectConversations = useMemo(
    () => makeSelectAgentConversations(canonicalAgentId, null),
    [canonicalAgentId],
  );

  const conversationState = useAppSelector(selectConversations);
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

  const handleSelect = useCallback(
    async (conversationId: string) => {
      setSelectedConversationId(conversationId);

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

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full min-h-0 w-full"
    >
      <ResizablePanel
        id="agent-content-history-sidebar"
        defaultSize="28%"
        minSize="8%"
        maxSize="45%"
      >
        <div className="h-full min-h-0 flex flex-col border-r border-border bg-card/30">
          {allowAgentSwitching && (
            <div className="px-2 py-1.5 border-b border-border shrink-0">
              <AgentListDropdown
                onSelect={handleAgentSelect}
                label={agentName ?? "Select agent…"}
                className="w-full"
              />
            </div>
          )}
          <div className="px-2 py-1 border-b border-border/50 shrink-0 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Conversations
            </span>
            {status === "loading" && (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {status === "failed" && (
              <p className="px-3 py-2 text-[10px] text-destructive">
                {error ?? "Failed to load"}
              </p>
            )}

            {status === "succeeded" && conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
                <History className="w-6 h-6 text-muted-foreground mb-2 opacity-40" />
                <p className="text-xs text-muted-foreground">
                  No conversations yet
                </p>
              </div>
            )}

            {versionGroups.map((group, i) => (
              <VersionGroupRow
                key={group.versionNumber}
                group={group}
                agentId={agentId}
                selectedId={selectedConversationId}
                onSelect={handleSelect}
                defaultOpen={i === 0}
              />
            ))}
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel
        id="agent-content-history-main"
        defaultSize="72%"
        minSize="30%"
      >
        <div className="h-full min-h-0 overflow-hidden">
          {selectedConversationId ? (
            <div className="h-full w-full overflow-y-auto">
              <div className="mx-auto max-w-3xl w-full p-3">
                <AgentConversationDisplay
                  conversationId={selectedConversationId}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 text-muted-foreground">
              <SquareStack className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">Select a conversation</p>
              <p className="text-xs opacity-60 mt-1">
                Choose a run from the list to view the conversation (read-only)
              </p>
            </div>
          )}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
