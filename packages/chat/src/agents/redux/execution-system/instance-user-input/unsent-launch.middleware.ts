// features/agents/redux/execution-system/instance-user-input/unsent-launch.middleware.ts
//
// Keeps each unsent agent WINDOW's launch recipe current (unsent-launch-store.ts)
// and drops it the moment the conversation is sent or destroyed. Driven by the
// conversation state every launch already writes, so every window launch path
// — the Agents menu, send-to-agent, custom agent, shortcuts, mandates — is
// covered without its callers knowing this exists.

import type { Middleware } from "@reduxjs/toolkit";
import type { RootState } from "@host/lib/redux/rootReducer";
import { destroyInstance } from "../conversations/conversations.slice";
import { DISPLAY_MODE_TO_OVERLAY_ID } from "../display-mode-overlay";
import {
  clearUnsentLaunch,
  writeUnsentLaunch,
  type UnsentLaunchRecipe,
} from "./unsent-launch-store";

const WRITE_DEBOUNCE_MS = 400;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, UnsentLaunchRecipe>();
/** Conversations holding a recipe — so a SENT one clears storage once, not per stream chunk. */
const kept = new Set<string>();

function cancel(conversationId: string): void {
  const t = timers.get(conversationId);
  if (t) clearTimeout(t);
  timers.delete(conversationId);
  pending.delete(conversationId);
}

let pagehideBound = false;
function bindPagehideFlush(): void {
  if (pagehideBound || typeof window === "undefined") return;
  pagehideBound = true;
  // The reload is the case this exists for: flush what is still debouncing.
  window.addEventListener("pagehide", () => {
    for (const [id, recipe] of pending) writeUnsentLaunch(id, recipe);
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    pending.clear();
  });
}

/**
 * SENT means the person pressed send — a request exists or the transcript
 * holds a turn — NOT that the server has confirmed the row. `cacheOnly` only
 * flips when the stream's `record_reserved` event arrives, seconds into the
 * first turn (never, if that stream dies first). Keying "unsent" on it kept
 * the recipe alive across the send, so a reload in that window rebuilt a
 * fresh, empty, cache-only conversation under the SAME id while the server
 * finished the real turn behind it — and the next send went out `is_new:true`
 * and was refused "Conversation already exists … Pass is_new=false"
 * (2026-10-01, the /notes page agents panel).
 */
export function conversationWasSent(
  state: RootState,
  conversationId: string,
): boolean {
  const conv = state.conversations.byConversationId[conversationId];
  if (conv?.cacheOnly === false) return true;
  if ((state.messages?.byConversationId?.[conversationId]?.orderedIds?.length ?? 0) > 0) {
    return true;
  }
  return (state.activeRequests?.byConversationId?.[conversationId]?.length ?? 0) > 0;
}

/** The recipe for an unsent conversation shown in a window, or null. */
export function buildUnsentLaunchRecipe(
  state: RootState,
  conversationId: string,
): UnsentLaunchRecipe | null {
  const conv = state.conversations.byConversationId[conversationId];
  if (!conv || !conv.agentId || conversationWasSent(state, conversationId)) {
    return null;
  }
  const ui = state.instanceUIState.byConversationId[conversationId];
  const displayMode = ui?.displayMode;
  // Only a window has an address to come back from; page composers keep their
  // own draft through the composer store's surface alias.
  if (!displayMode || !DISPLAY_MODE_TO_OVERLAY_ID[displayMode]) return null;

  const vars = state.instanceVariableValues.byConversationId[conversationId];
  const hostNames = new Set(vars?.hostValueNames ?? []);
  const hostValues: Record<string, unknown> = {};
  const userValues: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(vars?.userValues ?? {})) {
    (hostNames.has(name) ? hostValues : userValues)[name] = value;
  }
  const context: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(
    state.instanceContext.byConversationId[conversationId] ?? {},
  )) {
    context[key] = entry.value;
  }

  return {
    v: 1,
    savedAt: Date.now(),
    agentId: conv.agentId,
    mandateKey: conv.mandateKey ?? null,
    sourceFeature: conv.sourceFeature ?? null,
    surfaceKey: conv.surfaceKey ?? null,
    surfaceName: conv.surfaceName ?? null,
    displayMode,
    allowChat: ui?.allowChat ?? null,
    showVariablePanel: ui?.showVariablePanel ?? null,
    hostValues,
    userValues,
    context,
  };
}

function conversationIdOf(action: unknown): string | null {
  if (typeof action !== "object" || action === null || !("payload" in action)) {
    return null;
  }
  const payload = (action as { payload: unknown }).payload;
  if (typeof payload === "string") return null;
  if (typeof payload === "object" && payload !== null && "conversationId" in payload) {
    const id = (payload as { conversationId: unknown }).conversationId;
    return typeof id === "string" ? id : null;
  }
  return null;
}

export const unsentLaunchMiddleware: Middleware<
  Record<string, never>,
  RootState
> = (api) => (next) => (action: unknown) => {
  const type =
    typeof action === "object" && action !== null && "type" in action
      ? (action as { type: unknown }).type
      : undefined;

  if (type === destroyInstance.type) {
    const conversationId = (action as { payload: string }).payload;
    cancel(conversationId);
    kept.delete(conversationId);
    clearUnsentLaunch(conversationId);
    return next(action);
  }

  const result = next(action);
  const conversationId = conversationIdOf(action);
  if (!conversationId) return result;

  const state = api.getState();
  const conv = state.conversations.byConversationId[conversationId];
  if (!conv) return result;
  if (conversationWasSent(state, conversationId)) {
    // Sent: from here on it loads from the server like any other (and the
    // window's restore follows a turn still in flight to its end).
    if (kept.has(conversationId)) {
      cancel(conversationId);
      kept.delete(conversationId);
      clearUnsentLaunch(conversationId);
    }
    return result;
  }

  const recipe = buildUnsentLaunchRecipe(state, conversationId);
  if (!recipe) return result;
  bindPagehideFlush();
  kept.add(conversationId);
  pending.set(conversationId, recipe);
  const existing = timers.get(conversationId);
  if (existing) clearTimeout(existing);
  timers.set(
    conversationId,
    setTimeout(() => {
      timers.delete(conversationId);
      const latest = pending.get(conversationId);
      pending.delete(conversationId);
      if (latest) writeUnsentLaunch(conversationId, latest);
    }, WRITE_DEBOUNCE_MS),
  );
  return result;
};
