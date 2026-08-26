"use client";

import { ArrowUp, ArrowUpRight, CircleAlert, Mic, Plus } from "lucide-react";
import { ChatRoomClient } from "./ChatRoomClient";
import { chatRouteSurfaceKey } from "./begin-fresh-chat";
import { NewChatGreeting } from "./NewChatGreeting";
import {
  DEFAULT_NEW_CHAT_MANDATE_KEY,
  PRIMARY_QUICK_ACTIONS,
  SECONDARY_QUICK_ACTIONS,
} from "./chat-quick-actions.config";
import { useMandate } from "@/features/agents/mandates/useMandate";

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
 * Mounts the resolved agent so the input bar is immediately usable, and
 * supplies a custom landing (greeting + quick-action chips) above the input
 * via `ChatRoomClient`'s `landingContent` mandate. When the user types and
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
  const { mandate, loading, error } = useMandate(DEFAULT_NEW_CHAT_MANDATE_KEY);
  if (loading) return <ChatNewLandingSkeleton />;
  if (error || !mandate) {
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
              {error ? ` — ${error}` : ""}. Check your chat settings, or try
              again shortly.
            </p>
          </div>
        </div>
      </div>
    );
  }
  return <ChatNewBody agentId={mandate.agentId} />;
}

function ChatNewBody({ agentId }: { agentId: string }) {
  // No eager agent-list fetch here. Chip labels are hardcoded in
  // chat-quick-actions.config.ts (no agent registry lookup) and the default
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
      landingContent={(conversationId) => (
        <NewChatGreeting
          sourceConversationId={conversationId}
          surfaceKey={surfaceKey}
        />
      )}
    />
  );
}

/** Shared SSR/client-retry fallback matching the final `/chat/new` geometry. */
export function ChatNewLandingSkeleton() {
  return (
    <div className="h-full overflow-hidden bg-textured">
      <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-2xl flex-col items-center gap-7">
          <header className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-[clamp(1.75rem,1.4rem+1.6vw,2.75rem)] font-semibold tracking-tight text-foreground">
              Hello
            </h1>
            <p className="text-[clamp(1rem,0.95rem+0.4vw,1.25rem)] text-muted-foreground">
              How can I help you today?
            </p>
          </header>

          <section
            aria-label="Suggested agents loading"
            className="flex flex-wrap items-center justify-center gap-2"
          >
            {PRIMARY_QUICK_ACTIONS.map((action) => (
              <div
                key={action.mandateKey}
                className="group inline-flex h-11 items-center gap-1.5 rounded-full border border-border/80 bg-card px-4 text-sm text-foreground/90 shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_1px_2px_0_rgba(0,0,0,0.06)]"
              >
                <span>{action.label}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/60" />
              </div>
            ))}
          </section>

          <div
            data-chat-new-input-shell="true"
            className="w-full rounded-[28px] border border-border bg-card p-2.5 shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)]"
          >
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-1.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground/70">
                <Plus className="h-5 w-5" />
              </div>
              <div className="min-h-11 px-2 py-2 text-base leading-7 text-muted-foreground/60">
                Ask anything
              </div>
              <div className="flex items-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground/70">
                  <Mic className="h-4 w-4" />
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground/20 text-background">
                  <ArrowUp className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>

          <section
            aria-label="More actions loading"
            className="flex flex-wrap items-center justify-center gap-2"
          >
            {SECONDARY_QUICK_ACTIONS.map((action) => (
              <div
                key={action.mandateKey}
                className="inline-flex min-h-11 items-center rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground shadow-[0_1px_0_0_rgba(255,255,255,0.5)_inset,0_1px_1px_0_rgba(0,0,0,0.04)]"
              >
                {action.label}
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
