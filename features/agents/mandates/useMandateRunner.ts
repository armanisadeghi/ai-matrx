"use client";

/**
 * useMandateRunner — run the agent bound to a MANDATE, not a hardcoded id.
 *
 * This is the client consumer primitive of the Mandates system (SoR
 * /Users/armanisadeghi/code/common-docs/systems/mandates/FEATURE.md): it
 * composes `useMandate` (resolution: system default → the caller's own user
 * binding) with `useRunAgent` (the ONE client run path) so a call site never
 * names an agent id at all.
 *
 * Migrating a hardcoded call site is a two-line change:
 *
 *   const { run, running } = useRunAgent();          const { runMandate, running, unavailable } = useMandateRunner("research_client.output_blog");
 *   await run({ agentId: BLOG_AGENT_ID, ... });  →   await runMandate({ ... });
 *
 * Then drop `<MandateAgentPicker mandateKey="…" />` beside the affordance and the
 * user can swap in their own agent — no code change, no deploy.
 *
 * LOUD, never silent: if the mandate can't resolve (unknown / disabled /
 * version-pinned / broken override) `unavailable` is true and `runMandate`
 * throws with the resolution message. There is no fallback to a hardcoded id —
 * that would hide exactly the breakage this system exists to surface.
 *
 * Config precedence: the caller's `configOverrides` are the feature's
 * defaults; the mandate's overrides (which come from the USER's binding) win per
 * key, because a user who set "run this step on a cheaper model" means it.
 */

import { useCallback } from "react";
import type { LLMParamsBody } from "@/lib/api/call-api";
import { useRunAgent, type RunAgentArgs } from "@/features/agents/run/useRunAgent";
import { useMandate } from "./useMandate";
import { resolveMandate, type ResolvedMandate } from "./service";

/** Everything `run` takes except the agent identity, which the mandate supplies. */
export type MandateRunArgs = Omit<RunAgentArgs, "agentId">;

export interface UseMandateRunner {
  /** Run the mandate's resolved agent. Throws if the mandate cannot resolve. */
  runMandate: (args: MandateRunArgs) => Promise<string>;
  /** A run is in flight. */
  running: boolean;
  /** The last RUN error (not a resolution failure). */
  error: string | null;
  /** The mandate's resolution error — set means the affordance must be disabled. */
  mandateError: string | null;
  /** Resolution is still in flight (first paint). */
  mandateLoading: boolean;
  /** The resolved mandate: which agent, whose choice (`provenance`). */
  resolved: ResolvedMandate | null;
  /** True when the affordance cannot run: resolution failed. */
  unavailable: boolean;
  reset: () => void;
}

export function useMandateRunner(mandateKey: string): UseMandateRunner {
  const { mandate, loading: mandateLoading, error: mandateError } = useMandate(mandateKey);
  const { run, running, error, reset } = useRunAgent();

  const runMandate = useCallback(
    async (args: MandateRunArgs): Promise<string> => {
      // Resolve at call time rather than trusting the render-time snapshot: a
      // binding saved seconds ago must take effect on the very next run.
      const current = await resolveMandate(mandateKey);
      const configOverrides: LLMParamsBody | undefined =
        current.configOverrides || args.configOverrides
          ? { ...args.configOverrides, ...current.configOverrides }
          : undefined;
      return run({ ...args, agentId: current.agentId, configOverrides });
    },
    [run, mandateKey],
  );

  return {
    runMandate,
    running,
    error,
    mandateError,
    mandateLoading,
    resolved: mandate,
    unavailable: mandateError !== null,
    reset,
  };
}
