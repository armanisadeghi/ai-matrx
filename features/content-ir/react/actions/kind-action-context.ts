/**
 * The kind-action contract: what a handler receives and returns. Handlers are
 * contributed to the app's ONE action registry by `kind-action-provider.ts`
 * and run by `useKindActionRunner`; this file stays free of any React / hook
 * import (unit-testable, capability-locked).
 */

import type { ManagedAgentOptions } from "@ai-matrx/chat/agents/types/instance.types";
import type { LaunchResult } from "@ai-matrx/chat/agents/redux/execution-system/thunks/launch-agent-execution.thunk";

/**
 * The exact `launchAgent` surface a handler is allowed to use — the same
 * signature `useAgentLauncher` exposes, so the host binds its real launcher
 * with no adapter. A handler cannot reach anything else on the launcher.
 */
export type LaunchAgentFn = (
  agentId: string,
  options?: ManagedAgentOptions,
) => Promise<LaunchResult>;

/** The envelope every kind action returns. A skip/failure is never a silent pass. */
export type KindActionResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

/**
 * Capability-scoped runtime the runner binds for handlers. Deliberately narrow:
 * a handler gets exactly what its capability needs and nothing that widens
 * data reach (never supabase, redux internals, or raw fetch). New capabilities
 * that need a new dependency extend THIS type (reviewed centrally), never the
 * component-facing surface.
 */
export interface KindActionContext {
  /** Launch an agent execution. Bound to the viewing user by the host. */
  launchAgent: LaunchAgentFn;
  /** The acting (viewing) user's id, or null when unauthenticated. */
  userId: string | null;
}

/** A kind capability. Pure w.r.t. globals — all deps arrive via ctx. */
export type KindActionHandler = (
  input: unknown,
  ctx: KindActionContext,
) => Promise<KindActionResult>;

export interface KindActionDefinition {
  /** Stable key a component names to invoke it, e.g. "trigger_agent". */
  key: string;
  /** Short name (alchemy's run path names it when the handler throws). */
  label: string;
  /** One line for authoring surfaces + the doctor; never user-facing chrome. */
  description: string;
  handler: KindActionHandler;
}
