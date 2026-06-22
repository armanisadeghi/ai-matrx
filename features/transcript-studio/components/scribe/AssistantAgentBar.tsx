"use client";

// AssistantAgentBar — shows which agent the Scribe assistant is using and lets
// the user change it. Rendered once at the top of every tab (above the working
// document) so the choice is always visible and reachable.
//
//   [ Webhook  Agent name  ]   Scribe assistant            [ History (N) ]
//      └ AgentListDropdown (all agents)                  └ conversation roster
//
// Switching to an agent that already has a conversation in this session prompts
// "resume vs start fresh"; a brand-new agent just starts fresh. Each agent's
// conversation is kept, so the History control flips between them.

import { useEffect, useState } from "react";
import { Webhook, History, Plus } from "lucide-react";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentById,
  selectAllAgents,
} from "@/features/agents/redux/agent-definition/selectors";
import { initializeChatAgents } from "@/features/agents/redux/agent-definition/thunks";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import {
  selectActiveAssistantAgentId,
  selectAssistantConversationId,
  selectAssistantConversations,
} from "../../redux/selectors";
import {
  setActiveAssistantConversationThunk,
  switchAssistantAgentThunk,
} from "../../redux/thunks";
import { ActionSheet, type ActionSheetItem } from "./ActionSheet";
import { ActiveContextButton } from "@/features/scopes/components/active-context/ActiveContextButton";
import { cn } from "@/lib/utils";

interface AssistantAgentBarProps {
  sessionId: string;
  compact?: boolean;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function AssistantAgentBar({
  sessionId,
  compact,
}: AssistantAgentBarProps) {
  const dispatch = useAppDispatch();
  const agents = useAppSelector(selectAllAgents);
  // Ensure the full agent list (owned + shared + builtins, incl. the War Room
  // Thread persona a tile defaults to) is loaded so the active agent's NAME
  // resolves immediately instead of "Select agent". TTL-guarded, safe per mount.
  useEffect(() => {
    void dispatch(initializeChatAgents());
  }, [dispatch]);
  const activeAgentId = useAppSelector(selectActiveAssistantAgentId(sessionId));
  const activeConversationId = useAppSelector(
    selectAssistantConversationId(sessionId),
  );
  const conversations = useAppSelector(selectAssistantConversations(sessionId));
  const activeAgentName = useAppSelector((s) =>
    activeAgentId ? selectAgentById(s, activeAgentId)?.name : undefined,
  );
  // Conversation titles ("chat labels") for the roster — keyed by conversationId.
  const conversationsById = useAppSelector(
    (s) => s.conversationList.byConversationId,
  );

  // When switching to an agent that already has a conversation here, ask the
  // user whether to resume it or start fresh.
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);

  const handlePickAgent = (agentId: string) => {
    if (agentId === activeAgentId) return;
    const hasExisting = conversations.some((c) => c.agentId === agentId);
    if (hasExisting) {
      setPendingAgentId(agentId);
    } else {
      void dispatch(
        switchAssistantAgentThunk({ sessionId, agentId, mode: "fresh" }),
      );
    }
  };

  const switchTo = (mode: "reuse" | "fresh") => {
    if (!pendingAgentId) return;
    void dispatch(
      switchAssistantAgentThunk({ sessionId, agentId: pendingAgentId, mode }),
    );
    setPendingAgentId(null);
  };

  // Save the current chat and start a clean one with the SAME agent. The old
  // conversation is never deleted — it stays in the roster (History) — and the
  // new one is minted fresh, so no prior history is injected. (Switching to a
  // DIFFERENT agent is handled by the dropdown above.)
  const handleNewConversation = async () => {
    if (!activeAgentId) return;
    const ok = await confirm({
      title: "Start a fresh conversation?",
      description:
        "Your current chat is saved and stays available under History. The new conversation starts with a clean slate — no past messages are carried over.",
      confirmLabel: "Start fresh",
    });
    if (ok) {
      void dispatch(
        switchAssistantAgentThunk({
          sessionId,
          agentId: activeAgentId,
          mode: "fresh",
        }),
      );
    }
  };

  const pendingAgentName = pendingAgentId
    ? (agents[pendingAgentId]?.name ?? "this agent")
    : "";

