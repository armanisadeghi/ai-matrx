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
import { useOvertimeQueue } from "../overtime/hooks/useOvertimeQueue";
import { usePayPeriods } from "../periods/hooks/usePayPeriods";
import { listOvertimePreapprovals } from "../overtime/api/overtimeReads";
import { listPayPeriods } from "../periods/api/periodReads";

jest.mock("../overtime/api/overtimeReads", () => ({ listOvertimePreapprovals: jest.fn() }));
jest.mock("../periods/api/periodReads", () => ({ listPayPeriods: jest.fn() }));
jest.mock("../api/rpc", () => ({ HrRpcError: class extends Error {} }));
const overtimeRead = jest.mocked(listOvertimePreapprovals);
const periodRead = jest.mocked(listPayPeriods);
const emptyPage = { rows: [], page: 1, pageSize: 50, totalRows: 90, hasMore: true };

beforeEach(() => {
  jest.clearAllMocks();
  overtimeRead.mockResolvedValue(emptyPage);
  periodRead.mockResolvedValue(emptyPage);
});

it("keeps the overtime watchlist request fixed while paging the table", async () => {
  const seed = await renderHook(() => useOvertimeQueue({}, undefined, undefined, "employer-a"), { initialProps: {} });
  const queue = await renderHook(({ page }) => useOvertimeQueue({}, undefined, { page, pageSize: 10 }, "employer-a"), { initialProps: { page: 1 } });
  expect(seed.result.current?.isLoading || queue.result.current?.isLoading).toBe(false);
  overtimeRead.mockClear();
  await queue.rerender({ page: 2 });
  expect(overtimeRead).toHaveBeenCalledTimes(1);
  expect(overtimeRead).toHaveBeenCalledWith({}, { page: 2, pageSize: 10 }, { mockCase: undefined });
  expect(seed.result.current?.page?.pageSize).toBe(50);
});

it("clears the prior employer before the next overtime request settles and exposes failure", async () => {
  const queue = await renderHook(({ scope }) => useOvertimeQueue({}, undefined, undefined, scope), { initialProps: { scope: "a" } });
  expect(queue.result.current?.page).not.toBeNull();
  let rejectRead: (reason: Error) => void = () => { throw new Error("read not started"); };
  overtimeRead.mockImplementationOnce(() => new Promise((_, reject) => { rejectRead = reject; }));
  await queue.rerender({ scope: "b" });
  expect(queue.result.current?.page).toBeNull();
  expect(queue.result.current?.isLoading).toBe(true);
  await act(async () => rejectRead(new Error("Source unavailable")));
  expect(queue.result.current?.isLoading).toBe(false);
  expect(queue.result.current?.failure?.userMessage).toBe("Source unavailable");
});

it("uses the selected pay-period page and clears rows when the employer changes", async () => {
  const periods = await renderHook(({ page, scope }) => usePayPeriods({}, { page, pageSize: 10 }, undefined, scope), { initialProps: { page: 1, scope: "a" } });
  expect(periods.result.current?.isLoading).toBe(false);
  periodRead.mockClear();
  periodRead.mockImplementationOnce(() => new Promise(() => {}));
  await periods.rerender({ page: 2, scope: "b" });
  expect(periods.result.current?.page).toBeNull();
  expect(periods.result.current?.isLoading).toBe(true);
  expect(periodRead).toHaveBeenCalledWith({}, { page: 2, pageSize: 10 }, { mockCase: undefined });
});
