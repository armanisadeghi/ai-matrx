import type { Tables } from "@/types/database.types";
import {
  providerMessageDisplay,
  type ProviderMessageDisplay,
} from "./providerMessageText";

/** Messages loaded per transcript page (initial server read and each earlier page). */
export const PROVIDER_TRANSCRIPT_PAGE_SIZE = 200;

/**
 * The exact chat.message columns a provider transcript reads.
 *
 * `agent_id` and `metadata` joined the projection on 2026-09-14: a conversation
 * bound to a coding session is no longer only a mirror. Two kinds of turn are
 * now authored INSIDE AI Matrx on the same row set — a person's reply typed
 * here, and an agent run triggered from the coding host through our MCP — and
 * without these two columns neither is distinguishable from a provider turn,
 * so the page would attribute our own words to Claude Code.
 */
export const PROVIDER_MESSAGE_COLUMNS =
  "id, conversation_id, role, content, position, status, created_at, agent_id, metadata";

export type ProviderConversationMessageRow = Pick<
  Tables<{ schema: "chat" }, "message">,
  | "id"
  | "conversation_id"
  | "role"
  | "content"
  | "position"
  | "status"
  | "created_at"
  | "agent_id"
  | "metadata"
>;

/**
 * WHO authored a turn on a coding-session-bound conversation.
 *
 * The wire contract is the server's (aidream writes every one of these rows):
 *  - `ai_matrx_reply`   — `metadata.origin === "ai_matrx_reply"`: a person's
 *                         reply typed in AI Matrx, or the AI Matrx answer to
 *                         it. The coding host never sees either.
 *  - `matrx_agent_run`  — `metadata.origin === "matrx_agent_run"`: an AI Matrx
 *                         agent run triggered from the coding host through our
 *                         MCP, landing in this same transcript.
 *  - `provider_mirror`  — ABSENCE of `metadata.origin`. That is the contract:
 *                         a mirrored provider turn carries only
 *                         `coding_session_bridge`, so "no origin" is the
 *                         mirror, and anything unreadable degrades to it.
 */
export type ProviderMessageOrigin =
  | "ai_matrx_reply"
  | "matrx_agent_run"
  | "provider_mirror";

/**
 * WHERE a turn came from when it is not native to this conversation.
 *
 * A seeded handoff can MOVE a claiming session's binding onto the conversation
 * being handed over, and the turns that session had already produced travel
 * with it (`metadata.carried_from`, written by the bridge's rebind). Those rows
 * then sit in a transcript whose primary provider is a DIFFERENT tool, so a
 * page that labels every turn with the conversation's provider attributes them
 * to a tool that never wrote them — seen live on 2026-09-18, where two Claude
 * Code turns carried onto a Codex conversation were both bylined "Codex".
 * The row itself knows better, so the row is asked.
 */
export type ProviderMessageCarriedFrom = {
  /** The provider whose session actually produced this turn. */
  provider: string;
  /** That session's own id, when the bridge recorded it. */
  providerSessionId: string | null;
  /** The conversation it was carried off. */
  conversationId: string | null;
};

export type ProviderConversationMessage = Omit<
  ProviderConversationMessageRow,
  "content" | "metadata" | "agent_id"
> & {
  display: ProviderMessageDisplay;
  contentValid: boolean;
  origin: ProviderMessageOrigin;
  /** The responder agent's id, from the row's own column. Never derived. */
  agentId: string | null;
  /**
   * The responder agent's display name, read ONLY from the metadata block the
   * server wrote (`ai_matrx_reply.agent_name` / `agent_run.agent_name`).
   * `null` when absent — a name is never invented from an id, a slug, or a
   * provider label.
   */
  agentName: string | null;
  /**
   * Set only on a turn a handoff rebind MOVED onto this conversation, naming
   * the provider session that actually produced it. The transcript labels the
   * turn from this rather than from the conversation's own provider.
   */
  carriedFrom: ProviderMessageCarriedFrom | null;
};

