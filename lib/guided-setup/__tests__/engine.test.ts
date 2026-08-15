/**
 * The engine decides what the screen says. These lock the four rules that a
 * hand-rolled checklist gets wrong every time.
 */

import {
  autoRunnableSteps,
  checklistSteps,
  resolveChecklist,
  withConfirmation,
  withLastResult,
} from "../engine";
import type { ChecklistDefinition, ChecklistRunState } from "../types";

type Ctx = Record<string, never>;

const definition: ChecklistDefinition<Ctx> = {
  key: "test.checklist",
  title: "Get ready",
  steps: [
    {
      kind: "verified",
      id: "connect",
      title: "Connect the thing",
      check: async () => ({ status: "pass" }),
    },
    {
      kind: "auto",
      id: "import",
      title: "Bring in the data",
      dependsOn: ["connect"],
      check: async () => ({ status: "fail" }),
      run: async () => undefined,
    },
    {
      kind: "confirmed",
      id: "own",
      title: "Confirm it's yours",
      reconfirmAfterDays: 30,
    },
  ],
};

const ctx: Ctx = {};
const emptyState: ChecklistRunState = { steps: {} };

describe("resolveChecklist", () => {
  it("uses the LIVE result, not the stored one", () => {
    const state: ChecklistRunState = {
      steps: { connect: { lastResult: { status: "pass", at: "2026-01-01T00:00:00Z" } } },
    };
    const resolved = resolveChecklist({
      definition,
      ctx,
      state,
      live: { connect: { status: "fail", reason: "The connection was removed." } },
    });
    const connect = resolved.steps.find((s) => s.id === "connect")!;
    expect(connect.status).toBe("action");
    expect(connect.stale).toBe(false);
    // A step that used to pass and now fails is a regression, said out loud.
    expect(connect.regressed).toBe(true);
    expect(resolved.hasRegression).toBe(true);
  });

  it("paints the stored result while the live check is in flight, flagged stale", () => {
    const state: ChecklistRunState = {
      steps: { connect: { lastResult: { status: "pass", at: "2026-01-01T00:00:00Z" } } },
    };
    const resolved = resolveChecklist({ definition, ctx, state, live: {} });
    const connect = resolved.steps.find((s) => s.id === "connect")!;
    expect(connect.status).toBe("done");
    expect(connect.stale).toBe(true);
    expect(connect.lastCheckedAt).toBe("2026-01-01T00:00:00Z");
    // Stale never counts as a regression — it is not news, it is memory.
    expect(connect.regressed).toBe(false);
  });

  it("renders 'we could not check' as neutral, never as a failure", () => {
    const resolved = resolveChecklist({
      definition,
      ctx,
      state: emptyState,
      live: { connect: { status: "unknown", reason: "Google didn't answer." } },
    });
    expect(resolved.steps.find((s) => s.id === "connect")!.status).toBe("unknown");
  });

  it("blocks a step whose dependency is not done, and unblocks it when it is", () => {
    const blocked = resolveChecklist({
      definition,
      ctx,
      state: emptyState,
      live: { connect: { status: "fail" }, import: { status: "fail" } },
    });
    const step = blocked.steps.find((s) => s.id === "import")!;
    expect(step.status).toBe("blocked");
    expect(step.blockedBy).toEqual(["Connect the thing"]);

    const unblocked = resolveChecklist({
      definition,
      ctx,
      state: emptyState,
      live: { connect: { status: "pass" }, import: { status: "fail" } },
    });
    expect(unblocked.steps.find((s) => s.id === "import")!.status).toBe("action");
  });

  it("keeps a blocked step out of the 'what should I do now' slot", () => {
    // The blocked step is the only non-done one, but it is not actionable —
    // pointing the user at it would send them at work they cannot start.
    // (The UI's matching rule: a blocked step never renders its fix button.)
    const resolved = resolveChecklist({
      definition,
      ctx,
      state: withConfirmation(emptyState, "own", true, "u1", new Date().toISOString()),
      live: { connect: { status: "pass" }, import: { status: "fail" } },
    });
    expect(resolved.steps.find((s) => s.id === "import")!.status).toBe("action");

    const blocked = resolveChecklist({
      definition,
      ctx,
      state: withConfirmation(emptyState, "own", true, "u1", new Date().toISOString()),
      live: { connect: { status: "fail" }, import: { status: "fail" } },
    });
    // `connect` is what actually wants the user; `import` is merely waiting.
    expect(blocked.currentStepId).toBe("connect");
    expect(blocked.steps.find((s) => s.id === "import")!.status).toBe("blocked");
  });

  it("expires a human confirmation once it is out of date", () => {
    const now = Date.parse("2026-06-01T00:00:00Z");
    const fresh = withConfirmation(emptyState, "own", true, "u1", "2026-05-25T00:00:00Z");
    expect(
      resolveChecklist({ definition, ctx, state: fresh, live: {}, now }).steps.find(
        (s) => s.id === "own",
      )!.status,
    ).toBe("done");

    const old = withConfirmation(emptyState, "own", true, "u1", "2026-01-01T00:00:00Z");
    expect(
      resolveChecklist({ definition, ctx, state: old, live: {}, now }).steps.find(
        (s) => s.id === "own",
      )!.status,
    ).toBe("action");
  });

  it("counts progress and completion off REQUIRED steps only", () => {
    const state = withConfirmation(emptyState, "own", true, "u1", new Date().toISOString());
    const resolved = resolveChecklist({
      definition,
      ctx,
      state,
      live: { connect: { status: "pass" }, import: { status: "pass" } },
    });
    expect(resolved.requiredCount).toBe(3);
    expect(resolved.doneCount).toBe(3);
    expect(resolved.complete).toBe(true);
    expect(resolved.currentStepId).toBeNull();
  });
});

