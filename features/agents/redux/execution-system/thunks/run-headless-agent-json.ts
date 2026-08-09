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
 *  - a fuzzy-parse fallback over the full response text
 *  - instance cleanup (`destroyInstanceIfAllowed`) unless the caller keeps the
 *    conversation alive for live streaming UI
 *
 * It never throws — it resolves a structured result. Callers that want
 * throw-on-failure semantics use the hook (or check `.success` themselves).
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { MessagePart } from "@/types/python-generated/stream-events";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import { extractFirstJson } from "@/utils/json/extract-json";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import {
  selectConversationRequestIds,
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
      msgs,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error running the agent";
    const fullResponse = conversationId
      ? selectLatestAnswerText(conversationId)(getState())
      : "";
    return {
      success: false,
      data: null,
      fullResponse,
      error: message,
      conversationId: conversationId ?? undefined,
    };
  } finally {
    if (conversationId && !opts.keepInstance) {
      dispatch(destroyInstanceIfAllowed(conversationId));
    }
  }
}

async function waitForExtraction(
  getState: () => RootState,
  args: {
    conversationId: string;
    requestId: string;
    timeoutMs: number;
    pollMs: number;
    settleMs: number;
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

  while (Date.now() - start < args.timeoutMs) {
    const state = getState();

    if (selectJsonExtractionComplete(requestId)(state)) {
      const snapshot = selectFirstExtractedObject(requestId)(state);
      const data = snapshot?.value ?? fuzzyFallback(base().fullResponse);
      if (data == null) {
        return { success: false, data: null, error: msgs.noJson, ...base() };
      }
      return { success: true, data, ...base() };
    }

    const status = selectRequestStatus(requestId)(state);

    if (status === "error") {
      // Fast-fail — but surface any PARTIAL object extracted before the
      // failure so soft consumers (hints, tips) can still use it.
      const reqError = selectRequestError(requestId)(state);
      const partial = selectFirstExtractedObject(requestId)(state)?.value ?? null;
      return {
        success: false,
        data: partial,
        error: reqError?.user_message ?? reqError?.message ?? msgs.streamError,
        ...base(),
      };
    }

    // Stream over, extraction never finalized: give Redux a bounded settle
    // window, then fuzzy-parse the text instead of burning the full timeout.
    if (status !== undefined && TERMINAL_STATUSES.has(status)) {
      terminalAt ??= Date.now();
      if (Date.now() - terminalAt > args.settleMs) {
        const data = fuzzyFallback(base().fullResponse);
        if (data != null) return { success: true, data, ...base() };
        return { success: false, data: null, error: msgs.noJson, ...base() };
      }
    }

    await sleep(args.pollMs);
  }

  return { success: false, data: null, error: msgs.timeout, ...base() };
}

function fuzzyFallback(fullResponse: string): unknown | null {
  if (!fullResponse) return null;
  return extractFirstJson(fullResponse, { allowFuzzy: true })?.value ?? null;
}
