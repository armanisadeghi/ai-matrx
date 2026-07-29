import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { selectAutoClearConversation } from "../instance-ui-state/instance-ui-state.selectors";
import { executeInstance } from "./execute-instance.thunk";
import { executeManualInstance } from "./execute-manual-instance.thunk";
import { splitInputIntoNewConversation } from "./create-instance.thunk";
import { abortConversation } from "./abort-registry";
import { setInstanceStatus } from "../conversations/conversations.slice";
import { setRequestStatus } from "../active-requests/active-requests.slice";
import {
  markInputSubmitted,
  clearUserInput,
  resetSubmissionPhase,
} from "../instance-user-input/instance-user-input.slice";
import { selectUserInputText } from "../instance-user-input/instance-user-input.selectors";
import { resolvePendingAsksWithInput } from "@/features/agents/ui-first-tools/redux/resolve-asks-with-input.thunk";
import { ensureSandboxOrDecide } from "./sandbox-gate.thunk";
import { ensureConversationScopesOrAsk } from "@/features/scopes/redux/thunks/conversationScopeGate";
import {
  selectAllResourcesResolved,
  selectResourcePayloads,
} from "../instance-resources/instance-resources.selectors";
import { selectIsExecuting } from "../selectors/aggregate.selectors";
import { enqueueInboxMessage } from "../inbox/inbox.thunks";
import { callCancelRequest } from "@/lib/api/call-api";
import { toast } from "@/lib/toast";

interface SmartExecuteArgs {
  conversationId: string;
  surfaceKey?: string;
}

/**
 * The single submit entrypoint. Handles two flavours:
 *
 *   • Normal:         execute on `conversationId`.
 *   • Autoclear ON:   execute on `conversationId`, then IMMEDIATELY split —
 *                     prep a fresh conversation pre-populated with the same
 *                     text + userValues and point the input focus slot at it,
 *                     while the display keeps watching the original stream.
 *
 * The split isn't gated on "has history" anymore — under autoclear we split
 * on EVERY submit so the engineer can continue iterating the same prompt
 * against a fresh agent call while the previous one is still streaming.
 */
export const smartExecute = createAsyncThunk<
  void,
  SmartExecuteArgs,
  { state: RootState; dispatch: AppDispatch }
