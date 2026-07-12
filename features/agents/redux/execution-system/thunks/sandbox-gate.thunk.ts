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
 * ── What "bound" means (and the bug that came from getting it wrong) ─────────
 * A conversation is bound iff ITS OWN RECORD says so — `sandboxBinding`, backed
 * by `cx_conversation.sandbox_instance_id`, the same column the server checks.
 * The per-surface preference is a SEED ("which box a NEW conversation on this
 * surface starts out with"), never a binding.
 *
 * Gating on the seed is what produced the reported defect: a stale surface
 * preference — pointing at a box killed off weeks earlier, and never cleared
 * because nothing clears it — made every brand-new /chat/new conversation claim
 * "this conversation is bound to a sandbox" and blocked the first message. It
 * never had one. A conversation with no turns has nothing to protect: no tool
 * calls against a filesystem, no context to poison. So the gate reads the record
 * and only the record.
 *
 * The seed still arms a new conversation — but the first turn that actually goes
 * out with it PROMOTES it onto the record and writes the DB, after which client
 * and server read the same one place. A seed that can't be resolved live simply
 * doesn't arm anything (loudly): nothing was bound, so nothing is at risk.
 *
 * ── Ordering: the DB is written BEFORE the request goes out ──────────────────
 * The server runs its own binding check off `sandbox_instance_id`. So every
 * decision the user makes here — detach, attach a different box — is persisted
 * BEFORE the send proceeds. Sending first and writing after would hand the
 * server a conversation it still believes is sandbox-bound: errors, or worse,
 * tools silently routed at the wrong box.
 *
 * `ensureSandboxOrDecide` runs at the very top of `smartExecute` — before any
 * optimistic state or input clearing — so a "cancel" loses nothing (the typed
 * message stays in the composer). It returns whether the send may proceed.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  getConversationSandboxBinding,
  getSurfaceSeedRef,
  getActiveSandboxBinding,
  clearSandboxBindingCache,
  type ResolvedSandboxRef,
} from "@/lib/sandbox/active-binding";
import { setConversationSandbox } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import { selectConversationSandboxPersisted } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { openSandboxGate } from "@/components/dialogs/sandbox-gate/SandboxGateHost";

const LOG = "[sandbox-gate]";

/** Strip the resolution-source tag — the record stores the ref, not where it came from. */
function toStoredRef(ref: ResolvedSandboxRef) {
  return {
    rowId: ref.rowId,
    proxyUrl: ref.proxyUrl,
    tier: ref.tier,
    kind: ref.kind,
    name: ref.name,
  };
}

/** Remove the surface seed for this conversation's surface, if it has one. */
function clearSurfaceSeed(
  state: RootState,
  conversationId: string,
  dispatch: AppDispatch,
): void {
  const sourceFeature =
    state.conversations?.byConversationId?.[conversationId]?.sourceFeature;
  if (!sourceFeature) return;
  const bySurface = {
    ...(state.userPreferences?.coding?.activeAgentSandboxBySurface ?? {}),
  };
  if (!(sourceFeature in bySurface)) return;
  delete bySurface[sourceFeature];
  dispatch(
    setPreference({
      module: "coding",
      preference: "activeAgentSandboxBySurface",
      value: bySurface,
    }),
  );
}

/**
 * Unbind the sandbox from a conversation so every downstream gate — client AND
 * server — sees it as unbound. Writes `sandbox_instance_id = null` to the DB
 * (the column the server's own check reads) and clears the surface seed, so the
 * next turn can't silently re-arm the box the user just said no to. Also drops
 * the token/suppression cache. Awaited by the gate BEFORE the send proceeds.
 */
export const detachSandboxForConversation = createAsyncThunk<
  void,
  string,
  { state: RootState; dispatch: AppDispatch }
>(
  "sandbox/detachForConversation",
  async (conversationId, { getState, dispatch }) => {
    const state = getState();
    const binding = getConversationSandboxBinding(state, conversationId);
    const seed = getSurfaceSeedRef(state, conversationId);

    // The DB write comes first — the server checks the same column.
    if (binding) {
      await dispatch(
        setConversationSandbox({ conversationId, ref: null }),
      ).unwrap();
    }

    // A seed left in place would re-arm the box on the very next turn, which is
    // exactly what the user just declined.
    clearSurfaceSeed(state, conversationId, dispatch);

    const rowId = binding?.rowId ?? seed?.rowId;
    if (rowId) clearSandboxBindingCache(rowId);
  },
);

/**
 * Promote a surface seed onto the conversation record — the moment a box is
 * actually used by a conversation, that conversation OWNS it. Writes the DB so
 * the server sees the same binding we do. After this, the record is the only
 * thing anyone reads for this conversation.
 */
