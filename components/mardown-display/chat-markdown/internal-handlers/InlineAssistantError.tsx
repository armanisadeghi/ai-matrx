"use client";

/**
 * InlineAssistantError — renders a request's error at its CHRONOLOGICAL spot
 * in the streamed content flow.
 *
 * Mounted only by EnhancedChatMarkdown for an `error` unified slot, which
 * `selectUnifiedSlots` emits exclusively for a MID-TURN error (one the model
 * recovered from and kept streaming past). It reads the error payload straight
 * from Redux by `requestId` (one error per request) and renders the same
 * compact `AssistantError` line used for failed turns — minus Retry, because a
 * mid-turn error isn't the terminal state of the turn (the turn continued).
 *
 * A FATAL error (stream died, nothing after it) produces no `error` slot, so
 * it never reaches here: it stays the trailing failed-turn render in
 * AgentAssistantMessage, Retry affordance and all.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { selectRequestError } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { AssistantError } from "@/features/agents/components/run/AssistantError";

export function InlineAssistantError({ requestId }: { requestId: string }) {
  const streamError = useAppSelector(selectRequestError(requestId));
  if (!streamError) return null;

  // Mirror AgentAssistantMessage's failed-turn derivation so the inline and
  // trailing presentations are byte-for-byte identical.
  const friendly =
    streamError.user_message ?? streamError.message ?? "The response failed.";
  const technical = streamError.message;
  const detail = technical && technical !== friendly ? technical : undefined;
  const code =
    streamError.code ??
    (streamError.details &&
    typeof streamError.details === "object" &&
    "status_code" in streamError.details
      ? (streamError.details as { status_code?: string | number }).status_code
      : undefined);

  return (
    <AssistantError
      message={friendly}
      detail={detail}
      errorType={streamError.error_type}
      code={code}
    />
  );
}
