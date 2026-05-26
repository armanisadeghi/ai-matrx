/**
 * resumeInstance — continue an agent loop whose original stream has ended
 * because a client-delegated tool was answered after the hard-suspend.
 *
 * Background: the aidream backend hard-suspends and ENDS the stream the moment
 * any client-delegated tool is pending (see `_suspend_for_delegation` in
 * executor.py). Once the user answers via `POST /tool_results`, the server
 * returns `continuation_needed: true` and the `user_request_id` — meaning
 * "the call is resolved, the loop is ready to continue, but nobody is running
 * it." This thunk opens a fresh stream against `/ai/conversations/{id}/resume`
 * to reconstruct the conversation from the DB and stream the continuation.
 *
 * The thunk that owns the contract for that round-trip is `submit-tool-results.ts`
 * — it reads the success body and dispatches us. Do not call this from
 * anywhere else; the server's `continuation_needed` flag is the only
 * authoritative signal for when to resume.
 *
 * See features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md for the full protocol.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

import { generateRequestId } from "../utils/ids";
import { resolveBackendForConversation } from "./resolve-base-url";
import { buildToolInjection } from "../utils/build-tool-injection";
import { hasAbortController } from "./abort-registry";
import {
  runAiStream,
  StreamCancelledError,
  StreamPhaseError,
} from "./run-ai-stream";
import { setInstanceStatus } from "../conversations/conversations.slice";
import {
  createRequest,
  setRequestStatus,
} from "../active-requests/active-requests.slice";

interface ResumeInstanceArgs {
  conversationId: string;
  /**
   * The `user_request_id` returned by `POST /tool_results` — the server reuses
   * it on `/resume` so token / cost aggregation stays under the same row and
   * the executor knows which suspended turn to reconstruct.
   */
  userRequestId: string;
  debug?: boolean;
}

interface ResumeInstanceResult {
  requestId: string;
  conversationId: string;
}

export const resumeInstance = createAsyncThunk<
  ResumeInstanceResult,
  ResumeInstanceArgs
>(
  "instances/resume",
  async (
    { conversationId, userRequestId, debug = false },
    { getState, dispatch, rejectWithValue },
  ) => {
    const requestId = generateRequestId();

    try {
      const state = getState() as RootState;

      // Double-resume guard. A stream is already registered for this
      // conversation (either the original turn is unexpectedly still alive, or
      // a previous resume is mid-flight). Aborting it would race the
      // already-in-flight reducer, and starting a second one would split the
      // stream into two parallel readers writing to the same Redux entries.
      // Bail and let the live one finish; the next /tool_results POST will
      // re-evaluate continuation_needed.
      if (hasAbortController(conversationId)) {
        return rejectWithValue("Resume skipped — stream already in flight");
      }

      // Conversation must already be in Redux (the /tool_results POST that
      // triggered us was made under this conversationId). If it's not here, the
      // instance was torn down — there's nothing to resume into.
      const instance = state.conversations.byConversationId[conversationId];
      if (!instance) {
        return rejectWithValue(`Conversation ${conversationId} not found`);
      }

      // Don't auto-resume after a user cancel or a stream error. The user
      // either explicitly stopped the run or saw a failure surface — either
      // way, silently restarting the loop would be surprising. The instance is
      // resumable manually (a fresh send / explicit retry); we just don't do
      // it implicitly from a late /tool_results POST.
      if (instance.status === "cancelled" || instance.status === "error") {
        return rejectWithValue(
          `Resume skipped — instance is ${instance.status}`,
        );
      }

      // Same server + auth scheme the original turn used. Resume MUST hit the
      // server that owns the conversation; resolveBackendForConversation honors
      // the per-conversation override (sandbox-mode editor) and matches the
      // auth scheme automatically.
      const backend = resolveBackendForConversation(state, conversationId);
      if (!backend) {
        return rejectWithValue("No backend URL configured");
      }

      // Mirror the original launch's capability surface. Resume goes to the
      // additive endpoint family (it never replaces the agent's saved tools),
      // so the surface declaration + per-conversation client tools + capability
      // envelope all line up with what the original turn shipped. Without
      // this, the resumed loop would see a different tool set and might
      // re-delegate calls the user already answered.
      const injection = await buildToolInjection(state, conversationId, {
        mode: "additive",
      });

      const body: Record<string, unknown> = {
        user_request_id: userRequestId,
        ...(injection.tools && { tools: injection.tools }),
        ...(injection.tools_replace !== undefined && {
          tools_replace: injection.tools_replace,
        }),
        ...(injection.client && { client: injection.client }),
        ...(debug && { debug: true }),
      };
      // ResumeRequest does NOT declare a top-level `sandbox` (unlike the
      // turn-1 agent payload). The sandbox binding rides on
      // `client.state["sandbox-fs"]` via buildToolInjection; the server reads
      // it from there for the resume path.

      // Create the request tracking entry. No optimistic user message — there
      // is no new input on a resume.
      dispatch(createRequest({ requestId, conversationId }));
      // Flip the instance back to running. It was likely `paused` (the
      // ui-first dispatcher sets it before awaiting the user) or `complete`
      // (the original suspended stream finalised its phase). `runAiStream`
      // will set it to `streaming` once the response opens.
      dispatch(setInstanceStatus({ conversationId, status: "running" }));
      dispatch(setRequestStatus({ requestId, status: "connecting" }));

      const submitAt = performance.now();
      // Plural path — same as POST /tool_results and the type-generated
      // ResumeRequest entry in api-types.ts. The singular `/conversation/...`
      // is registered as an alias on the backend; prefer the canonical plural.
      const url = `${backend.baseUrl}/ai/conversations/${conversationId}/resume`;

      return await runAiStream({
        requestId,
        conversationId,
        url,
        headers: backend.headers,
        body,
        channel: backend.channel,
        dispatch,
        getState: getState as () => RootState,
        submitAt,
        kind: "resume",
        // Resume never read the input box — leaving the user's draft (if any)
        // untouched on a stream-phase failure.
        clearInputOnError: false,
      });
    } catch (error) {
      if (error instanceof StreamCancelledError) {
        return rejectWithValue("Cancelled");
      }
      if (error instanceof StreamPhaseError) {
        return rejectWithValue(error.message);
      }

      // Pre-stream failure (backend resolve, buildToolInjection, etc.). Mark
      // the request as error so the UI doesn't leave a stale "connecting"
      // request hanging around. The instance was just flipped to "running";
      // walk it back to "error" so consumers can react.
      const message = error instanceof Error ? error.message : "Unknown error";
      dispatch(setInstanceStatus({ conversationId, status: "error" }));
      dispatch(
        setRequestStatus({
          requestId,
          status: "error",
          error: { error_type: "client_error", message },
        }),
      );
      return rejectWithValue(message);
    }
  },
);
