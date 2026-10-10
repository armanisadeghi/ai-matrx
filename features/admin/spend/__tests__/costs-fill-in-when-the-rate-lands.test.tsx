/**
 * AN ADMIN COST FILLS IN ITS POINTS WHEN THE RATE LANDS (lane DRILL-CLOSE, VERIFY-DRILL-FINAL L-b).
 *
 * The slim spend page's Estimated and batch-savings cells read "$0.0204 · —" for good: they formatted
 * through `formatAdminCost`, which peeked the `billing.points_per_usd` knob snapshot once
 * (`currentPointsRate()`), and when the panel's data landed before the snapshot nothing re-rendered it.
 * Here the rate arrives AFTER the panel has drawn its number, as on a cold page load.
 * Red on HEAD: the header stays "$0.0204 · —". Green: it re-renders to "$0.0204 · 408 points".
 */
import { act, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockRate = { value: null as number | null, listeners: new Set<() => void>() };
jest.mock("@/components/cost/pointsRate", () => ({
  ...jest.requireActual("@/components/cost/pointsRate"),
  currentPointsRate: () => mockRate.value,
}));
// The dollar seat: a system admin sees "$x · y points"; everyone else (org admins included) sees points alone.
const mockSeat = { sees: true };
jest.mock("@/components/cost/useCostDisplay", () => ({
  ...jest.requireActual("@/components/cost/useCostDisplay"),
  useSeesDollars: () => mockSeat.sees,
}));
jest.mock("@/components/cost/pointsRate.client", () => ({
  usePointsRate: () =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useSyncExternalStore(
      (l: () => void) => {
        mockRate.listeners.add(l);
        return () => mockRate.listeners.delete(l);
      },
      () => mockRate.value,
    ),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@ai-matrx/design-system/data-table", () => ({ MatrxDataTable: () => null }));
jest.mock("../service", () => ({
  ESTIMATED_SPEND_ROW_CAP: 500,
  // the mandate reference patrol's container time, priced at the published Fargate rate
  fetchEstimatedSpend: jest.fn(async () => ({ rows: [], capped: false, totalEstimatedUsd: 0.0204 })),
}));

import { EstimatedCostPanel } from "../explorer/EstimatedCostPanel";

function landRate(rate: number) {
  act(() => {
    mockRate.value = rate;
    for (const l of mockRate.listeners) l();
  });
}

async function mountPanel() {
  mockRate.value = null;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<EstimatedCostPanel from={new Date("2026-09-30T07:00:00Z")} to={new Date("2026-10-01T07:00:00Z")} windowLabel="Yesterday" />);
  });
  await act(async () => {}); // the estimate read resolves
  const panel = () => host.querySelector("[data-testid=spend-estimated-cost]")?.textContent ?? "";
  return { panel, unmount: () => act(() => root.unmount()) };
}

it("system admin: the Estimated total shows dollars and its points once the rate knob answers, after the data", async () => {
  mockSeat.sees = true;
  const { panel, unmount } = await mountPanel();
  expect(panel()).toContain("$0.02 · —");
  landRate(20_000);
  expect(panel()).toContain("$0.02 · 408 points");
  unmount();
});

it("non-admin: the Estimated total shows points alone once the rate lands, never a dollar or the rate", async () => {
  mockSeat.sees = false;
  const { panel, unmount } = await mountPanel();
  expect(panel()).not.toContain("$");
  landRate(20_000);
  expect(panel()).toContain("408 points");
  expect(panel()).not.toContain("$");
  expect(panel()).not.toContain("20,000");
  unmount();
});
