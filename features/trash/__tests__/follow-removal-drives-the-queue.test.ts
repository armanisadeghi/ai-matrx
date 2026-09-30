const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc } }));
const loading = jest.fn((_m: unknown, _o?: unknown) => "t1");
const success = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { loading, success, info: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError: jest.fn() }));

import { followRemoval, followRemovalWithToast } from "@/features/trash/cascade";

function job(state: string, rowsDone: number, lastError: string | null = null) {
  return {
    data: { job_id: "j1", direction: "trash", state, rows_done: rowsDone, rows_total: 900, last_error: lastError },
    error: null,
  };
}

beforeEach(() => {
  rpc.mockReset();
  loading.mockClear();
  success.mockClear();
});

it("steps a pending removal until the server says it is done", async () => {
  rpc
    .mockResolvedValueOnce(job("pending", 100)) // progress
    .mockResolvedValueOnce(job("pending", 500)) // advance
    .mockResolvedValueOnce(job("done", 900)); // advance
  const final = await followRemoval("web_site", "s1");
  expect(final?.state).toBe("done");
  expect(rpc.mock.calls.map((c) => c[0])).toEqual([
    "soft_delete_cascade_progress",
    "soft_delete_cascade_advance",
    "soft_delete_cascade_advance",
  ]);
});

it("does nothing and says nothing when the removal finished in-line", async () => {
  rpc.mockResolvedValueOnce(job("done", 40));
  await followRemovalWithToast("web_site", "s2", "Website");
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(loading).not.toHaveBeenCalled();
  expect(success).not.toHaveBeenCalled();
});

it("shows progress, then success, for a removal that outlives the request", async () => {
  rpc.mockResolvedValueOnce(job("pending", 100)).mockResolvedValueOnce(job("done", 900));
  await followRemovalWithToast("web_site", "s3", "Website");
  expect(loading).toHaveBeenCalledWith("Removing Website — 100 of 900 parts", { id: undefined });
  expect(success).toHaveBeenCalledWith("Website removed", { id: "t1" });
});

it("stops when a step fails the same way twice instead of spinning", async () => {
  rpc
    .mockResolvedValueOnce(job("pending", 100, "57014: timeout"))
    .mockResolvedValueOnce(job("pending", 100, "57014: timeout"));
  const final = await followRemoval("web_site", "s4");
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(final?.lastError).toBe("57014: timeout");
});

it("joins a second caller to the loop already following that record", async () => {
  rpc.mockResolvedValueOnce(job("pending", 1)).mockResolvedValueOnce(job("done", 900));
  const [a, b] = await Promise.all([followRemoval("web_site", "s5"), followRemoval("web_site", "s5")]);
  expect(a).toBe(b);
  expect(rpc).toHaveBeenCalledTimes(2);
});
