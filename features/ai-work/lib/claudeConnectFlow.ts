/**
 * claudeConnectFlow — the Connect state machine for a Claude account.
 *
 * The server is start-then-poll: starting a sign-in answers at once, either
 * with the link (the sandbox is up) or with `state: "starting"` while the
 * sandbox boots in the background (a minute or two). This flow then polls the
 * hosted-runtime readiness with backoff and asks for the link again once it
 * says `ready`.
 *
 * Every wait has an end. Each call is bounded by `callTimeoutMs` and by the
 * overall deadline, and Cancel ends the flow at once, even mid-call. The flow
 * ends in exactly one of: signed in, awaiting the code (link in hand), failed
 * (the server's own reason), offline (the server could not be reached),
 * timeout (honest), or cancelled.
 *
 * Pure of React and of the network: every effect is injected, so the state
 * machine is tested without either.
 */

import type { OwnPlanStatus } from "@/features/ai-work/lib/ownPlan";

export type ConnectReadiness = {
  state: "ready" | "provisionable" | "unavailable";
  reason?: string | null;
};

export type ConnectOutcome =
  | { kind: "signed_in"; status: OwnPlanStatus }
  | { kind: "awaiting"; status: OwnPlanStatus }
  | { kind: "failed"; message: string }
  | { kind: "offline"; message: string }
  | { kind: "timeout"; message: string }
  | { kind: "cancelled" };

export type ConnectDeps = {
  /** Start the sign-in. Answers at once: the link, or `state: "starting"`. */
  start: () => Promise<OwnPlanStatus>;
  /** The hosted runtime's readiness verdict (never boots anything). */
  readiness: () => Promise<ConnectReadiness>;
  /** Errors that must leave the flow untouched (e.g. the cap-full refusal). */
  isFatal: (cause: unknown) => boolean;
  /** The request never reached the server or got no answer (no HTTP status). */
  isNetwork: (cause: unknown) => boolean;
  describe: (cause: unknown) => string;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  now: () => number;
  signal: AbortSignal;
  timeoutMs?: number;
  callTimeoutMs?: number;
};

export const CONNECT_TIMEOUT_MS = 180_000;
/** One request's longest wait. The server answers every connect call at once. */
export const CONNECT_CALL_TIMEOUT_MS = 25_000;
/** Consecutive unreachable answers before the flow says so instead of waiting. */
export const OFFLINE_AFTER = 3;
const FIRST_DELAY_MS = 1_500;
const MAX_DELAY_MS = 6_000;

export const SANDBOX_TIMEOUT_MESSAGE =
  "Your sandbox did not finish starting. Try again in a moment.";
export const OFFLINE_MESSAGE =
  "Could not reach AI Matrx. Check your connection, then try again.";

class CallTimedOut extends Error {}
class Cancelled extends Error {}

/** `call()`, but never longer than `ms`, and ended at once by `signal`. */
function bounded<T>(call: () => Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Cancelled());
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      reject(new CallTimedOut());
    }, Math.max(ms, 0));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Cancelled());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    call().then(
      (value) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (cause: unknown) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(cause);
      },
    );
  });
}

export async function runClaudeConnect(deps: ConnectDeps): Promise<ConnectOutcome> {
  const deadline = deps.now() + (deps.timeoutMs ?? CONNECT_TIMEOUT_MS);
  const callMs = deps.callTimeoutMs ?? CONNECT_CALL_TIMEOUT_MS;
  const cancelled = (): boolean => deps.signal.aborted;
  const budget = () => Math.min(callMs, deadline - deps.now());

  let lastReason: string | null = null;
  let unreachable = 0;
  let readyStarts = 0;

  /** A failed call: rethrow what ends the flow, else remember why and go on. */
  const absorb = (cause: unknown): ConnectOutcome | null => {
    if (cause instanceof Cancelled || cancelled()) return { kind: "cancelled" };
    if (cause instanceof CallTimedOut || deps.isNetwork(cause)) {
      unreachable += 1;
      return unreachable >= OFFLINE_AFTER ? { kind: "offline", message: OFFLINE_MESSAGE } : null;
    }
    if (deps.isFatal(cause)) throw cause;
    return { kind: "failed", message: deps.describe(cause) };
  };

  // Returns an outcome when the attempt settles the flow, else null (keep waiting).
  const attempt = async (): Promise<ConnectOutcome | null> => {
    try {
      const status = await bounded(deps.start, budget(), deps.signal);
      unreachable = 0;
      if (status.signed_in) return { kind: "signed_in", status };
      if (status.sign_in_url) return { kind: "awaiting", status };
      lastReason = status.detail ?? null;
      return null;
    } catch (cause) {
      return absorb(cause);
    }
  };

  const first = await attempt();
  if (first) return first;

  let delay = FIRST_DELAY_MS;
  while (!cancelled()) {
    if (deps.now() >= deadline) {
      return { kind: "timeout", message: SANDBOX_TIMEOUT_MESSAGE };
    }
    await deps.sleep(Math.min(delay, Math.max(deadline - deps.now(), 0)), deps.signal);
    if (cancelled()) break;
    if (deps.now() >= deadline) continue;
    delay = Math.min(Math.round(delay * 1.5), MAX_DELAY_MS);

    let verdict: ConnectReadiness;
    try {
      verdict = await bounded(deps.readiness, budget(), deps.signal);
      unreachable = 0;
    } catch (cause) {
      const settled = absorb(cause);
      if (settled) return settled;
      continue;
    }
    if (verdict.state === "unavailable") {
      return { kind: "failed", message: verdict.reason || lastReason || SANDBOX_TIMEOUT_MESSAGE };
    }
    if (verdict.state !== "ready") continue;

    // The box answers: the sign-in can now give its link. Twice without one is
    // a real answer, not a cold start.
    readyStarts += 1;
    const next = await attempt();
    if (next) return next;
    if (readyStarts >= 2) {
      return { kind: "failed", message: lastReason || SANDBOX_TIMEOUT_MESSAGE };
    }
  }
  return { kind: "cancelled" };
}

