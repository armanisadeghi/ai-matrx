/**
 * A SCREEN NEVER LIES — agent-app KPI strips.
 *
 * `total_cost` is nullable on `aga_apps`. A null there means "nobody knows
 * what this app cost", and `?? 0` turned that into the confident sentence
 * "$0.0000" — a user reading it believes the app was free. Money is the
 * worst place in the product to guess.
 *
 * A REAL zero still prints as a zero: 0 known-to-be-0 is information.
 */

import { agentAppAdminKpis, agentAppKpis } from "@/features/agent-apps/format";

describe("agentAppAdminKpis — unknown must not read as a number", () => {
  it("renders an unknown cost as an em-dash, not $0.0000", () => {
    expect(agentAppAdminKpis({ total_cost: null }).cost).toBe("—");
    expect(agentAppAdminKpis({}).cost).toBe("—");
  });

  it("still renders a REAL zero cost as $0.0000", () => {
    expect(agentAppAdminKpis({ total_cost: 0 }).cost).toBe("$0.0000");
  });

  it("renders a real cost unchanged", () => {
    expect(agentAppAdminKpis({ total_cost: 1.23456 }).cost).toBe("$1.2346");
  });

  it("renders unknown runs / users / success rate as em-dashes", () => {
    const kpis = agentAppAdminKpis({});
    expect(kpis.runs).toBe("—");
    expect(kpis.users).toBe("—");
    expect(kpis.success).toBe("—");
  });

  it("still renders real zeroes for runs / users / success rate", () => {
    const kpis = agentAppAdminKpis({
      total_executions: 0,
      unique_users_count: 0,
      success_rate: 0,
    });
    expect(kpis.runs).toBe("0");
    expect(kpis.users).toBe("0");
    expect(kpis.success).toBe("0%");
  });
});

describe("agentAppKpis — the entity stat strip", () => {
  it("omits cost when unknown and shows a real zero when known", () => {
    expect(agentAppKpis({ total_cost: null }).cost).toBeUndefined();
    expect(agentAppKpis({ total_cost: 0 }).cost).toBe("$0.00");
  });
});
