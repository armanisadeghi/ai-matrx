// The estimated-cost read: an estimate is shown on its own, never merged into
// billed cost (verification 2026-09-30, defect G — the mandate reference
// patrol's Fargate-priced compute landed as meters.estimated_usd and no reader
// showed it, so Spend Explorer read $0 for it).

import { parseEstimatedSpendRows } from "./service";

const patrolRow = {
  id: "4f0037ec-9a18-4da5-8d88-7b0af3e73d71",
  created_at: "2026-09-30T20:24:09.481633+00:00",
  cost: 0,
  link_kind: "sch_run",
  link_id: "c8a83b59-dbbf-47d9-bc77-5b873867906d",
  lease_holder: "utility:mandate_reference_patrol_compute:c8a83b59-dbbf-47d9-bc77-5b873867906d",
  meters: { estimated_usd: "0.010792", vcpu_seconds: "959.786" },
};

describe("parseEstimatedSpendRows", () => {
  it("reads the patrol's estimate as its own figure, beside a $0 billed cost", () => {
    const parsed = parseEstimatedSpendRows([patrolRow]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].source).toBe("mandate_reference_patrol_compute");
    expect(parsed.rows[0].estimatedUsd).toBeCloseTo(0.010792, 6);
    expect(parsed.rows[0].ledgerCostUsd).toBe(0);
    expect(parsed.totalEstimatedUsd).toBeCloseTo(0.010792, 6);
    expect(parsed.capped).toBe(false);
  });

  it("never invents an estimate for a row without one, and never adds billed cost", () => {
    const billed = { ...patrolRow, id: "b", cost: 1.5, meters: {} };
    const parsed = parseEstimatedSpendRows([patrolRow, billed, null, "junk"]);
    expect(parsed.rows.map((r) => r.id)).toEqual([patrolRow.id]);
    expect(parsed.totalEstimatedUsd).toBeCloseTo(0.010792, 6);
  });

  it("names the source from the link kind when there is no lease holder", () => {
    const parsed = parseEstimatedSpendRows([{ ...patrolRow, lease_holder: null }]);
    expect(parsed.rows[0].source).toBe("sch_run");
  });
});