// ---------------------------------------------------------------------------
// Finishing the sign-in: the pasted code
// ---------------------------------------------------------------------------
//
// The server answers a pasted code within seconds: signed in, Claude's own
// refusal (`awaiting_code` + detail; the same sign-in takes the next code), or
// `redeeming` while Claude is still checking it. `redeeming` is polled on the
// status door until it settles. The code is sent once and never resent.

export type RedeemOutcome =
  | { kind: "settled"; status: OwnPlanStatus }
  | { kind: "failed"; message: string }
  | { kind: "offline"; message: string }
  | { kind: "timeout"; message: string }
  | { kind: "cancelled" };

export type RedeemDeps = {
  /** Hand the code to the waiting sign-in (sent once, never retried). */
  submit: () => Promise<OwnPlanStatus>;
  /** The sign-in's current state; settles a code Claude is still checking. */
  status: () => Promise<OwnPlanStatus>;
  isNetwork: (cause: unknown) => boolean;
  describe: (cause: unknown) => string;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  now: () => number;
  signal: AbortSignal;
  timeoutMs?: number;
  callTimeoutMs?: number;
};

export const REDEEM_TIMEOUT_MS = 90_000;
export const REDEEM_TIMEOUT_MESSAGE =
  "Claude did not answer about that code in time. Start the sign-in again.";
export const CODE_NOT_ACCEPTED_MESSAGE =
  "Claude has not accepted that code. Check it and paste it again.";
/** The server's "Claude is still checking the code" state. Compared as a
 * string: the generated `OwnPlanState` union gains it on the next publish. */
export const REDEEMING_STATE = "redeeming";

export function isRedeeming(status: OwnPlanStatus): boolean {
  return String(status.state) === REDEEMING_STATE;
}

export async function runClaudeCodeRedeem(deps: RedeemDeps): Promise<RedeemOutcome> {
  const deadline = deps.now() + (deps.timeoutMs ?? REDEEM_TIMEOUT_MS);
  const callMs = deps.callTimeoutMs ?? CONNECT_CALL_TIMEOUT_MS;
  const budget = () => Math.min(callMs, deadline - deps.now());
  let unreachable = 0;
  let submitUnanswered = false;

  const settle = (status: OwnPlanStatus): RedeemOutcome => {
    // The code may never have reached Claude: say so rather than showing the
    // same waiting screen as if nothing happened.
    if (submitUnanswered && !status.signed_in && !status.detail) {
      return { kind: "settled", status: { ...status, detail: CODE_NOT_ACCEPTED_MESSAGE } };
    }
    return { kind: "settled", status };
  };

  try {
    const status = await bounded(deps.submit, budget(), deps.signal);
    if (!isRedeeming(status)) return { kind: "settled", status };
  } catch (cause) {
    if (cause instanceof Cancelled || deps.signal.aborted) return { kind: "cancelled" };
    if (!(cause instanceof CallTimedOut || deps.isNetwork(cause))) {
      return { kind: "failed", message: deps.describe(cause) };
    }
    // No answer: the code may still be with Claude, so ask the status door.
    submitUnanswered = true;
    unreachable = 1;
  }

  let delay = 1_000;
  while (!deps.signal.aborted) {
    if (deps.now() >= deadline) return { kind: "timeout", message: REDEEM_TIMEOUT_MESSAGE };
    await deps.sleep(Math.min(delay, Math.max(deadline - deps.now(), 0)), deps.signal);
    if (deps.signal.aborted) break;
    if (deps.now() >= deadline) continue;
    delay = Math.min(Math.round(delay * 1.5), 3_000);
    try {
      const status = await bounded(deps.status, budget(), deps.signal);
      unreachable = 0;
      if (!isRedeeming(status)) return settle(status);
    } catch (cause) {
      if (cause instanceof Cancelled || deps.signal.aborted) return { kind: "cancelled" };
      if (cause instanceof CallTimedOut || deps.isNetwork(cause)) {
        unreachable += 1;
        if (unreachable >= OFFLINE_AFTER) return { kind: "offline", message: OFFLINE_MESSAGE };
        continue;
      }
      return { kind: "failed", message: deps.describe(cause) };
    }
  }
  return { kind: "cancelled" };
}
