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
import type { MasterworkRun } from "../../../service";
import { lastPricedRunCost } from "../../../runPrice";
import { TryMasterworkBox } from "../TryMasterworkBox";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const listRecentRunsForMasterworks = jest.fn();

jest.mock("../../../service", () => ({
  getMasterworkDefinition: () => Promise.resolve(null),
  getMasterworkRunVerdict: () => Promise.resolve(null),
  listRecentRunsForMasterworks: (...args: unknown[]) =>
    listRecentRunsForMasterworks(...args),
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

function run(partial: Partial<MasterworkRun>): MasterworkRun {
  return {
    id: "r",
    status: "completed",
    created_at: "2026-09-30T20:00:00Z",
    started_at: null,
    completed_at: null,
    steps_executed: null,
    cost_usd: null,
    deliverable_preview: null,
    error_message: null,
    ...partial,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  listRecentRunsForMasterworks.mockReset();
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
    listRecentRunsForMasterworks.mockResolvedValue({
      [MASTERWORK_ID]: [run({ cost_usd: 1.39 })],
    });
    await renderBox();
    const price = container.querySelector('[data-masterwork-run-price="known"]');
    expect(price).not.toBeNull();
    expect(price?.textContent).toContain("Last run");
    // 1.39 × 20,000 points per dollar.
    expect(price?.textContent).toContain("27,800 points");
    expect(price?.textContent).not.toContain("$");
  });

  it("says plainly when no run has been priced yet", async () => {
    listRecentRunsForMasterworks.mockResolvedValue({ [MASTERWORK_ID]: [] });
    await renderBox();
    const price = container.querySelector('[data-masterwork-run-price="unknown"]');
    expect(price).not.toBeNull();
    expect(price?.textContent).toContain("—");
  });

  it("never blanks the box when the read fails", async () => {
    listRecentRunsForMasterworks.mockRejectedValue(new Error("refused"));
    await renderBox();
    expect(container.textContent).toContain("Run it");
    expect(container.querySelector("[data-masterwork-run-price]")).toBeNull();
  });
});
