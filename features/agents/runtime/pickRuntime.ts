// features/agents/runtime/pickRuntime.ts
//
// Pure resolver that decides WHERE an agent execution actually runs,
// given the model's interaction shape and the surface's declared
// execution mode. Used by the launcher to branch between the standard
// Python streaming path and the new in-browser realtime transport.
//
// Why this is separate from model.capabilities:
//   • A model declares what KIND of interaction it expects (turn vs
//     realtime). That's a property of the model.
//   • A surface declares which RUNTIME it uses to talk to that model.
//     That's a property of the surface — the same realtime model could
//     in principle be hit from Python too; we pick browser-direct on
//     `/chat/voice` for latency.
//
// Pure: no React, no Redux, no I/O. The launcher does the lookups and
// passes plain data in.

import type { InteractionMode } from "@/features/ai-models/capabilities/types";

export const EXECUTION_MODES = [
  "python-stream",
  "nextjs-stream",
  "browser-realtime",
  "local-runtime",
] as const;
export type ExecutionMode = typeof EXECUTION_MODES[number];

/**
 * Realtime-capable runtimes. Any surface in this set can host a model
 * with `interaction: "realtime"`; others cannot.
 */
const REALTIME_RUNTIMES: ReadonlySet<ExecutionMode> = new Set<ExecutionMode>([
  "browser-realtime",
  // NOTE: "local-runtime" (Phase 5, live) is a TURN-BASED transport — the
  // Matrx Local engine's /ai surface speaks the same NDJSON stream contract
  // as aidream, not the realtime voice transport. It deliberately stays out
  // of this set; routing to the engine happens at the backend-resolution
  // layer (resolve-base-url.ts "local-runtime" channel), keyed off the
  // conversation's local-pc compute-target binding.
]);

export interface PickRuntimeInput {
  /** From `model.capabilities.interaction`. */
  modelInteraction: InteractionMode;
  /** From `ui_surface.execution_mode`. */
  surfaceMode: ExecutionMode;
  /** Optional per-agent override (currently unused; reserved for a future builder field). */
  agentHint?: ExecutionMode | null;
}

export type PickRuntimeResult =
  | { runtime: ExecutionMode }
  | { error: string };

export function pickRuntime(opts: PickRuntimeInput): PickRuntimeResult {
  const { modelInteraction, surfaceMode, agentHint } = opts;

  // EXHAUSTIVE on InteractionMode — a new mode added to the vocabulary must
  // be handled here explicitly, never fall through to the chat path (that
  // silent fall-through is how extraction models got launched as chat
  // models; see TASK-003).
  switch (modelInteraction) {
    case "realtime":
      // Realtime models are picky: they only work on realtime-capable runtimes.
      if (REALTIME_RUNTIMES.has(surfaceMode)) {
        return { runtime: surfaceMode };
      }
      if (agentHint && REALTIME_RUNTIMES.has(agentHint)) {
        // Honored only when the agent explicitly upgrades; doesn't downgrade.
        return { runtime: agentHint };
      }
      return {
        error: `This is a realtime voice/audio model — open it from a realtime-capable surface (e.g. /chat/voice) instead.`,
      };

    case "extraction":
      // EXPLICIT EXCLUSION: extraction models (NER/classification — the
      // GLiNER2/fastino family) are not conversational. There is no defined
      // chat-launch behavior for them, so the launcher must refuse rather
      // than silently run them as chat models (the pre-TASK-003 bug).
      return {
        error:
          "This is an extraction model (NER/classification) — it cannot run as a conversational agent. Use it through an extraction surface instead.",
      };

    case "turn":
    case "single":
      // "single" (one-shot generation — image/video models) deliberately
      // shares the turn-based routing: the aidream stream runtime handles
      // one-shot generation requests on the same transport as chat turns.
      break;

    default: {
      // Compile-time exhaustiveness: adding a mode to INTERACTION_MODES
      // without handling it here is a type error, not a silent fall-through.
      const unhandled: never = modelInteraction;
      return { error: `Unhandled model interaction mode: ${String(unhandled)}` };
    }
  }

  // Turn-based (or single-shot) model. Surface mode wins by default; agent
  // hint can refine if the surface explicitly accepts the hint.
  if (agentHint && agentHint !== surfaceMode) {
    // Hint only honored when the surface supports the hinted runtime
    // family. For now this means: hint must be in the same realtime/
    // non-realtime bucket as the surface. We don't downgrade across
    // buckets.
    const surfaceIsRealtime = REALTIME_RUNTIMES.has(surfaceMode);
    const hintIsRealtime = REALTIME_RUNTIMES.has(agentHint);
    if (surfaceIsRealtime === hintIsRealtime) {
      return { runtime: agentHint };
    }
  }
  return { runtime: surfaceMode };
}

/**
 * Convenience: tells the caller whether the resolved runtime is a
 * realtime transport, without re-importing the set.
 */
export function isRealtimeRuntime(mode: ExecutionMode): boolean {
  return REALTIME_RUNTIMES.has(mode);
}
