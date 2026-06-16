// features/voice-agent/runtime/realtime-tool-loop.ts
//
// The realtime tool-call loop (contract §5.6 / handoff §4d).
//
// xAI emits `response.function_call_arguments.done` per tool the model wants to
// call, then `response.done`. We BUFFER the calls until `response.done`, then
// flush them as ONE batch so parallel calls land together:
//
//   1. Classify each call against the resolved `RealtimeToolSet` (a Map by name):
//        - "client"  → run locally via the client-tool registry.
//        - "server"  → round-trip through `POST /ai/tools/execute`.
//        - "builtin" → log a warning + answer with an explanatory string
//                      (a builtin reaching the client is a backend bug; xAI
//                      should have run it server-side).
//   2. `Promise.all` — every result becomes a STRING `output`.
//   3. Send ONE `function_call_output` per call_id.
//   4. Send EXACTLY ONE `response.create` so xAI continues the turn.
//
// Failure handling — the loop NEVER throws: an unknown tool, a JSON parse
// error, a thrown runner, or a server `ok:false` all resolve to a short
// explanatory string for that call_id, so the model recovers gracefully and
// the voice turn never crashes. Outputs are always strings.

import type { RealtimeToolSet, ResolvedRealtimeTool } from "../types";
import type { RealtimeClientToolContext } from "./client-tool-registry";
import type {
  RealtimeToolContextEnvelope,
  RealtimeToolService,
} from "../services/realtimeToolService";

/** One buffered tool call from `response.function_call_arguments.done`. */
export interface PendingCall {
  call_id: string;
  name: string;
  /** Raw JSON string of the arguments as xAI sent them. */
  arguments: string;
}

/**
 * Everything `flushToolCalls` needs. Built lazily on first tool call by
 * `useXaiVoiceSession` so a tool-less session pays nothing.
 *
 * `runClient` / `service` are injected (rather than imported directly) so the
 * loop is unit-testable without Redux or the network.
 */
export interface ToolLoopContext {
  agentId: string;
  conversationId: string | null;
  /** DB surface name for allowed-set resolution (e.g. "matrx-user/chat-voice"). */
  surface: string;
  /**
   * Per-conversation tool additions (tool UUIDs) — MUST mirror exactly what the
   * resolve hook declared at session start, or the server's re-resolution at
   * execute time excludes an added tool and 403s it. Same source as resolve.
   */
  addedToolIds: string[];
  /** Resolve against an agent VERSION row rather than the live agent. Mirrors resolve. */
  isVersion: boolean;
  /** Resolved tools keyed by name — the classification source. */
  resolvedTools: Map<string, ResolvedRealtimeTool>;
  /** org/project/task/scope envelope for the execute call. */
  contextEnvelope?: RealtimeToolContextEnvelope | null;
  /** Send a `function_call_output` JSON payload over the xAI socket. */
  sendFunctionCallOutput: (callId: string, output: string) => void;
  /** Send a single `response.create` to continue the turn. */
  sendResponseCreate: () => void;
  /** The server-execution path (`POST /ai/tools/execute`). */
  service: RealtimeToolService;
  /**
   * Run a client tool by name. Returns the string output, or `null` when no
   * runner is registered (→ "unknown tool" answer). Defaults to the shared
   * client-tool registry; injectable for tests.
   */
  runClient?: (
    name: string,
    args: Record<string, unknown>,
    clientCtx: RealtimeClientToolContext,
  ) => Promise<string | null>;
  /** Context handed to client-tool runners. */
  clientToolContext: Omit<RealtimeClientToolContext, "callId">;
}

/** Build a name→tool Map from a `RealtimeToolSet` for O(1) classification. */
export function buildResolvedToolMap(
  tools: RealtimeToolSet,
): Map<string, ResolvedRealtimeTool> {
  return new Map(tools.map((t) => [t.name, t]));
}

interface CallResult {
  call_id: string;
  output: string;
}

