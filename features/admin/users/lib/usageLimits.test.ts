import {
  applyFreshUsage,
  compareConstraint,
  inUsagePopulation,
  presentSecondaryWindows,
  usageKpis,
} from "./usageLimits";
import type { AdminUserPlan, AdminUserRow } from "../types";

const NOW = new Date("2026-10-04T12:00:00Z").getTime();

function row(id: string, plan: Partial<AdminUserPlan> | null): AdminUserRow {
  return {
    id,
    plan: plan
      ? {
          key: "free",
          name: "Free",
          source: "default",
          organization: null,
          grant_expires_at: null,
          grant_note: null,
          state: "ok",
          binding: null,
          windows: [],
          month_points: 0,
          last_points_at: null,
          ...plan,
        }
      : null,
  } as AdminUserRow;
}

describe("usage limits dashboard rules", () => {
  it("lists recent AI users and anyone near/over; 'all accounts' lists every planned row", () => {
    const recent = row("r", { last_points_at: "2026-09-20T00:00:00Z" });
    const stale = row("s", { last_points_at: "2026-07-01T00:00:00Z" });
    const near = row("n", { state: "near" });
    const unknown = row("x", null);
    expect([recent, stale, near, unknown].filter((r) => inUsagePopulation(r, NOW, false)).map((r) => r.id)).toEqual(["r", "n"]);
    expect([recent, stale, near, unknown].filter((r) => inUsagePopulation(r, NOW, true)).map((r) => r.id)).toEqual(["r", "s", "n"]);
  });

  it("sorts most constrained first: over, near, then by pressure", () => {
    const a = row("a", { state: "ok", windows: [{ period: "week", used: 90, limit: 100, resets_at: null, state: "ok" }] });
    const b = row("b", { state: "over", windows: [{ period: "week", used: 100, limit: 100, resets_at: null, state: "over" }] });
    const c = row("c", { state: "ok", windows: [{ period: "week", used: 10, limit: 100, resets_at: null, state: "ok" }] });
    const d = row("d", { state: "near", windows: [{ period: "week", used: 85, limit: 100, resets_at: null, state: "near" }] });
    expect([a, b, c, d].sort(compareConstraint).map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("counts states and points from the database's answer", () => {
    const k = usageKpis([row("a", { state: "over", month_points: 5 }), row("b", { month_points: 7 }), row("c", null)]);
    expect(k).toEqual({ over: 1, near: 0, ok: 1, monthPoints: 12 });
  });

  it("shows Day / 1-hour only when a row holds them", () => {
    expect(presentSecondaryWindows([row("a", {})])).toEqual([]);
    expect(
      presentSecondaryWindows([row("a", { windows: [{ period: "day", used: 0, limit: 1, resets_at: null, state: "ok" }] })]),
    ).toEqual(["day"]);
  });

  it("a reset replaces the row's windows with the function's fresh answer", () => {
    const before = row("a", {
      state: "over",
      windows: [{ period: "week", used: 100, limit: 100, resets_at: null, state: "over" }],
    });
    const after = applyFreshUsage(before, {
      state: "ok",
      binding_period: "week",
      windows: [{ period: "week", used: 0, limit: 100, resets_at: "2026-10-05T00:00:00Z", state: "ok" }],
    });
    expect(after.plan?.state).toBe("ok");
    expect(after.plan?.windows[0].used).toBe(0);
    expect(after.plan?.binding?.used).toBe(0);
  });
});
