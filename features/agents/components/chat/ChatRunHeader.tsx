"use client";

// ChatRunHeader — chat controls injected into the app shell header center slot
// (#shell-header-center) via <PageHeader>, exactly like AgentRunHeader does for
// the run route. A COMPACT agent picker (never full-width). Self-contained:
// the page passes the route's active agent; the live name comes from Redux.

import { useRouter } from "next/navigation";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { ActiveContextLensChip } from "@/features/scopes/components/active-context/ActiveContextLensChip";
import { ChatCanvasButton } from "./ChatCanvasButton";
import { ChatSandboxToggleButton } from "./sandbox-insight/ChatSandboxToggleButton";
import { ConversationRecordsChip } from "./ConversationRecordsChip";
import { ConversationRoomNotice } from "./ConversationRoomNotice";
import { ConversationPageMenu } from "./ConversationPageMenu";
import { stashChatDraftTransfer } from "./chat-draft-transfer";
import { chatRouteSurfaceKey } from "./begin-fresh-chat";

interface ChatRunHeaderProps {
  /**
   * The agent that owns this route: the URL agent on `/chat/a/[agentId]`, the
   * conversation's initiating agent on `/chat/[conversationId]`, or the default
   * on `/chat/new`. Drives the picker label.
   */
  activeAgentId?: string;
  /** SSR-resolved name for first paint; replaced by the live Redux value. */
  initialAgentName?: string;
  /** Active conversation (present on `/chat/[conversationId]`). Lets the Canvas
   *  button open this conversation's working document when the Canvas is empty. */
  conversationId?: string;
  /**
   * Where picking an agent navigates. Defaults to the text chat route
   * (`/chat/a/<id>`). A sibling chat route that is still a chat — same picker,
   * same draft carry-over, different mode — passes its own builder so
   * switching agents keeps the user in the mode they chose. Without this the
   * picker silently drops them back into text mid-conversation.
   */
  buildAgentHref?: (agentId: string) => string;
}

const defaultAgentHref = (agentId: string) =>
  `/chat/a/${encodeURIComponent(agentId)}`;

export function ChatRunHeader({
  activeAgentId,
  initialAgentName,
  conversationId,
  buildAgentHref = defaultAgentHref,
}: ChatRunHeaderProps) {
  const router = useRouter();
  const store = useAppStore();
  const liveName = useAppSelector((state) =>
    activeAgentId ? selectAgentName(state, activeAgentId) : undefined,
  );
  const label =
    liveName?.trim() || initialAgentName?.trim() || "Select an agent";

  // On `/chat/a/[agentId]` the page has no conversation id to give us — the
  // launcher mints one in the room below. The Sandbox toggle still has to
  // find it, or a user who closes the panel on that route has no way to
  // reopen it (the panel's own X would be a one-way door). The room registers
  // its conversation under the chat surface key, so read it from there.
  const focusedConversationId = useAppSelector((state) =>
    activeAgentId
      ? (state.conversationFocus.bySurface[chatRouteSurfaceKey(activeAgentId)]
          ?.display ??
        state.conversationFocus.bySurface[chatRouteSurfaceKey(activeAgentId)]
          ?.input ??
        null)
      : null,
  );
  const sandboxConversationId = conversationId ?? focusedConversationId ?? undefined;

  const handleAgentSelect = (id: string) => {
    if (id === activeAgentId) return;
    // Carry any in-progress draft over to the newly-selected agent so switching
    // agents never destroys what the user has typed. Mirrors the chip path in
    // NewChatGreeting: snapshot the current surface's draft via getState (no
    // per-keystroke subscription) and stash it for the destination route's
    // consumeChatDraftTransfer in ChatRoomClient.
    if (activeAgentId) {
      const state = store.getState();
      const sourceSurfaceKey = chatRouteSurfaceKey(activeAgentId);
      const sourceConversationId =
        state.conversationFocus.bySurface[sourceSurfaceKey]?.input ??
        state.conversationFocus.bySurface[sourceSurfaceKey]?.display ??
        null;
      const draftText = sourceConversationId
        ? selectUserInputText(sourceConversationId)(state)
        : "";
      if (draftText && draftText.trim().length > 0) {
        stashChatDraftTransfer({ text: draftText, targetAgentId: id });
      }
    }
    router.push(buildAgentHref(id));
  };

  // Full-width bar with a hard left/right split at every breakpoint: agent +
  // context stay pinned left; canvas stays pinned right inside the center slot.
  // (Previously `lg:w-full` + a single row let the inject zone center the
  // shrink-wrapped cluster on mobile/tablet, which pushed controls into the
  // avatar and broke the layout.)
  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1 overflow-hidden">
        <div
          data-chat-agent-picker-trigger
          className="flex min-w-0 items-center"
        >
          <AgentListDropdown
            onSelect={handleAgentSelect}
            label={label}
            activeAgentId={activeAgentId}
            compact
            noBorder
          />
        </div>
        {/* Working context — Lens Chip → ActiveContextTree. Sets
            appContextSlice; Clear lives in the tree footer. */}
        <ActiveContextLensChip
          conversationId={conversationId}
          className="min-w-0"
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {/* "Personal — only you can see this, even inside a shared room"
            (DD-171, 2026-09-12; it read the opposite until that day). A
            `personal` conversation dropped into a war room or a thread USED to
            be readable by that room's members; the chair overturned that —
            containment carries a container's reach to rows at `internal` and
            above, never to `personal` — and the kernel moved before this
            sentence did. The chip renders for the OWNER and only when the
            conversation really does sit inside a room other people can reach. */}
        <ConversationRoomNotice conversationId={conversationId} />
        {/* What this chat PRODUCED — the reverse view of the record chrome
            drawn under a kind block. Only an existing conversation can have
            produced anything, so `/chat/new` shows nothing rather than an
            empty control. */}
        {conversationId && (
          <ConversationRecordsChip conversationId={conversationId} />
        )}
        {/* The bound SANDBOX — terminal, files and this conversation's sandbox
            work, one click away. Absent entirely when nothing is bound, so the
            header never carries a control with nothing behind it. */}
        <ChatSandboxToggleButton conversationId={sandboxConversationId} />
        {/* Canvas — the unified live workspace, one click away at the top. */}
        <ChatCanvasButton conversationId={conversationId} />
        {/* DD-179 — the conversation's own menu: rename, archive, delete (soft
            and restorable), share, duplicate. Absent on `/chat/new`, where
            there is no conversation yet to act on. */}
        {conversationId && (
          <ConversationPageMenu
            conversationId={conversationId}
            href={`/chat/${conversationId}`}
          />
        )}
      </div>
    </div>
  );
}
