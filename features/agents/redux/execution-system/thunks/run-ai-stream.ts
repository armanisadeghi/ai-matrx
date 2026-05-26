/**
 * runAiStream — the single shared stream runner.
 *
 * THE only place that:
 *   1. Stamps the routing record (`setRequestRouting`).
 *   2. Opens the abort-able `fetch` and registers the controller.
 *   3. Validates `!response.ok` (409 / 404 / 422 + tool-injection toast).
 *   4. Asserts X-Conversation-ID drift.
 *   5. Sets streaming statuses.
 *   6. Drives `processStream` (heartbeat-monitored, end-of-stream-committing).
 *   7. Owns the canonical error path (cancel / heartbeat / total / client) —
 *      including `failPendingToolLifecycle` so the LiveToolCallCard never
 *      shimmers forever, and the optional `clearInputOnError` for the turn
 *      pre-persistence failure case.
 *
 * Both the initial-turn thunk (`executeInstance`) and the continuation thunk
 * (`resumeInstance`) call this. Resume is therefore a true peer of a turn —
 * structurally incapable of diverging from the stream contract.
 *
 * The TWO turn-vs-resume divergence points are explicit args, not branches:
 *   - `kind`: 409 is "Conversation already exists" for turns, but "outstanding
 *     delegated calls still need answering" (benign — set instance back to
 *     `paused`, no failPendingToolLifecycle) for resumes.
 *   - `clearInputOnError`: turns clear the user's hidden input on pre-persist
 *     failure; resumes never read the input box.
 *
 * Cancellation is surfaced as `StreamCancelledError` so the caller can map it
 * to `rejectWithValue("Cancelled")` without inspecting `error.name`.
 *
 * See features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md for the full
 * suspend→submit→resume round-trip this runner powers.
 */

import type { RootState } from "@/lib/redux/store";
import { toast } from "sonner";

/**
 * Loose dispatch type that matches whatever `createAsyncThunk` hands us at the
 * call site — RTK doesn't infer the full RootState into a thunk's dispatch
 * generic, so a tight `AppDispatch` is incompatible. This file only ever
 * dispatches plain action creators (no thunk results consumed), so the loose
 * shape doesn't lose anything. Mirrors `processStream`'s `dispatch: (action:
 * unknown) => unknown` for consistency.
 */
export type StreamDispatch = (action: unknown) => unknown;

import { processStream } from "./process-stream";
import type { JsonExtractionConfig } from "./process-stream";
import {
  registerAbortController,
  unregisterAbortController,
} from "./abort-registry";
import type { BackendChannel } from "./resolve-base-url";
import { selectActiveServer } from "@/lib/redux/slices/apiConfigSlice";
import { resolveAgentSandboxRef } from "@/lib/sandbox/active-binding";
import { setInstanceStatus } from "../conversations/conversations.slice";
import {
  setRequestStatus,
  setRequestRouting,
  failPendingToolLifecycle,
} from "../active-requests/active-requests.slice";
import { assertConversationIdMatches } from "../utils/assert-conversation-id";

/**
 * Thrown when the underlying fetch is aborted (user cancel, heartbeat-driven
 * abort, etc.). Lets callers map cancellation to `rejectWithValue("Cancelled")`
 * without sniffing `error.name === "AbortError"`.
 */
export class StreamCancelledError extends Error {
  override name = "StreamCancelledError" as const;
  constructor() {
    super("Cancelled");
  }
}

/**
 * Wraps a stream-phase error AFTER runAiStream's catch has already done the
 * full cleanup (instance/request status, failPendingToolLifecycle, optional
 * clearUserInput). The caller's outer catch should pass these straight through
 * to `rejectWithValue` without re-running cleanup — re-dispatching would
 * overwrite the precise `error_type` (heartbeat_timeout, total_timeout, …)
 * runAiStream recorded with a generic `client_error`.
 *
 * Pre-stream errors (assemble, inject, payload-build) bypass this class and
 * the caller's outer catch handles them with its own cleanup.
 */
export class StreamPhaseError extends Error {
  override name = "StreamPhaseError" as const;
  /** Preserves the original error.name (HeartbeatTimeoutError, etc.) for diagnostics. */
  readonly originalName: string;
  constructor(original: Error) {
    super(original.message);
    this.originalName = original.name;
    this.stack = original.stack;
  }
}

