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
  // local-runtime will join this set in Phase 2 when matrx-local lands.
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

  // Realtime models are picky: they only work on realtime-capable runtimes.
  if (modelInteraction === "realtime") {
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
  }

  // Turn-based model. Surface mode wins by default; agent hint can
  // refine if the surface explicitly accepts the hint.
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
