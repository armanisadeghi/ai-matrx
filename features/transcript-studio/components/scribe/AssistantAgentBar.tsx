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

import { useState } from "react";
import { Webhook, History, Plus } from "lucide-react";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentById,
  selectAllAgents,
} from "@/features/agents/redux/agent-definition/selectors";
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

interface AssistantAgentBarProps {
  sessionId: string;
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

export function AssistantAgentBar({ sessionId }: AssistantAgentBarProps) {
  const dispatch = useAppDispatch();
  const agents = useAppSelector(selectAllAgents);
  const activeAgentId = useAppSelector(selectActiveAssistantAgentId(sessionId));
  const activeConversationId = useAppSelector(
    selectAssistantConversationId(sessionId),
  );
  const conversations = useAppSelector(selectAssistantConversations(sessionId));
  const activeAgentName = useAppSelector((s) =>
    activeAgentId ? selectAgentById(s, activeAgentId)?.name : undefined,
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
      return {
        key: c.conversationId,
        label: agents[c.agentId]?.name ?? "Assistant",
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
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
      <AgentListDropdown
        onSelect={handlePickAgent}
        compact
        triggerSlot={
          <button
            type="button"
            className="flex min-w-0 items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-left transition-colors active:bg-accent"
            title="Change the Scribe assistant agent"
          >
            <Webhook className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="max-w-[12rem] truncate text-xs font-medium text-foreground">
              {activeAgentName ?? "Assistant agent"}
            </span>
          </button>
        }
      />

      <span className="text-[11px] text-muted-foreground">
        Scribe assistant
      </span>

      <div className="flex-1" />

      {/* Working context — DUAL ROLE: execute-instance stamps it onto every
          assistant run (backend access), and it is the context the artifacts
          this page saves (recordings, conversation, working doc) should
          inherit. Save-side stamping lands with the ctx_associations work. */}
      <ActiveContextButton
        size="xs"
        align="end"
        triggerClassName="max-w-[280px]"
      />

      <button
        type="button"
        onClick={handleNewConversation}
        disabled={!activeAgentId}
        className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-muted-foreground transition-colors active:bg-accent disabled:opacity-40"
        aria-label="Start a fresh conversation"
        title="Save this conversation and start a clean one"
      >
        <Plus className="h-3.5 w-3.5" />
        New
      </button>

      {conversations.length > 1 && (
        <button
          type="button"
          onClick={() => setRosterOpen(true)}
          className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-muted-foreground transition-colors active:bg-accent"
          aria-label="Switch conversation"
          title="Switch between this session's agent conversations"
        >
          <History className="h-3.5 w-3.5" />
          {conversations.length}
        </button>
      )}

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