>(
  "instances/smartExecute",
  async ({ conversationId, surfaceKey }, { getState, dispatch }) => {
    const state = getState();

    // A pending resource has only a local preview; it has no durable file_id
    // and is intentionally excluded from selectResourcePayloads. Sending now
    // would persist a text-only turn while the upload continued in the
    // background. This thunk-level guard protects every submit surface,
    // including callers that bypass the disabled composer controls.
    if (!selectAllResourcesResolved(conversationId)(state)) {
      console.error(
        `[smart-execute] blocked conversation "${conversationId}" while attachments are still resolving; ` +
          `sending now would silently omit them.`,
      );
      toast.info("Attachment is still uploading", {
        description: "Your message will be ready to send when the upload finishes.",
      });
      return;
    }

    // On-deck delegated tool guard. If the agent has delegated one or more
    // client tools that are still awaiting the user (pending asks), a chat
    // submit must NOT start a colliding new turn — the outstanding tool calls
    // would dangle (see CLIENT_TOOL_SUSPEND_RESUME.md). Deliver the composer
    // text as the answer to those asks instead; that resolves the tool calls
    // and the normal `continuation_needed → resumeInstance` flow continues the
    // conversation with the user's message embedded. No separate turn is run.
    const composerText = selectUserInputText(conversationId)(state) ?? "";
    const consumedByPendingAsks = dispatch(
      resolvePendingAsksWithInput(conversationId, composerText),
    );
    if (consumedByPendingAsks) {
      // Mirror the normal submit lifecycle so the composer clears cleanly:
      // markInputSubmitted snapshots the text as lastSubmittedText, which lets
      // clearUserInput wipe it (draft-protection only blocks clearing text that
      // diverged from the just-submitted message).
      const userValuesForClear =
        state.instanceVariableValues?.byConversationId[conversationId]
          ?.userValues ?? {};
      dispatch(
        markInputSubmitted({ conversationId, userValues: userValuesForClear }),
      );
      dispatch(clearUserInput(conversationId));
      return;
    }

    // ── Queue-while-running (Turn-Boundary Inbox) ────────────────────────────
    // A send into a conversation whose run is STILL LIVE must not start a
    // second concurrent turn (double stream, abort-registry eviction, server
    // 409s). The server supports exactly this case: queue the message via
    // `POST /ai/conversations/{id}/inbox` and the running agent answers it on
    // the stream that's already open, at its next natural pause
    // (docs/TURN_BOUNDARY_INBOX.md). The client is the judge of "run active" —
    // we opened the stream. NOTE: this keys on THIS conversation being live,
    // so the autoclear split (input focus already moved to a fresh, idle
    // conversation) keeps its parallel-iteration behavior untouched.
    if (selectIsExecuting(conversationId)(state)) {
      const queueText = composerText.trim();
      if (!queueText) return; // nothing to queue
      if (selectResourcePayloads(conversationId)(state).length > 0) {
        // The inbox is text-only; silently dropping attachments would be the
        // classic lost-file bug. Keep everything in the composer and tell the
        // user how to proceed.
        toast.info("Attachments can't be queued mid-run", {
          description:
            "Stop the agent first, or remove the attachment to queue this message.",
        });
        return;
      }
      const userValuesForClear =
        state.instanceVariableValues?.byConversationId[conversationId]
          ?.userValues ?? {};
      dispatch(
        markInputSubmitted({ conversationId, userValues: userValuesForClear }),
      );
      dispatch(clearUserInput(conversationId));
      await dispatch(
        enqueueInboxMessage({ conversationId, text: queueText }),
      );
      return;
    }

    // Sandbox hard-gate. A conversation BOUND to a sandbox must never silently
    // run this turn on the global backend — that burns tokens on tool calls that
    // fail against the wrong filesystem and poisons the agent's context. If the
    // bound box can't be resolved, block the send and let the user decide
    // (attach & retry / detach & send without it / cancel). Gating HERE — before
    // markInputSubmitted and any optimistic user bubble — means a cancel leaves
    // the composer text exactly as typed, with nothing to restore.
    const gate = await dispatch(
      ensureSandboxOrDecide({ conversationId }),
    ).unwrap();
    if (gate === "blocked") return;

    // Route mode — read once; also reused for the execute dispatch below.
    const apiEndpointMode =
      state.messages.byConversationId[conversationId]?.apiEndpointMode ??
      "agent";

    // Chat↔scope "ask on mismatch" gate. A chat carries its scopes durably;
    // when the sidebar's active selection differs from the chat's tags we
    // ALWAYS ask (switch / combine / keep) — never silently retag, never
    // silently drop. Same placement contract as the sandbox gate: BEFORE
    // markInputSubmitted, so a cancel leaves the composer text as typed.
    // Skipped for ephemeral chats (no persisted rows by design) and manual
    // mode (Agent Builder — sends no scope_ids and stamps no tags).
    const isEphemeral =
      state.conversations.byConversationId[conversationId]?.isEphemeral ===
      true;
    let scopeIdsOverride: string[] | undefined;
    if (!isEphemeral && apiEndpointMode !== "manual") {
      const scopeGate = await dispatch(
        ensureConversationScopesOrAsk(conversationId),
      );
      if (scopeGate.blocked) return;
      scopeIdsOverride = scopeGate.scopeIdsOverride;
    }

    const autoClear = selectAutoClearConversation(conversationId)(state);

    // Phase 1 — capture the current text + userValues so we can pre-populate
    // the post-split conversation (and so the "re-apply" snapshot is available
    // after phase 2 clears the textarea on `conversationId`).
    const userValues =
      state.instanceVariableValues?.byConversationId[conversationId]
        ?.userValues ?? {};
    dispatch(markInputSubmitted({ conversationId, userValues }));

    // Fire the execute on the CURRENT conversation — do NOT await yet.
    // We want to split the input focus before the stream lands so the user
    // sees the fresh input view as quickly as possible.
    //
    // Route by `apiEndpointMode`: the Agent Builder declares "manual" on
    // every instance it creates (AgentBuilderRightPanel) and MUST hit
    // /ai/manual — never /ai/agents/* or /ai/conversations/*. Manual mode
    // sends the live agent definition in the request body; the server reads
    // nothing from the agent record. Any non-manual surface keeps the
    // existing agent-mode path.
    const executePromise =
      apiEndpointMode === "manual"
        ? dispatch(executeManualInstance({ conversationId }))
        : dispatch(executeInstance({ conversationId, scopeIdsOverride }));

    // The split (auto-clear "iterate") mints a NEW, historyless conversation and
    // repoints the input focus at it. That is ONLY valid for a conversation
    // explicitly created as "iterate" (builder / tester / orchestrator generator
    // / programmatic extraction). Splitting a durable ("continuous"/undefined)
    // conversation would ORPHAN it — the exact class of failure this gate makes
    // structurally impossible: split ONLY when the stamped lifecycle says
    // iterate; otherwise refuse and scream (loud recovery). Reaching the else
    // means auto-clear got turned on for a non-iterate conversation — a rogue
    // path that bypassed the `showAutoClearToggle`-gated toggle.
    if (autoClear && surfaceKey) {
      const lifecycle =
        state.conversations.byConversationId[conversationId]
          ?.conversationLifecycle;
      if (lifecycle === "iterate") {
        await dispatch(
          splitInputIntoNewConversation({
            currentConversationId: conversationId,
            surfaceKey,
          }),
        );
      } else {
        console.error(
          `[smart-input] refused to split a non-iterate conversation ` +
            `"${conversationId}" (lifecycle=${lifecycle ?? "continuous"}) — ` +
            `would orphan it; treating as continuous. Auto-clear/split is an ` +
            `iterate-surface affordance only — see ConversationLifecycle.`,
        );
      }
    }

    await executePromise;
  },
);

