/**
 * sandbox-gate.thunk.ts — the pre-send hard-gate for sandbox-bound conversations.
 *
 * The load-bearing invariant: **a conversation bound to a sandbox must NEVER
 * silently run a turn on the global backend.** If the box can't be resolved at
 * send time, we do NOT send — we make the user decide. Silently falling back to
 * the multi-tenant server mid-coding-session is the expensive failure: wasted
 * tokens on a pile of tool calls that all fail against the wrong filesystem, and
 * a poisoned agent context. This gate makes that class of failure impossible.
 *
 * `ensureSandboxOrDecide` runs at the very top of `smartExecute` — before any
 * optimistic state or input clearing — so a "cancel" loses nothing (the typed
 * message stays in the composer). It returns whether the send may proceed.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  getConfiguredSandboxRef,
  getActiveSandboxBinding,
  clearSandboxBindingCache,
} from "@/lib/sandbox/active-binding";
import { setConversationSandboxOverride } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { openSandboxGate } from "@/components/dialogs/sandbox-gate/SandboxGateHost";

/**
 * Detach the sandbox from a conversation so every downstream gate — client AND
 * server — sees it as unbound. Clears whichever level holds the binding: the
 * per-conversation override (Level 1, which also writes `sandbox_instance_id =
 * null` to the DB so the server's autobind can't re-arm it) and/or the
 * surface-active preference (Level 2). Also clears the token/suppression cache
 * for the box. Mirrors `SandboxPanel`'s own "Detach" so the modal's
 * "send without sandbox" and the panel's detach button behave identically.
 */
export const detachSandboxForConversation = createAsyncThunk<
  void,
  string,
  { state: RootState; dispatch: AppDispatch }
>(
  "sandbox/detachForConversation",
  async (conversationId, { getState, dispatch }) => {
    const state = getState();
    const ref = getConfiguredSandboxRef(state, conversationId);
    if (!ref) return;

    // Clear the level the binding actually came from.
    if (ref.source === "conversation-override") {
      // Level 1 — also persists `sandbox_instance_id = null` to the DB so the
      // server's autobind can't re-arm the box on the next turn.
      await dispatch(setConversationSandboxOverride({ conversationId, ref: null }));
    } else if (ref.source === "surface-active") {
      // Level 2 — the surface default (every chat on this surface). Mirrors
      // SandboxPanel's own "Detach from this surface".
      const sourceFeature =
        state.conversations?.byConversationId?.[conversationId]?.sourceFeature;
      if (sourceFeature) {
        const bySurface = {
          ...(state.userPreferences?.coding?.activeAgentSandboxBySurface ?? {}),
        };
        delete bySurface[sourceFeature];
        dispatch(
          setPreference({
            module: "coding",
            preference: "activeAgentSandboxBySurface",
            value: bySurface,
          }),
        );
      }
    }
    // (editor-active is managed by the /code editor surface itself — a chat
    // send never binds through it, so there's nothing to clear here.)

    if (ref.rowId) clearSandboxBindingCache(ref.rowId);
  },
);

export type SandboxGateOutcome = "proceed" | "blocked";

/**
 * The gate. Returns `"proceed"` when the send may go ahead, `"blocked"` when it
 * must not (the user cancelled — the caller returns without sending, leaving the
 * composer untouched).
 *
 * Fast path: no configured binding → `"proceed"` with no network I/O (the common
 * no-sandbox case pays nothing). Only a conversation that IS bound but whose live
 * binding can't be resolved opens the modal.
 */
export const ensureSandboxOrDecide = createAsyncThunk<
  SandboxGateOutcome,
  { conversationId: string },
  { state: RootState; dispatch: AppDispatch }
>(
  "sandbox/ensureOrDecide",
  async ({ conversationId }, { getState, dispatch }) => {
    // Not bound → nothing to protect.
    if (!getConfiguredSandboxRef(getState(), conversationId)) return "proceed";

    // Bound → try to resolve a live binding (mints/verifies the token).
    if (await getActiveSandboxBinding(getState, conversationId)) return "proceed";

    // Bound but unresolvable → the user decides. Never silently fall back.
    const choice = await openSandboxGate({ conversationId });

    if (choice === "detach") {
      await dispatch(detachSandboxForConversation(conversationId));
      return "proceed"; // now genuinely unbound — send as-is
    }

    if (choice === "attach") {
      // The user managed/attached a box in the embedded panel. Re-resolve once;
      // if it's live now, proceed — otherwise block (they can hit send again,
      // which re-opens the gate). Either way the message is preserved.
      return (await getActiveSandboxBinding(getState, conversationId))
        ? "proceed"
        : "blocked";
    }

    return "blocked"; // cancel
  },
);