export const promoteSurfaceSeedToConversation = createAsyncThunk<
  void,
  { conversationId: string; ref: ResolvedSandboxRef },
  { state: RootState; dispatch: AppDispatch }
>(
  "sandbox/promoteSeed",
  async ({ conversationId, ref }, { dispatch }) => {
    await dispatch(
      setConversationSandbox({ conversationId, ref: toStoredRef(ref) }),
    ).unwrap();
  },
);

export type SandboxGateOutcome = "proceed" | "blocked";

/**
 * The gate. Returns `"proceed"` when the send may go ahead, `"blocked"` when it
 * must not (the user cancelled — the caller returns without sending, leaving the
 * composer untouched).
 *
 * Fast path: an unbound, unseeded conversation → `"proceed"` with no network I/O
 * (the common no-sandbox case pays nothing). The modal opens for exactly ONE
 * condition: the conversation's OWN record names a box that can't be resolved
 * right now.
 */
export const ensureSandboxOrDecide = createAsyncThunk<
  SandboxGateOutcome,
  { conversationId: string },
  { state: RootState; dispatch: AppDispatch }
>(
  "sandbox/ensureOrDecide",
  async ({ conversationId }, { getState, dispatch }) => {
    const binding = getConversationSandboxBinding(getState(), conversationId);

    // ── Not bound ────────────────────────────────────────────────────────────
    // Nothing to protect: this conversation has never gone out with a sandbox.
    // It may still be ARMED by the surface seed — but a seed that can't be
    // resolved live simply doesn't arm anything. It NEVER gates: blocking a
    // first message because of a stale preference is the bug this replaced.
    if (!binding) {
      const seed = getSurfaceSeedRef(getState(), conversationId);
      if (!seed) return "proceed";

      if (await getActiveSandboxBinding(getState, conversationId)) {
        // Live — this conversation now owns the box. Persist before sending.
        await dispatch(
          promoteSurfaceSeedToConversation({ conversationId, ref: seed }),
        ).unwrap();
        return "proceed";
      }

      // LOUD: the user's default box for this surface is gone/unreachable. We do
      // NOT gate (nothing was bound) and we do NOT delete their preference — a
      // stopped box can be restarted, and the SandboxPanel already surfaces it
      // as "unavailable — re-attach". The turn simply goes out with no sandbox.
      console.warn(
        `${LOG} surface default box ${seed.rowId} (${seed.name ?? "unnamed"}) could not be resolved — it is stopped, expired, or gone. This conversation has never been bound to a sandbox, so the send proceeds WITHOUT one (no gate). Attach a live box from the Sandbox panel to bind it.`,
      );
      return "proceed";
    }

    // ── Bound ────────────────────────────────────────────────────────────────
    // A binding set before the cx_conversation row existed never made it to the
    // DB. Write it now (the row exists by this turn) so the server's own check
    // reads what we think is bound. Loud on failure — never send on a binding
    // the server can't see.
    if (!selectConversationSandboxPersisted(conversationId)(getState())) {
      try {
        await dispatch(
          setConversationSandbox({ conversationId, ref: toStoredRef(binding) }),
        ).unwrap();
      } catch (err) {
        console.error(
          `${LOG} ❌ failed to persist the sandbox binding for conversation ${conversationId} to cx_conversation.sandbox_instance_id. The server may not see this box as bound.`,
          err,
        );
      }
    }

    // Try to resolve a live binding (mints/verifies the token).
    if (await getActiveSandboxBinding(getState, conversationId)) return "proceed";

    // Bound but unresolvable → the user decides. Never silently fall back.
    const choice = await openSandboxGate({ conversationId });

    if (choice === "detach") {
      // Persists `sandbox_instance_id = null` BEFORE the send goes out.
      await dispatch(detachSandboxForConversation(conversationId)).unwrap();
      return "proceed"; // now genuinely unbound, client AND server — send as-is
    }

    if (choice === "attach") {
      // The user managed/attached/started a box in the embedded panel. That may
      // have landed as a conversation binding (override mode) or as a surface
      // seed — re-resolve through the same path a normal turn takes.
      if (await getActiveSandboxBinding(getState, conversationId)) {
        const next = getConversationSandboxBinding(getState(), conversationId);
        if (!next) {
          const seed = getSurfaceSeedRef(getState(), conversationId);
          if (seed) {
            await dispatch(
              promoteSurfaceSeedToConversation({ conversationId, ref: seed }),
            ).unwrap();
          }
        }
        return "proceed";
      }
      // Still not live — block. They can hit send again (which re-opens the
      // gate); either way the typed message is preserved.
      return "blocked";
    }

    return "blocked"; // cancel
  },
);
