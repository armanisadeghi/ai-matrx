import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { PayPeriodsPage } from "../periods/components/PayPeriodsPage";
import { usePayPeriods } from "../periods/hooks/usePayPeriods";

jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock("@/features/hr/shared/useHrContext", () => ({ useHrContext: () => ({ orgRef: null, active: { organization_id: "sole-employer" } }) }));
jest.mock("../periods/hooks/usePayPeriods", () => ({ usePayPeriods: jest.fn(() => ({ page: null, isLoading: false, failure: null, reload: jest.fn() })) }));
jest.mock("../periods/components/GeneratePeriodsPanel", () => ({ GeneratePeriodsPanel: () => null }));
jest.mock("../periods/components/PayPeriodsTable", () => ({ PayPeriodsTable: () => null }));
jest.mock("@/features/hr/exports/components/ExportRunList", () => ({ ExportRunList: () => null }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("filters the sole resolved HR employer even when there is no org_filter URL", async () => {
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<PayPeriodsPage />));
    expect(usePayPeriods).toHaveBeenCalledWith({ organizationId: "sole-employer" }, { page: 1, pageSize: 50 }, undefined, "sole-employer");
  } finally { await act(async () => root.unmount()); }
});
