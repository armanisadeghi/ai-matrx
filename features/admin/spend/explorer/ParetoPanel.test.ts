import type { SpendDimensionRow } from "../types";
import {
  paretoCopyData,
  paretoCopyText,
  paretoAgentPayload,
  paretoCut,
  type ParetoParentContext,
} from "./ParetoPanel";

function row(key: string, cost: number, total = 100): SpendDimensionRow {
  return {
    key,
    label: key,
    cost,
    share: cost / total,
    n: 1,
    requests: 1,
    tokensIn: 0,
    tokensCached: 0,
    tokensOut: 0,
    manualCost: cost,
    automatedCost: 0,
    lastAt: null,
  };
}

describe("paretoCut", () => {
  it("shows at least three rows even when one row already exceeds 80%", () => {
    const cut = paretoCut(
      [row("a", 85), row("b", 7), row("c", 5), row("d", 3)],
      4,
      100,
    );

    expect(cut.head.map((item) => item.key)).toEqual(["a", "b", "c"]);
    expect(cut.restCount).toBe(1);
    expect(cut.restCost).toBe(3);
  });

  it("never shows more than six rows when 80% needs a long tail", () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      row(String(index + 1), 10),
    );
    const cut = paretoCut(rows, 10, 100);

    expect(cut.head).toHaveLength(6);
    expect(cut.headCost).toBe(60);
    expect(cut.restCount).toBe(4);
    expect(cut.restCost).toBe(40);
  });

  it("keeps the honest row count when fewer than three values exist", () => {
    const cut = paretoCut([row("a", 70), row("b", 30)], 2, 100);

    expect(cut.head).toHaveLength(2);
    expect(cut.restCount).toBe(0);
    expect(cut.restCost).toBe(0);
  });
});

describe("Pareto copy context", () => {
  const parent: ParetoParentContext = {
    selectedWindow: "Last 7 days",
    window: {
      from: "2026-09-07T00:00:00.000Z",
      to: "2026-09-14T00:00:00.000Z",
      hours: 168,
    },
    filters: { model: "gpt-5.6-terra" },
    leadingKpis: {
      windowTotal: { value: "$100.00", hint: "$0.60/hr · 9 executions" },
      manual: { value: "$60.00", hint: "60%" },
      automated: { value: "$40.00", hint: "40%" },
      requests: { value: "8", hint: "4 conversations · 9 ledger rows" },
      tokensIn: { value: "12K", hint: "25% served from cache · 3K out" },
      explainedByRequest: { value: "90%", hint: "$10.00 from execution context" },
    },
  };

  it("carries the selected window, filters, and every leading KPI", () => {
    const cut = paretoCut([row("a", 85), row("b", 10), row("c", 5)], 3, 100);
    const data = paretoCopyData("model", cut, 100, parent);
    const text = paretoCopyText("model", cut, 100, parent);

    expect(data.parent).toEqual(parent);
    expect(text).toContain("Window: Last 7 days");
    expect(text).toContain("Filters: model: gpt-5.6-terra");
    expect(text).toContain("Window total: $100.00");
    expect(text).toContain("Explained by a request: 90%");
  });

  it("mirrors every displayed KPI in the agent envelope attributes", () => {
    const cut = paretoCut([row("a", 85), row("b", 10), row("c", 5)], 3, 100);
    const payload = paretoAgentPayload(
      "model",
      cut,
      100,
      {
        cost: 100,
        manualCost: 60,
        automatedCost: 40,
        linkedCost: 90,
        unlinkedCost: 10,
        requests: 8,
        conversations: 4,
        executions: 9,
        paidExecutions: 9,
        tokensIn: 9000,
        tokensCached: 3000,
        tokensOut: 3000,
        ledgerCost: 100,
        ledgerRows: 9,
        hours: 168,
      },
      parent,
    );

    expect(payload.context.selected_window).toBe("Last 7 days");
    expect(payload.attributes).toMatchObject({
      conversations: 4,
      per_hour_cost: 100 / 168,
      tokens_cached: 3000,
      token_cache_share: 0.25,
      linked_cost: 90,
      unlinked_cost: 10,
      explained_share: 0.9,
      manual_share: 0.6,
      automated_share: 0.4,
      window_total_display: "$100.00",
      manual_display: "$60.00",
      automated_display: "$40.00",
      requests_display: "8",
      tokens_in_display: "12K",
      explained_by_request_display: "90%",
    });
  });
});
