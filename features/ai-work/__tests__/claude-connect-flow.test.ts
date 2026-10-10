/**
 * FORCING GUARD — Connect must always end. Arman, 2026-10-10: the sign-in POST
 * died with "Failed to fetch" and the readiness GET timed out, and the panel
 * spun on. Every wait here has an end: a call that never answers, a network
 * failure, a Cancel mid-call, a sandbox that never comes up. Only the injected
 * effects are fake; the state machine is real.
 */

import {
  OFFLINE_MESSAGE,
  runClaudeConnect,
  SANDBOX_TIMEOUT_MESSAGE,
  type ConnectDeps,
  type ConnectReadiness,
} from "@/features/ai-work/lib/claudeConnectFlow";
import type { OwnPlanStatus } from "@/features/ai-work/lib/ownPlan";

/** The server's start-then-poll answer while the sandbox boots. */
const starting = {
  provider: "claude_code",
  state: "starting",
  signed_in: false,
  detail: "Starting your coding sandbox. This usually takes about a minute.",
} as unknown as OwnPlanStatus;
const link: OwnPlanStatus = {
  provider: "claude_code",
  state: "awaiting_code",
  signed_in: false,
  sign_in_url: "https://claude.ai/oauth/x",
};
const NEVER = "never" as const;
const offline = () => new TypeError("Failed to fetch");

type Step<T> = T | Error | typeof NEVER;

function harness(opts: {
  starts: Array<Step<OwnPlanStatus>>;
  readiness?: Array<Step<ConnectReadiness>>;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  let clock = 0;
  const starts = [...opts.starts];
  const reads = [...(opts.readiness ?? [])];
  const play = async <T,>(next: Step<T> | undefined, fallback: T): Promise<T> => {
    const step = next === undefined ? fallback : next;
    if (step === NEVER) return new Promise<T>(() => {});
    if (step instanceof Error) throw step;
    return step;
  };
  const deps: ConnectDeps = {
    start: jest.fn(() => {
      if (starts.length === 0) throw new Error("unexpected start");
      return play(starts.shift(), link);
    }),
    readiness: jest.fn(() => play(reads.shift(), { state: "provisionable" as const })),
    isFatal: (c) => c instanceof Error && c.message === "capacity",
    isNetwork: (c) => c instanceof TypeError,
    describe: (c) => (c instanceof Error ? c.message : "error"),
    sleep: jest.fn(async (ms: number) => {
      clock += ms;
    }),
    now: () => clock,
    signal: controller.signal,
    timeoutMs: opts.timeoutMs,
    callTimeoutMs: 30,
  };
  return { deps, controller };
}

describe("runClaudeConnect", () => {
  it("cold box: the server says starting, the flow polls until ready, then gets the link", async () => {
    const h = harness({
      starts: [starting, link],
      readiness: [{ state: "provisionable" }, { state: "ready" }],
    });
    expect(await runClaudeConnect(h.deps)).toEqual({ kind: "awaiting", status: link });
    expect(h.deps.readiness).toHaveBeenCalledTimes(2);
    expect(h.deps.start).toHaveBeenCalledTimes(2);
  });

  it("warm box: one call, no polling", async () => {
    const h = harness({ starts: [link] });
    expect(await runClaudeConnect(h.deps)).toEqual({ kind: "awaiting", status: link });
    expect(h.deps.readiness).not.toHaveBeenCalled();
  });

  it("a start that never answers is bounded — never an endless spinner", async () => {
    const h = harness({ starts: [NEVER, NEVER, NEVER], readiness: [NEVER, NEVER, NEVER] });
    const out = await runClaudeConnect(h.deps);
    expect(out).toEqual({ kind: "offline", message: OFFLINE_MESSAGE });
  });

  it("'Failed to fetch' is shown as unreachable, not waited on until the deadline", async () => {
    const h = harness({
      starts: [offline()],
      readiness: [offline(), offline()],
    });
    expect(await runClaudeConnect(h.deps)).toEqual({ kind: "offline", message: OFFLINE_MESSAGE });
  });

  it("one network blip is ridden out", async () => {
    const h = harness({
      starts: [offline(), link],
      readiness: [{ state: "ready" }],
    });
    expect(await runClaudeConnect(h.deps)).toEqual({ kind: "awaiting", status: link });
  });

  it("Cancel ends the flow at once, even while a call is in flight", async () => {
    const h = harness({ starts: [NEVER] });
    const pending = runClaudeConnect(h.deps);
    h.controller.abort();
    expect(await pending).toEqual({ kind: "cancelled" });
  });

  it("cancel during the wait stops polling", async () => {
    const h = harness({ starts: [starting] });
    (h.deps.sleep as jest.Mock).mockImplementation(async () => h.controller.abort());
    expect(await runClaudeConnect(h.deps)).toEqual({ kind: "cancelled" });
    expect(h.deps.readiness).not.toHaveBeenCalled();
  });

  it("a sandbox that never comes up ends in an honest timeout", async () => {
    const h = harness({ starts: [starting], timeoutMs: 20_000 });
    expect(await runClaudeConnect(h.deps)).toEqual({
      kind: "timeout",
      message: SANDBOX_TIMEOUT_MESSAGE,
    });
  });

  it("a server refusal on start fails at once with its own sentence", async () => {
    const h = harness({ starts: [new Error("Your sandbox would not start.")] });
    expect(await runClaudeConnect(h.deps)).toEqual({
      kind: "failed",
      message: "Your sandbox would not start.",
    });
  });

  it("ready twice without a link is a failure with the reason", async () => {
    const h = harness({
      starts: [starting, starting, starting],
      readiness: [{ state: "ready" }, { state: "ready" }],
    });
    expect(await runClaudeConnect(h.deps)).toEqual({ kind: "failed", message: starting.detail });
  });

  it("readiness 'unavailable' fails with its own reason", async () => {
    const h = harness({
      starts: [starting],
      readiness: [{ state: "unavailable", reason: "No sandbox host is configured." }],
    });
    expect(await runClaudeConnect(h.deps)).toEqual({
      kind: "failed",
      message: "No sandbox host is configured.",
    });
  });

  it("fatal errors (capacity) propagate untouched", async () => {
    const h = harness({ starts: [new Error("capacity")] });
    await expect(runClaudeConnect(h.deps)).rejects.toThrow("capacity");
  });

  it("signed in on the first call settles immediately", async () => {
    const done: OwnPlanStatus = { ...link, state: "signed_in", signed_in: true, sign_in_url: null };
    const h = harness({ starts: [done] });
    expect((await runClaudeConnect(h.deps)).kind).toBe("signed_in");
  });
});