async function executeOne(
  call: PendingCall,
  ctx: ToolLoopContext,
): Promise<CallResult> {
  const spec = ctx.resolvedTools.get(call.name);
  if (!spec) {
    return {
      call_id: call.call_id,
      output: `Unknown tool: ${call.name}. It is not in this agent's resolved tool set.`,
    };
  }

  // Parse args once. A malformed args string is a recoverable answer, not a crash.
  let args: Record<string, unknown>;
  try {
    const parsed = call.arguments.trim() === "" ? {} : JSON.parse(call.arguments);
    args =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    return {
      call_id: call.call_id,
      output: `Tool ${call.name} received malformed arguments and could not run.`,
    };
  }

  try {
    if (spec.execution === "builtin") {
      // A builtin should never reach the client — xAI runs it server-side.
      // Surface LOUDLY (a recovery firing means a real classification bug got
      // past the resolve endpoint) but still answer so the turn survives.
      console.warn(
        `[realtime-tool-loop] Builtin tool reached the client: ${call.name}. ` +
          `xAI should run builtins server-side — this indicates a classification bug.`,
      );
      return {
        call_id: call.call_id,
        output: `The "${call.name}" capability runs automatically and cannot be called directly here.`,
      };
    }

    if (spec.execution === "client") {
      // Default to the shared client-tool registry. Imported lazily so this
      // module doesn't pull the ui-first-tools registry (and its transitive
      // Supabase client) at load — keeps the loop unit-testable in isolation
      // and trims the chat-voice bundle when no client tool ever fires.
      const runClient =
        ctx.runClient ??
        (await import("./client-tool-registry")).runClientTool;
      const out = await runClient(call.name, args, {
        ...ctx.clientToolContext,
        callId: call.call_id,
      });
      if (out === null) {
        return {
          call_id: call.call_id,
          output: `Tool ${call.name} is marked client-side but has no client implementation registered.`,
        };
      }
      return { call_id: call.call_id, output: out };
    }

    // execution === "server"
    // A server tool needs a real agent_id — the /execute endpoint resolves the
    // allowed set for THAT agent. Round-tripping agent_id:"" 403s/500s with no
    // useful signal, so answer the call with the documented explanatory string
    // instead. (A server session that reached here without an agentId is itself
    // a wiring bug; this is the LOUD-but-recoverable fallback.)
    if (!ctx.agentId) {
      return {
        call_id: call.call_id,
        output: `Tool ${call.name} could not run: this voice session has no agent bound, so server tools are unavailable.`,
      };
    }
    const res = await ctx.service.execute({
      agent_id: ctx.agentId,
      conversation_id: ctx.conversationId,
      tool_name: call.name,
      arguments: args,
      call_id: call.call_id,
      surface: ctx.surface,
      added_tool_ids: ctx.addedToolIds,
      is_version: ctx.isVersion,
      context: ctx.contextEnvelope ?? null,
    });
    // The server returns a string output for BOTH ok and !ok — the failure
    // message is forwarded verbatim so the model can recover from it.
    return { call_id: call.call_id, output: res.output };
  } catch (err) {
    const message = err instanceof Error ? err.message : "tool execution failed";
    return { call_id: call.call_id, output: `Tool error: ${message}` };
  }
}

/** Options that let the caller abort a flush mid-flight (barge-in / stop). */
export interface FlushOptions {
  /**
   * Aborted by the orchestrator on barge-in / stop / a superseding flush. When
   * already aborted, NO `function_call_output` and NO `response.create` are
   * sent — the turn that owned these calls is gone, so emitting outputs would
   * either hit a closed socket or inject a stale `response.create` into a new
   * turn (the double-`response.create` class of bug this guards against).
   */
  signal?: AbortSignal;
  /**
   * Last-line guard: returns true only when it is still safe to send on the
   * socket (open + not superseded). Checked immediately before EACH send so a
   * disconnect or abort that lands during tool execution can't produce a stray
   * `response.create`. Defaults to "always safe" for unit tests.
   */
  canSend?: () => boolean;
}

/**
 * Flush a batch of buffered tool calls: execute all in parallel, send one
 * `function_call_output` per call_id, then EXACTLY ONE `response.create`.
 *
 * Sending more than one `response.create` breaks xAI's response flow — the
 * single trailing send is the critical invariant. It fires AT MOST once: the
 * caller serializes flushes (one outstanding logical batch at a time) and an
 * aborted/superseded flush sends nothing at all, so two `response.create`s can
 * never be emitted for one logical batch even across re-entrancy / interrupt.
 *
 * Returns true if the trailing `response.create` was sent, false if the flush
 * was aborted/blocked before it could send (so the caller can keep bookkeeping
 * accurate).
 */
export async function flushToolCalls(
  pending: PendingCall[],
  ctx: ToolLoopContext,
  options?: FlushOptions,
): Promise<boolean> {
  if (pending.length === 0) return false;

  const aborted = (): boolean => options?.signal?.aborted ?? false;
  const canSend = (): boolean =>
    !aborted() && (options?.canSend ? options.canSend() : true);

  // If the turn was interrupted before we even started running, do nothing.
  if (aborted()) return false;

  const results = await Promise.all(
    pending.map((call) => executeOne(call, ctx)),
  );

  // The turn may have been interrupted (barge-in / stop) or the socket closed
  // WHILE the tools ran. Sending now would emit a stale response.create into a
  // cancelled/new turn — exactly the invariant violation we guard. Bail loudly-
  // recoverable: the discarded outputs belong to a turn that no longer exists.
  if (!canSend()) return false;

  for (const r of results) {
    // Re-check before every send — a disconnect/abort mid-loop must stop us.
    if (!canSend()) return false;
    ctx.sendFunctionCallOutput(r.call_id, r.output);
  }
  if (!canSend()) return false;
  ctx.sendResponseCreate();
  return true;
}