/**
 * The latest server-known request id for a conversation's live run — what
 * `POST /ai/cancel/{request_id}` expects (captured from the stream response's
 * `X-Request-ID` header). Null when no stream has opened yet.
 */
function latestServerRequestId(
  state: RootState,
  conversationId: string,
): string | null {
  const requestIds = state.activeRequests?.byConversationId[conversationId];
  if (!requestIds?.length) return null;
  for (let i = requestIds.length - 1; i >= 0; i--) {
    const req = state.activeRequests.byRequestId[requestIds[i]];
    if (req?.serverRequestId) return req.serverRequestId;
  }
  return null;
}

export const cancelExecution = createAsyncThunk<
  void,
  string,
  { state: RootState; dispatch: AppDispatch }
>(
  "instances/cancelExecution",
  async (conversationId, { getState, dispatch }) => {
    const state = getState();

    // Tell the SERVER to stop too — best-effort, before the local abort.
    // Closing our read alone never stops the run (detach_on_disconnect: the
    // server loops to completion and bills every remaining iteration). The
    // cancel signal stops it at its next iteration boundary; the in-flight
    // provider call finishes by design (its cost is committed either way) and
    // everything streamed persists server-side.
    const serverRequestId = latestServerRequestId(state, conversationId);
    if (serverRequestId) {
      void dispatch(callCancelRequest(serverRequestId)).then((result) => {
        if (result.error) {
          console.warn("[cancel-execution] server cancel failed (best-effort)", {
            conversationId,
            serverRequestId,
            error: result.error,
          });
        }
      });
    }

    abortConversation(conversationId);

    const requestIds = state.activeRequests?.byConversationId[conversationId];
    if (requestIds && requestIds.length > 0) {
      const latestRequestId = requestIds[requestIds.length - 1];
      dispatch(
        setRequestStatus({ requestId: latestRequestId, status: "cancelled" }),
      );
    }
    dispatch(setInstanceStatus({ conversationId, status: "cancelled" }));
    // Return the input phase to idle so the user can edit/re-submit without
    // appearing stuck in "pending". Keep any `text` they had in place.
    dispatch(resetSubmissionPhase(conversationId));
  },
);

/**
 * Interrupt ("stop & redirect") — cut the run and send the composer text as
 * the next turn. The safe sequencing matters: a new turn POSTed while the old
 * run is still finalizing would run CONCURRENTLY with it (the continue
 * endpoint takes no run claim), interleaving history writes. So:
 *
 *   1. Signal the server (`POST /ai/cancel/{request_id}`) — the run stops at
 *      its next iteration boundary and persists everything streamed.
 *   2. Keep OUR read of the stream open and wait for the run to leave
 *      running/streaming — stream end is the persistence signal.
 *   3. Then submit normally through `smartExecute`.
 *
 * If the stream never closes inside the window (dead socket), abort locally
 * and send anyway — at that point the boundary poll has long since fired.
 */
export const interruptAndSend = createAsyncThunk<
  void,
  SmartExecuteArgs,
  { state: RootState; dispatch: AppDispatch }
>(
  "instances/interruptAndSend",
  async ({ conversationId, surfaceKey }, { getState, dispatch }) => {
    const initial = getState();
    if (!selectIsExecuting(conversationId)(initial)) {
      // Nothing to interrupt — behave like a plain send.
      await dispatch(smartExecute({ conversationId, surfaceKey }));
      return;
    }

    const serverRequestId = latestServerRequestId(initial, conversationId);
    if (serverRequestId) {
      const result = await dispatch(callCancelRequest(serverRequestId));
      if (result.error) {
        console.warn("[interrupt-and-send] server cancel failed — falling back to local abort", {
          conversationId,
          serverRequestId,
          error: result.error,
        });
        abortConversation(conversationId);
      }
    } else {
      // No stream has opened yet (or it predates header capture) — local
      // abort is all we have.
      abortConversation(conversationId);
    }

    // Wait for the run to settle. The in-flight provider call is allowed to
    // finish (platform rule — its cost is committed the moment it started),
    // so this can take as long as the current model turn.
    const INTERRUPT_SETTLE_TIMEOUT_MS = 120_000;
    const POLL_MS = 250;
    const deadline = Date.now() + INTERRUPT_SETTLE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!selectIsExecuting(conversationId)(getState())) break;
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    if (selectIsExecuting(conversationId)(getState())) {
      console.warn(
        "[interrupt-and-send] run did not settle in time — aborting locally and sending",
        { conversationId },
      );
      abortConversation(conversationId);
      dispatch(setInstanceStatus({ conversationId, status: "cancelled" }));
      dispatch(resetSubmissionPhase(conversationId));
    }

    await dispatch(smartExecute({ conversationId, surfaceKey }));
  },
);
