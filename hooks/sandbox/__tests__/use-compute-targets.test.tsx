/**
 * @jest-environment jsdom
 */
/**
 * One focus, one request: every mounted picker refreshes on window focus, and
 * on /data that was five or six identical GETs per focus (Vercel,
 * 2026-10-03). Instances that refresh together share one request — the list
 * lives in the store, so the pickers are three views of one read.
 */
// A signed-in person (a signed-out one owns no compute target and asks nothing).
jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => "5b0c7e2a-31f4-4d6b-9a0e-8c2f1d7a4e10" }));

import { renderHook, settle } from "@/test-utils/renderHook";
import { notifyComputeTargetsChanged, useComputeTargets, type ComputeTargetListResponse } from "@/hooks/sandbox/use-compute-targets";
import { storeReadsWrapper } from "@/test-utils/store-reads";

it("three mounted pickers make one request on mount and one per focus, and every picker gets the answer", async () => {
  const body: ComputeTargetListResponse = { targets: [], max_sandboxes: 3, sandbox_count: 0 };
  const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => body, text: async () => "" }));
  window.fetch = fetchMock as unknown as typeof window.fetch;

  const pickers = await renderHook(() => [useComputeTargets(), useComputeTargets(), useComputeTargets()], {
    wrapper: storeReadsWrapper(),
  });
  await settle(pickers, (all) => all.every((p) => p.data === body && !p.loading), "every picker loaded");
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await pickers.act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await settle(pickers, (all) => all.every((p) => !p.loading), "every picker refreshed");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await pickers.unmount();
});

it("a change notice while a request is in flight asks again once, and every picker ends on the answer after the change", async () => {
  const before: ComputeTargetListResponse = { targets: [], max_sandboxes: 3, sandbox_count: 0 };
  const after: ComputeTargetListResponse = { targets: [], max_sandboxes: 3, sandbox_count: 1 };
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let calls = 0;
  const fetchMock = jest.fn(async () => {
    calls += 1;
    const answer = calls === 1 ? before : after;
    if (calls === 1) await gate;
    return { ok: true, status: 200, json: async () => answer, text: async () => "" };
  });
  window.fetch = fetchMock as unknown as typeof window.fetch;

  const pickers = await renderHook(() => [useComputeTargets(), useComputeTargets(), useComputeTargets()], {
    wrapper: storeReadsWrapper(),
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await pickers.act(() => {
    notifyComputeTargetsChanged();
  });
  // The re-read waits for the read in flight (which may predate the change),
  // then runs once — answers land in order, never the older one last.
  release();
  await settle(pickers, (all) => all.every((p) => p.data === after && !p.loading), "every picker on the post-change answer");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await pickers.unmount();
});
