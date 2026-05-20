"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { ChatRoomClient } from "./ChatRoomClient";
import { NewChatGreeting } from "./NewChatGreeting";
import { DEFAULT_NEW_CHAT_AGENT_ID } from "./chat-quick-actions.config";

interface ChatNewClientProps {
  /** Server-resolved name of the default agent — fed through as the picker
   *  placeholder so the input bar shows a real label on first paint. */
  defaultAgentName?: string;
}

/**
 * `/chat/new` — landing surface.
 *
 * Mounts the default agent so the input bar is immediately usable, and
 * supplies a custom landing (greeting + quick-action chips) above the input
 * via `ChatRoomClient`'s `landingContent` slot. When the user types and
 * submits, the normal Fix 2 promotion swaps the URL to /chat/[conversationId].
 * When the user clicks a chip instead, `NewChatGreeting` stashes the draft
 * and pushes to /chat/a/[chipAgentId] where it's re-applied.
 *
 * Agent IDs and chip labels live in `chat-quick-actions.config.ts`.
 */
export function ChatNewClient({ defaultAgentName }: ChatNewClientProps) {
  // No eager agent-list fetch here. Chip labels are hardcoded in
  // chat-quick-actions.config.ts (no agent registry lookup) and the default
  // agent's execution payload is fetched on-demand by ChatRoomClient via
  // useAgentLauncher. The picker dropdown still loads the full agent list
  // lazily on first click via its own ensureLoaded() — same pattern used
  // everywhere else in the app.

  // The greeting reads the in-progress draft from whichever conversation the
  // launcher has bound to the input. The chat route uses the
  // `chat-route:<agentId>` surface key (see ChatRoomClient.SOURCE_FEATURE);
  // subscribe to that surface's `input` focus so the greeting always has the
  // current target — including the brief autoclear-split window.
  const surfaceKey = `chat-route:${DEFAULT_NEW_CHAT_AGENT_ID}`;
  const sourceConversationId = useAppSelector(
    (state) =>
      state.conversationFocus.bySurface[surfaceKey]?.input ??
      state.conversationFocus.bySurface[surfaceKey]?.display ??
      null,
  );

  return (
    <ChatRoomClient
      agentId={DEFAULT_NEW_CHAT_AGENT_ID}
      initialAgentName={defaultAgentName}
      landingContent={
        <NewChatGreeting
          sourceConversationId={sourceConversationId}
          surfaceKey={surfaceKey}
        />
      }
    />
  );
}
