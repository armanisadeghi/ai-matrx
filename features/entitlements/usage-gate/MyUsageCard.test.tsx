/**
 * A person's meter must fill in when its rate answers after usage state does.
 *
 * The usage RPC can land before `billing.points_per_usd`. The rate hook is the
 * only subscribed read of that knob; a one-shot `currentPointsRate()` leaves
 * valid usage permanently displayed as `— of —`.
 */
import { act, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const rate = { value: null as number | null, listeners: new Set<() => void>() };
const usageState = {
  userAuth: { id: null },
  entitlements: {
    usageGate: {
      state: "ok" as const,
      planName: "Starter",
      bindingPeriod: "month",
      resetsAt: "2026-11-01T00:00:00Z",
      windows: [
        {
          period: "month",
          used: 2_000 as number | null,
          limit: 8_000,
          remaining: 6_000,
          resetsAt: "2026-11-01T00:00:00Z",
          state: "ok" as const,
        },
      ],
      computedAt: "2026-10-04T12:00:00Z",
      enforced: false,
      stale: false,
      fetchedAt: Date.now(),
      refusal: null,
      freePeriod: null,
    },
  },
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: typeof usageState) => unknown) =>
    selector(usageState),
  useAppStore: () => ({ getState: () => usageState }),
}));

jest.mock("@/components/cost/pointsRate", () => ({
  currentPointsRate: () => null,
}));

jest.mock("@/components/cost/useCostDisplay", () => ({
  useCostDisplay: () => ({
    unit: "points",
    rate: useSyncExternalStore(
      (listener: () => void) => {
        rate.listeners.add(listener);
        return () => rate.listeners.delete(listener);
      },
      () => rate.value,
      () => null,
    ),
  }),
}));

import { MyUsageCard } from "./MyUsageCard";

beforeEach(() => {
  usageState.entitlements.usageGate.windows[0].used = 2_000;
});

function landRate(value: number) {
  act(() => {
    rate.value = value;
    for (const listener of rate.listeners) listener();
  });
}

it("keeps an unanswered rate unmeasured instead of inventing zero usage", async () => {
  rate.value = null;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<MyUsageCard />);
  });

  expect(host.textContent).toContain("— of —");
  act(() => root.unmount());
});

it("renders the usage RPC's actual values when the rate arrives after it", async () => {
  rate.value = null;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<MyUsageCard />);
  });
  expect(host.textContent).toContain("— of —");

  landRate(20_000);

  expect(host.textContent).toContain("2,000 points of 8,000 points");
  act(() => root.unmount());
});

it("renders a malformed usage count as unmeasured instead of zero", async () => {
  rate.value = 20_000;
  usageState.entitlements.usageGate.windows[0].used = null;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<MyUsageCard />);
  });

  expect(host.textContent).toContain("— of 8,000 points");
  expect(host.textContent).not.toContain("0 points of 8,000 points");
  expect(host.querySelector('[style*="width"]')).toBeNull();
  act(() => root.unmount());
});
