import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { ChatConversationRoom } from "@ai-matrx/chat/agents/components/chat/ChatConversationRoom";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@ai-matrx/chat/agents/components/chat/chat-quick-actions.config";
import { ChatConversationWarmup } from "@/components/warmup/ChatConversationWarmup";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { ServerReadRecheck } from "@/features/access-gate/components/ServerReadRecheck";
import { ChatNewLandingSkeleton } from "@ai-matrx/chat/agents/components/chat/ChatNewClient";
import { resolveMandateSeed } from "@/features/mandates/seed.server";
import { ChatRunHeader } from "@ai-matrx/chat/agents/components/chat/ChatRunHeader";
import { readComposerModeCookie } from "@ai-matrx/chat/next/server/composer-mode.server";
import {
  conversationSandboxBindingFromRow,
  type ConversationSandboxBinding,
} from "@/lib/sandbox/conversation-binding-row";

interface ConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

/**
 * First-paint: SSR reads the conversation row and resolves the DISPLAY agent
 * (id + name) so the client shell mounts without a round-trip or a
 * "Loading…" picker. The full bundle (messages, variables, overrides,
 * observability) is hydrated client-side via `loadConversation`.
 *
 * THE ROW IS THE ONLY GATE. `initial_agent_id` is provenance, not a
 * requirement — model-direct API turns, coding-session mirrors, workflow and
 * proof runs all persist conversations with no agent (6,288 live rows on
 * 2026-09-08), and every one of them must open. An agent-less conversation is
 * owned by the `chat.default_new_chat` mandate, exactly like `/chat/new`.
 *
 * An empty or failed read is NEVER guessed at: this page cannot know whether
 * the row is deleted, missing, denied, or the session is anonymous, so it
 * renders `<AccessGate>` and lets the platform answer. It never redirects —
 * a redirect to `/chat/new` was the silent dead end this replaced.
 */
type ConversationSeed =
  | {
      kind: "ok";
      agentId: string | null;
      /** The row's own organization — an agent-less room resolves its mandate there. */
      organizationId: string | null;
      agentName: string | null;
      /**
       * The box this conversation is bound to, read in the SAME round-trip that
       * resolves the agent. It reaches Redux before the bundle RPC does, so the
       * Sandbox / Compute control names the chat's own box from the first
       * render instead of showing nothing (or the user's shared default) until
       * two more round-trips land. Arman, 2026-09-14: "it didn't instantly make
       * sure to put me on the same sandbox in the UI."
       */
      sandboxBinding: ConversationSandboxBinding | null;
    }
  | { kind: "unavailable"; error: PostgrestError | null };

async function resolveConversationSeed(
  conversationId: string,
): Promise<ConversationSeed> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("chat")
    .from("conversation")
    .select(
      "initial_agent_id, organization_id, sandbox_instance_id, app_instance_id, metadata",
    )
    .eq("id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    // Scream server-side; the client `AccessGate` reconciles the true state
    // onto the Error Inspector row. Never swallow, never guess.
    console.error(
      `[chat/${conversationId}] conversation read failed at SSR:`,
      error,
    );
    return { kind: "unavailable", error };
  }
  if (!data) return { kind: "unavailable", error: null };

  const sandboxBinding = conversationSandboxBindingFromRow(data);
  const agentId = (data.initial_agent_id as string | null) ?? null;
  const organizationId = (data.organization_id as string | null) ?? null;
  if (!agentId)
    return { kind: "ok", agentId: null, agentName: null, organizationId, sandboxBinding };
  // `chat.conversation` has no FK on `initial_agent_id`, so the agent name
  // cannot be a PostgREST embed — resolve it with a separate lookup against
  // the canonical `agent.definition` table.
  const agentName = await resolveAgentName(supabase, agentId);
  return { kind: "ok", agentId, agentName, organizationId, sandboxBinding };
}

async function resolveAgentName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agentId: string,
): Promise<string | null> {
  const { data: agentRow } = await supabase
    .schema("agent")
    .from("definition")
    .select("name")
    .eq("id", agentId)
    .maybeSingle();
  return (agentRow?.name as string | null) ?? null;
}

/**
 * The mandate that owns an agent-less room — the same SSR resolution
 * `/chat/new` performs. A failure SCREAMS and returns null; the client room
 * then re-resolves through the one client resolver and goes loud itself.
 * There is no hardcoded-agent fallback.
 */
async function resolveMandateAgent(): Promise<{
  agentId: string;
  agentName: string | null;
} | null> {
  // BOUNDED — see seed.server.ts. The seed screams on its own and never throws.
  const seed = await resolveMandateSeed(DEFAULT_NEW_CHAT_MANDATE_KEY);
  if (!seed.agentId) return null;
  const supabase = await createClient();
  return {
    agentId: seed.agentId,
    agentName: await resolveAgentName(supabase, seed.agentId),
  };
}

export default async function ChatConversationPage({
  params,
}: ConversationPageProps) {
  const { conversationId } = await params;

  const seed = await resolveConversationSeed(conversationId);
  if (seed.kind === "unavailable") {
    return (
      <>
        <ChatRunHeader conversationId={conversationId} />
        {/* The SSR read can run WITHOUT the person's identity (an expired token
            whose refresh outran the server's 2.5s budget goes out as anon), so
            the browser re-reads with its own session before any gate shows. */}
        <ServerReadRecheck
          token="conversation"
          id={conversationId}
          pending={<ChatNewLandingSkeleton />}
        >
          <AccessGate
            token="conversation"
            id={conversationId}
            error={seed.error ?? undefined}
            fallbackHref="/chat/new"
            fallbackLabel="New chat"
          />
        </ServerReadRecheck>
      </>
    );
  }

  const ownedByMandate = seed.agentId === null;
  const [display, initialMode] = await Promise.all([
    ownedByMandate ? resolveMandateAgent() : Promise.resolve(seed),
    readComposerModeCookie(),
  ]);

  return (
    <>
      <ChatConversationWarmup
        conversationId={conversationId}
        agentId={display?.agentId ?? null}
      />
      <ChatRunHeader
        activeAgentId={display?.agentId ?? undefined}
        initialAgentName={display?.agentName ?? undefined}
        conversationId={conversationId}
        composerMode={{ initialMode }}
      />
      <ChatConversationRoom
        conversationId={conversationId}
        agentId={display?.agentId ?? null}
        ownedByMandate={ownedByMandate}
        sandboxBinding={seed.sandboxBinding}
        organizationId={seed.organizationId}
        composer={{ initialMode }}
      />
    </>
  );
}