/** `metadata` is unknown JSON on the wire. Narrow, never assume. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export interface ProviderMessageAttribution {
  origin: ProviderMessageOrigin;
  agentName: string | null;
  /** Null for every turn native to this conversation, which is most of them. */
  carriedFrom: ProviderMessageCarriedFrom | null;
}

/**
 * The `carried_from` block a handoff rebind stamped on a moved turn, or null.
 *
 * Only a block that NAMES a provider counts: the label is the whole point, and
 * a carry we cannot attribute must read as an ordinary turn rather than as an
 * unnamed "carried from somewhere", which tells a person nothing and looks
 * broken.
 */
export function readCarriedFrom(
  metadata: unknown,
): ProviderMessageCarriedFrom | null {
  if (!isRecord(metadata)) return null;
  const block = isRecord(metadata.carried_from) ? metadata.carried_from : null;
  if (!block) return null;
  const provider = readString(block.provider);
  if (!provider) return null;
  return {
    provider,
    providerSessionId: readString(block.provider_session_id),
    conversationId: readString(block.conversation_id),
  };
}

/**
 * Read the authorship block out of a row's metadata.
 *
 * Defensive on purpose: every field is optional on the wire, the JSON can be
 * any shape, and a row we cannot read is reported as a provider mirror with NO
 * attribution rather than a guess.
 */
export function readProviderMessageAttribution(
  metadata: unknown,
): ProviderMessageAttribution {
  if (!isRecord(metadata)) {
    return { origin: "provider_mirror", agentName: null, carriedFrom: null };
  }

  const carriedFrom = readCarriedFrom(metadata);
  const origin = readString(metadata.origin);
  if (origin === "ai_matrx_reply") {
    const block = isRecord(metadata.ai_matrx_reply)
      ? metadata.ai_matrx_reply
      : null;
    return {
      origin: "ai_matrx_reply",
      agentName: block ? readString(block.agent_name) : null,
      carriedFrom,
    };
  }
  if (origin === "matrx_agent_run") {
    const block = isRecord(metadata.agent_run) ? metadata.agent_run : null;
    return {
      origin: "matrx_agent_run",
      agentName: block ? readString(block.agent_name) : null,
      carriedFrom,
    };
  }
  // Absence of a known origin IS the provider mirror. An origin string we do
  // not know is also not ours to claim — it renders as the mirror it came from
  // rather than borrowing an AI Matrx byline.
  return { origin: "provider_mirror", agentName: null, carriedFrom };
}

export function normalizeProviderMessage(
  message: ProviderConversationMessageRow,
): ProviderConversationMessage {
  let attribution: ProviderMessageAttribution = {
    origin: "provider_mirror",
    agentName: null,
    carriedFrom: null,
  };
  try {
    attribution = readProviderMessageAttribution(message.metadata);
  } catch (error) {
    // Same honesty as the invalid-content branch below: an unreadable row is
    // reported, and shown as a mirror with no attribution — never as an
    // AI Matrx turn we cannot substantiate.
    console.error(
      "[normalizeProviderMessage] unreadable persisted message metadata",
      { messageId: message.id, error },
    );
  }

  try {
    return {
      id: message.id,
      conversation_id: message.conversation_id,
      role: message.role,
      position: message.position,
      status: message.status,
      created_at: message.created_at,
      display: providerMessageDisplay(message.content),
      contentValid: true,
      origin: attribution.origin,
      agentId: message.agent_id,
      agentName: attribution.agentName,
      carriedFrom: attribution.carriedFrom,
    };
  } catch (error) {
    console.error(
      "[normalizeProviderMessage] invalid persisted message content",
      { messageId: message.id, error },
    );
    return {
      id: message.id,
      conversation_id: message.conversation_id,
      role: message.role,
      position: message.position,
      status: message.status,
      created_at: message.created_at,
      display: { text: "", activityCount: 0 },
      contentValid: false,
      origin: attribution.origin,
      agentId: message.agent_id,
      agentName: attribution.agentName,
      carriedFrom: attribution.carriedFrom,
    };
  }
}
