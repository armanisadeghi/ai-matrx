import type { MessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";
import { extractFlatText } from "@/features/agents/redux/execution-system/messages/messages.selectors";

export interface AssistantEditTarget {
  messageId: string;
  content: string;
  /**
   * True when `content` is a pretty-printed JSON raw view of a structured
   * (non-text) stored payload rather than editable flat text. The edit
   * entry points open the read-only raw viewer for these — never the
   * text editor (see openAssistantMessageEditor).
   */
  isStructuredRaw: boolean;
}

/**
 * Resolve the persisted row that owns the visible answer at the end of an
 * agentic assistant turn. A turn may end with a tool-only row, so the newest
 * row is not necessarily the row whose text Copy / Notes exposed to the user.
 *
 * When NO row in the group carries text (e.g. the turn's content is a pure
 * media-block array), the anchor message falls back to its structured raw
 * view (`fallbackIsStructuredRaw`) so the edit affordance shows the stored
 * payload instead of an empty editor.
 */
export function resolveAssistantEditTarget(
  groupMessageIds: string[] | undefined,
  recordsById: Record<string, MessageRecord> | undefined,
  fallbackMessageId: string,
  fallbackContent: string,
  fallbackIsStructuredRaw = false,
): AssistantEditTarget {
  if (groupMessageIds && recordsById) {
    for (let index = groupMessageIds.length - 1; index >= 0; index -= 1) {
      const candidateMessageId = groupMessageIds[index];
      const candidateContent = extractFlatText(recordsById[candidateMessageId]);
      if (candidateContent.length > 0) {
        return {
          messageId: candidateMessageId,
          content: candidateContent,
          isStructuredRaw: false,
        };
      }
    }
  }

  return {
    messageId: fallbackMessageId,
    content: fallbackContent,
    isStructuredRaw: fallbackIsStructuredRaw,
  };
}
