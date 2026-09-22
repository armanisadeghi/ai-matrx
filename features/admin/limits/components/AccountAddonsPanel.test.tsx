import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let tableRenderCount = 0;
let latestScope: Record<string, unknown> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => {
  const { useEffect } = require("react");
  return {
    MatrxDataTable: ({
      data,
      onViewChange,
    }: {
      data: unknown[];
      onViewChange?: (rows: unknown[]) => void;
    }) => {
      tableRenderCount += 1;
      useEffect(
        () => onViewChange?.([...data].reverse()),
        [data, onViewChange],
      );
      return <div data-testid="addons-table" />;
    },
  };
});

jest.mock("@ai-matrx/design-system/data-table/url-state", () => ({
  useTableUrlState: () => ({
    state: {},
    onStateChange: jest.fn(),
  }),
}));

jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({
    children,
    getScope,
  }: {
    children: React.ReactNode;
    getScope: () => Record<string, unknown>;
  }) => {
    latestScope = getScope();
    return children;
  },
}));

jest.mock("../service", () => ({
  fetchAccountAddons: jest.fn(),
  fetchOrganizationOptions: jest.fn(),
  fetchPlans: jest.fn(),
  fetchPlanLimits: jest.fn(),
  fetchCapabilities: jest.fn(),
  fetchOrgPlanAssignments: jest.fn(),
  grantAccountAddon: jest.fn(),
}));

import {
  fetchAccountAddons,
  fetchCapabilities,
  fetchOrganizationOptions,
  fetchOrgPlanAssignments,
  fetchPlanLimits,
  fetchPlans,
} from "../service";
import { AccountAddonsPanel } from "./AccountAddonsPanel";

describe("AccountAddonsPanel processed-view feedback", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    tableRenderCount = 0;
    latestScope = null;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    (fetchAccountAddons as jest.Mock).mockResolvedValue([
      {
        id: "addon-1",
        organization_id: "org-1",
        capability: "platform.points",
        period: "month",
        limit_value: 500_000,
        source: "manual",
        note: null,
        granted_by: null,
        effective_from: "2026-01-01T00:00:00.000Z",
        expires_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "addon-2",
        organization_id: "org-1",
        capability: "platform.points",
        period: "month",
        limit_value: 600_000,
        source: "manual",
        note: null,
        granted_by: null,
        effective_from: "2026-01-01T00:00:00.000Z",
        expires_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    (fetchOrganizationOptions as jest.Mock).mockResolvedValue([]);
    (fetchPlans as jest.Mock).mockResolvedValue([]);
    (fetchPlanLimits as jest.Mock).mockResolvedValue([]);
    (fetchCapabilities as jest.Mock).mockResolvedValue([]);
    (fetchOrgPlanAssignments as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  it("settles after a non-empty table reports the same processed view", async () => {
    await act(async () => {
      root.render(<AccountAddonsPanel />);
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="addons-table"]')).not.toBeNull();
    expect(tableRenderCount).toBeLessThan(4);
    expect(
      (latestScope?.processed_addons as Array<{ addon: { id: string } }>).map(
        (row) => row.addon.id,
      ),
    ).toEqual(["addon-2", "addon-1"]);
  });
});
