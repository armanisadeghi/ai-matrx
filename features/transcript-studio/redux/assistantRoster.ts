/**
 * features/transcript-studio/redux/assistantRoster.ts
 *
 * Pure helpers for the per-session assistant conversation roster
 * (`studio_sessions.assistant_conversations`). Each session can hold several
 * assistant conversations — one per agent the user has talked to — and one is
 * "active" (`assistant_conversation_id`). A conversation is bound to its agent
 * at creation, so switching agents means picking another roster entry or
 * minting a new one; it is never re-pointed.
 *
 * These functions are intentionally free of Redux/Supabase so the ensure /
 * switch / set-active thunks can share one definition of "the default agent"
 * and "add/touch a roster entry".
 */

import type { RootState } from "@/lib/redux/store";
import type { AssistantConversationRef } from "../types";
import { AUDIO_ASSISTANT_AGENT_ID } from "../constants";

/**
 * The agent the assistant should use when nothing more specific applies.
 * Precedence: an explicit `overrideAgentId` (a surface that brings its own
 * default agent — e.g. a War Room tile defaulting to the Thread persona) → the
 * user-wide Scribe preference → the seeded audio-assistant agent. (Per-session
 * choices live on the roster and take precedence over all of these.)
 */
export function resolveDefaultAssistantAgentId(
  state: RootState,
  overrideAgentId?: string,
): string {
  return (
    overrideAgentId ||
    state.userPreferences?.transcription?.scribeAssistantAgentId ||
    AUDIO_ASSISTANT_AGENT_ID
  );
}

/** Find the roster entry for a conversation id. */
export function findRosterByConversation(
  roster: AssistantConversationRef[],
  conversationId: string,
): AssistantConversationRef | undefined {
  return roster.find((c) => c.conversationId === conversationId);
}

/** The most-recently-used roster entry for a given agent, if any. */
export function findRosterByAgent(
  roster: AssistantConversationRef[],
  agentId: string,
): AssistantConversationRef | undefined {
  return [...roster]
    .filter((c) => c.agentId === agentId)
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0];
}

/** Append a new conversation to the roster (no dedupe — caller guarantees id is new). */
export function appendRoster(
  roster: AssistantConversationRef[],
  ref: AssistantConversationRef,
): AssistantConversationRef[] {
  return [...roster, ref];
}

/** Bump the `lastUsedAt` of one conversation to now. */
export function touchRoster(
  roster: AssistantConversationRef[],
  conversationId: string,
  now: string = new Date().toISOString(),
): AssistantConversationRef[] {
  return roster.map((c) =>
    c.conversationId === conversationId ? { ...c, lastUsedAt: now } : c,
  );
}

/** Build a fresh roster entry timestamped now. */
export function makeRosterRef(
  conversationId: string,
  agentId: string,
): AssistantConversationRef {
  const now = new Date().toISOString();
  return { conversationId, agentId, createdAt: now, lastUsedAt: now };
}
