import { createAsyncThunk } from "@reduxjs/toolkit";
import { serializeExecutionRejection } from "@host/lib/diagnostics/executionRejectionMeta";
import type { ChatDispatch, ChatRootState } from "../../../../store/root-state";
import { selectAutoClearConversation } from "../instance-ui-state/instance-ui-state.selectors";
import {
  executeInstance,
  SUBMISSION_REFUSED_AT_ADMISSION,
} from "./execute-instance.thunk";
import { executeManualInstance } from "./execute-manual-instance.thunk";
import { splitInputIntoNewConversation } from "./create-instance.thunk";
import { abortConversation, hasAbortController } from "./abort-registry";
import { setInstanceStatus } from "../conversations/conversations.slice";
import { setRequestStatus } from "../active-requests/active-requests.slice";
import {
  markInputSubmitted,
  clearUserInput,
  resetSubmissionPhase,
  setUserInputText,
  setPreSend,
} from "../instance-user-input/instance-user-input.slice";
import { resolvePendingAsksWithInput } from "../../../ui-first-tools/redux/resolve-asks-with-input.thunk";
import { ensureSandboxOrDecide } from "./sandbox-gate.thunk";
import { ensureConversationScopesOrAsk } from "@host/features/scopes/redux/thunks/conversationScopeGate";
import {
  selectAllResourcesResolved,
} from "../instance-resources/instance-resources.selectors";
import { selectIsExecuting } from "../selectors/aggregate.selectors";
import {
  enqueueInboxMessage,
  returnQueuedToComposer,
} from "../inbox/inbox.thunks";
import {
  selectInFlightRequestIds,
  settleAfterStop,
} from "./settle-after-stop.thunk";
import { cancelAgentRunRequest } from "@host/lib/api/matrx-transport";
import { toast } from "../../../../host/notify";
import { refreshSurfaceScope } from "./refresh-surface-scope.thunk";
import {
  ensureExecutionOrganization,
  executionOrganizationForRequest,
} from "../utils/required-organization";
import { isOrganizationSelectionCancelled } from "@host/lib/organization/organization-gate";
import { getManifest } from "../../../../surfaces/runtime/registry";
import {
  claimSubmit,
  isDuplicateSubmittedInput,
  isSendInFlight,
  releaseSubmitClaim,
} from "./submit-claims";
import {
  captureSubmission,
  isEmptySubmission,
  type FrozenSubmission,
} from "./frozen-submission";
import {
  addInboxItem,
  removeInboxItem,
} from "../inbox/inbox.slice";
import { markResourcesSubmitted } from "../instance-resources/instance-resources.slice";

interface SmartExecuteArgs {
  conversationId: string;
  surfaceKey?: string;
  /**
   * When a run is live on this conversation, which of the three send modes
   * (/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/TURN-BOUNDARY-INBOX.md — Arman's ruling) this send uses. Both are
   * SERVER-HELD inbox items answered on the already-open stream:
   *   "queue" (default) — delivery "turn_end": waits until the run is
   *     COMPLETELY done, then delivered as the next message (FIFO, one per
   *     turn, editable until delivered — survives reloads/closed tabs).
   *   "steer" — delivery "next_boundary": delivered at the agent's next
   *     natural pause mid-run.
   * Interrupt is its own thunk (`interruptAndSend`). Ignored while idle.
   */
  whileRunning?: "queue" | "steer";
  /**
   * A message already captured at its keypress and detached from the
   * composer (a submit that was held behind an in-flight send). When present
   * the composer is never read or cleared — it may hold the next message.
   */
  submission?: FrozenSubmission;
}

export function hasConversationAtExecutionBoundary(
  state: ChatRootState,
  conversationId: string,
): boolean {
  return state.conversations.byConversationId[conversationId] !== undefined;
}

/**
 * SEND NEVER SILENTLY DOES NOTHING. A submit whose conversation is gone (a
 * superseded launch reaped it, navigation or fresh-chat cleanup removed it
 * while a gate was pending) is not an incident — nothing is reported to the
 * error lane — but the person pressed Send, so they are told it did not go
 * and what to do. This used to be a bare `return`: the button simply did
 * nothing (the page guide, 2026-09-28).
 */
