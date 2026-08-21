import type { MessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";
import { extractFlatText } from "@/features/agents/redux/execution-system/messages/messages.selectors";

export interface AssistantEditTarget {
  messageId: string;
  content: string;
}

/**
 * Resolve the persisted row that owns the visible answer at the end of an
 * agentic assistant turn. A turn may end with a tool-only row, so the newest
 * row is not necessarily the row whose text Copy / Notes exposed to the user.
 */
export function resolveAssistantEditTarget(
  groupMessageIds: string[] | undefined,
  recordsById: Record<string, MessageRecord> | undefined,
  fallbackMessageId: string,
  fallbackContent: string,
): AssistantEditTarget {
  if (groupMessageIds && recordsById) {
    for (let index = groupMessageIds.length - 1; index >= 0; index -= 1) {
      const candidateMessageId = groupMessageIds[index];
      const candidateContent = extractFlatText(recordsById[candidateMessageId]);
      if (candidateContent.length > 0) {
        return {
          messageId: candidateMessageId,
          content: candidateContent,
        };
      }
    }
  }

  return {
    messageId: fallbackMessageId,
    content: fallbackContent,
  };
}
