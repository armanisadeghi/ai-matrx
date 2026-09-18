import { formatText } from "@ai-matrx/kit/text-case";
import { providerLabel } from "../conversations/presentation";
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
 *
 * A FOURTH case arrived with the cross-tool handoff: a turn another tool's
 * session produced, MOVED onto this conversation when that session's binding
 * was rebound (`carriedFrom`). The conversation's provider did not write it, so
 * the page must not sign it with that provider's name — live on 2026-09-18 two
 * Claude Code turns carried onto a Codex conversation were both bylined
 * "Codex". The row names its own producer; that name wins, and the note says
 * the turn was carried in so the byline is not mistaken for a native one.
 */
export function transcriptAuthorship(
  message: ProviderConversationMessage,
  provider: string,
): TranscriptAuthorship {
  const matrxName = message.agentName
    ? `AI Matrx · ${message.agentName}`
    : "AI Matrx";
  // The tool that actually produced this turn. For all but a carried turn that
  // IS the conversation's provider, so nothing else in this function changes.
  const carried = message.carriedFrom;
  const author = carried
    ? (providerLabel(carried.provider) ?? formatText(carried.provider))
    : provider;
  const carriedNote = carried ? "carried in by a handoff" : null;

  if (message.origin === "matrx_agent_run") {
    return {
      label: matrxName,
      // Where it was run FROM is the session that triggered it, which for a
      // carried turn is that session's tool, not this conversation's.
      note: `run from ${author}${carried ? ", carried in by a handoff" : ""}`,
      fromMatrx: true,
    };
  }
  if (message.origin === "ai_matrx_reply") {
    // Authored in AI Matrx either way; a carry moved it, it did not write it.
    return message.role === "user"
      ? { label: "You (in AI Matrx)", note: carriedNote, fromMatrx: true }
      : { label: matrxName, note: carriedNote, fromMatrx: true };
  }
  if (message.role === "user") {
    // The person typed it, whichever tool they typed it in — but on a carried
    // turn the tool is worth saying, because that is where it was said.
    return {
      label: "You",
      note: carried ? `in ${author}, carried in by a handoff` : null,
      fromMatrx: false,
    };
  }
  return {
    label: message.role === "assistant" ? author : formatText(message.role),
    note: carriedNote,
    fromMatrx: false,
  };
}