function announceMissingConversation(conversationId: string): void {
  console.warn(
    `[smart-execute] send dropped: conversation "${conversationId}" no longer exists in this tab.`,
  );
  toast.info("Message not sent", {
    description:
      "This conversation closed before your message could go. Your text was not sent — reopen the assistant and send it again.",
  });
}

// =============================================================================
// THE SEND IS FROZEN AT THE KEYPRESS — composer hand-off and the hold queue
// =============================================================================

/**
 * Take a captured message out of the composer: mark it submitted (the box
 * hides it) and clear it, so the person can type the next message. Used for a
 * submit that is HELD behind an in-flight send.
 */
function detachFromComposer(
  dispatch: ChatDispatch,
  getState: () => ChatRootState,
  conversationId: string,
  submission: FrozenSubmission,
): void {
  dispatch(
    markInputSubmitted({ conversationId, userValues: submission.userValues }),
  );
  settleComposer(dispatch, getState, conversationId, submission);
}

/**
 * The message has gone somewhere (the door, the queue, a pending ask): clear
 * it from the composer — but only if the composer still holds exactly it. A
 * next message the person has started is never touched.
 */
function settleComposer(
  dispatch: ChatDispatch,
  getState: () => ChatRootState,
  conversationId: string,
  submission: FrozenSubmission,
): void {
  const entry = getState().instanceUserInput?.byConversationId[conversationId];
  if (entry && entry.text === submission.text) {
    dispatch(clearUserInput(conversationId));
  }
}

/**
 * The message went nowhere (a gate cancelled, preparation failed): put it back
 * in the composer, visible. If the person has typed something since, both are
 * kept — the returned message first, then what they typed.
 */
function returnToComposer(
  dispatch: ChatDispatch,
  getState: () => ChatRootState,
  conversationId: string,
  submission: FrozenSubmission,
): void {
  const state = getState();
  if (!hasConversationAtExecutionBoundary(state, conversationId)) return;
  const entry = state.instanceUserInput?.byConversationId[conversationId];
  const current = entry?.text ?? "";
  if (current === submission.text) {
    dispatch(resetSubmissionPhase(conversationId));
    return;
  }
  dispatch(
    setUserInputText({
      conversationId,
      text: current
        ? `${submission.text}\n\n${current}`
        : submission.text,
      userValues: submission.userValues,
    }),
  );
}

/** One FIFO chain per conversation, so held messages keep the order typed. */
const heldSends = new Map<string, Promise<void>>();
const HOLD_POLL_MS = 25;

/**
 * A submit arrived while another send on the conversation is between its
 * keypress and `running`. The message shows in the queue strip at once and
 * is re-dispatched — in the order typed — the moment the earlier send is
 * admitted; it then queues into the live run (or, if the earlier send never
 * started, goes as the next turn). Never dropped, never silent.
 */
