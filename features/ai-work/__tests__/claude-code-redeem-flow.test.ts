/**
 * FORCING GUARD — finishing the Claude sign-in always ends, and a wrong code
 * shows Claude's own refusal. 2026-10-10: Claude Code does not exit on a wrong
 * code, the server waited for it for 90 s, and the public load balancer cut
 * the request at 60 s, so the panel said "Failed to fetch". The server now
 * answers within seconds or says `redeeming`, which this flow polls to its
 * end. Only the injected effects are fake; the state machine is real.
 */

import {
  CODE_NOT_ACCEPTED_MESSAGE,
  OFFLINE_MESSAGE,
  REDEEM_TIMEOUT_MESSAGE,
  runClaudeCodeRedeem,
  type RedeemDeps,
} from "@/features/ai-work/lib/claudeConnectFlow";
import type { OwnPlanStatus } from "@/features/ai-work/lib/ownPlan";

const redeeming = {
  provider: "claude_code",
  state: "redeeming",
  signed_in: false,
  detail: "Claude is checking the code.",
} as unknown as OwnPlanStatus;
const refused: OwnPlanStatus = {
  provider: "claude_code",
  state: "awaiting_code",
  signed_in: false,
  sign_in_url: "https://claude.ai/oauth/x",
  detail:
    "Claude did not accept that code: Invalid code. Please make sure the full code was copied. Paste the newest code again.",
};
const waitingNoDetail: OwnPlanStatus = {
  provider: "claude_code",
  state: "awaiting_code",
  signed_in: false,
  sign_in_url: "https://claude.ai/oauth/x",
};
const signedIn: OwnPlanStatus = { provider: "claude_code", state: "signed_in", signed_in: true };
const NEVER = "never" as const;
type Step = OwnPlanStatus | Error | typeof NEVER;

function harness(opts: { submit: Step; statuses?: Step[]; timeoutMs?: number }) {
  const controller = new AbortController();
  let clock = 0;
  const statuses = [...(opts.statuses ?? [])];
  const play = (step: Step | undefined): Promise<OwnPlanStatus> => {
    if (step === undefined) return Promise.resolve(redeeming);
    if (step === NEVER) return new Promise(() => {});
    if (step instanceof Error) return Promise.reject(step);
    return Promise.resolve(step);
  };
  const deps: RedeemDeps = {
    submit: jest.fn(() => play(opts.submit)),
    status: jest.fn(() => play(statuses.shift())),
    isNetwork: (c) => c instanceof TypeError,
    describe: (c) => (c instanceof Error ? c.message : "error"),
    sleep: jest.fn(async (ms: number) => {
      clock += ms;
    }),
    now: () => clock,
    signal: controller.signal,
    timeoutMs: opts.timeoutMs,
    callTimeoutMs: 50,
  };
  return { deps, controller };
}

it("a wrong code ends at once with Claude's own refusal", async () => {
  const { deps } = harness({ submit: refused });
  const outcome = await runClaudeCodeRedeem(deps);
  expect(outcome).toEqual({ kind: "settled", status: refused });
  expect(deps.status).not.toHaveBeenCalled();
});

it("a code Claude is still checking is polled until it settles; the code is sent once", async () => {
  const { deps } = harness({ submit: redeeming, statuses: [redeeming, redeeming, signedIn] });
  const outcome = await runClaudeCodeRedeem(deps);
  expect(outcome).toEqual({ kind: "settled", status: signedIn });
  expect(deps.submit).toHaveBeenCalledTimes(1);
  expect(deps.status).toHaveBeenCalledTimes(3);
});

it("a submit that never answers still ends: the status door is asked, and says so", async () => {
  const { deps } = harness({ submit: NEVER, statuses: [waitingNoDetail] });
  const outcome = await runClaudeCodeRedeem(deps);
  expect(outcome).toEqual({
    kind: "settled",
    status: { ...waitingNoDetail, detail: CODE_NOT_ACCEPTED_MESSAGE },
  });
  expect(deps.submit).toHaveBeenCalledTimes(1);
});

it("'Failed to fetch' on every call ends offline, never spins", async () => {
  const offline = () => new TypeError("Failed to fetch");
  const { deps } = harness({ submit: offline(), statuses: [offline(), offline(), offline()] });
  expect(await runClaudeCodeRedeem(deps)).toEqual({ kind: "offline", message: OFFLINE_MESSAGE });
});

it("a code that stays 'redeeming' forever ends with an honest timeout", async () => {
  const { deps } = harness({ submit: redeeming, timeoutMs: 10_000 });
  expect(await runClaudeCodeRedeem(deps)).toEqual({
    kind: "timeout",
    message: REDEEM_TIMEOUT_MESSAGE,
  });
});

it("a server refusal fails at once with its message", async () => {
  const { deps } = harness({ submit: new Error("There is no Claude sign-in waiting for a code.") });
  expect(await runClaudeCodeRedeem(deps)).toEqual({
    kind: "failed",
    message: "There is no Claude sign-in waiting for a code.",
  });
});

it("Cancel ends it at once, even mid-call", async () => {
  const { deps, controller } = harness({ submit: NEVER });
  deps.callTimeoutMs = 60_000;
  const pending = runClaudeCodeRedeem(deps);
  controller.abort();
  expect(await pending).toEqual({ kind: "cancelled" });
});
