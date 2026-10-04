import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); });
async function renderHook<T, P>(hook: (props: P) => T, options: { initialProps: P }) {
  const root = createRoot(document.createElement("div")); roots.push(root);
  const result = { current: undefined as T | undefined };
  function Harness({ value }: { value: P }) { result.current = hook(value); return null; }
  async function rerender(value: P) { await act(async () => { root.render(<Harness value={value} />); }); }
  await rerender(options.initialProps);
  return { result, rerender };
}
import { usePayPeriods } from "../periods/hooks/usePayPeriods";
import { listPayPeriods } from "../periods/api/periodReads";

jest.mock("../periods/api/periodReads", () => ({ listPayPeriods: jest.fn() }));
jest.mock("../api/rpc", () => ({ HrRpcError: class extends Error {} }));
const periodRead = jest.mocked(listPayPeriods);
const emptyPage = { rows: [], page: 1, pageSize: 50, totalRows: 90, hasMore: true };

beforeEach(() => {
  jest.clearAllMocks();
  periodRead.mockResolvedValue(emptyPage);
});

it("uses the selected pay-period page and clears rows when the employer changes", async () => {
  const periods = await renderHook(({ page, scope }) => usePayPeriods({ organizationId: scope }, { page, pageSize: 10 }, undefined, scope), { initialProps: { page: 1, scope: "a" } });
  expect(periods.result.current?.isLoading).toBe(false);
  periodRead.mockClear();
  periodRead.mockImplementationOnce(() => new Promise(() => {}));
  await periods.rerender({ page: 2, scope: "b" });
  expect(periods.result.current?.page).toBeNull();
  expect(periods.result.current?.isLoading).toBe(true);
  expect(periodRead).toHaveBeenCalledWith({ organizationId: "b" }, { page: 2, pageSize: 10 }, { mockCase: undefined });
});
