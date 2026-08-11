/**
 * runHeadlessAgentJson — THE canonical "launch an agent headlessly → wait for
 * its extracted JSON" primitive (FOUND_DEFECTS.md D126).
 *
 * Every headless one-shot agent round-trip goes through this function (directly
 * from thunk-style code, or via the `useHeadlessAgentJson` hook for React
 * surfaces). Do NOT re-implement the launch + poll loop at a call site — the
 * ~22 hand-rolled copies this replaced each carried their own timeout, error
 * mapping, and instance-leak bugs.
 *
 * What it owns:
 *  - launch via `launchAgentExecution` (or the two-step attach-parts +
 *    `executeInstance` path for multimodal inputs like audio grading)
 *  - polling `selectJsonExtractionComplete` with fast-fail on a stream error
 *  - a bounded settle window after the stream ends (never burns the full
 *    timeout when the stream is already over and no JSON is coming)
 *  - ONE result-resolution rule shared by every exit path (`resolveRunData`):
 *    extracted object → extracted value of any type → fuzzy parse of the
 *    request's answer text → fuzzy parse of the conversation's. A run whose
 *    object is already in Redux (and therefore already on the user's screen)
 *    can never be reported as "produced nothing".
 *  - instance cleanup (`destroyInstanceIfAllowed`) unless the caller keeps the
 *    conversation alive for live streaming UI
 *
 * It never throws — it resolves a structured result. Callers that want
 * throw-on-failure semantics use the hook (or check `.success` themselves).
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { MessagePart } from "@/types/python-generated/stream-events";
import type {
  ContextAnchor,
  SourceFeature,
} from "@/features/agents/types/instance.types";
import { extractFirstJson } from "@/utils/json/extract-json";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  selectAnswerText,
  selectConversationRequestIds,
  selectExtractedJson,
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestError,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import {
  selectLatestAnswerText,
  selectLatestRequestId,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { setUserInputMessageParts } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { launchAgentExecution } from "./launch-agent-execution.thunk";
import { executeInstance } from "./execute-instance.thunk";

export interface HeadlessAgentJsonOptions {
  /** Exact agent to run. Mutually exclusive with slotKey. */
  agentId?: string;
  /** Swappable slot to resolve inside the canonical launcher, preserving config_overrides. */
  slotKey?: string;
  /** Stable surface key for telemetry + the focus registry. */
  surfaceKey: string;
  /** UI feature that triggered the run. */
  sourceFeature: SourceFeature;
  /** Variable values keyed by the agent's variable NAME. */
  variables?: Record<string, unknown>;
  /** Canonical surface identity carried into execution context. */
  surfaceName?: string;
  /** Live user-typed input (leave undefined when the user typed nothing). */
  userInput?: string;
  /**
   * "background" (default) — fully invisible run. "direct" — the caller renders
   * the stream itself (pair with `keepInstance: true` + `onConversationCreated`
   * so the live request survives for the streaming UI).
   */
  displayMode?: "direct" | "background";
  /** Server persists nothing for this run. Default false. */
  isEphemeral?: boolean;
  /**
   * Explicit organization for this run — the org of the row it generates
   * from. Without it the request falls back to the user's ambient active org.
   */
  organizationId?: string | null;
  /**
   * The durable entity this run is FOR. Sent as `context_anchor`; the server
   * reloads that row for authoritative org/project/task. Pass it whenever a
   * surface migrating off `useRunAgent` used to send one.
   */
  contextAnchor?: ContextAnchor | null;
  /** Wipe history between sends (builder/test semantics). Default false. */
  autoClearConversation?: boolean;
  /** Let the extractor fuzzy-parse at finalize. Default true. */
  fuzzyOnFinalize?: boolean;
  /** Overall ceiling for the run + extraction. Default 120s. */
  timeoutMs?: number;
  /** Poll cadence (floored to 100ms). Default 250ms. */
  pollIntervalMs?: number;
  /**
   * After the stream reaches a terminal non-error state with no extraction,
   * how long to let Redux settle before falling back / failing — instead of
   * burning the whole `timeoutMs`. Default 6s.
   */
  settleMs?: number;
  /**
   * Keep the conversation/instance alive after the run (live streaming UI owns
   * cleanup). Default false — the instance is destroyed in all outcomes.
   */
  keepInstance?: boolean;
  /**
   * Show the model's chain-of-thought if a surface renders this run's stream.
   * Default FALSE, and it should stay that way: a headless JSON run's product
   * is the structured value. Nobody asked this agent to think out loud, and a
   * user who clicked "get me some ideas" must never be shown the model's
   * private reasoning. Only a builder/debugging surface flips this on.
   */
  showReasoning?: boolean;
  /** Fires with the conversation id BEFORE the stream runs (live UI handle). */
  onConversationCreated?: (conversationId: string) => void;
  /** Fires once the run's request id is known (progress / task tracking). */
  onRequestId?: (requestId: string) => void;
  /**
   * Multimodal inputs (e.g. a recorded answer clip) attached as message parts.
   * Forces the two-step path: launch with autoRun off, attach, execute.
   * KNOWN ANTI-PATTERN (autoRun:false programmatically) centralized HERE so it
   * exists once, not per call site — blocked on launcher-level attach support.
   */
  messageParts?: MessagePart[];
  /** Per-feature user-facing failure copy. */
  failureMessages?: {
    /** Stream errored and the request carries no usable message. */
    streamError?: string;
    /** Run finished but produced no parseable JSON. */
    noJson?: string;
    /** Ceiling elapsed. */
    timeout?: string;
  };
}

