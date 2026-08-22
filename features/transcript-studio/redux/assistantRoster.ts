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
 * These functions carry no Redux dispatch of their own so the ensure / switch /
 * set-active thunks can share one definition of "the default agent" and
 * "add/touch a roster entry". The default-agent resolver is async because its
 * last tier is the Mandate (`transcript_studio.document_edit`), resolved at
 * call time — never a hardcoded agent id.
 */

import type { RootState } from "@/lib/redux/store";
import type { AssistantConversationRef } from "../types";
import { TRANSCRIPT_STUDIO_ASSISTANT_MANDATE_KEY } from "../constants";
import { resolveMandate } from "@/features/agents/mandates/service";
import { selectSurfaceConfigEntry } from "@/features/surfaces/redux/surfaceConfigSlice";
import { TRANSCRIPT_SCRIBE_SURFACE } from "@/features/surfaces/manifests/transcript-scribe.manifest";

/**
 * The agent the assistant should use when nothing more specific applies.
 * Precedence: an explicit `overrideAgentId` (a surface that brings its own
 * default agent — e.g. a War Room tile defaulting to the Thread persona) → the
 * `assistant` role on the `matrx-user/transcript-scribe` surface (resolved
 * global → org → user via surface-config; hydrated by `ScribeScreen`'s
 * `useSurfaceConfig` mount) → the `transcript_studio.document_edit` Mandate
 * (system default = the seeded audio assistant, which is also the role's
 * platform default, so the two tiers only differ pre-hydration or after a
 * user rebinds the mandate). An unresolvable mandate throws — the caller
 * refuses loudly; there is no hardcoded fallback.
 * (Per-session choices live on the roster and take precedence over all.)
 *
 * This REPLACED `userPreferences.transcription.scribeAssistantAgentId`
 * (deleted 2026-07-12) — user overrides now live in `ui_surface_agent_pref`.
 */
export async function resolveDefaultAssistantAgentId(
  state: RootState,
  overrideAgentId?: string,
): Promise<string> {
  if (overrideAgentId) return overrideAgentId;
  const entry = selectSurfaceConfigEntry(state, TRANSCRIPT_SCRIBE_SURFACE);
  const roleAgent =
    entry?.resolved?.roles["assistant"]?.effective[0]?.agentId ?? null;
  if (roleAgent) return roleAgent;
  const mandate = await resolveMandate(TRANSCRIPT_STUDIO_ASSISTANT_MANDATE_KEY);
  return mandate.agentId;
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
