/**
 * hostedSandboxRun — the ONE client for a Claude Code run inside a Matrx
 * Sandbox we start for the user.
 *
 * ## What this is
 *
 * `/work/new`'s "Claude Code (hosted)" destination. The run happens in a Matrx
 * Sandbox on our side (not on the user's Mac — that is the separate
 * `matrxLocalRuntime` lane), streams back as NDJSON, and lands in a canonical
 * conversation the user opens at `/work/conversations/<id>`.
 *
 * ## Rendering
 *
 * Nothing here parses content. The NDJSON body is handed to
 * `adoptForeignStream`, so the run renders through the ONE canonical pipeline
 * (`processStream` → `activeRequests` → the kind registry) exactly as a chat
 * stream does. A second renderer here would be the banned bespoke-stream
 * defect (`features/content-ir/FEATURE.md`).
 *
 * ## THE TWO-HOMES RULE — why these are the `claude/*` paths
 *
 * There is ONE url per operation. `POST /coding-sessions/claude/stream` and
 * `POST /coding-sessions/claude/runtimes/{runtime_id}/cancel` each have two
 * server homes: served inside a hosted Matrx Sandbox they run the turn; served
 * by the app server they find or start the caller's sandbox and forward the
 * same request into it. The client sends the identical body either way, so
 * there is nothing here to branch on. The short-lived `/coding-sessions/hosted/*`
 * POST twins were collapsed into these before they ever shipped — two urls for
 * one operation is two auth stories and a second dispatch path
 * (aidream `scripts/check_bridge_dispatch_surface.py`).
 *
 * The verdict that decides whether this may run at all is the BRIDGE's, never
 * a probe here: `lib/codingBridgeCapability.ts`.
 */

import { apiPost, buildPath } from "@/lib/api/typed-client";
import { callApi } from "@/lib/api/call-api";
import type { AppThunk } from "@/lib/redux/store";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";

/** See THE TWO-HOMES RULE. The one url for a hosted turn. */
export const HOSTED_STREAM_PATH = "/coding-sessions/claude/stream" as const;
/** See THE TWO-HOMES RULE. The one url that stops a hosted run. */
export const HOSTED_CANCEL_PATH =
  "/coding-sessions/claude/runtimes/{runtime_id}/cancel" as const;

/** Default folder inside the sandbox. The server default, stated here too. */
export const HOSTED_WORKSPACE_ROOT = "/home/agent";

export interface HostedRunRequest {
  /** The conversation id the caller minted with `crypto.randomUUID()`. */
  conversationId: string;
  /** What the user typed. Never machine content. */
  prompt: string;
  workspaceRoot?: string;
  maxTurns?: number;
  model?: string | null;
  agentId?: string | null;
  mandateKey?: string | null;
  permissionMode?: "acceptEdits" | "plan";
}

export interface HostedRunHandle {
  /** The ids the adopted stream landed under, once the stream connected. */
  requestId: string | null;
  /** The sandbox run id Cancel needs, when the stream reported one. */
  runtimeId: string | null;
  /** The server's own sentence when the run could not start. */
  error: string | null;
}

export interface StartHostedRunCallbacks {
  /** Fires the instant the stream is adopted — before any event is processed. */
  onAdopted?: (ids: { requestId: string; conversationId: string }) => void;
  /** Fires the first time the stream reports a runtime id (Cancel's input). */
  onRuntimeId?: (runtimeId: string) => void;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * The runtime id an event reports, or null.
 *
 * The sandbox run id arrives on the run's own early events — the
 * `MatrxRuntimeWarning`-shaped event carries it as `runtime_id`, and the init /
 * data events carry the same field. It is read tolerantly (root, and one level
 * of `data` nesting, plus the `matrx_runtime_id` spelling) because Cancel is
 * useless without it and a missing id must never be guessed.
 */
export function readHostedRuntimeId(event: TypedStreamEvent): string | null {
  const payload = asRecord((event as { data?: unknown }).data);
  const candidates = [payload, asRecord(payload?.data)];
  for (const source of candidates) {
    if (!source) continue;
    const found =
      nonEmptyString(source.runtime_id) ??
      nonEmptyString(source.matrx_runtime_id);
    if (found) return found;
  }
  return null;
}

/**
 * Start the hosted run and adopt its stream.
 *
 * Resolves when the stream ends (cleanly or not). A failure BEFORE the stream
 * is a normal JSON error envelope; its `message` is returned verbatim in
 * `error` for the caller to surface — nothing is swallowed and nothing is
 * re-worded.
 */
export function startHostedRun(
  request: HostedRunRequest,
  callbacks: StartHostedRunCallbacks = {},
): AppThunk<Promise<HostedRunHandle>> {
  return async (dispatch) => {
    const abortController = new AbortController();
    let requestId: string | null = null;
    let runtimeId: string | null = null;

    const consumeStream = dispatch(
      adoptForeignStream({
        abortController,
        onAdopted: (ids) => {
          requestId = ids.requestId;
          callbacks.onAdopted?.(ids);
        },
        onEvent: (event) => {
          if (runtimeId) return;
          const found = readHostedRuntimeId(event);
          if (found) {
            runtimeId = found;
            callbacks.onRuntimeId?.(found);
          }
        },
      }),
    );

    const result = await dispatch(
      callApi({
        path: HOSTED_STREAM_PATH,
        method: "POST",
        stream: true,
        signal: abortController.signal,
        consumeStream,
        body: {
          action: "start",
          conversation: {
            conversation_id: request.conversationId,
            is_new: true,
            store: true,
          },
          prompt: request.prompt,
          workspace_root: request.workspaceRoot ?? HOSTED_WORKSPACE_ROOT,
          max_turns: request.maxTurns ?? 20,
          model: request.model ?? null,
          agent_id: request.agentId ?? null,
          mandate_key: request.mandateKey ?? null,
          permission_mode: request.permissionMode ?? "acceptEdits",
        },
      }),
    );

    return {
      requestId,
      runtimeId,
      error: result.error ? result.error.message : null,
    };
  };
}

/**
 * Stop a hosted run.
 *
 * Throws on refusal so the caller surfaces the server's sentence; a cancel that
 * silently did nothing is the lie this platform treats as a defect.
 */
export async function cancelHostedRun(
  runtimeId: string,
): Promise<{ runtimeId: string; cancelled: boolean }> {
  const { data } = await apiPost(
    buildPath(HOSTED_CANCEL_PATH, { runtime_id: runtimeId }),
    undefined,
  );
  return { runtimeId: data.runtime_id, cancelled: data.cancelled };
}
