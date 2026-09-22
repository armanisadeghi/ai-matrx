import {
  createAddonTableRow,
  type PlanContext,
} from "../components/AccountAddonsPanel";
import type { AccountAddon, Plan } from "../types";

const now = new Date("2026-09-22T12:00:00.000Z");
const plan: Plan = {
  plan_key: "pro",
  name: "Pro",
  audience: "business",
  rank: 1,
  tier: "pro",
  active: true,
};
const addon: AccountAddon = {
  id: "addon-1",
  organization_id: "org-1",
  capability: "platform.points",
  period: "month",
  limit_value: 500_000,
  source: "manual",
  note: null,
  granted_by: null,
  effective_from: "2026-01-01T00:00:00.000Z",
  expires_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

function known(limit: number | null): PlanContext {
  return {
    kind: "known",
    plan,
    limit: {
      plan_id: plan.plan_key,
      capability: addon.capability,
      period: "month",
      limit_value: limit,
      note: null,
    },
  };
}

describe("account add-on table semantics", () => {
  it("keeps an absent plan limit distinct from an unlimited plan limit", () => {
    const absent = createAddonTableRow(
      addon,
      undefined,
      undefined,
      { kind: "known", plan, limit: null },
      now,
    );
    const unlimited = createAddonTableRow(
      addon,
      undefined,
      undefined,
      known(null),
      now,
    );

    expect(absent.planAllowanceState).toBe("not_included");
    expect(absent.raiseState).toBe("from_nothing");
    expect(absent.raiseAmount).toBe(500_000);
    expect(unlimited.planAllowanceState).toBe("unlimited");
    expect(unlimited.raiseState).toBe("already_unlimited");
  });

  it("calculates positive, unlimited, and non-raising grants without erasing units", () => {
    const positive = createAddonTableRow(
      addon,
      undefined,
      undefined,
      known(320_000),
      now,
    );
    const toUnlimited = createAddonTableRow(
      { ...addon, limit_value: null },
      undefined,
      undefined,
      known(320_000),
      now,
    );
    const noRaise = createAddonTableRow(
      { ...addon, limit_value: 100_000 },
      undefined,
      undefined,
      known(320_000),
      now,
    );

    expect(positive.raiseState).toBe("positive");
    expect(positive.raiseAmount).toBe(180_000);
    expect(positive.raiseLabel).toBe("+180,000");
    expect(toUnlimited.raiseState).toBe("to_unlimited");
    expect(noRaise.raiseState).toBe("no_raise");
    expect(noRaise.raiseLabel).toBe("no raise (-220,000)");
  });

  it("retains expired grants but says they no longer raise the plan", () => {
    const expired = createAddonTableRow(
      { ...addon, expires_at: "2026-02-01T00:00:00.000Z" },
      undefined,
      undefined,
      known(320_000),
      now,
    );

    expect(expired.status).toBe("expired");
    expect(expired.raiseLabel).toBe(
      "no longer raises anything (+180,000)",
    );
  });

  it("keeps a future grant distinct from an expired grant", () => {
    const future = createAddonTableRow(
      { ...addon, effective_from: "2026-10-01T00:00:00.000Z" },
      undefined,
      undefined,
      known(320_000),
      now,
    );

    expect(future.status).toBe("starts_later");
    expect(future.raiseLabel).toBe("not effective yet (+180,000)");
  });
});
