// features/voice-agent/runtime/client-tool-registry.ts
//
// The CLIENT-side tool execution registry for the realtime voice loop.
//
// Why this exists (and why it is NOT a voice-only fork):
//   A realtime tool classified `execution: "client"` must run locally in the
//   browser — the LLM is client-side, so a genuinely browser-only tool (a
//   working-document mutator, a DOM action) executes here, not server-side.
//   The platform's canonical client-tool execution path is the ui-first-tools
//   registry (`getUiFirstToolEntry(name).handler.run(args, ctx)`), used by the
//   turn-based agent's `dispatchUiFirstTool` thunk. This registry REUSES that
//   path by default, and adds ONE narrow extension point for client tools that
//   only make sense in a realtime/voice surface (e.g. working-doc mutators that
//   write a `studio_documents` row live) — which the turn-based path reaches
//   server-side via `ctx_patch` instead.
//
// Resolution order for a client tool name:
//   1. A voice-surface client tool registered via `registerRealtimeClientTool`.
//   2. The canonical ui-first-tools registry (`getUiFirstToolEntry`).
//   3. Not found → the loop answers the call with an explanatory string.
//
// A runner returns a string (the `function_call_output`) — voice tool outputs
// are ALWAYS strings, so each runner stringifies its own structured result.

import type { ThunkDispatch } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { extractErrorMessage } from "@/utils/errors";
import { getUiFirstToolEntry } from "@/features/agents/ui-first-tools/tools/registry";

/**
 * Context handed to a client-tool runner. Mirrors the ui-first-tools
 * `HandlerContext` so a runner can delegate to a ui-first handler directly,
 * plus the voice-specific `instanceId` / `sessionId` a surface tool needs.
 */
export interface RealtimeClientToolContext {
  /** Voice slice instance id (one per route preset). */
  instanceId: string;
  /** The cx conversation id, when the session has minted one. */
  conversationId: string | null;
  /** xAI call_id this invocation answers. */
  callId: string;
  userId: string | null;
  /** Studio session id, when the surface is Scribe Live. */
  sessionId?: string | null;
  dispatch: ThunkDispatch<RootState, unknown, UnknownAction>;
  getState: () => RootState;
}

/** A voice-surface client tool: name + a runner returning the string output. */
export interface RealtimeClientTool {
  name: string;
  run: (
    args: Record<string, unknown>,
    ctx: RealtimeClientToolContext,
  ) => Promise<string>;
}

const voiceRegistry = new Map<string, RealtimeClientTool>();

/**
 * Register a client tool that only exists on a realtime/voice surface (e.g. a
 * working-document mutator). Idempotent on name — re-registering overwrites,
 * which keeps hot-reload sane in dev. Surfaces register their tools once at
 * module load (import the registration file for its side-effect).
 */
export function registerRealtimeClientTool(tool: RealtimeClientTool): void {
  voiceRegistry.set(tool.name, tool);
}

export function getRegisteredRealtimeClientTools(): RealtimeClientTool[] {
  return Array.from(voiceRegistry.values());
}

function stringifyOutput(out: unknown): string {
  if (typeof out === "string") return out;
  try {
    return JSON.stringify(out);
  } catch {
    return String(out);
  }
}

/**
 * Run a client tool by name. Resolution: voice-surface registry first, then the
 * canonical ui-first-tools registry. Returns the string output, or `null` when
 * NO runner is registered for the name (so the caller can answer with an
 * "unknown tool" string — distinct from a tool that ran and failed).
 *
 * A thrown runner error is NOT swallowed here — it propagates to the loop,
 * which answers that call_id with an explanatory string. (The loop is the one
 * place that turns failures into recoverable strings, per the contract.)
 */
export async function runClientTool(
  name: string,
  args: Record<string, unknown>,
  ctx: RealtimeClientToolContext,
): Promise<string | null> {
  const voiceTool = voiceRegistry.get(name);
  if (voiceTool) {
    return voiceTool.run(args, ctx);
  }

  const uiFirst = getUiFirstToolEntry(name);
  if (uiFirst) {
    // The ui-first handler validates its own args via the registry schema in
    // the turn-based dispatcher; here we trust the model's args and let the
    // handler defend. A userId is required by the ui-first HandlerContext.
    if (!ctx.userId) {
      throw new Error(`client tool "${name}" requires an authenticated user`);
    }
    const parsed = uiFirst.schema.safeParse(args);
    if (!parsed.success) {
      throw new Error(
        `args failed schema for ${name}: ${extractErrorMessage(parsed.error)}`,
      );
    }
    const result = await uiFirst.handler.run(parsed.data, {
      conversationId: ctx.conversationId ?? "",
      callId: ctx.callId,
      userId: ctx.userId,
      dispatch: ctx.dispatch,
      getState: ctx.getState,
    });
    return stringifyOutput(result);
  }

  return null;
}
