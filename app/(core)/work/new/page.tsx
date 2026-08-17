import { createClient } from "@/utils/supabase/server";
import { AiWorkHeader } from "@/features/ai-work/components/AiWorkHeader";
import { AiWorkComposer } from "@/features/ai-work/compose/components/AiWorkComposer";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";
import { resolveMandateServer } from "@/features/agents/mandates/service.server";

export function generateMetadata() {
  return { title: "Start work" };
}

/**
 * SSR mandate resolution, exactly as `/chat/new` does it: the agent that owns new
 * work for THIS user (system default → their own binding). Resolving here means
 * the composer mounts with a real expert system and no client flash. A failure
 * SCREAMS server-side and returns null — the composer then asks the user to
 * choose one. There is no hardcoded-agent fallback.
 */
async function resolveDefaultAgentId(): Promise<string | null> {
  try {
    const resolved = await resolveMandateServer(DEFAULT_NEW_CHAT_MANDATE_KEY);
    return resolved.agentId;
  } catch (error) {
    console.error(
      `[work/new] mandate "${DEFAULT_NEW_CHAT_MANDATE_KEY}" failed to resolve at SSR:`,
      error,
    );
    return null;
  }
}

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

export default async function WorkNewPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { request } = await searchParams;
  const agentId = await resolveDefaultAgentId();
  const agentName = agentId ? await resolveAgentName(agentId) : null;

  return (
    <>
      <AiWorkHeader />
      <div className="h-full min-h-0 overflow-y-auto pt-[var(--shell-header-h)]">
        <AiWorkComposer
          defaultAgentId={agentId}
          defaultAgentName={agentName}
          savedRequestId={request}
        />
      </div>
    </>
  );
}
