import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { ProviderConversationHeader } from "@/features/ai-work/components/ProviderConversationHeader";
import { ProviderConversationTranscript } from "@/features/ai-work/components/ProviderConversationTranscript";
import { MatrxConversationDetail } from "@/features/ai-work/conversations/components/MatrxConversationDetail";
import { readProviderConversation } from "@/features/ai-work/service/providerConversation";

interface WorkConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

export function generateMetadata() {
  return { title: "Conversation provenance" };
}

/**
 * ONE detail route for every conversation in the inbox.
 *
 * A provider mirror gets the read-only transcript (it is agentless and has no
 * chat home); an AI Matrx conversation gets the same provenance view with a
 * door to runnable chat. It used to REDIRECT the second kind to /chat, which
 * made the surface that explains where a conversation's data comes from
 * unreachable for almost the entire corpus.
 */
export default async function WorkConversationPage({
  params,
}: WorkConversationPageProps) {
  const { conversationId } = await params;
  const read = await readProviderConversation(conversationId);

  if (read.state === "not-provider") {
    const title =
      read.conversation.title?.trim() || "Untitled conversation";
    return (
      <>
        <ProviderConversationHeader title={title} />
        <div className="h-full overflow-y-auto pt-[var(--shell-header-h)] scrollbar-thin">
          <MatrxConversationDetail
            conversation={read.conversation}
            runnable={Boolean(read.initialAgentId)}
          />
        </div>
      </>
    );
  }

  const title =
    read.state === "ready"
      ? read.detail.conversation.title?.trim() || "Provider conversation"
      : "Provider conversation";

  return (
    <>
      <ProviderConversationHeader title={title} />
      <div className="h-full overflow-y-auto pt-[var(--shell-header-h)] scrollbar-thin">
        {read.state === "ready" ? (
          <ProviderConversationTranscript detail={read.detail} />
        ) : (
          <AccessGate
            token="conversation"
            id={conversationId}
            error={read.error}
            fallbackHref="/work/conversations"
            fallbackLabel="Conversations"
          />
        )}
      </div>
    </>
  );
}
