import { messagePartsFromPersistedContent } from "@/features/agents/redux/execution-system/messages/persisted-content-boundary";

export interface ProviderMessageDisplay {
  text: string;
  activityCount: number;
}

/**
 * Normalizes validated canonical message parts for a read-only provider
 * transcript. Thinking stays private; non-text parts are counted as activity
 * instead of being fabricated into prose.
 */
export function providerMessageDisplay(
  content: unknown,
): ProviderMessageDisplay {
  const parts = messagePartsFromPersistedContent(content);
  let text = "";
  let activityCount = 0;

  for (const part of parts) {
    if (part.type === "text") {
      if (part.text) text += part.text;
      continue;
    }
    if (part.type !== "thinking") activityCount += 1;
  }

  return { text, activityCount };
}
