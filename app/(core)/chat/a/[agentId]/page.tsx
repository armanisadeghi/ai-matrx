import { Suspense } from "react";
import { ChatNewLandingSkeleton } from "@ai-matrx/chat/agents/components/chat/ChatNewClient";
import { createClient } from "@/utils/supabase/server";
import { WarmOnRoute } from "@/components/warmup/WarmOnRoute";
import { ChatRoomClient } from "@ai-matrx/chat/agents/components/chat/ChatRoomClient";
import { ChatRunHeader } from "@ai-matrx/chat/agents/components/chat/ChatRunHeader";
import { readComposerModeCookie } from "@ai-matrx/chat/next/server/composer-mode.server";

interface DirectAgentChatPageProps {
  params: Promise<{ agentId: string }>;
}

/**
 * Resolves just the agent's display name — single-column query so first paint
 * has a real label for the picker without forcing the full agent fetch on the
 * server. Returns `null` on missing/RLS-denied; the client renders "Select an
 * agent" in that case (rare — usually means the link is stale).
 */
async function resolveAgentName(agentId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("name")
    .is("deleted_at", null)
    .eq("id", agentId)
    .maybeSingle();
  if (error || !data) return null;
  return (data.name as string | null) ?? null;
}

/**
 * Direct-to-agent chat route. Mounts the chat shell with an `agentId` but no
 * `conversationId` — `ChatRoomClient` creates a fresh instance via
 * `useAgentLauncher`. After the user sends their first message, the client
 * `router.replace`s to `/chat/[conversationId]` so the URL no longer pins
 * them to the agent route.
 */
async function DirectAgentChatSeeded({
  params,
}: DirectAgentChatPageProps) {
  const { agentId } = await params;
  const [agentName, initialMode] = await Promise.all([
    resolveAgentName(agentId),
    readComposerModeCookie(),
  ]);
  return (
    <>
      <WarmOnRoute items={[{ key: "agent", id: agentId }]} reason="route" />
      <ChatRunHeader
        activeAgentId={agentId}
        initialAgentName={agentName ?? undefined}
        composerMode={{ initialMode }}
      />
      {/* The agent's own organization has nothing to do with where the chat
          lands — the conversation belongs to the person's working
          organization, so no switch-organization offer (Arman, 2026-09-26). */}
      <ChatRoomClient agentId={agentId} composer={{ initialMode }} />
    </>
  );
}

/**
 * 🚨 THE PAGE STREAMS: the seed reads above resolve inside a Suspense child, so
 * the shell goes out with the first byte instead of waiting for them
 * (same fix as /chat/new, 2026-10-09).
 */
export default function DirectAgentChatPage({ params }: DirectAgentChatPageProps) {
  return (
    <Suspense fallback={<ChatNewLandingSkeleton />}>
      <DirectAgentChatSeeded params={params} />
    </Suspense>
  );
}
