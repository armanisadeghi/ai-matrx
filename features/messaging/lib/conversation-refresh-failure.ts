import { SessionUnavailableError } from "@/lib/supabase/authRetry";

/**
 * Keep an expected auth-lifecycle pause out of the red error channel while
 * preserving console.error for genuine conversation-refresh failures.
 */
export function reportConversationRefreshFailure(error: unknown): void {
  if (error instanceof SessionUnavailableError) {
    console.warn(
      "[Messaging] Conversation refresh paused because the session is unavailable; it will resume after authentication recovers.",
    );
    return;
  }

  console.error("[Messaging] Failed to fetch conversation details:", error);
}
