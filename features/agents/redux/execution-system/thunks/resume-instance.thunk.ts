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
 * authoritative signal for when to resume. (Exception: this thunk re-dispatches
 * itself for the bounded 409 `resume_conflict` retry.)
 *
 * Concurrency contract (2026-06-09 incident fixes):
 *   - Single-flight per user_request_id via `claimResume` — taken
 *     synchronously before the first `await` (see resume-claims.ts).
 *   - Fresh `context` is re-sent in the resume body so the resumed loop
 *     isn't context-blind (`ctx_get` → "No context objects are available").
 *   - 409 `resume_conflict` retries with bounded linear backoff;
 *     `not_resumable` / `outstanding_delegated_calls` never retry and never
 *     surface as user-facing errors (handled in run-ai-stream.ts).
 *
 * See features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md for the full protocol.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { UserOverrides } from "@/features/agents/types/request.types";

import { generateRequestId } from "../utils/ids";
import { resolveBackendForConversation } from "./resolve-base-url";
import { buildToolInjection } from "../utils/build-tool-injection";
import { hasAbortController } from "./abort-registry";
import {
  runAiStream,
  ResumeConflictError,
  StreamCancelledError,
  StreamPhaseError,
} from "./run-ai-stream";
import {
  claimResume,
  releaseResumeClaim,
  onResumeStreamOpened,
  nextResumeConflictAttempt,
  RESUME_CONFLICT_BACKOFF_MS,
  RESUME_CONFLICT_MAX_RETRIES,
} from "./resume-claims";
import { selectContextPayload } from "../instance-context/instance-context.selectors";
import { buildAmbientContext } from "@/features/agents/ui-first-tools/redux/build-ambient-context";
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

    // Single-flight claim per user_request — taken SYNCHRONOUSLY, before the
    // first `await`. Two /tool_results POSTs for parallel delegated calls can
    // BOTH return `continuation_needed=true`; without this claim both
    // dispatches pass the hasAbortController check below (the controller
    // isn't registered until after `await buildToolInjection`) and race two
    // model loops onto one conversation (the 2026-06-09 incident). Claims
    // clear when the stream opens or after a ~10s TTL; every bail path below
    // must release explicitly so it doesn't suppress the next legitimate
    // resume for the TTL window.
    if (!claimResume(userRequestId)) {
      return rejectWithValue(
        "Resume skipped — already claimed for this user_request",
      );
    }

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
        releaseResumeClaim(userRequestId);
        return rejectWithValue("Resume skipped — stream already in flight");
      }

      // Conversation must already be in Redux (the /tool_results POST that
      // triggered us was made under this conversationId). If it's not here, the
      // instance was torn down — there's nothing to resume into.
      const instance = state.conversations.byConversationId[conversationId];
      if (!instance) {
        releaseResumeClaim(userRequestId);
        return rejectWithValue(`Conversation ${conversationId} not found`);
      }

      // Don't auto-resume after a user cancel or a stream error. The user
      // either explicitly stopped the run or saw a failure surface — either
      // way, silently restarting the loop would be surprising. The instance is
      // resumable manually (a fresh send / explicit retry); we just don't do
      // it implicitly from a late /tool_results POST.
      if (instance.status === "cancelled" || instance.status === "error") {
        releaseResumeClaim(userRequestId);
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
        releaseResumeClaim(userRequestId);
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

      // Re-send the per-message context bundle. The suspended run's context
      // objects lived only in the original request's scope — without
      // re-sending, the resumed loop is context-blind (`ctx_get` → "No
      // context objects are available"). The server's ResumeRequest accepts
      // `context` since the 2026-06-09 fix and re-applies it via
      // apply_context_objects. We rebuild from cached Redux state only (the
      // chips on this conversation + the ambient snapshot) — no heavy
      // pre-send refresh; the resume must open fast.
      const chipContext = selectContextPayload(conversationId)(state);
      const ambient = buildAmbientContext(state, conversationId);
      const context: Record<string, unknown> | undefined =
        chipContext || ambient
          ? { ...(ambient ?? {}), ...(chipContext ?? {}) }
          : undefined;

      // USER-layer apply policy — keep the resumed loop's directive handling
      // aligned with the user's preference (highest-priority cascade leg).
      // "default" → omit (let the backend resolve its own default).
      const applyPolicy = state.userPreferences.assistant.directiveApplyPolicy;
      const userOverrides: UserOverrides | undefined =
        applyPolicy && applyPolicy !== "default"
          ? { apply_policy: applyPolicy }
          : undefined;

      const body: Record<string, unknown> = {
        user_request_id: userRequestId,
        ...(context && { context }),
        ...(injection.tools && { tools: injection.tools }),
        ...(injection.tools_replace !== undefined && {
          tools_replace: injection.tools_replace,
        }),
        ...(injection.client && { client: injection.client }),
        ...(userOverrides && { user: userOverrides }),
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

      const result = await runAiStream({
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
        // Stream genuinely opened — clear the single-flight claim so the
        // resumed loop's NEXT suspend (re-entrancy) can claim fresh, and
        // reset the resume_conflict retry counter for this request.
        onStreamOpen: () => onResumeStreamOpened(userRequestId),
      });
      // Benign-409 returns (outstanding_delegated_calls / not_resumable)
      // never opened a stream, so onStreamOpen never cleared the claim —
      // release here so the next /tool_results-triggered resume isn't
      // suppressed for the TTL window. Idempotent after a real stream.
      releaseResumeClaim(userRequestId);
      return result;
    } catch (error) {
      if (error instanceof ResumeConflictError) {
        // 409 resume_conflict — another run is still live for this request
        // (usually the suspending run hasn't persisted status='paused' yet;
        // a fast tool's result POST can beat that write). runAiStream already
        // skipped all error surfacing. Retry with linear backoff, bounded
        // per user_request across retries.
        releaseResumeClaim(userRequestId);
        // The createRequest entry we opened never streamed — close it so the
        // UI doesn't show a stale "connecting" request.
        dispatch(setRequestStatus({ requestId, status: "complete" }));
        const attempt = nextResumeConflictAttempt(userRequestId);
        if (attempt !== null) {
          const delay = RESUME_CONFLICT_BACKOFF_MS * attempt;
          console.warn(
            `[resumeInstance] 409 resume_conflict — retrying in ${delay}ms (attempt ${attempt}/${RESUME_CONFLICT_MAX_RETRIES})`,
            { conversationId, userRequestId },
          );
          setTimeout(() => {
            void dispatch(
              resumeInstance({ conversationId, userRequestId, debug }),
            );
          }, delay);
          return rejectWithValue(
            `resume_conflict — retry ${attempt} scheduled`,
          );
        }
        // Budget spent. Benign: the conflicting run owns the conversation
        // (or the next /tool_results POST will re-trigger us). Settle back
        // to the waiting affordance rather than surfacing an error.
        console.warn(
          "[resumeInstance] 409 resume_conflict — retries exhausted; leaving instance paused",
          { conversationId, userRequestId },
        );
        dispatch(setInstanceStatus({ conversationId, status: "paused" }));
        return rejectWithValue("resume_conflict — retries exhausted");
      }
      if (error instanceof StreamCancelledError) {
        releaseResumeClaim(userRequestId);
        return rejectWithValue("Cancelled");
      }
      if (error instanceof StreamPhaseError) {
        releaseResumeClaim(userRequestId);
        return rejectWithValue(error.message);
      }

      // Pre-stream failure (backend resolve, buildToolInjection, etc.). Mark
      // the request as error so the UI doesn't leave a stale "connecting"
      // request hanging around. The instance was just flipped to "running";
      // walk it back to "error" so consumers can react.
      releaseResumeClaim(userRequestId);
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
