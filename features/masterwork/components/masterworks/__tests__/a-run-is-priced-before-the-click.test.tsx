/**
 * A MASTERWORK RUN IS PRICED BEFORE THE CLICK (cold walk 23, defect F).
 *
 * The Bench dialog priced its trial from the Masterwork's last priced run;
 * the run box itself showed nothing beside "Run it", and the Expert learned
 * the price only from the run row afterwards — $1.39, 63% above the run
 * before it, over her cap, with no warning. The box now shows what the last
 * priced run cost, beside the button, through the canonical cost chip, and
 * re-reads it when a run finishes so the figure after the click is the one
 * just spent.
 *
 * Only the DB read is stubbed; the box, the price derivation and the cost
 * primitive are real.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

import { makeStore } from "@/lib/redux/store";
import { lastPricedRunCost, type PricedRun } from "../../../runPrice";
import { TryMasterworkBox } from "../TryMasterworkBox";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/**
 * The two tables the price is read from, as rows — and every filter the read
 * applied, so the test proves it asks the server's question (finished,
 * non-archived, newest three) and not a looser one.
 */
let tables: Record<string, { data: unknown[] | null; error: unknown }> = {};
const filters: string[] = [];
jest.mock("@/utils/supabase/client", () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "order", "limit", "returns"]) {
      q[m] = (...args: unknown[]) => {
        filters.push(`${table}.${m}(${JSON.stringify(args)})`);
        return q;
      };
    }
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(tables[table] ?? { data: [], error: null }).then(resolve, reject);
    return q;
  };
  return {
    supabase: { schema: () => ({ from: (table: string) => chain(table) }) },
  };
});

jest.mock("../../../service", () => ({
  getMasterworkDefinition: () => Promise.resolve(null),
  getMasterworkRunVerdict: () => Promise.resolve(null),
}));
jest.mock("../../../unfolding/sealedCases", () => ({
  ...jest.requireActual("../../../unfolding/sealedCases"),
  rulebookIdForMasterwork: () => Promise.resolve(null),
  listSealedCases: () => Promise.resolve([]),
}));
jest.mock("@/lib/api/call-api", () => ({
  callApi: () => ({ type: "test/call-api" }),
}));
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: () => <textarea aria-label="Masterwork input" />,
}));
jest.mock("@/features/rich-document/RichDocument", () => ({
  RichDocument: () => <div />,
}));
// The organization's points-per-dollar knob, answered — the knob snapshot is
// transport, not the behaviour under test.
jest.mock("@/components/cost/pointsRate.client", () => ({
  usePointsRate: () => 20000,
}));

const MASTERWORK_ID = "11111111-1111-4111-8111-111111111111";

function run(partial: Partial<PricedRun> & { id?: string }): PricedRun {
  return { status: "completed", cost_usd: null, ...partial };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  tables = {};
  filters.length = 0;
  sessionStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderBox() {
  await act(async () => {
    root.render(
      <Provider store={makeStore()}>
        <TryMasterworkBox
          masterworkId={MASTERWORK_ID}
          masterworkKind="edit"
          onRunFinished={() => undefined}
        />
      </Provider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("the price of one run", () => {
  it("is the newest finished run that was priced — the Bench's own derivation", () => {
    expect(
      lastPricedRunCost([
        run({ id: "a", status: "running", cost_usd: 0.5 }),
        run({ id: "b", status: "failed", cost_usd: 0.3 }),
        run({ id: "c", cost_usd: null }),
        run({ id: "d", cost_usd: 0.85 }),
        run({ id: "e", cost_usd: 1.39 }),
      ]),
    ).toBe(0.85);
    expect(lastPricedRunCost([])).toBeNull();
    expect(lastPricedRunCost([run({ cost_usd: 0 })])).toBeNull();
  });

  it("sits beside Run it, in points, before anything is spent", async () => {
    tables = {
      run: { data: [{ id: "run-1" }], error: null },
      // A run's cost is the sum of its steps: ruling, Editor, auditors.
      node_outcome: {
        data: [
          { run_id: "run-1", cost: "1.19" },
          { run_id: "run-1", cost: "0.08" },
          { run_id: "run-1", cost: "0.12" },
          { run_id: "run-1", cost: null },
        ],
        error: null,
      },
    };
    await renderBox();
    expect(filters).toEqual(
      expect.arrayContaining([
        `run.eq(["definition_id","${MASTERWORK_ID}"])`,
        'run.eq(["status","completed"])',
        'run.is(["deleted_at",null])',
        "run.limit([3])",
        'node_outcome.is(["deleted_at",null])',
      ]),
    );
    const price = container.querySelector('[data-masterwork-run-price="known"]');
    expect(price).not.toBeNull();
    expect(price?.textContent).toContain("Last run");
    // 1.39 × 20,000 points per dollar.
    expect(price?.textContent).toContain("27,800 points");
    expect(price?.textContent).not.toContain("$");
  });

  it("says plainly when no run has been priced yet", async () => {
    tables = { run: { data: [], error: null } };
    await renderBox();
    const price = container.querySelector('[data-masterwork-run-price="unknown"]');
    expect(price).not.toBeNull();
    expect(price?.textContent).toContain("—");
  });

  it("never blanks the box when the read fails", async () => {
    tables = { run: { data: null, error: new Error("refused") } };
    await renderBox();
    expect(container.textContent).toContain("Run it");
    expect(container.querySelector("[data-masterwork-run-price]")).toBeNull();
  });
});
