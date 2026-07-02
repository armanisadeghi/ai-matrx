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
    const apiEndpointMode =
      state.messages.byConversationId[conversationId]?.apiEndpointMode ??
      "agent";
    const executePromise =
      apiEndpointMode === "manual"
        ? dispatch(executeManualInstance({ conversationId }))
        : dispatch(executeInstance({ conversationId }));

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

export const cancelExecution = createAsyncThunk<
  void,
  string,
  { state: RootState; dispatch: AppDispatch }
>(
  "instances/cancelExecution",
  async (conversationId, { getState, dispatch }) => {
    abortConversation(conversationId);

    const state = getState();
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
