/**
 * connectClaudeAccount — the ONE browser wiring of the Claude Connect flow
 * (`claudeConnectFlow.ts`): the real sign-in and readiness doors, real time,
 * and the error classification. Every surface that connects a Claude account
 * calls this, so each one gets the same bounded, cancellable, honest wait.
 */

import { apiGet } from "@/lib/api/typed-client";
import { getUserMessage } from "@/lib/api/errors";
import {
  runClaudeCodeRedeem,
  runClaudeConnect,
  type ConnectOutcome,
  type RedeemOutcome,
} from "@/features/ai-work/lib/claudeConnectFlow";
import {
  capacityRefusalOf,
  HOSTED_RUNTIME_PATH,
  readOwnPlanStatus,
  startOwnPlanSignIn,
  submitOwnPlanCode,
  type OwnPlanAccount,
} from "@/features/ai-work/lib/ownPlan";

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true },
    );
  });
}

/** No HTTP status: the request never reached the server or got no answer. */
export function isUnreachable(cause: unknown): boolean {
  if (cause instanceof TypeError) return true;
  if (typeof cause !== "object" || cause === null || !("status" in cause)) return false;
  const status = (cause as { status: unknown }).status;
  return status === null || status === 0;
}

/**
 * Start a Claude sign-in for `account` and wait (bounded) for its link.
 * Throws only the capacity refusal, which the caller renders as the list of
 * sandboxes it can stop.
 */
export function connectClaudeAccount(
  account: OwnPlanAccount,
  signal: AbortSignal,
): Promise<ConnectOutcome> {
  return runClaudeConnect({
    start: () => startOwnPlanSignIn("claude_code", account),
    readiness: async () => (await apiGet(HOSTED_RUNTIME_PATH)).data,
    isFatal: (cause) => capacityRefusalOf(cause) !== null,
    isNetwork: isUnreachable,
    describe: (cause) => getUserMessage(cause),
    sleep: abortableSleep,
    now: () => Date.now(),
    signal,
  });
}

/**
 * Hand the pasted code to the waiting Claude sign-in and wait (bounded) for
 * Claude's answer: signed in, its own refusal, or an honest timeout/offline.
 * The code is sent once; only the status door is polled.
 */
export function redeemClaudeCode(
  code: string,
  account: OwnPlanAccount,
  signal: AbortSignal,
): Promise<RedeemOutcome> {
  return runClaudeCodeRedeem({
    submit: () => submitOwnPlanCode("claude_code", code, account),
    status: () => readOwnPlanStatus("claude_code", account),
    isNetwork: isUnreachable,
    describe: (cause) => getUserMessage(cause),
    sleep: abortableSleep,
    now: () => Date.now(),
    signal,
  });
}
