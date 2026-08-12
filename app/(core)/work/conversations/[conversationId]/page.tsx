import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { ProviderConversationHeader } from "@/features/ai-work/components/ProviderConversationHeader";
import { ProviderConversationTranscript } from "@/features/ai-work/components/ProviderConversationTranscript";
import { readProviderConversation } from "@/features/ai-work/service/providerConversation";
import { redirect } from "next/navigation";

interface WorkConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

export function generateMetadata() {
  return { title: "Provider conversation" };
}

export default async function WorkConversationPage({
  params,
}: WorkConversationPageProps) {
  const { conversationId } = await params;
  const read = await readProviderConversation(conversationId);

  if (read.state === "not-provider") {
    redirect(
      read.initialAgentId ? `/chat/${conversationId}` : "/work/conversations",
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
            fallbackLabel="Provider conversations"
          />
        )}
      </div>
    </>
  );
}
