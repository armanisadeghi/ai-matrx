import { renderToStaticMarkup } from "react-dom/server";

import type { FindingEffectiveness } from "../types";
import {
  effectivenessDuration,
  effectivenessPercent,
  FINDING_EFFECTIVENESS_COLUMNS,
} from "./FindingEffectivenessPanel";

const noSignalRow: FindingEffectiveness = {
  id: "no-signal",
  unit_token: "tool",
  unit_id: "tool-1",
  unit_display_name: "Tool context",
  lever: "tools",
  findings_total: 4,
  applied_count: 0,
  rejected_count: 1,
  reverted_count: 0,
  accept_rate: null,
  revert_rate: null,
  time_to_decision_seconds_avg: null,
  cost_delta_usd_avg: null,
};

const measuredZeroRow: FindingEffectiveness = {
  ...noSignalRow,
  id: "measured-zero",
  accept_rate: 0,
  revert_rate: 0,
  time_to_decision_seconds_avg: 0,
  cost_delta_usd_avg: 0,
};

function column(id: string) {
  const found = FINDING_EFFECTIVENESS_COLUMNS.find(
    (candidate) => candidate.id === id,
  );
  if (!found) throw new Error(`Missing ${id} column`);
  return found;
}

describe("FindingEffectivenessPanel canonical columns", () => {
  it("keeps no signal distinct from a measured zero", () => {
    expect(effectivenessPercent(null)).toBe("—");
    expect(effectivenessPercent(0)).toBe("0%");
    expect(effectivenessDuration(null)).toBe("—");
    expect(effectivenessDuration(0)).toBe("0s");

    const cost = column("cost-move");
    expect(renderToStaticMarkup(<>{cost.cell?.(noSignalRow, 0)}</>)).toContain(
      "—",
    );
    expect(
      renderToStaticMarkup(<>{cost.cell?.(measuredZeroRow, 0)}</>),
    ).toContain("+$0.0000");
  });

  it("makes every numeric audit value independently sortable and filterable", () => {
    for (const id of [
      "proposed",
      "applied",
      "rejected",
      "reverted",
      "accept-rate",
      "revert-rate",
      "time-to-decision",
      "cost-move",
    ]) {
      const candidate = column(id);
      expect(candidate.filter).toBe("number");
      expect(candidate.accessorKey ?? candidate.accessorFn).toBeDefined();
    }
    expect(column("lever").filter).toBe("select");
    expect(
      column("revert-rate").accessorFn?.({
        ...measuredZeroRow,
        revert_rate: 0.5,
      }),
    ).toBe(50);
  });

  it("keeps reversion warning presentation tied to the measured rate", () => {
    const rate = column("revert-rate");
    expect(
      renderToStaticMarkup(
        <>{rate.cell?.({ ...measuredZeroRow, revert_rate: 0.5 }, 0)}</>,
      ),
    ).toContain("50%");
    expect(renderToStaticMarkup(<>{rate.cell?.(noSignalRow, 0)}</>)).toContain(
      "No signal: nothing has been applied",
    );
  });
});
