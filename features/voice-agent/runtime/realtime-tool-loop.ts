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
    const res = await ctx.service.execute({
      agent_id: ctx.agentId,
      conversation_id: ctx.conversationId,
      tool_name: call.name,
      arguments: args,
      call_id: call.call_id,
      surface: ctx.surface,
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

/**
 * Flush a batch of buffered tool calls: execute all in parallel, send one
 * `function_call_output` per call_id, then EXACTLY ONE `response.create`.
 *
 * Sending more than one `response.create` breaks xAI's response flow — the
 * single trailing send is the critical invariant. It always fires (even on an
 * empty batch is a no-op caller-side; callers only invoke this with ≥1 call).
 */
export async function flushToolCalls(
  pending: PendingCall[],
  ctx: ToolLoopContext,
): Promise<void> {
  if (pending.length === 0) return;

  const results = await Promise.all(
    pending.map((call) => executeOne(call, ctx)),
  );

  for (const r of results) {
    ctx.sendFunctionCallOutput(r.call_id, r.output);
  }
  ctx.sendResponseCreate();
}