export interface RunAiStreamArgs {
  /** Tracking id for the active request (`createRequest`'d by the caller). */
  requestId: string;
  /** Local Redux conversation id (also keys the abort registry). */
  conversationId: string;
  /** Fully-resolved URL — `${baseUrl}/ai/agents/{id}` or `/ai/conversations/{id}` or `.../resume`. */
  url: string;
  /** Resolved auth/content headers from `resolveBackendForConversation`. */
  headers: Record<string, string>;
  /** Wire body — already snake_cased and shaped for the endpoint. */
  body: Record<string, unknown>;
  /** Backend channel resolved by the caller; recorded for telemetry. */
  channel: BackendChannel;
  dispatch: StreamDispatch;
  getState: () => RootState;
  /** `performance.now()` at the true submit moment (t=0 for client timing). */
  submitAt: number;
  /**
   * Turn vs resume. Governs ONLY the 409 branch:
   *   - turn   → 409 throws "Conversation already exists".
   *   - resume → 409 is benign (outstanding delegated calls still need
   *     answering). Reset the instance to `paused`, complete the request,
   *     do NOT failPendingToolLifecycle.
   */
  kind: "turn" | "resume";
  /**
   * Clear the hidden user input on pre-persistence failure. Turns pass `!retry`
   * (clear on initial sends, leave drafts alone on retries). Resume passes
   * `false` (it never read the input box).
   */
  clearInputOnError?: boolean;
  /** Only set by manual-execution path; mirrors `processStream`'s contract. */
  userMessageClientTempId?: string;
  /** Default 30_000 (≈ 3 missed heartbeats). */
  heartbeatTimeoutMs?: number;
  /** Default 24h. By design heartbeat-loss is the only way a healthy stream fails. */
  maxLifetimeMs?: number;
}

export interface RunAiStreamResult {
  requestId: string;
  conversationId: string;
}