/**
 * THE FLOATING LAW, thunk side. Spread into `runHeadlessAgentJson` options to
 * make a THUNK-launched run watchable by the component that triggered it:
 * `direct` so the stream is rendered rather than drained, `keepInstance` so the
 * display does not go blank at the exact moment the content completes, and the
 * conversation handed back the instant it exists.
 *
 * Pass the component's `useLiveRunHandle().claim` (or a
 * `useFloatingRunWindow().start(...).bind`) — those own the kept-alive
 * instance and destroy it on the next run and on unmount. With no callback this
 * spreads NOTHING, so a genuinely headless lane keeps its background posture
 * and its automatic teardown.
 */
export function livePosture(
  onConversationCreated?: (conversationId: string) => void,
):
  | Record<string, never>
  | Pick<
      HeadlessAgentJsonOptions,
      "displayMode" | "keepInstance" | "onConversationCreated"
    > {
  return onConversationCreated
    ? { displayMode: "direct", keepInstance: true, onConversationCreated }
    : {};
}

export interface HeadlessAgentJsonResult {
  success: boolean;
  /**
   * The first extracted JSON object (or fuzzy-recovered value). On a stream
   * error this may carry the PARTIAL object extracted before the failure —
   * `success` is false but soft consumers may still use it.
   */
  data: unknown | null;
  /** Full accumulated answer text (debugging / raw-fallback display). */
  fullResponse: string;
  /** User-facing failure message when `success` is false. */
  error?: string;
  requestId?: string;
  conversationId?: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_MS = 250;
const DEFAULT_SETTLE_MS = 6_000;

const DEFAULT_MESSAGES = {
  streamError: "The agent failed before returning a result.",
  noJson: "The agent finished but produced no structured JSON.",
  timeout:
    "The AI response timed out. If you switched browser tabs during this " +
    "process, the connection may have been suspended — keep this tab active " +
    "and try again.",
} as const;

const TERMINAL_STATUSES = new Set(["complete", "error", "timeout", "cancelled"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runHeadlessAgentJson(
  dispatch: AppDispatch,
  getState: () => RootState,
  opts: HeadlessAgentJsonOptions,
): Promise<HeadlessAgentJsonResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = Math.max(opts.pollIntervalMs ?? DEFAULT_POLL_MS, 100);
  const settleMs = opts.settleMs ?? DEFAULT_SETTLE_MS;
  const msgs = { ...DEFAULT_MESSAGES, ...opts.failureMessages };
  const twoStep = opts.messageParts !== undefined;

  let conversationId: string | null = null;

  try {
    let executionIdentity: { agentId: string } | { slotKey: string };
    if (opts.slotKey !== undefined) {
      if (opts.agentId !== undefined) {
        throw new Error("runHeadlessAgentJson accepts agentId or slotKey, never both");
      }
      executionIdentity = { slotKey: opts.slotKey };
    } else {
      if (opts.agentId === undefined) {
        throw new Error("runHeadlessAgentJson requires agentId or slotKey");
      }
      executionIdentity = { agentId: opts.agentId };
    }
    const launch = await dispatch(
      launchAgentExecution({
        ...executionIdentity,
        surfaceKey: opts.surfaceKey,
        sourceFeature: opts.sourceFeature,
        isEphemeral: opts.isEphemeral ?? false,
        ...(opts.organizationId !== undefined
          ? { organizationId: opts.organizationId }
          : {}),
        ...(opts.contextAnchor !== undefined
          ? { contextAnchor: opts.contextAnchor }
          : {}),
        ...(opts.autoClearConversation !== undefined
          ? { autoClearConversation: opts.autoClearConversation }
          : {}),
        jsonExtraction: {
          enabled: true,
          fuzzyOnFinalize: opts.fuzzyOnFinalize ?? true,
        },
        onConversationCreated: opts.onConversationCreated,
        runtime: {
          ...(opts.surfaceName ? { surfaceName: opts.surfaceName } : {}),
          ...(opts.variables ? { variables: opts.variables } : {}),
          ...(opts.userInput !== undefined ? { userInput: opts.userInput } : {}),
        },
        config: {
          autoRun: !twoStep,
          displayMode: opts.displayMode ?? "background",
          allowChat: false,
          showVariablePanel: false,
          showPreExecutionGate: false,
          hideReasoning: opts.showReasoning !== true,
        },
      }),
    ).unwrap();
    conversationId = launch.conversationId;

    let requestId = launch.requestId;

    if (twoStep) {
      dispatch(
        setUserInputMessageParts({
          conversationId,
          parts: opts.messageParts ?? null,
        }),
      );
      const exec = await dispatch(executeInstance({ conversationId })).unwrap();
      requestId = exec.requestId;
    }

    if (!requestId) {
      requestId =
        selectLatestRequestId(conversationId)(getState()) ??
        selectConversationRequestIds(conversationId)(getState()).at(-1);
    }
    if (!requestId) {
      return {
        success: false,
        data: null,
        fullResponse: "",
        error: "Agent launch did not produce a request id",
        conversationId,
      };
    }
    opts.onRequestId?.(requestId);

    return await waitForExtraction(getState, {
      conversationId,
      requestId,
      timeoutMs,
      pollMs,
      settleMs,
      surfaceKey: opts.surfaceKey,
      agentRef: opts.agentId ?? opts.slotKey ?? "unknown",
      msgs,
    });
  } catch (err: unknown) {
    // The thrown detail is for US, not for the user: a launch/transport
    // failure's message ("Unknown error running the agent", "Failed to fetch")
    // tells a subject-matter expert nothing and reads as a dead end. Capture
    // the technical text, show the feature's own copy.
    const detail =
      err instanceof Error ? err.message : "Unknown error running the agent";
    const fullResponse = conversationId
      ? selectLatestAnswerText(conversationId)(getState())
      : "";
    captureError({
      source: "agent-json-result",
      message: `Headless agent run threw before producing a result: ${detail}`,
      conversationId: conversationId ?? undefined,
      raw: {
        surfaceKey: opts.surfaceKey,
        agent: opts.agentId ?? opts.slotKey ?? "unknown",
        detail,
        answerTextLength: fullResponse.length,
      },
    });
    return {
      success: false,
      data: null,
      fullResponse,
      error: msgs.streamError,
      conversationId: conversationId ?? undefined,
    };
  } finally {
    if (conversationId && !opts.keepInstance) {
      dispatch(destroyInstanceIfAllowed(conversationId));
    }
  }
}

/**
 * THE ONE RULE for deciding what a finished run produced. Every exit path —
 * extraction finalized, stream ended without finalizing, ceiling elapsed —
 * asks THIS, in this order:
 *
 *  1. the first extracted OBJECT committed to Redux
 *  2. the first extracted JSON of ANY type (a top-level array is a real,
 *     usable answer — the old code declared "no structured result" for it)
 *  3. a fuzzy parse of the request's own answer text
 *  4. a fuzzy parse of the conversation's latest answer text
 *
 * Why it matters: the live UI renders straight off `extractedJson`, so a run
 * whose object is sitting in Redux is one the USER HAS ALREADY SEEN. Any exit
 * path that ignores that state tells the user "the agent produced nothing"
 * while its output is on their screen — and throws away a paid model call.
 * Checking a single narrower source in one branch is exactly the bug this
 * function exists to make unrepeatable.
 */
function resolveRunData(
  getState: () => RootState,
  requestId: string,
  conversationId: string,
): { data: unknown | null; via: string } {
  const state = getState();

  const obj = selectFirstExtractedObject(requestId)(state);
  if (obj?.value != null) return { data: obj.value, via: "extracted-object" };

  const any = selectExtractedJson(requestId)(state)?.find(
    (r) => r.value != null,
  );
  if (any?.value != null) return { data: any.value, via: `extracted-${any.type}` };

  const requestText = selectAnswerText(requestId)(state);
  const fromRequest = fuzzyFallback(requestText);
  if (fromRequest != null) return { data: fromRequest, via: "fuzzy-request" };

  const convoText = selectLatestAnswerText(conversationId)(state);
  const fromConvo = fuzzyFallback(convoText);
  if (fromConvo != null) return { data: fromConvo, via: "fuzzy-conversation" };

  return { data: null, via: "none" };
}

/**
 * Loud recovery: a run that ends with nothing usable burned a paid model call
 * and hands the user a failure. Capture the evidence needed to tell the three
 * causes apart (agent/kind drift, answer-free reasoning-only response, or a
 * lost extraction) without re-running the agent.
 */
function reportNoResult(
  getState: () => RootState,
  args: {
    requestId: string;
    conversationId: string;
    surfaceKey: string;
    agentRef: string;
    reason: "extraction-complete" | "stream-ended" | "timeout";
    message: string;
  },
): void {
  const state = getState();
  const answerText = selectAnswerText(args.requestId)(state);
  const extracted = selectExtractedJson(args.requestId)(state);
  captureError({
    source: "agent-json-result",
    message: `Headless agent run produced no usable structured result (${args.reason})`,
    requestId: args.requestId,
    conversationId: args.conversationId,
    raw: {
      surfaceKey: args.surfaceKey,
      agent: args.agentRef,
      userMessage: args.message,
      requestStatus: selectRequestStatus(args.requestId)(state) ?? "unknown",
      extractionComplete: selectJsonExtractionComplete(args.requestId)(state),
      answerTextLength: answerText.length,
      answerTextSample: answerText.slice(0, 800),
      extractedCount: extracted?.length ?? 0,
      extractedTypes: (extracted ?? []).map((r) => r.type),
    },
  });
}

async function waitForExtraction(
  getState: () => RootState,
  args: {
    conversationId: string;
    requestId: string;
    timeoutMs: number;
    pollMs: number;
    settleMs: number;
    surfaceKey: string;
    agentRef: string;
    msgs: { streamError: string; noJson: string; timeout: string };
  },
): Promise<HeadlessAgentJsonResult> {
  const { conversationId, requestId, msgs } = args;
  const start = Date.now();
  let terminalAt: number | null = null;

  const base = () => ({
    requestId,
    conversationId,
    fullResponse: selectLatestAnswerText(conversationId)(getState()),
  });

  const settle = (
    reason: "extraction-complete" | "stream-ended" | "timeout",
    message: string,
  ): HeadlessAgentJsonResult => {
    const { data } = resolveRunData(getState, requestId, conversationId);
    if (data != null) return { success: true, data, ...base() };
    reportNoResult(getState, {
      requestId,
      conversationId,
      surfaceKey: args.surfaceKey,
      agentRef: args.agentRef,
      reason,
      message,
    });
    return { success: false, data: null, error: message, ...base() };
  };

  while (Date.now() - start < args.timeoutMs) {
    const state = getState();

    if (selectJsonExtractionComplete(requestId)(state)) {
      return settle("extraction-complete", msgs.noJson);
    }

    const status = selectRequestStatus(requestId)(state);

    if (status === "error") {
      // Fast-fail — but surface any PARTIAL value extracted before the
      // failure so soft consumers (hints, tips) can still use it.
      const reqError = selectRequestError(requestId)(state);
      const { data } = resolveRunData(getState, requestId, conversationId);
      return {
        success: false,
        data,
        error: reqError?.user_message ?? reqError?.message ?? msgs.streamError,
        ...base(),
      };
    }

    // Stream over, extraction never finalized: give Redux a bounded settle
    // window, then resolve from whatever the run actually produced instead of
    // burning the full timeout.
    if (status !== undefined && TERMINAL_STATUSES.has(status)) {
      terminalAt ??= Date.now();
      if (Date.now() - terminalAt > args.settleMs) {
        return settle("stream-ended", msgs.noJson);
      }
    }

    await sleep(args.pollMs);
  }

  // Ceiling elapsed — a slow run that already produced its object is a
  // SUCCESS, not a timeout. Only report the timeout when nothing landed.
  return settle("timeout", msgs.timeout);
}

function fuzzyFallback(fullResponse: string): unknown | null {
  if (!fullResponse) return null;
  return extractFirstJson(fullResponse, { allowFuzzy: true })?.value ?? null;
}
