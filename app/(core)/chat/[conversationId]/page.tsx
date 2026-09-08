import type { Metadata } from "next";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { ChatConversationRoom } from "@/features/agents/components/chat/ChatConversationRoom";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { resolveMandateServer } from "@/features/mandates/service.server";
import { ChatRunHeader } from "@/features/agents/components/chat/ChatRunHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

interface ConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

interface ConversationMetadataProps extends ConversationPageProps {
  searchParams: Promise<{ attention?: string | string[] }>;
}

export async function generateMetadata({
  params,
  searchParams,
}: ConversationMetadataProps): Promise<Metadata> {
  const [{ conversationId }, query] = await Promise.all([params, searchParams]);
  if (query.attention !== "approval") return {};

  return createDynamicRouteMetadata("/chat", {
    title: "Approval needed",
    description: "A secure action from your AI Matrx text assistant is waiting for your review.",
    letter: "C",
    socialCard: {
      eyebrow: "Text assistant",
      intent: "Action waiting",
      seed: `approval:${conversationId}`,
    },
  });
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
  | { kind: "ok"; agentId: string | null; agentName: string | null }
  | { kind: "unavailable"; error: PostgrestError | null };

async function resolveConversationSeed(
  conversationId: string,
): Promise<ConversationSeed> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("chat")
    .from("conversation")
    .select("initial_agent_id")
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

  const agentId = (data.initial_agent_id as string | null) ?? null;
  if (!agentId) return { kind: "ok", agentId: null, agentName: null };
  // `chat.conversation` has no FK on `initial_agent_id`, so the agent name
  // cannot be a PostgREST embed — resolve it with a separate lookup against
  // the canonical `agent.definition` table.
  const agentName = await resolveAgentName(supabase, agentId);
  return { kind: "ok", agentId, agentName };
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
  try {
    const resolved = await resolveMandateServer(DEFAULT_NEW_CHAT_MANDATE_KEY);
    const supabase = await createClient();
    return {
      agentId: resolved.agentId,
      agentName: await resolveAgentName(supabase, resolved.agentId),
    };
  } catch (error) {
    console.error(
      `[chat/[conversationId]] mandate "${DEFAULT_NEW_CHAT_MANDATE_KEY}" failed to resolve at SSR — deferring to client resolution:`,
      error,
    );
    return null;
  }
}

export default async function ChatConversationPage({
  params,
}: ConversationPageProps) {
  const { conversationId } = await params;

  const seed = await resolveConversationSeed(conversationId);
  if (seed.kind === "unavailable") {
    return (
      <>
        <PageHeader>
          <ChatRunHeader conversationId={conversationId} />
        </PageHeader>
        <AccessGate
          token="conversation"
          id={conversationId}
          error={seed.error ?? undefined}
          fallbackHref="/chat/new"
          fallbackLabel="New chat"
        />
      </>
    );
  }

  const ownedByMandate = seed.agentId === null;
  const display = ownedByMandate ? await resolveMandateAgent() : seed;

  return (
    <>
      <PageHeader>
        <ChatRunHeader
          activeAgentId={display?.agentId ?? undefined}
          initialAgentName={display?.agentName ?? undefined}
          conversationId={conversationId}
        />
      </PageHeader>
      <ChatConversationRoom
        conversationId={conversationId}
        agentId={display?.agentId ?? null}
        ownedByMandate={ownedByMandate}
      />
    </>
  );
}
