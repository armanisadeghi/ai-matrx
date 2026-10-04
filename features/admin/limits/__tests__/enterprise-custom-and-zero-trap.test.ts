import {
  customLimitsByPeriod,
  parseCustomLimit,
  resetConsequence,
  zeroConfirmation,
} from "../enterpriseCustom";
import { toAdminUserPlan } from "../../users/lib/accountPlan";
import type { AccountAddon } from "../types";

const addon = (over: Partial<AccountAddon>): AccountAddon => ({
  id: "a",
  organization_id: "org1",
  capability: "platform.points",
  period: "month",
  limit_value: 100,
  source: "enterprise_custom",
  note: null,
  granted_by: null,
  effective_from: "2026-01-01T00:00:00Z",
  expires_at: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("THE 0 TRAP", () => {
  it("asks before saving a fresh 0 on AI points and names the consequence", () => {
    const c = zeroConfirmation("Pro", "platform.points", 0, 5000);
    expect(c?.description).toBe("0 means no AI points at all for Pro — every account on it is blocked.");
  });
  it("does not ask when the value is not 0, or is already 0", () => {
    expect(zeroConfirmation("Pro", "platform.points", 10, 5000)).toBeNull();
    expect(zeroConfirmation("Pro", "platform.points", null, 5000)).toBeNull();
    expect(zeroConfirmation("Pro", "platform.points", 0, 0)).toBeNull();
  });
  it("asks for a fresh 0 over a missing row too", () => {
    expect(zeroConfirmation("Pro", "platform.points", 0, undefined)).not.toBeNull();
  });
});

describe("Enterprise custom values", () => {
  const now = new Date("2026-10-04T00:00:00Z");
  it("reads only this organization's live enterprise_custom points rows", () => {
    const map = customLimitsByPeriod(
      [
        addon({ period: "month", limit_value: 50 }),
        addon({ period: "week", limit_value: 20 }),
        addon({ period: "day", source: "grant", limit_value: 9 }),
        addon({ period: "rolling_5h", organization_id: "other", limit_value: 7 }),
        addon({ period: "rolling_1h", expires_at: "2026-10-01T00:00:00Z", limit_value: 3 }),
        addon({ period: "lifetime", limit_value: null }),
      ],
      "org1",
      now,
    );
    expect(Object.fromEntries(map)).toEqual({ month: 50, week: 20 });
  });
  it("never offers unlimited: blank is 'not set', not a value", () => {
    expect(parseCustomLimit("")).toBeNull();
    expect(parseCustomLimit("1,000")).toBe(1000);
    expect(parseCustomLimit("-5")).toBeUndefined();
    expect(parseCustomLimit("unlimited")).toBeUndefined();
  });
  it("a member's plan names the organization the values come from", () => {
    const plan = toAdminUserPlan(
      {
        user_id: "u1",
        plan_key: "enterprise",
        plan_name: "Enterprise",
        plan_source: "default",
        grant_expires_at: null,
        grant_note: null,
        usage: { state: "ok", limits_source: "organization", windows: [{ period: "month", limit: 50, used: 1, state: "ok" }] },
      },
      { user_id: "u1", plan_org_id: "org1", plan_org_name: "Acme", month_points: 12, last_points_at: null },
    );
    expect(plan?.source).toBe("organization");
    expect(plan?.organization).toEqual({ id: "org1", name: "Acme" });
    expect(plan?.windows).toHaveLength(1);
    expect(plan?.month_points).toBe(12);
  });
});

describe("reset consequence", () => {
  it("states what is cleared", () => {
    expect(resetConsequence("Ava", ["week"])).toBe("Clears Ava's Week usage; the weekly count starts from zero now.");
    expect(resetConsequence("Ava", ["rolling_5h", "month"])).toBe(
      "Clears Ava's 5-hour and Month usage; those counts start from zero now.",
    );
    expect(resetConsequence("Ava", null)).toMatch(/every window starts from zero now/);
  });
});
