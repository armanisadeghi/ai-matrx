import { Suspense } from "react";
import ChatContainer from "@/features/public-chat/components/ChatContainer";
import ChatLoading from "../../loading";
import { BACKEND_URLS } from "@/lib/api/endpoints";
import { warmAgent } from "@/lib/api/warm-helpers";

/**
 * Agent-Direct Route — /p/chat/a/[id]
 * Opens an empty chat with a specific agent pre-selected.
 * Agent resolution happens in ChatLayoutShell.
 *
 * Server-side: fires a warm call to Python so the agent is cached
 * before the client even loads.
 */
export default async function AgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fire-and-forget: warm the agent on the Python backend.
  warmAgent(id, { baseUrl: BACKEND_URLS.production });

  return (
    <div className="h-full w-full bg-textured">
      <Suspense fallback={<ChatLoading />}>
        <ChatContainer className="h-full" />
      </Suspense>
    </div>
  );
}
