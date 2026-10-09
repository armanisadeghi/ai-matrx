import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import {
  ChatNewClient,
  ChatNewLandingSkeleton,
} from "@ai-matrx/chat/agents/components/chat/ChatNewClient";
import { ChatNewHeader } from "@ai-matrx/chat/agents/components/chat/ChatNewHeader";
import { readComposerModeCookie } from "@ai-matrx/chat/next/server/composer-mode.server";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@ai-matrx/chat/agents/components/chat/chat-quick-actions.config";
import { ChatMandateWarmup } from "@/components/warmup/ChatMandateWarmup";
import { resolveMandateSeed } from "@/features/mandates/seed.server";
import { isUuidShape } from "@ai-matrx/kit/uuid";

/**
 * SSR mandate resolution: which agent owns `/chat/new` for THIS user (system
 * default → their own `chat.default_new_chat` binding). Resolving here means
 * the header and input bar mount the right agent with no client flash. On a
 * resolution failure we SCREAM server-side and return null — the client then
 * re-attempts through the one client resolver and surfaces its loud error
 * state; there is no hardcoded-agent fallback.
 */
async function resolveDefaultChatAgentId(): Promise<string | null> {
  // BOUNDED — see seed.server.ts. The seed screams on its own and never throws.
  return (await resolveMandateSeed(DEFAULT_NEW_CHAT_MANDATE_KEY)).agentId;
}

/**
 * Single-column SSR lookup for the default agent's display name so the chat
 * picker bar has a real label on first paint (instead of the bare placeholder
 * or a "loading" flicker). The lazy `AgentListDropdown` still defers its full
 * fetch until the user actually clicks the picker.
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
  return data.name ?? null;
}

/** `?agent=<id>` — an explicit agent for this new chat (feedback c0875460). */
function requestedAgentId(
  searchParams: Record<string, string | string[] | undefined>,
): string | null {
  const raw = searchParams.agent;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && isUuidShape(value) ? value : null;
}

/**
 * 🚨 THE PAGE STREAMS. Nothing here is awaited above a Suspense boundary: the
 * shell and the composer outline go out with the first byte, and the default
 * agent's seed (three sequential reads — mandate, treatment, agent name)
 * fills in behind it. Awaiting them at the top held the whole document until
 * every read had come back (first byte ~6 s signed in, 2026-10-09).
 */
export default function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<ChatNewLandingSkeleton />}>
      <NewChatSeeded searchParams={searchParams} />
    </Suspense>
  );
}

async function NewChatSeeded({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const pinnedAgentId = requestedAgentId(await searchParams);
  const [defaultAgentId, initialMode] = await Promise.all([
    pinnedAgentId ? Promise.resolve(null) : resolveDefaultChatAgentId(),
    readComposerModeCookie(),
  ]);
  // An explicit agent wins over the default-chat mandate; it is addressed
  // directly (like /chat/a/[agentId]) so an unreadable id shows the access
  // gate rather than silently answering with someone else.
  const agentId = pinnedAgentId ?? defaultAgentId;
  const defaultAgentName = agentId ? await resolveAgentName(agentId) : null;
  return (
    <>
      {!pinnedAgentId && (
        <ChatMandateWarmup
          mandateKey={DEFAULT_NEW_CHAT_MANDATE_KEY}
          agentId={agentId}
        />
      )}
      <ChatNewHeader
        agentId={agentId}
        initialAgentName={defaultAgentName ?? undefined}
        composerMode={{ initialMode }}
      />
      <Suspense fallback={<ChatNewLandingSkeleton />}>
        <ChatNewClient
          agentId={agentId}
          pinned={Boolean(pinnedAgentId)}
          composer={{ initialMode }}
        />
      </Suspense>
      {/* No conversion nudge here: the send gate is gone (guests send for
          real), so gate-attempt-driven nudges can never fire on this page. */}
    </>
  );
}
