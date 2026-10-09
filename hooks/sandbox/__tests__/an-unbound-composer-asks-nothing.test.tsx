/**
 * @jest-environment jsdom
 */
/**
 * AN UNBOUND COMPOSER ASKS NOTHING (live /chat/new, 2026-10-09). Every composer's
 * compute chip asks `useVerifiedSandboxBinding` whether its box is reachable, and
 * that read the whole `/api/compute-targets` list on mount — and again on every
 * window focus — for a conversation with no box bound at all. The liveness list
 * is read only when something IS bound.
 */
jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => "5b0c7e2a-31f4-4d6b-9a0e-8c2f1d7a4e10" }));

let bound: { rowId: string; proxyUrl: string; source: string } | null = null;
jest.mock("@/lib/sandbox/active-binding", () => ({
  getEffectiveSandboxRef: () => bound,
}));

import { renderHook, settle } from "@/test-utils/renderHook";
import { useVerifiedSandboxBinding } from "@/hooks/sandbox/use-verified-binding";
import type { ComputeTargetListResponse } from "@/hooks/sandbox/use-compute-targets";
import { storeReadsWrapper } from "@/test-utils/store-reads";

const body: ComputeTargetListResponse = { targets: [], max_sandboxes: 3, sandbox_count: 0 };
let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => body, text: async () => "" }));
  window.fetch = fetchMock as unknown as typeof window.fetch;
});

it("nothing bound: no request on mount and none on focus", async () => {
  bound = null;
  const hook = await renderHook(() => useVerifiedSandboxBinding("c1"), { wrapper: storeReadsWrapper() });
  await hook.act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(hook.current.status).toBe("none");
  expect(fetchMock).not.toHaveBeenCalled();
  await hook.unmount();
});

it("a bound box is verified with one request", async () => {
  bound = { rowId: "box-1", proxyUrl: "", source: "conversation" };
  const hook = await renderHook(() => useVerifiedSandboxBinding("c1"), { wrapper: storeReadsWrapper() });
  await settle(hook, (b) => b.status === "unavailable", "the bound box was checked");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await hook.unmount();
});
