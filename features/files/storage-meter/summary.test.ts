/**
 * THE GUARD for folder-sync L5-1.
 *
 * The screen read "Free · 23% · 1.1 GB of 5.0 GB" while billing held
 * personal-pro / 10 GB for the organization that owns the synced folder, and
 * Free in billing is 512 MB, not 5 GB. Two separate lies in one chip: a
 * denominator from the retired `files.account_tiers` ladder, and a plan word
 * that was a SILENT fallback because the billing read had been swallowed.
 *
 * These cases pin both, with the live numbers of 2026-09-21:
 *   billing.plan_limit  free = 536,870,912   personal-pro = 10,737,418,240
 *   files.user_storage_usage(87a6e699…) bytes_used = 1,219,293,862
 */

import {
  GRAIN_NOTE,
  summarizeOrgStorage,
  type PlanInput,
  type UsageInput,
} from "./summary";

const PRO_PLAN: PlanInput = {
  status: "read",
  planName: "Pro",
  limitBytes: 10_737_418_240,
  missingDimension: false,
};

const MEASURED: UsageInput = {
  status: "read",
  bytesUsed: 1_219_293_862,
  measuredAt: "2026-09-20T23:05:32.200757Z",
};

describe("the storage meter reads billing, or says it could not", () => {
  it("meters the owning organization's real plan — the live case that was wrong", () => {
    const meter = summarizeOrgStorage({ plan: PRO_PLAN, usage: MEASURED });
    expect(meter.kind).toBe("ready");
    if (meter.kind !== "ready") throw new Error("unreachable");
    expect(meter.planName).toBe("Pro");
    expect(meter.limitBytes).toBe(10_737_418_240);
    expect(meter.percent).toBe(11);
    expect(meter.headline).toBe("1.1 GB of 10 GB");
    // The grain is stated, never implied (SPEC-SERVER §8 amendment).
    expect(meter.grain).toBe(GRAIN_NOTE);
  });

  it("never shows a number when billing did not answer", () => {
    const meter = summarizeOrgStorage({
      plan: { status: "unreadable", reason: "permission denied" },
      usage: MEASURED,
    });
    expect(meter.kind).toBe("unreadable");
    if (meter.kind !== "unreadable") throw new Error("unreachable");
    expect(meter.title).toBe("Your plan's storage limit could not be read");
    expect(meter.detail).toContain("permission denied");
    // The retired ladder's 5 GB must not appear anywhere in the output.
    expect(JSON.stringify(meter)).not.toContain("5 GB");
  });

  it("says so when the plan carries no storage dimension", () => {
    const meter = summarizeOrgStorage({
      plan: {
        status: "read",
        planName: "Custom",
        limitBytes: null,
        missingDimension: true,
      },
      usage: MEASURED,
    });
    expect(meter.kind).toBe("unreadable");
  });

  it("draws no bar over an unmeasured ledger", () => {
    const meter = summarizeOrgStorage({
      plan: PRO_PLAN,
      usage: { status: "unmeasured" },
    });
    if (meter.kind !== "ready") throw new Error("unreachable");
    expect(meter.fraction).toBeNull();
    expect(meter.percent).toBeNull();
    expect(meter.severity).toBe("unmeasured");
    expect(meter.bytesUsed).toBeNull();
  });

  it("calls an over-quota account over, on billing's Free number", () => {
    const meter = summarizeOrgStorage({
      plan: {
        status: "read",
        planName: "Free",
        limitBytes: 536_870_912,
        missingDimension: false,
      },
      usage: MEASURED,
    });
    if (meter.kind !== "ready") throw new Error("unreachable");
    expect(meter.severity).toBe("over");
    expect(meter.percent).toBe(227);
    expect(meter.offerMoreStorage).toBe(true);
    expect(meter.detail).toContain("over the 512 MB");
  });

  it("shows no percentage on an unlimited plan", () => {
    const meter = summarizeOrgStorage({
      plan: {
        status: "read",
        planName: "Enterprise",
        limitBytes: null,
        missingDimension: false,
      },
      usage: MEASURED,
    });
    if (meter.kind !== "ready") throw new Error("unreachable");
    expect(meter.percent).toBeNull();
    expect(meter.headline).toBe("1.1 GB used");
  });

  it("reports loading rather than a half-read meter", () => {
    expect(
      summarizeOrgStorage({ plan: { status: "loading" }, usage: MEASURED }).kind,
    ).toBe("loading");
    expect(
      summarizeOrgStorage({ plan: PRO_PLAN, usage: { status: "loading" } }).kind,
    ).toBe("loading");
  });
});