describe("autoRunnableSteps", () => {
  const runnable = (args: Parameters<typeof autoRunnableSteps<Ctx>>[0]) =>
    autoRunnableSteps(args);

  it("runs an unblocked auto step whose LIVE check failed", () => {
    const live = { connect: { status: "pass" as const }, import: { status: "fail" as const } };
    const resolved = resolveChecklist({ definition, ctx, state: emptyState, live });
    expect(
      runnable({ definition, ctx, resolved, live, alreadyRan: new Set() }),
    ).toEqual(["import"]);
  });

  it("never acts on a stale result — only on a live failure", () => {
    const state = withLastResult(
      emptyState,
      "import",
      { status: "fail" },
      "2026-01-01T00:00:00Z",
    );
    const live = { connect: { status: "pass" as const } };
    const resolved = resolveChecklist({ definition, ctx, state, live });
    expect(runnable({ definition, ctx, resolved, live, alreadyRan: new Set() })).toEqual([]);
  });

  it("never acts when we could not check", () => {
    const live = {
      connect: { status: "pass" as const },
      import: { status: "unknown" as const },
    };
    const resolved = resolveChecklist({ definition, ctx, state: emptyState, live });
    expect(runnable({ definition, ctx, resolved, live, alreadyRan: new Set() })).toEqual([]);
  });

  it("never acts on a blocked step", () => {
    const live = { connect: { status: "fail" as const }, import: { status: "fail" as const } };
    const resolved = resolveChecklist({ definition, ctx, state: emptyState, live });
    expect(runnable({ definition, ctx, resolved, live, alreadyRan: new Set() })).toEqual([]);
  });

  it("does not run the same step twice", () => {
    const live = { connect: { status: "pass" as const }, import: { status: "fail" as const } };
    const resolved = resolveChecklist({ definition, ctx, state: emptyState, live });
    expect(
      runnable({ definition, ctx, resolved, live, alreadyRan: new Set(["import"]) }),
    ).toEqual([]);
  });
});

/**
 * A definition whose step LIST comes from the outside world — Stripe answering
 * "what is still missing from this account". The point is that a requirement
 * nobody anticipated still gets its own row instead of vanishing.
 */
describe("steps declared as a factory", () => {
  interface OutstandingCtx {
    outstanding: string[];
  }

  const dynamic: ChecklistDefinition<OutstandingCtx> = {
    key: "test.dynamic",
    title: "Finish setting up",
    steps: (context) => [
      {
        kind: "verified" as const,
        id: "account",
        title: "Account exists",
        check: async () => ({ status: "pass" as const }),
      },
      ...context.outstanding.map((code) => ({
        kind: "verified" as const,
        id: `need.${code}`,
        title: `They still need ${code}`,
        dependsOn: ["account"],
        check: async () => ({ status: "fail" as const, reason: "Outstanding." }),
      })),
    ],
  };

  it("grows a step per outstanding item and drops it when it clears", () => {
    expect(
      checklistSteps(dynamic, { outstanding: ["id_document", "bank"] }).map(
        (s) => s.id,
      ),
    ).toEqual(["account", "need.id_document", "need.bank"]);
    expect(checklistSteps(dynamic, { outstanding: [] }).map((s) => s.id)).toEqual([
      "account",
    ]);
  });

  it("resolves and counts the generated steps like any other", () => {
    const resolved = resolveChecklist({
      definition: dynamic,
      ctx: { outstanding: ["bank"] },
      state: emptyState,
      live: {
        account: { status: "pass" },
        "need.bank": { status: "fail", reason: "Outstanding." },
      },
    });
    expect(resolved.requiredCount).toBe(2);
    expect(resolved.doneCount).toBe(1);
    expect(resolved.currentStepId).toBe("need.bank");
  });

  it("is complete the moment nothing is outstanding", () => {
    const resolved = resolveChecklist({
      definition: dynamic,
      ctx: { outstanding: [] },
      state: emptyState,
      live: { account: { status: "pass" } },
    });
    expect(resolved.complete).toBe(true);
  });
});
