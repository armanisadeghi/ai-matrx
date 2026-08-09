"use client";

import { CircleAlert } from "lucide-react";
import { ChatRoomClient } from "./ChatRoomClient";
import { NewChatGreeting } from "./NewChatGreeting";
import { DEFAULT_NEW_CHAT_SLOT_KEY } from "./chat-quick-actions.config";
import { useAgentSlot } from "@/features/agents/slots/useAgentSlot";

/**
 * `/chat/new` — landing surface.
 *
 * The agent that owns the input bar is the `chat.default_new_chat` SLOT: the
 * server page resolves it at SSR (system default → the user's own binding)
 * and passes it down as `agentId`, so there is no client flash. If SSR
 * resolution failed (`agentId === null`), this component re-resolves through
 * the one client resolver; if that fails too, the landing shows a loud error
 * instead of silently mounting a hardcoded agent.
 *
 * Mounts the resolved agent so the input bar is immediately usable, and
 * supplies a custom landing (greeting + quick-action chips) above the input
 * via `ChatRoomClient`'s `landingContent` slot. When the user types and
 * submits, the normal Fix 2 promotion swaps the URL to /chat/[conversationId].
 * When the user clicks a chip instead, `NewChatGreeting` stashes the draft
 * and pushes to /chat/a/[chipAgentId] where it's re-applied.
 *
 * Chip agent IDs and labels live in `chat-quick-actions.config.ts`.
 */
export function ChatNewClient({ agentId }: { agentId: string | null }) {
  return agentId ? (
    <ChatNewBody agentId={agentId} />
  ) : (
    <ChatNewClientResolved />
  );
}

/** SSR resolution failed — re-resolve client-side, loud on failure. */
function ChatNewClientResolved() {
  const { slot, loading, error } = useAgentSlot(DEFAULT_NEW_CHAT_SLOT_KEY);
  if (loading) return null;
  if (error || !slot) {
    return (
      <div className="h-full overflow-hidden bg-textured">
        <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
          <div className="mx-auto max-w-xl rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-6 text-center">
            <CircleAlert className="mx-auto h-6 w-6 text-amber-600 dark:text-amber-400" />
            <p className="mt-2 text-sm font-medium text-foreground">
              Chat is unavailable right now.
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              The default chat agent could not be resolved
              {error ? ` — ${error}` : ""}. Check your override on the Agent
              Slots page, or try again shortly.
            </p>
          </div>
        </div>
      </div>
    );
  }
  return <ChatNewBody agentId={slot.agentId} />;
}

function ChatNewBody({ agentId }: { agentId: string }) {
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
  const surfaceKey = `chat-route:${agentId}`;
  return (
    <ChatRoomClient
      agentId={agentId}
      landingContent={(conversationId) => (
        <NewChatGreeting
          sourceConversationId={conversationId}
          surfaceKey={surfaceKey}
        />
      )}
    />
  );
}
