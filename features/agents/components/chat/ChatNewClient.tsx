"use client";

import { CircleAlert } from "lucide-react";
import { ChatRoomClient } from "./ChatRoomClient";
import { chatRouteSurfaceKey } from "./begin-fresh-chat";
import { ChatSplashComposerShell, NewChatGreeting } from "./NewChatGreeting";
import {
  ComposerGreeting,
  ComposerQuickActionsSkeleton,
} from "@/features/agents/components/inputs/smart-input/composer/ComposerSplash";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "./chat-quick-actions.config";
import { useMandate } from "@/features/mandates/useMandate";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { asClause } from "@/lib/text/asClause";
import { WorkspaceGate } from "@/features/organizations/components/WorkspaceGate";
import type { ComposerMode } from "@/features/agents/components/inputs/smart-input/composer/composer-types";

/**
 * `/chat/new` — landing surface.
 *
 * The agent that owns the input bar is the `chat.default_new_chat` MANDATE: the
 * server page resolves it at SSR (system default → the user's own binding)
 * and passes it down as `agentId`, so there is no client flash. If SSR
 * resolution failed (`agentId === null`), this component re-resolves through
 * the one client resolver; if that fails too, the landing shows a loud error
 * instead of silently mounting a hardcoded agent.
 *
 * Mounts the resolved agent so the composer is immediately usable, and
 * supplies the splash (greeting · splash composer · quick actions) via
 * `ChatRoomClient`'s `landingContent`. When the user types and submits, the
 * normal Fix 2 promotion swaps the URL to /chat/[conversationId]. When the
 * user clicks a quick action instead, `NewChatGreeting` stashes the draft and
 * pushes to /chat/a/[agentId] where it's re-applied.
 *
 * The quick actions are the `agents.chat_composer.quick_actions` knob.
 */
export function ChatNewClient({
  agentId,
  composer,
}: {
  agentId: string | null;
  /** The three-mode composer (server-read "last mode used" cookie). */
  composer: { initialMode: ComposerMode | null };
}) {
  return agentId ? (
    <ChatNewBody agentId={agentId} composer={composer} />
  ) : (
    <ChatNewClientResolved composer={composer} />
  );
}

/** SSR resolution failed — re-resolve client-side, loud on failure. */
function ChatNewClientResolved({
  composer,
}: {
  composer: { initialMode: ComposerMode | null };
}) {
  const { mandate, loading, error, organizationPending } = useMandate(DEFAULT_NEW_CHAT_MANDATE_KEY);
  if (loading) return <ChatNewLandingSkeleton />;
  // No workspace chosen is a question, never "chat is unavailable".
  if (organizationPending) {
    return (
      <WorkspaceGate blocked sentence="Chat needs a workspace to open.">
        <ChatNewLandingSkeleton />
      </WorkspaceGate>
    );
  }
  if (error || !mandate) return <ChatMandateUnavailable error={error} />;
  return <ChatNewBody agentId={mandate.agentId} composer={composer} />;
}

/**
 * The ONE loud face for "the default chat mandate could not be resolved".
 * Shared by `/chat/new` and by `/chat/[id]` rooms that carry no agent of
 * their own (`ChatConversationRoom`) — never a silent fallback agent.
 */
export function ChatMandateUnavailable({ error }: { error?: string | null }) {
  return (
    <div className="h-full overflow-hidden bg-textured">
      <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
        <div className="mx-auto max-w-xl rounded-md border border-warning/30 bg-warning/5 px-4 py-6 text-center">
          <CircleAlert className="mx-auto h-6 w-6 text-warning" />
          <p className="mt-2 text-sm font-medium text-foreground">
            Chat is unavailable right now.
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            The default chat agent could not be resolved
            {asClause(error ? ` — ${error}` : "")}. Check your chat settings, or try
            again shortly.
            <ErrorAlchemyMenu />
          </p>
        </div>
      </div>
    </div>
  );
}

function ChatNewBody({
  agentId,
  composer,
}: {
  agentId: string;
  composer: { initialMode: ComposerMode | null };
}) {
  // No eager agent-list fetch here. Quick-action labels come from the
  // `agents.chat_composer.quick_actions` knob (no agent registry lookup) and the default
  // agent's execution payload is fetched on-demand by ChatRoomClient via
  // useAgentLauncher. The picker dropdown still loads the full agent list
  // lazily on first click via its own ensureLoaded() — same pattern used
  // everywhere else in the app.

  // The greeting reads the in-progress draft from whichever conversation the
  // launcher has bound to the input. ONE helper owns the chat-route surface
  // key (`chatRouteSurfaceKey`) — hand-building it here is what silently
  // de-synced this landing from the surface `ChatRoomClient` registers.
  const surfaceKey = chatRouteSurfaceKey(agentId);
  return (
    <ChatRoomClient
      agentId={agentId}
      // THE MANDATE DOOR. `agentId` above is DISPLAY identity (SSR-resolved so
      // the header and input bar paint without a flash); the RUN goes to
      // `/ai/mandates/chat.default_new_chat` and aidream resolves the Holder
      // for this principal. A user or org rebinding this mandate changes who
      // answers immediately — no client deploy, and no second resolver that
      // could disagree with the server about whose binding wins.
      mandateKey={DEFAULT_NEW_CHAT_MANDATE_KEY}
      composer={composer}
      // ChatRoomClient builds the presentation from the `composer` passed just
      // above, so it is always present here.
      landingContent={(conversationId, composerPresentation) =>
        composerPresentation ? (
          <NewChatGreeting
            sourceConversationId={conversationId}
            surfaceKey={surfaceKey}
            composer={composerPresentation}
          />
        ) : null
      }
    />
  );
}

/** Shared SSR/client-retry fallback matching the `/chat/new` splash geometry. */
export function ChatNewLandingSkeleton() {
  return (
    <div className="h-full overflow-hidden bg-textured">
      <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-[760px] flex-col items-center gap-4">
          <ComposerGreeting className="mb-4" />
          <ChatSplashComposerShell />
          <ComposerQuickActionsSkeleton className="w-full max-w-[720px]" />
        </div>
      </div>
    </div>
  );
}
