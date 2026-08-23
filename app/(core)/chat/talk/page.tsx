import { redirect } from "next/navigation";
import { resolveMandateServer } from "@/features/agents/mandates/service.server";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";

/**
 * `/chat/talk` — start talking with whichever agent owns new chats for THIS
 * user (system default → their own `chat.default_new_chat` binding), the same
 * mandate `/chat/new` resolves. No hardcoded agent, no silent fallback: if the
 * mandate cannot resolve we send the user to `/chat/new`, which surfaces the
 * failure in its own loud error state rather than inventing an agent here.
 */
export default async function VoiceChatEntryPage() {
  try {
    const resolved = await resolveMandateServer(DEFAULT_NEW_CHAT_MANDATE_KEY);
    redirect(`/chat/talk/a/${encodeURIComponent(resolved.agentId)}`);
  } catch (error) {
    // `redirect()` throws by design — never swallow it as a resolution failure.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    console.error(
      `[chat/talk] mandate "${DEFAULT_NEW_CHAT_MANDATE_KEY}" failed to resolve:`,
      error,
    );
    redirect("/chat/new");
  }
}
