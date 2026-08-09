/**
 * The assist ACTION REGISTRY — the one extensible seam through which an
 * accepted assist chip executes a platform capability.
 *
 * Same design (and the same two non-negotiables) as content-ir's
 * kind-action-registry, which this deliberately mirrors:
 *
 *  1. A handler NEVER throws into UI code — the runner wraps every call and
 *     always returns an envelope. A malformed assist degrades to a toast +
 *     captured error, never a crashed render.
 *  2. A handler receives ONLY the capability-scoped `AssistActionContext`
 *     the runner binds. New capabilities extend THAT type centrally; the
 *     chip-facing surface (`runAssist`) never widens.
 *
 * Pure + host-agnostic (no React, no hooks) so it is unit-testable and a
 * handler can't smuggle in capability.
 */

import type { OpenAgentRunWindowOptions } from "@/features/overlays/openers/agentRunWindow";
import type { Assist } from "../types";

export type AssistActionResult =
  | { ok: true; result?: unknown }
  | { ok: false; error: string };

/** Capability-scoped runtime the host binds for handlers. Deliberately narrow. */
export interface AssistActionContext {
  /** The acting (viewing) user's id, or null when unauthenticated. */
  userId: string | null;
  /** Open the shared floating agent-run window (pre-fill only, user sends). */
  openAgentRun: (opts: OpenAgentRunWindowOptions) => void;
  /** Client-side navigation. */
  navigate: (href: string) => void;
}

export type AssistActionHandler = (
  assist: Assist,
  ctx: AssistActionContext,
) => Promise<AssistActionResult>;

export interface AssistActionDefinition {
  /** Matches `AssistAction["kind"]`, e.g. "launch_agent". */
  kind: string;
  /** One line for authoring surfaces + docs; never user-facing chrome. */
  description: string;
  handler: AssistActionHandler;
}

const registry = new Map<string, AssistActionDefinition>();

/** Idempotent-by-replace; throws on an empty kind. */
export function registerAssistAction(def: AssistActionDefinition): void {
  if (!def.kind || !def.kind.trim()) {
    throw new Error("registerAssistAction: kind must be a non-empty string");
  }
  registry.set(def.kind, def);
}

export function getAssistAction(
  kind: string,
): AssistActionDefinition | undefined {
  return registry.get(kind);
}

/** Enumerate registered capabilities — for authoring UIs, docs, the doctor. */
export function listAssistActions(): AssistActionDefinition[] {
  return [...registry.values()];
}

/** Test/HMR reset. */
export function clearAssistActionRegistry(): void {
  registry.clear();
}
