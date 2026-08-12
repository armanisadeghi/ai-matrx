import { AiWorkConversationsInbox } from "@/features/ai-work/components/AiWorkConversationsInbox";
import { AiWorkHeader } from "@/features/ai-work/components/AiWorkHeader";

export function generateMetadata() {
  return { title: "Conversations" };
}

export default function WorkConversationsPage() {
  return (
    <>
      <AiWorkHeader />
      <div className="flex h-full min-h-0 flex-col overflow-hidden pt-[var(--shell-header-h)]">
        <AiWorkConversationsInbox />
      </div>
    </>
  );
}
