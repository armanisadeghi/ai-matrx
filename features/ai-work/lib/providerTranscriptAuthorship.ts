import { formatText } from "@ai-matrx/kit/text-case";
import type { ProviderConversationMessage } from "./providerConversationMessage";

export interface TranscriptAuthorship {
  /** Who wrote the turn, in the words the page shows. */
  label: string;
  /** A short qualifier, when one is true (an agent run's host). */
  note: string | null;
  /** True when AI Matrx authored it, so the turn is visibly marked. */
  fromMatrx: boolean;
}

/**
 * WHO wrote this turn, in words, from the row's own attribution — never from
 * the page's provider label. Three authorships share one conversation now:
 *   * a mirrored provider turn (no `metadata.origin`) — the provider's label,
 *     exactly as before;
 *   * an AI Matrx reply (a person's, or the agent's answer to it);
 *   * an AI Matrx agent run triggered from the coding host through our MCP.
 * When the server reported no agent name we say "AI Matrx" and stop — a name
 * is never invented from an id or borrowed from the provider.
 */
export function transcriptAuthorship(
  message: ProviderConversationMessage,
  provider: string,
): TranscriptAuthorship {
  const matrxName = message.agentName
    ? `AI Matrx · ${message.agentName}`
    : "AI Matrx";

  if (message.origin === "matrx_agent_run") {
    return {
      label: matrxName,
      note: `run from ${provider}`,
      fromMatrx: true,
    };
  }
  if (message.origin === "ai_matrx_reply") {
    return message.role === "user"
      ? { label: "You (in AI Matrx)", note: null, fromMatrx: true }
      : { label: matrxName, note: null, fromMatrx: true };
  }
  if (message.role === "user") {
    return { label: "You", note: null, fromMatrx: false };
  }
  return {
    label: message.role === "assistant" ? provider : formatText(message.role),
    note: null,
    fromMatrx: false,
  };
}
