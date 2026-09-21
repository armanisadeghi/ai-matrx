import { redirect } from "next/navigation";
import { resolveMandateSeed } from "@/features/mandates/seed.server";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";

/**
 * `/chat/talk` — start talking with whichever agent owns new chats for THIS
 * user (system default → their own `chat.default_new_chat` binding), the same
 * mandate `/chat/new` resolves. No hardcoded agent, no silent fallback: if the
 * mandate cannot resolve we send the user to `/chat/new`, which surfaces the
 * failure in its own loud error state rather than inventing an agent here.
 */
export default async function VoiceChatEntryPage() {
  // BOUNDED, and the redirect now lives OUTSIDE the failure handling: `redirect()`
  // throws by design, so the old shape had to recognise its own digest to avoid
  // swallowing it. `resolveMandateSeed` never throws and gives up at its
  // deadline (see seed.server.ts — an unbounded await here is a 504, not a
  // slow page).
  const seed = await resolveMandateSeed(DEFAULT_NEW_CHAT_MANDATE_KEY);
  if (!seed.agentId) {
    console.error(
      `[chat/talk] mandate "${DEFAULT_NEW_CHAT_MANDATE_KEY}" failed to resolve:`,
      seed.unavailable,
    );
    redirect("/chat/new");
  }
  redirect(`/chat/talk/a/${encodeURIComponent(seed.agentId)}`);
}