  const pendingItems: ActionSheetItem[] = pendingAgentId
    ? [
        {
          key: "resume",
          label: "Resume previous chat",
          description: `Continue your existing conversation with ${pendingAgentName}.`,
          icon: <History className="h-4 w-4" />,
          onSelect: () => switchTo("reuse"),
        },
        {
          key: "fresh",
          label: "Start fresh chat",
          description: `Begin a new conversation with ${pendingAgentName}.`,
          icon: <Webhook className="h-4 w-4" />,
          onSelect: () => switchTo("fresh"),
        },
      ]
    : [];

  const rosterItems: ActionSheetItem[] = conversations
    .slice()
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
    .map((c) => {
      const isActive = c.conversationId === activeConversationId;
      const agentName = agents[c.agentId]?.name ?? "Assistant";
      const chatLabel = conversationsById[c.conversationId]?.title?.trim();
      // Show the conversation's own label ("Agent: Chat label"), not just the
      // agent — multiple chats with the same agent are otherwise indistinguishable.
      return {
        key: c.conversationId,
        label: chatLabel ? `${agentName}: ${chatLabel}` : agentName,
        description: `${relativeTime(c.lastUsedAt)}${isActive ? " · current" : ""}`,
        icon: <Webhook className="h-4 w-4" />,
        disabled: isActive,
        onSelect: () => {
          if (!isActive) {
            void dispatch(
              setActiveAssistantConversationThunk({
                sessionId,
                conversationId: c.conversationId,
              }),
            );
          }
          setRosterOpen(false);
        },
      };
    });

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1.5 border-b border-border",
        compact ? "px-1.5 py-1" : "gap-2 px-2 py-1.5",
      )}
    >
      {!compact ? (
        <span className="text-[11px] font-medium text-muted-foreground">
          Assistant
        </span>
      ) : null}

      <AgentListDropdown
        onSelect={handlePickAgent}
        compact
        triggerSlot={
          <button
            type="button"
            className={cn(
              "flex min-w-0 items-center gap-1 rounded-full bg-muted/60 text-left transition-colors active:bg-accent",
              compact ? "px-2 py-0.5" : "gap-1.5 px-2.5 py-1",
            )}
            title="Change the assistant agent"
          >
            <Webhook className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span
              className={cn(
                "truncate text-xs font-medium text-foreground",
                compact ? "max-w-[7rem]" : "max-w-[12rem]",
              )}
            >
              {activeAgentName ?? "Select agent"}
            </span>
          </button>
        }
      />

      <div className="flex-1" />

      <ActiveContextButton size="xs" align="end" iconOnly warnWhenEmpty />

      <button
        type="button"
        onClick={handleNewConversation}
        disabled={!activeAgentId}
        className={cn(
          "flex items-center rounded-full text-muted-foreground transition-colors active:bg-accent disabled:opacity-40",
          compact ? "gap-0.5 px-1.5 py-0.5" : "gap-1 px-2 py-1 text-[11px]",
        )}
        aria-label="Start a fresh conversation"
        title="Save this conversation and start a clean one"
      >
        <Plus className="h-3.5 w-3.5" />
        {!compact ? "New" : null}
      </button>

      {/* History is ALWAYS rendered — never hidden/re-shown (hiding a control is
          jarring, and it used to "appear" the moment you picked an agent, which
          read as fake history). It's disabled only when there's nothing to switch
          to (0 or 1 conversation); the count reflects the real roster from state. */}
      <button
        type="button"
        onClick={() => setRosterOpen(true)}
        disabled={conversations.length <= 1}
        className={cn(
          "flex items-center rounded-full text-muted-foreground transition-colors active:bg-accent disabled:opacity-40 disabled:active:bg-transparent",
          compact ? "gap-0.5 px-1.5 py-0.5" : "gap-1 px-2 py-1 text-[11px]",
        )}
        aria-label="Conversation history"
        title={
          conversations.length <= 1
            ? "No other conversations in this session yet"
            : "Switch between this session's agent conversations"
        }
      >
        <History className="h-3.5 w-3.5" />
        {conversations.length || 0}
      </button>

      <ActionSheet
        open={pendingAgentId !== null}
        onOpenChange={(o) => {
          if (!o) setPendingAgentId(null);
        }}
        title={`Switch to ${pendingAgentName}`}
        items={pendingItems}
        contentClassName="min-h-[40dvh]"
      />

      <ActionSheet
        open={rosterOpen}
        onOpenChange={setRosterOpen}
        title="Conversations in this session"
        items={rosterItems}
        contentClassName="min-h-[40dvh]"
      />
    </div>
  );
}
