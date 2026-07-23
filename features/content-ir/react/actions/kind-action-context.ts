/**
 * Types shared between the pure action registry and the React runner that
 * binds host dependencies into it. Split out so `kind-action-registry.ts`
 * stays free of any React / hook import (unit-testable, capability-locked).
 */

import type { ManagedAgentOptions } from "@/features/agents/types/instance.types";
import type { LaunchResult } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";

/**
 * The exact `launchAgent` surface a handler is allowed to use — the same
 * signature `useAgentLauncher` exposes, so the host binds its real launcher
 * with no adapter. A handler cannot reach anything else on the launcher.
 */
export type LaunchAgentFn = (
  agentId: string,
  options?: ManagedAgentOptions,
) => Promise<LaunchResult>;
