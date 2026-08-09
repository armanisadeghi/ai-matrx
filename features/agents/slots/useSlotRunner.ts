"use client";

/**
 * useSlotRunner — run the agent bound to a SLOT, not a hardcoded id.
 *
 * This is the client consumer primitive of the Agent Slots system (SoR
 * /Users/armanisadeghi/code/common-docs/systems/agent-slots/FEATURE.md): it
 * composes `useAgentSlot` (resolution: system default → the caller's own user
 * binding) with `useRunAgent` (the ONE client run path) so a call site never
 * names an agent id at all.
 *
 * Migrating a hardcoded call site is a two-line change:
 *
 *   const { run, running } = useRunAgent();          const { runSlot, running, unavailable } = useSlotRunner("research_client.output_blog");
 *   await run({ agentId: BLOG_AGENT_ID, ... });  →   await runSlot({ ... });
 *
 * Then drop `<SlotAgentPicker slotKey="…" />` beside the affordance and the
 * user can swap in their own agent — no code change, no deploy.
 *
 * LOUD, never silent: if the slot can't resolve (unknown / disabled /
 * version-pinned / broken override) `unavailable` is true and `runSlot`
 * throws with the resolution message. There is no fallback to a hardcoded id —
 * that would hide exactly the breakage this system exists to surface.
 *
 * Config precedence: the caller's `configOverrides` are the feature's
 * defaults; the slot's overrides (which come from the USER's binding) win per
 * key, because a user who set "run this step on a cheaper model" means it.
 */

import { useCallback } from "react";
import type { LLMParamsBody } from "@/lib/api/call-api";
import { useRunAgent, type RunAgentArgs } from "@/features/agents/run/useRunAgent";
import { useAgentSlot } from "./useAgentSlot";
import { resolveAgentSlot, type ResolvedClientSlot } from "./service";

/** Everything `run` takes except the agent identity, which the slot supplies. */
export type SlotRunArgs = Omit<RunAgentArgs, "agentId">;

export interface UseSlotRunner {
  /** Run the slot's resolved agent. Throws if the slot cannot resolve. */
  runSlot: (args: SlotRunArgs) => Promise<string>;
  /** A run is in flight. */
  running: boolean;
  /** The last RUN error (not a resolution failure). */
  error: string | null;
  /** The slot's resolution error — set means the affordance must be disabled. */
  slotError: string | null;
  /** Resolution is still in flight (first paint). */
  slotLoading: boolean;
  /** The resolved slot: which agent, whose choice (`provenance`). */
  resolved: ResolvedClientSlot | null;
  /** True when the affordance cannot run: resolution failed. */
  unavailable: boolean;
  reset: () => void;
}

export function useSlotRunner(slotKey: string): UseSlotRunner {
  const { slot, loading: slotLoading, error: slotError } = useAgentSlot(slotKey);
  const { run, running, error, reset } = useRunAgent();

  const runSlot = useCallback(
    async (args: SlotRunArgs): Promise<string> => {
      // Resolve at call time rather than trusting the render-time snapshot: a
      // binding saved seconds ago must take effect on the very next run.
      const current = await resolveAgentSlot(slotKey);
      const configOverrides: LLMParamsBody | undefined =
        current.configOverrides || args.configOverrides
          ? { ...args.configOverrides, ...current.configOverrides }
          : undefined;
      return run({ ...args, agentId: current.agentId, configOverrides });
    },
    [run, slotKey],
  );

  return {
    runSlot,
    running,
    error,
    slotError,
    slotLoading,
    resolved: slot,
    unavailable: slotError !== null,
    reset,
  };
}
