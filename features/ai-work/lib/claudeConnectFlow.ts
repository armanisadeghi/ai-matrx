/**
 * claudeConnectFlow — the Connect state machine for a Claude account.
 *
 * Starting a Claude sign-in boots the person's hosted sandbox when it is cold
 * (a minute or two). The old panel made one call and, when that call came back
 * without a sign-in link (or failed while the box was still starting), fell
 * straight back to the Connect button with nothing visible. This flow instead
 * stays in a visible "starting" phase, polls the hosted-runtime readiness with
 * backoff, retries the sign-in once the box is ready, and ends in exactly one
 * of: signed in, awaiting the code (link in hand), failed (the server's own
 * reason), timeout (honest), or cancelled.
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
  | { kind: "timeout"; message: string }
  | { kind: "cancelled" };

export type ConnectDeps = {
  /** Start the sign-in. May take a while when the sandbox must boot. */
  start: () => Promise<OwnPlanStatus>;
  /** The hosted runtime's readiness verdict (never boots anything). */
  readiness: () => Promise<ConnectReadiness>;
  /** Errors that must leave the flow untouched (e.g. the cap-full refusal). */
  isFatal: (cause: unknown) => boolean;
  describe: (cause: unknown) => string;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  now: () => number;
  signal: AbortSignal;
  onStarting: () => void;
  timeoutMs?: number;
};

export const CONNECT_TIMEOUT_MS = 180_000;
const FIRST_DELAY_MS = 1_500;
const MAX_DELAY_MS = 8_000;

export const SANDBOX_TIMEOUT_MESSAGE =
  "Your sandbox did not finish starting. Try again in a moment.";

export async function runClaudeConnect(deps: ConnectDeps): Promise<ConnectOutcome> {
  const deadline = deps.now() + (deps.timeoutMs ?? CONNECT_TIMEOUT_MS);
  const cancelled = (): boolean => deps.signal.aborted;
  deps.onStarting();

  let lastReason: string | null = null;
  let readyStarts = 0;

  // Returns an outcome when the attempt settles the flow, else null (keep waiting).
  const attempt = async (): Promise<ConnectOutcome | null> => {
    try {
      const status = await deps.start();
      if (cancelled()) return { kind: "cancelled" };
      if (status.signed_in) return { kind: "signed_in", status };
      if (status.sign_in_url) return { kind: "awaiting", status };
      lastReason = status.detail ?? null;
      return null;
    } catch (cause) {
      if (cancelled()) return { kind: "cancelled" };
      if (deps.isFatal(cause)) throw cause;
      lastReason = deps.describe(cause);
      return null;
    }
  };

  const first = await attempt();
  if (first) return first;

  let delay = FIRST_DELAY_MS;
  while (!cancelled()) {
    if (deps.now() >= deadline) {
      return { kind: "timeout", message: lastReason || SANDBOX_TIMEOUT_MESSAGE };
    }
    await deps.sleep(delay, deps.signal);
    if (cancelled()) break;
    delay = Math.min(Math.round(delay * 1.6), MAX_DELAY_MS);

    let verdict: ConnectReadiness | null = null;
    try {
      verdict = await deps.readiness();
    } catch {
      verdict = null; // a failed read is not a verdict; keep waiting until the deadline
    }
    if (cancelled()) break;
    if (!verdict) continue;
    if (verdict.state === "unavailable") {
      return { kind: "failed", message: verdict.reason || lastReason || SANDBOX_TIMEOUT_MESSAGE };
    }
    if (verdict.state !== "ready") continue;

    // The box is up: the sign-in can now give its link. Twice without one is a
    // real answer, not a cold start.
    readyStarts += 1;
    const next = await attempt();
    if (next) return next;
    if (readyStarts >= 2) {
      return { kind: "failed", message: lastReason || SANDBOX_TIMEOUT_MESSAGE };
    }
  }
  return { kind: "cancelled" };
}
