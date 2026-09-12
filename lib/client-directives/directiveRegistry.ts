/**
 * The opt-in handler registry for platform directives.
 *
 * Consumers OPT IN, one line each, and a consumer that never registers is
 * never touched — that is the whole point of "build it for the platform then
 * opt into it where you need". Registration is by ACTION NAME, so a heavy
 * feature cluster can register itself without the ubiquitous subscriber ever
 * importing it (the same zero-import-edge shape as
 * `lib/invalidation/invalidation-registry.ts`, and for the same build reason).
 *
 * NOTHING FAILS SILENTLY. Three ways a directive can go nowhere, and all three
 * say so with the remedy:
 *  - it arrives malformed          → the subscriber names which gate it failed;
 *  - no handler is registered      → `dispatchDirective` warns with the action
 *                                     name and how to register one;
 *  - a handler throws              → the throw is caught, named, and the other
 *                                     handlers still run.
 */

"use client";

import type { Directive, DirectiveAction, DirectivePayload } from "./directiveEnvelope";

export type DirectiveHandler<A extends DirectiveAction> = (
  payload: DirectivePayload<A>,
  directive: Directive<A>,
) => void | Promise<void>;

const handlers = new Map<DirectiveAction, Set<DirectiveHandler<never>>>();

/**
 * Opt this consumer in to one directive action. Returns the unregister
 * function — call it in an effect cleanup.
 */
export function registerDirectiveHandler<A extends DirectiveAction>(
  action: A,
  handler: DirectiveHandler<A>,
): () => void {
  let set = handlers.get(action);
  if (!set) {
    set = new Set();
    handlers.set(action, set);
  }
  const erased = handler as unknown as DirectiveHandler<never>;
  set.add(erased);
  return () => {
    const live = handlers.get(action);
    if (!live) return;
    live.delete(erased);
    if (live.size === 0) handlers.delete(action);
  };
}

/** How many handlers are opted in to `action`. Test seam and diagnostics. */
export function directiveHandlerCount(action: DirectiveAction): number {
  return handlers.get(action)?.size ?? 0;
}

/**
 * Fan a parsed directive out to every registered handler.
 *
 * Returns the number of handlers that ran, so the caller can tell "delivered"
 * from "nobody was listening" — a distinction a boolean would lose.
 */
export function dispatchDirective(directive: Directive): number {
  const set = handlers.get(directive.action);
  if (!set || set.size === 0) {
    console.warn(
      `[directives] Received "${directive.action}" but no handler is registered ` +
        `in this client, so nothing reacted. If this surface should react, call ` +
        `registerDirectiveHandler("${directive.action}", …) where it caches the ` +
        `thing that changed. If it should not, the publisher is targeting the ` +
        `wrong client.`,
      directive.payload,
    );
    return 0;
  }
  let ran = 0;
  for (const handler of set) {
    try {
      const result = (handler as DirectiveHandler<DirectiveAction>)(
        directive.payload,
        directive,
      );
      ran += 1;
      if (result instanceof Promise) {
        result.catch((err) => {
          console.error(
            `[directives] An async handler for "${directive.action}" rejected; ` +
              `that consumer did NOT react to this directive. Its cache is stale ` +
              `until its own TTL expires.`,
            err,
          );
        });
      }
    } catch (err) {
      console.error(
        `[directives] A handler for "${directive.action}" threw; that consumer ` +
          `did NOT react to this directive. Its cache is stale until its own TTL ` +
          `expires. Other handlers still ran.`,
        err,
      );
    }
  }
  return ran;
}

/** Test seam — drop every registration. */
export function resetDirectiveHandlersForTests(): void {
  handlers.clear();
}