export async function runAiStream(
  args: RunAiStreamArgs,
): Promise<RunAiStreamResult> {
  const {
    requestId,
    conversationId,
    url,
    headers,
    body,
    channel,
    dispatch,
    getState,
    submitAt,
    kind,
    clearInputOnError = false,
    userMessageClientTempId,
    heartbeatTimeoutMs = 30_000,
    maxLifetimeMs = 24 * 60 * 60 * 1000,
  } = args;

  // Stamp the factual routing record — exactly what we're about to send.
  // Ground truth for the Creator Hub Routing tab. Derived from the resolved
  // request inputs so turns and resumes produce identical telemetry.
  {
    const routedClient = body.client as
      | { capabilities?: string[] }
      | undefined;
    const routedTools = (body.tools ?? body.tools_replace ?? []) as Array<{
      name?: string;
    }>;
    dispatch(
      setRequestRouting({
        requestId,
        routing: {
          url,
          channel,
          activeServer: selectActiveServer(getState()),
          sandboxRef: resolveAgentSandboxRef(getState(), conversationId),
          sandboxAttached: body.sandbox != null,
          capabilities: routedClient?.capabilities ?? [],
          toolNames: routedTools
            .map((t) => t?.name)
            .filter((n): n is string => typeof n === "string"),
          recordedAt: new Date().toISOString(),
        },
      }),
    );
  }

  const abortController = new AbortController();
  registerAbortController(conversationId, abortController);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: abortController.signal,
    });

    if (!response.ok) {
      let serverMessage = `${response.status} ${response.statusText}`;
      try {
        const errBody = await response.json();
        serverMessage =
          errBody?.detail?.message ?? errBody?.detail ?? serverMessage;
      } catch {
        /* non-JSON error body */
      }

      const code = response.status;
      if (code === 409) {
        if (kind === "resume") {
          // Benign: ≥1 cx_tl_call rows are still in status='delegated' for
          // this user_request — the user hasn't answered everything. The
          // server returns 409 `outstanding_delegated_calls`. Keep the UI in
          // its waiting-on-user affordance; the next /tool_results POST will
          // re-trigger resume once the last call clears.
          unregisterAbortController(conversationId);
          dispatch(setInstanceStatus({ conversationId, status: "paused" }));
          dispatch(setRequestStatus({ requestId, status: "complete" }));
          return { requestId, conversationId };
        }
        throw new Error(`Conversation already exists: ${serverMessage}`);
      } else if (code === 404) {
        throw new Error(`Conversation not found: ${serverMessage}`);
      } else if (code === 422) {
        // 422 covers two distinct shapes from the backend:
        //   • Tool injection errors — capability resolution failed,
        //     unknown capability, ToolMergeError. Message starts with
        //     "client capability" or "tool". Surface as toast so the
        //     user sees what actually broke instead of a generic banner.
        //   • Validation errors — bad conversation id, schema mismatch.
        //     Throw as before.
        const lower =
          typeof serverMessage === "string" ? serverMessage.toLowerCase() : "";
        if (
          lower.startsWith("client capability") ||
          lower.includes("toolmergeerror") ||
          lower.includes("conflicting tool") ||
          (lower.includes("tool") &&
            (lower.includes("merge") || lower.includes("capability")))
        ) {
          toast.error("Tool injection failed", { description: serverMessage });
          throw new Error(`Tool injection failed: ${serverMessage}`);
        }
        throw new Error(`Invalid conversation ID: ${serverMessage}`);
      }
      throw new Error(`API error: ${serverMessage}`);
    }

    const headerConversationId = response.headers.get("X-Conversation-ID");
    assertConversationIdMatches(
      conversationId,
      headerConversationId,
      "x-conversation-id-header",
    );
    const conversationIdAt = headerConversationId ? performance.now() : null;

    dispatch(setInstanceStatus({ conversationId, status: "streaming" }));
    dispatch(setRequestStatus({ requestId, status: "streaming" }));

    const currentUiState =
      getState().instanceUIState?.byConversationId[conversationId];
    const jsonExtraction: JsonExtractionConfig | undefined =
      currentUiState?.jsonExtraction ?? undefined;

    await processStream({
      requestId,
      conversationId,
      response,
      submitAt,
      conversationIdAt,
      dispatch,
      getState,
      jsonExtraction,
      userMessageClientTempId,
      // Heartbeat-based liveness. The server emits {type:"heartbeat"} every
      // ~10s independent of tool progress; a 30s deadline is ~3 missed beats
      // — long enough for jitter, short enough to surface a dead socket fast.
      // monitorStream resets the deadline on EVERY event (including heartbeat),
      // so a 30-minute shell_execute is fine as long as heartbeats keep flowing.
      // The 24h lifetime ceiling exists so — by design — heartbeat-loss is the
      // ONLY way a healthy long-running stream fails.
      abortController,
      heartbeatTimeoutMs,
      maxLifetimeMs,
    });

    unregisterAbortController(conversationId);
    return { requestId, conversationId };
  } catch (error) {
    unregisterAbortController(conversationId);

    if (error instanceof Error && error.name === "AbortError") {
      dispatch(setInstanceStatus({ conversationId, status: "cancelled" }));
      // A user-initiated cancel orphans any in-flight tool just as surely as
      // a heartbeat timeout does — clear the shimmers.
      dispatch(
        failPendingToolLifecycle({
          requestId,
          errorType: "stream_cancelled",
          errorMessage: "Stream was cancelled before this tool completed.",
        }),
      );
      throw new StreamCancelledError();
    }

    // Client-side error (network failure, abort, etc.) — synthesise the
    // backend's ErrorPayload shape so all error consumers see one canonical
    // structure regardless of source. error_type distinguishes the cause:
    // heartbeat_timeout = the server stopped sending heartbeats (the only
    // designed-for failure signal for long-running tools); total_timeout =
    // the 24h absolute ceiling fired (effectively never); client_error =
    // anything else (fetch failure, parse error, etc.).
    const isHeartbeat =
      error instanceof Error && error.name === "HeartbeatTimeoutError";
    const isTotal =
      error instanceof Error && error.name === "TotalTimeoutError";
    const errorType: "heartbeat_timeout" | "total_timeout" | "client_error" =
      isHeartbeat
        ? "heartbeat_timeout"
        : isTotal
          ? "total_timeout"
          : "client_error";
    const message = error instanceof Error ? error.message : "Unknown error";

    dispatch(
      setRequestStatus({
        requestId,
        status: "error",
        error: { error_type: errorType, message },
      }),
    );
    dispatch(setInstanceStatus({ conversationId, status: "error" }));
    // Force-terminal any tool that the stream left mid-flight. Without this,
    // LiveToolCallCard keeps shimmering "Using tool …" forever because the
    // toolLifecycle entry never receives its terminal event.
    dispatch(
      failPendingToolLifecycle({
        requestId,
        errorType,
        errorMessage: isHeartbeat
          ? "Heartbeat stopped — the stream is no longer alive."
          : isTotal
            ? "Stream exceeded its maximum lifetime."
            : message,
      }),
    );

    // Pre-persistence failure (e.g. "Failed to fetch"): clear the hidden input
    // so the message doesn't linger in the box. It survives as the optimistic
    // user bubble + the `lastSubmittedText` re-apply backup, so nothing is
    // lost. (markInputPersisted, which normally clears it on success, never
    // ran on this path.) Resume never reads the input box, so it passes false.
    if (clearInputOnError) {
      const { clearUserInput } = await import(
        "../instance-user-input/instance-user-input.slice"
      );
      dispatch(clearUserInput(conversationId));
    }

    // Wrap so the caller's outer catch knows we've already cleaned up and
    // skips its own status/clearInput dispatches (which would clobber our
    // precise error_type classification).
    throw new StreamPhaseError(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
