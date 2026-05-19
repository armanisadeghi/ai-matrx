/**
 * Module-level registry for the promise resolvers that wait for the user to
 * answer an inline ask card.
 *
 * Why outside Redux: resolver functions are non-serializable, and Redux state
 * must stay serializable. The handler creates a promise + resolver pair, stores
 * the resolver here keyed by callId, then awaits the promise. The UI dispatches
 * `resolvePendingAsk` (state update for fade-out) AND calls `resolveAskByCallId`
 * (delivers the actual response envelope). The handler's await unblocks, the
 * handler returns the answer, and the dispatcher POSTs the tool_result.
 *
 * Cancellation / timeout / expiry all go through the same registry — every
 * pending ask resolves exactly once.
 */

import type { AskUserResponse } from "../tools/schemas";
import { EMPTY_ASK_RESPONSE } from "../tools/schemas";

type Resolver = (response: AskUserResponse) => void;

const resolvers = new Map<string, Resolver>();

export function registerAskResolver(callId: string, resolver: Resolver): void {
  resolvers.set(callId, resolver);
}

export function resolveAskByCallId(
  callId: string,
  response: AskUserResponse,
): boolean {
  const r = resolvers.get(callId);
  if (!r) return false;
  resolvers.delete(callId);
  try {
    r(response);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ask-resolver] resolver threw", err);
  }
  return true;
}

export function cancelAskByCallId(callId: string): boolean {
  return resolveAskByCallId(callId, {
    ...EMPTY_ASK_RESPONSE,
    cancelled: true,
  });
}

export function expireAskByCallId(callId: string): boolean {
  return resolveAskByCallId(callId, {
    ...EMPTY_ASK_RESPONSE,
    timed_out: true,
  });
}

export function hasPendingAsk(callId: string): boolean {
  return resolvers.has(callId);
}

/**
 * Test helper — drain everything and resolve as cancelled. Used by test
 * teardown to avoid leaks; never called in production code.
 */
export function __drainForTests(): void {
  for (const callId of Array.from(resolvers.keys())) {
    cancelAskByCallId(callId);
  }
}