function holdBehindInFlightSend(
  dispatch: ChatDispatch,
  getState: () => ChatRootState,
  args: {
    conversationId: string;
    surfaceKey?: string;
    whileRunning: "queue" | "steer";
    submission: FrozenSubmission;
  },
): void {
  const { conversationId, submission } = args;
  const cardId = `inbox_local_held_${crypto.randomUUID()}`;
  dispatch(
    addInboxItem({
      injectionId: cardId,
      conversationId,
      mode: args.whileRunning,
      kind: "user_message",
      text: submission.text,
      status: "sending",
      isVisibleToUser: true,
      queuedAt: new Date().toISOString(),
    }),
  );
  const previous = heldSends.get(conversationId) ?? Promise.resolve();
  const next = previous.then(async () => {
    while (isSendInFlight(conversationId)) {
      await new Promise((resolve) => setTimeout(resolve, HOLD_POLL_MS));
    }
    dispatch(removeInboxItem({ conversationId, injectionId: cardId }));
    // Dispatched, not awaited: the re-entered submit claims synchronously, so
    // the next held message waits for THIS one's admission, not its answer.
    void dispatch(
      smartExecute({
        conversationId,
        surfaceKey: args.surfaceKey,
        whileRunning: args.whileRunning,
        submission,
      }),
    );
  });
  const settled = next.catch((error: unknown) => {
    console.error("[smart-execute] a held send failed to re-enter", error);
  });
  heldSends.set(conversationId, settled);
  void settled.then(() => {
    if (heldSends.get(conversationId) === settled) {
      heldSends.delete(conversationId);
    }
  });
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
  { state: ChatRootState; dispatch: ChatDispatch }
>(
  "instances/smartExecute",
  async (
    { conversationId, surfaceKey, whileRunning = "queue", submission: handed },
    { getState, dispatch },
  ) => {
    // ── THE SEND IS FROZEN AT THE KEYPRESS (frozen-submission.ts) ──────────
    // Everything below may await (organization, live page, sandbox, scopes)
    // and the person may type the next message meanwhile. So what this send
    // carries is captured NOW, synchronously, and the composer is released
    // for the next message. No reader after this line reads the composer.
    const entryState = getState();
    if (!handed) {
      const inputEntry =
        entryState.instanceUserInput?.byConversationId[conversationId];
      // The same draft submitted twice (a double Enter, a click + Enter):
      // the first submit already owns it. Expected deduplication — the server
      // was not contacted, so this is not an operational error.
      if (isDuplicateSubmittedInput(inputEntry)) {
        console.debug(
          `[smart-execute] duplicate submit dropped for conversation "${conversationId}" — ` +
            "this exact draft is already being sent. A newly typed draft is held or queued.",
        );
        return;
      }
      if (!hasConversationAtExecutionBoundary(entryState, conversationId)) {
        announceMissingConversation(conversationId);
        return;
      }
      // A pending resource has only a local preview; it has no durable file_id
      // and is intentionally excluded from selectResourcePayloads. Sending now
      // would persist a text-only turn while the upload continued in the
      // background. Checked at the keypress, before anything is frozen.
      if (!selectAllResourcesResolved(conversationId)(entryState)) {
        console.error(
          `[smart-execute] blocked conversation "${conversationId}" while attachments are still resolving; ` +
            `sending now would silently omit them.`,
        );
        toast.info("Attachment is still uploading", {
          description:
            "Your message will be ready to send when the upload finishes.",
        });
        return;
      }
    }
    const submission = handed ?? captureSubmission(entryState, conversationId);

    // ── A SEND IS ALREADY IN FLIGHT: hold this one behind it ───────────────
    // Another submit is between the keypress and `running` (its gates, the
    // door's admission). This message is never dropped: it leaves the
    // composer now, shows in the queue strip, and is routed — queued into the
    // live run, or sent as the next turn — the moment the first is admitted.
    if (isSendInFlight(conversationId)) {
      if (!handed) {
        if (isEmptySubmission(submission)) return;
        if (submission.resources.length > 0) {
          // Queued sends are text-only; dropping an attachment would be the
          // classic lost-file bug. Everything stays in the composer.
          toast.info("Attachments can't be sent while the agent is running", {
            description:
              "Stop the agent first, or remove the attachment to queue this message.",
          });
          return;
        }
        detachFromComposer(dispatch, getState, conversationId, submission);
      }
      holdBehindInFlightSend(dispatch, getState, {
        conversationId,
        surfaceKey,
        whileRunning,
        submission,
      });
      return;
    }

    // Take admission synchronously, before the first pre-send await. Redux
    // cannot expose `running` while surface/sandbox/scope gates are resolving;
    // `isSendInFlight` above reads this claim, so a second submit is held.
    claimSubmit(conversationId);

    // The composer is released at the keypress: the box empties now, and the
    // person can type the next message while this one is prepared.
    const fromComposer = !handed && !isEmptySubmission(submission);
    if (fromComposer) {
      dispatch(
        markInputSubmitted({
          conversationId,
          userValues: submission.userValues,
        }),
      );
      dispatch(markResourcesSubmitted(conversationId));
    }
    // True once the message has gone somewhere (the door, the queue, a
    // pending ask). Any exit before that returns it to the composer.
    let delivered = false;

    // Whether THIS submit put a "preparing" pre-send state up (so the finally
    // can take it down on every early return — a gate cancel, a dropped send).
    let preSendShown = false;
    let claimReleased = false;
    const releaseClaim = () => {
      if (claimReleased) return;
      claimReleased = true;
      releaseSubmitClaim(conversationId);
    };

    try {
      let state = getState();

      // A held send re-enters here; its conversation may have closed since.
      if (!hasConversationAtExecutionBoundary(state, conversationId)) {
        announceMissingConversation(conversationId);
        return;
      }

      // Organization is a hard execution boundary. A personal organization is
      // still not an implicit substitute for an empty picker — but "no
      // organization" is now a QUESTION rather than a dead end.
      //
      // This exact spot used to toast "Select an organization before sending
      // this message. The request was not sent." and stop. The person then went
      // to the switcher, picked an organization, came back and re-sent — and on
      // 2026-08-30 that round trip is what split a screenshot (uploaded under no
      // organization, so filed personally) from the conversation (started under
      // the organization they had just picked). The advice created the mismatch
      // it was warning about.
      //
      // Now the gate asks inline: one dialog, they choose, the choice becomes
      // their active workspace, and this same submit continues into it with the
      // draft and attachments untouched. Declining returns the message to the
      // composer — nothing sent, and no error, because declining is an answer.
      try {
        await ensureExecutionOrganization(state, conversationId);
        state = getState();
        executionOrganizationForRequest(state, conversationId);
      } catch (error) {
        if (isOrganizationSelectionCancelled(error)) return;
        const message =
          error instanceof Error
            ? error.message
            : "Select an organization before sending this message.";
        // Expected, locally recoverable form validation: no request crossed the
        // transport boundary and the draft returns to the composer. Keep it
        // visible without manufacturing console-error + user-toast incidents.
        toast.info("Organization required", { description: message });
        return;
      }

      // On-deck delegated tool guard. If the agent has delegated one or more
      // client tools that are still awaiting the user (pending asks), a chat
      // submit must NOT start a colliding new turn — the outstanding tool calls
      // would dangle (see CLIENT_TOOL_SUSPEND_RESUME.md). Deliver the submitted
      // text as the answer to those asks instead; that resolves the tool calls
      // and the normal `continuation_needed → resumeInstance` flow continues the
      // conversation with the user's message embedded. No separate turn is run.
      const consumedByPendingAsks = dispatch(
        resolvePendingAsksWithInput(conversationId, submission.text),
      );
      if (consumedByPendingAsks) {
        delivered = true;
        settleComposer(dispatch, getState, conversationId, submission);
        return;
      }

      // ── Send while a run is live — the three send modes ─────────────────────
      // (Arman's ruling — /Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/TURN-BOUNDARY-INBOX.md.) A send into a
      // conversation whose run is STILL LIVE must never start a second
      // concurrent turn (double stream, abort-registry eviction, interleaved
      // history; the server's turn lock now refuses it too). Both modes hand
      // the message to the SERVER inbox — QUEUE (delivery turn_end, default)
      // waits for the run to be completely done and then delivers one message
      // per turn; STEER (next_boundary) delivers at the agent's next pause.
      // Either way the running agent answers on the already-open stream and
      // the message survives reloads. The client is the judge of "run active"
      // — we opened the stream. This keys on THIS conversation being live, so
      // the autoclear split (input focus already moved to a fresh, idle
      // conversation) keeps its parallel-iteration behavior untouched.
      if (selectIsExecuting(conversationId)(state)) {
        const surfaceName =
          state.conversations.byConversationId[conversationId]?.surfaceName;
        if (
          surfaceName &&
          getManifest(surfaceName)?.requiresBeforeExecute === true
        ) {
          toast.info("Wait for this tutor turn to finish", {
            description:
              "Each tutor question searches your material before it sends, so it can't be queued into an already-running answer.",
          });
          return;
        }
        if (submission.resources.length > 0) {
          // Queued/steered sends are text-only; silently dropping attachments
          // would be the classic lost-file bug. Keep everything in the composer
          // and tell the user how to proceed.
          toast.info("Attachments can't be sent while the agent is running", {
            description:
              "Stop the agent first, or remove the attachment to queue this message.",
          });
          return;
        }
        const sendText = submission.text.trim();
        if (!sendText) return; // the running-turn inbox is text-only
        delivered = true;
        settleComposer(dispatch, getState, conversationId, submission);
        await dispatch(
          enqueueInboxMessage({
            conversationId,
            text: sendText,
            mode: whileRunning,
          }),
        );
        return;
      }

      // A managed surface may have created this conversation at MOUNT, before
      // the person filled its form. Refresh its stamped provider NOW, on submit,
      // and re-apply the canonical value_mappings before any execution gate or
      // request snapshot reads the instance. Conversation/focus/gate lifecycle
      // stays exactly where the launcher established it.
      //
      // THIS IS THE PRE-SEND WINDOW, AND IT IS VISIBLE. A surface's
      // `beforeExecute` can take real time (the tutor searches the learner's
      // material for 10–25 s); it used to show nothing, and its failure reached
      // only the console. The outgoing message renders with what is happening
      // (`PendingSendMessage`), and a failure stays in place with Retry.
      const prepSurface =
        state.conversations.byConversationId[conversationId]?.surfaceName ??
        undefined;
      dispatch(
        setPreSend({
          conversationId,
          preSend: {
            status: "preparing",
            text: submission.text,
            label:
              (prepSurface && getManifest(prepSurface)?.beforeExecuteLabel) ||
              "Preparing your message",
            startedAt: Date.now(),
          },
        }),
      );
      preSendShown = true;
      try {
        await dispatch(
          refreshSurfaceScope({ conversationId, composerText: submission.text }),
        ).unwrap();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof (error as { message?: unknown })?.message === "string"
              ? (error as { message: string }).message
              : "This message could not be prepared. Nothing was sent.";
        dispatch(
          setPreSend({
            conversationId,
            preSend: {
              status: "failed",
              text: submission.text,
              label: "Not sent",
              error: message,
              startedAt: Date.now(),
            },
          }),
        );
        preSendShown = false; // the failure stays up until Retry / Dismiss
        throw error;
      }
      state = getState();

      // Sandbox hard-gate. A conversation BOUND to a sandbox must never silently
      // run this turn on the global backend — that burns tokens on tool calls that
      // fail against the wrong filesystem and poisons the agent's context. If the
      // bound box can't be resolved, block the send and let the user decide
      // (attach & retry / detach & send without it / cancel). A cancel returns
      // the message to the composer, with nothing sent.
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
      // silently drop. A cancel returns the message to the composer.
      // Skipped for ephemeral chats (no persisted rows by design) and manual
      // mode (Agent Builder — sends the active scope_ids for this turn but stamps no tags).
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

      // Every gate above may suspend while the person navigates or starts a
      // fresh chat. Re-read at the final admission boundary: dispatching the
      // child against the earlier snapshot would manufacture a paired
      // execute/rejected + smartExecute/rejected incident for expected stale
      // UI intent.
      state = getState();
      if (!hasConversationAtExecutionBoundary(state, conversationId)) {
        announceMissingConversation(conversationId);
        return;
      }

      const autoClear = selectAutoClearConversation(conversationId)(state);

      // Admission: the real optimistic turn takes over from the pre-send one.
      dispatch(setPreSend({ conversationId, preSend: null }));
      preSendShown = false;

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
      // initiation:"user" — every send smartExecute routes originates from a
      // person hitting send/submit (chat inputs, builder run, agent apps). This
      // per-send override beats an "auto" launch default: a user typing into an
      // auto-launched conversation is still a user-initiated request.
      //
      // The frozen `submission` is what goes — never the composer, which may
      // already hold the person's next message.
      delivered = true;
      const executePromise =
        apiEndpointMode === "manual"
          ? dispatch(
              executeManualInstance({
                conversationId,
                initiation: "user",
                surfaceRefreshed: true,
                submission,
              }),
            )
          : dispatch(
              executeInstance({
                conversationId,
                scopeIdsOverride,
                initiation: "user",
                // The live page was read above, with the submitted text.
                surfaceRefreshed: true,
                submission,
              }),
            );

      // Both execution thunks synchronously take the door's admission claim
      // (`claimExecution`) before their first await and hold it until
      // `running`, so a submit arriving now is still held behind this one.
      releaseClaim();

      // The split (auto-clear "iterate") mints a NEW, historyless conversation and
      // repoints the input focus at it. That is ONLY valid for a conversation
      // explicitly created as "iterate" (builder / tester / Conductor generator
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

      const executeResult = await executePromise;
      // Surface a failed child to OUR caller (the queue-drain watcher marks its
      // card failed off this). createAsyncThunk children resolve their action
      // even on rejection, so without this smartExecute would report success
      // over a dead send.
      if (
        executeInstance.rejected.match(executeResult) &&
        executeResult.payload === SUBMISSION_REFUSED_AT_ADMISSION
      ) {
        // The door saw another send being admitted (a direct caller raced
        // us). Nothing was sent; hold this message behind that one.
        holdBehindInFlightSend(dispatch, getState, {
          conversationId,
          surfaceKey,
          whileRunning,
          submission,
        });
        return;
      }
      if (
        executeInstance.rejected.match(executeResult) ||
        executeManualInstance.rejected.match(executeResult)
      ) {
        const reason =
          typeof executeResult.payload === "string"
            ? executeResult.payload
            : (executeResult.error?.message ?? "Send failed");
        throw Object.assign(new Error(reason), {
          conversationId,
          executionRequestId: executeResult.meta.executionRequestId,
          originalErrorName: executeResult.meta.originalErrorName,
        });
      }
    } finally {
      // Covers every gate cancellation, validation failure, and thrown error.
      // A claim can never strand the composer.
      if (preSendShown) dispatch(setPreSend({ conversationId, preSend: null }));
      releaseClaim();
      // A message that went nowhere goes back to the person — never lost.
      if (!delivered && !isEmptySubmission(submission)) {
        returnToComposer(dispatch, getState, conversationId, submission);
      }
    }
  },
  { serializeError: serializeExecutionRejection },
);

/**
 * The latest server-known request id for a conversation's live run — what
 * `POST /ai/cancel/{request_id}` expects (captured from the stream response's
 * `X-Request-ID` header). Null when no stream has opened yet.
 */
function latestServerRequestId(
  state: ChatRootState,
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

/**
 * The last wire frame the page applied for the request the server knows as
 * `serverRequestId` — read AFTER the local abort, whose processor commits its
 * cursor synchronously. Undefined when no frame carried a cursor.
 */
function appliedTransportSeq(
  state: ChatRootState,
  conversationId: string,
  serverRequestId: string,
): number | undefined {
  const requestIds = state.activeRequests?.byConversationId[conversationId] ?? [];
  for (let i = requestIds.length - 1; i >= 0; i--) {
    const req = state.activeRequests.byRequestId[requestIds[i]];
    if (req?.serverRequestId === serverRequestId) {
      return typeof req.lastTransportSeq === "number"
        ? req.lastTransportSeq
        : undefined;
    }
  }
  return undefined;
}

export const cancelExecution = createAsyncThunk<
  void,
  string,
  { state: ChatRootState; dispatch: ChatDispatch }
>(
  "instances/cancelExecution",
  async (conversationId, { getState, dispatch }) => {
    const state = getState();

    // Stop reading NOW — the aborted processor commits what it applied, so
    // the store holds the page's exact cursor. Then tell the SERVER to stop
    // too (closing our read alone never stops a detached run) and where the
    // page stopped: the server saves the stopped answer only up to that frame,
    // so the post-Stop re-read never grows the screen (bench 2026-10-01).
    const serverRequestId = latestServerRequestId(state, conversationId);
    abortConversation(conversationId);
    if (serverRequestId) {
      const seenSeq = appliedTransportSeq(
        getState(),
        conversationId,
        serverRequestId,
      );
      void dispatch(
        cancelAgentRunRequest(serverRequestId, "cancel", seenSeq),
      ).then((result) => {
        if (result.error) {
          console.warn(
            "[cancel-execution] server cancel failed (best-effort)",
            {
              conversationId,
              serverRequestId,
              error: result.error,
            },
          );
        }
      });
    }

    // Only the requests the Stop actually interrupted are settled — never an
    // answer that had already finished earlier in the conversation.
    const stoppedRequestIds = selectInFlightRequestIds(state, conversationId);
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

    // W-48: nothing will drain the queue after a Stop — give it back.
    void dispatch(returnQueuedToComposer({ conversationId }));
    // W-47: the server finishes its in-flight call and persists it; follow
    // the run to its end (cancelling it if the stream never opened) and
    // re-read, so the screen shows what persisted, not where the read froze.
    void dispatch(
      settleAfterStop({
        conversationId,
        serverRequestId,
        localRequestIds: stoppedRequestIds,
      }),
    );
  },
);

/**
 * INTERRUPT ("stop & redirect") — the third send mode. Instantly stop from
 * the user's perspective, keep the costs, hide the abandoned tail, send the
 * composer text as the reply. Mechanics (/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/TURN-BOUNDARY-INBOX.md):
 *
 *   1. `POST /ai/cancel/{request_id}?mode=interrupt` — the server stops the
 *      run at its next boundary and persists the abandoned tail HIDDEN
 *      (is_visible_to_user/model = false, pairing-safe). Costs are kept.
 *   2. Abort OUR read of the stream immediately — the UI stops rendering NOW
 *      (the same instant-stop illusion ChatGPT/Claude use; the server winds
 *      down in the background).
 *   3. Retry-send the composer text: the server's turn lock 409s
 *      (`run_in_flight`) until the old run finalizes, then admits the turn.
 */
export const interruptAndSend = createAsyncThunk<
  void,
  SmartExecuteArgs,
  { state: ChatRootState; dispatch: ChatDispatch }
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
    // Instant local stop first — its processor commits the page's cursor.
    abortConversation(conversationId);
    if (serverRequestId) {
      const seenSeq = appliedTransportSeq(
        getState(),
        conversationId,
        serverRequestId,
      );
      void dispatch(
        cancelAgentRunRequest(serverRequestId, "interrupt", seenSeq),
      ).then(
        (result) => {
          if (result.error) {
            console.warn(
              "[interrupt-and-send] server interrupt signal failed (best-effort)",
              { conversationId, serverRequestId, error: result.error },
            );
          }
        },
      );
    }

    dispatch(setInstanceStatus({ conversationId, status: "cancelled" }));
    dispatch(resetSubmissionPhase(conversationId));

    // Let the aborted fetch unwind and unregister its abort controller —
    // executeInstance's concurrent-turn guard keys on it, and a stale entry
    // would misroute the reply into the (dying) run's queue.
    const ABORT_SETTLE_DEADLINE = Date.now() + 5_000;
    while (
      hasAbortController(conversationId) &&
      Date.now() < ABORT_SETTLE_DEADLINE
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Send the reply, retrying while the server's turn lock reports the old
    // run still winding down (bounded by the current provider call).
    const RETRY_WINDOW_MS = 120_000;
    const RETRY_DELAY_MS = 750;
    const deadline = Date.now() + RETRY_DELAY_MS + RETRY_WINDOW_MS;
    for (;;) {
      const result = await dispatch(
        smartExecute({ conversationId, surfaceKey }),
      );
      if (!smartExecute.rejected.match(result)) return;
      const reason =
        typeof result.payload === "string"
          ? result.payload
          : (result.error?.message ?? "");
      const runInFlight = /run_in_flight/i.test(reason);
      if (!runInFlight || Date.now() > deadline) {
        if (runInFlight) {
          console.error(
            "[interrupt-and-send] old run never settled inside the retry window",
            { conversationId },
          );
          toast.error("Couldn't send the message", {
            description:
              "The previous run is still winding down — try sending again.",
          });
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  },
);
