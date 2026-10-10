/**
 * FORCING GUARD — Connect on a cold sandbox must stay visibly "starting" and
 * continue by itself to the sign-in link; it must never settle back to idle
 * with nothing shown. Only the injected effects are fake; the state machine is real.
 */

import {
  runClaudeConnect,
  SANDBOX_TIMEOUT_MESSAGE,
  type ConnectDeps,
  type ConnectReadiness,
} from "@/features/ai-work/lib/claudeConnectFlow";
import type { OwnPlanStatus } from "@/features/ai-work/lib/ownPlan";

const cold: OwnPlanStatus = {
  provider: "claude_code",
  state: "unavailable",
  signed_in: false,
  detail: "Your coding sandbox is not running. Connecting starts it.",
};
const link: OwnPlanStatus = {
  provider: "claude_code",
  state: "awaiting_code",
  signed_in: false,
  sign_in_url: "https://claude.ai/oauth/x",
};

function harness(opts: {
  starts: Array<OwnPlanStatus | Error>;
  readiness?: Array<ConnectReadiness | Error>;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  let clock = 0;
  const starts = [...opts.starts];
  const reads = [...(opts.readiness ?? [])];
  const onStarting = jest.fn();
  const deps: ConnectDeps = {
    start: jest.fn(async () => {
      const next = starts.shift();
      if (!next) throw new Error("unexpected start");
      if (next instanceof Error) throw next;
      return next;
    }),
    readiness: jest.fn(async () => {
      const next = reads.shift() ?? { state: "provisionable" as const };
      if (next instanceof Error) throw next;
      return next;
    }),
    isFatal: (c) => c instanceof Error && c.message === "capacity",
    describe: (c) => (c instanceof Error ? c.message : "error"),
    sleep: jest.fn(async (ms: number) => {
      clock += ms;
    }),
    now: () => clock,
    signal: controller.signal,
    onStarting,
    timeoutMs: opts.timeoutMs,
  };
  return { deps, controller, onStarting };
}

describe("runClaudeConnect", () => {
  it("cold box: shows starting, waits for ready, then returns the sign-in link", async () => {
    const h = harness({
      starts: [cold, link],
      readiness: [{ state: "provisionable" }, { state: "ready" }],
    });
    const out = await runClaudeConnect(h.deps);
    expect(out).toEqual({ kind: "awaiting", status: link });
    expect(h.onStarting).toHaveBeenCalledTimes(1);
    expect(h.deps.readiness).toHaveBeenCalledTimes(2);
    expect(h.deps.start).toHaveBeenCalledTimes(2);
  });

  it("a start that fails while the box boots keeps waiting instead of dropping to idle", async () => {
    const h = harness({
      starts: [new Error("boom"), link],
      readiness: [{ state: "ready" }],
    });
    expect(await runClaudeConnect(h.deps)).toEqual({ kind: "awaiting", status: link });
  });

  it("warm box: one call, no polling", async () => {
    const h = harness({ starts: [link] });
    expect(await runClaudeConnect(h.deps)).toEqual({ kind: "awaiting", status: link });
    expect(h.deps.readiness).not.toHaveBeenCalled();
  });

  it("never-ready box ends in an honest timeout with the server's reason", async () => {
    const h = harness({ starts: [cold], timeoutMs: 20_000 });
    const out = await runClaudeConnect(h.deps);
    expect(out).toEqual({ kind: "timeout", message: cold.detail });
  });

  it("timeout with no server reason still says something", async () => {
    const h = harness({ starts: [new Error("")], timeoutMs: 5_000 });
    const out = await runClaudeConnect(h.deps);
    expect(out.kind).toBe("timeout");
    expect((out as { message: string }).message).toBe(SANDBOX_TIMEOUT_MESSAGE);
  });

  it("ready twice without a link is a failure with the reason, not an endless wait", async () => {
    const h = harness({
      starts: [cold, cold, cold],
      readiness: [{ state: "ready" }, { state: "ready" }],
    });
    const out = await runClaudeConnect(h.deps);
    expect(out).toEqual({ kind: "failed", message: cold.detail });
  });

  it("readiness 'unavailable' fails with its own reason", async () => {
    const h = harness({
      starts: [cold],
      readiness: [{ state: "unavailable", reason: "No sandbox host is configured." }],
    });
    expect(await runClaudeConnect(h.deps)).toEqual({
      kind: "failed",
      message: "No sandbox host is configured.",
    });
  });

  it("cancel during the wait stops polling and reports cancelled", async () => {
    const h = harness({ starts: [cold] });
    (h.deps.sleep as jest.Mock).mockImplementation(async () => h.controller.abort());
    expect(await runClaudeConnect(h.deps)).toEqual({ kind: "cancelled" });
    expect(h.deps.readiness).not.toHaveBeenCalled();
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
