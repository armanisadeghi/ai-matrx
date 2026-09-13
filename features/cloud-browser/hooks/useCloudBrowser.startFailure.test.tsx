/**
 * A failed browser start must leave the person with something that WORKS.
 *
 * Production, 2026-09-13: every start was refused by the server. The panel
 * reduced the server's error to a string, left `loading` stuck true, rendered
 * one small red line at the bottom, and offered no way to try again. The obvious
 * repair — a Try again button wired to the existing `reload` — would have been
 * a dead button: `reload` needs an `activeProfileId`, and a first load that
 * failed never set one. These tests pin the real contract against the REAL
 * slice; only the network boundary and the signed-in user are faked.
 */

import * as React from "react";
import { configureStore } from "@reduxjs/toolkit";
import { renderHook, settle } from "@/test-utils/renderHook";
import { BackendApiError } from "@/lib/api/errors";
import cloudBrowserReducer from "../redux/cloudBrowserSlice";

const makeStore = () =>
  configureStore({ reducer: { cloudBrowser: cloudBrowserReducer } });

// Fresh store per test — no test may depend on another's leftovers.
const mockRef: { store: ReturnType<typeof makeStore> } = { store: makeStore() };

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockRef.store.dispatch,
  useAppSelector: (sel: (s: unknown) => unknown) =>
    React.useSyncExternalStore(
      mockRef.store.subscribe,
      () => sel(mockRef.store.getState()),
      () => sel(mockRef.store.getState()),
    ),
}));

jest.mock("@/lib/hooks/useUser", () => ({
  useUser: () => ({ userId: "user-1", activeUserName: "Test Admin" }),
}));

jest.mock("./useWrittenProgress", () => ({
  useWrittenProgress: () => ({ refreshProgress: jest.fn() }),
}));

const mockLoadSnapshot = jest.fn();
jest.mock("../service", () => ({
  loadSnapshot: (...args: unknown[]) => mockLoadSnapshot(...args),
}));

import { useCloudBrowser } from "./useCloudBrowser";

/** What the server actually sent during the outage (router → BackendApiError). */
function refusedStart(retryable: boolean) {
  return new BackendApiError({
    code: "worker_unreachable",
    detail: "The browser worker did not start cleanly (already_bootstrapped).",
    userMessage: "Your browser could not start. Try again in a moment.",
    details: { retryable },
    requestId: "req-08fb9faf",
    status: 502,
  });
}

const liveSnapshot = {
  activeProfileId: "prof-1",
  profiles: [],
  quotas: {},
  run: { id: "run-1", profileId: "prof-1", state: "agent_control" },
  progress: [],
  handoff: null,
  controller: null,
  bindings: [],
  telemetry: null,
  consent: null,
  notificationAcknowledgedAt: null,
};

describe("useCloudBrowser — a failed start", () => {
  beforeEach(() => {
    mockLoadSnapshot.mockReset();
    mockRef.store = makeStore();
  });

  it("keeps what the server said: message, retryable, and the reference", async () => {
    mockLoadSnapshot.mockRejectedValueOnce(refusedStart(true));
    const h = await renderHook(() => useCloudBrowser());
    await settle(h, (v) => v.error !== null, "the recorded failure");

    expect(h.current.error).toEqual({
      message: "Your browser could not start. Try again in a moment.",
      retryable: true,
      requestId: "req-08fb9faf",
    });
    // A failed load is finished — never an endless "starting".
    expect(h.current.loading).toBe(false);
    await h.unmount();
  });

  it("carries the server's NOT-retryable verdict through", async () => {
    mockLoadSnapshot.mockRejectedValueOnce(refusedStart(false));
    const h = await renderHook(() => useCloudBrowser());
    await settle(h, (v) => v.error !== null, "the recorded failure");
    expect(h.current.error?.retryable).toBe(false);
    await h.unmount();
  });

  it("proves the trap is real: the old `reload` path does NOTHING here", async () => {
    // If this ever starts loading again, `retry` is no longer load-bearing and
    // the distinction below can be collapsed. Until then a Try again wired to
    // `reload` is a dead button.
    mockLoadSnapshot.mockRejectedValueOnce(refusedStart(true));
    const h = await renderHook(() => useCloudBrowser());
    await settle(h, (v) => v.error !== null, "the recorded failure");

    await h.act(() => h.current.reload());

    expect(mockLoadSnapshot).toHaveBeenCalledTimes(1);
    expect(h.current.run).toBeNull();
    await h.unmount();
  });

  it("Try again actually loads again after a first load that never set a profile", async () => {
    mockLoadSnapshot
      .mockRejectedValueOnce(refusedStart(true))
      .mockResolvedValueOnce(liveSnapshot);
    const h = await renderHook(() => useCloudBrowser());
    await settle(h, (v) => v.error !== null, "the recorded failure");
    // The trap: no profile was ever hydrated.
    expect(h.current.activeProfileId).toBeNull();

    await h.act(() => h.current.retry());
    await settle(h, (v) => v.run !== null, "the browser after retrying");

    expect(mockLoadSnapshot).toHaveBeenCalledTimes(2);
    expect(h.current.error).toBeNull();
    expect(h.current.run?.id).toBe("run-1");
    await h.unmount();
  });
});
