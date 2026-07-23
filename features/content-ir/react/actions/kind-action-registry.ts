/**
 * The kind-component ACTION REGISTRY — the one extensible seam through which a
 * rendered kind component triggers a platform capability.
 *
 * The vision (Arman, 2026-07-23): a component should be able to trigger ANY
 * safe capability — the registry is meant to grow to hundreds or thousands of
 * actions. The design keeps that open WITHOUT widening the sandbox contract
 * more than once: components call a single `runAction(key, input)` function
 * (injected as a prop, see `useKindActionRunner`), and every new capability is
 * just another `registerKindAction(key, handler)` here. Adding capability #2..N
 * never touches the sandbox, the compiler, or the component prop shape again.
 *
 * The two non-negotiables that make "trigger anything" safe:
 *
 *  1. A handler NEVER throws into component code. The runner wraps every call
 *     and always returns a `KindActionResult` envelope ({ ok } | { ok:false }).
 *     An imperfect component — a missing field, a bad key — degrades to a
 *     toast + captured error, never a crashed render. "Don't cause errors if
 *     something isn't perfect" is enforced structurally, not by convention.
 *  2. A handler receives ONLY the capability-scoped `KindActionContext` the
 *     runner binds (the agent launcher, the acting user). It never gets the
 *     supabase client, redux internals, or raw fetch — the sandbox's data-reach
 *     boundary is preserved. Side effects run in the host, gated by the host.
 *
 * This file is pure + host-agnostic (no React, no hooks): the runtime deps a
 * handler needs arrive through `KindActionContext` at call time, so the
 * registry can be unit-tested and a handler can't smuggle in capability.
 */

import type { LaunchAgentFn } from "./kind-action-context";

/** The envelope every action returns. A skip/failure is never a silent pass. */
export type KindActionResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

/**
 * Capability-scoped runtime the host binds for handlers. Deliberately narrow:
 * a handler gets exactly what its capability needs and nothing that widens
 * data reach. New capabilities that need a new dependency extend THIS type
 * (reviewed centrally), never the component-facing surface.
 */
export interface KindActionContext {
  /** Launch an agent execution. Bound to the viewing user by the host. */
  launchAgent: LaunchAgentFn;
  /** The acting (viewing) user's id, or null when unauthenticated. */
  userId: string | null;
}

/** A registered capability. Pure w.r.t. globals — all deps arrive via ctx. */
export type KindActionHandler = (
  input: unknown,
  ctx: KindActionContext,
) => Promise<KindActionResult>;

export interface KindActionDefinition {
  /** Stable key a component names to invoke it, e.g. "trigger_agent". */
  key: string;
  /** One line for authoring surfaces + the doctor; never user-facing chrome. */
  description: string;
  handler: KindActionHandler;
}

const registry = new Map<string, KindActionDefinition>();

/**
 * Register a capability. Idempotent-by-replace: re-registering a key overwrites
 * (module reload / test reset friendly). Throws on an empty key — a registry of
 * thousands must never contain an unaddressable entry.
 */
export function registerKindAction(def: KindActionDefinition): void {
  if (!def.key || !def.key.trim()) {
    throw new Error("registerKindAction: key must be a non-empty string");
  }
  registry.set(def.key, def);
}

export function getKindAction(key: string): KindActionDefinition | undefined {
  return registry.get(key);
}

/** Enumerate registered capabilities — for authoring UIs, docs, the doctor. */
export function listKindActions(): KindActionDefinition[] {
  return [...registry.values()];
}

/** Test/HMR reset. */
export function clearKindActionRegistry(): void {
  registry.clear();
}
