/**
 * useSyncHydrated — the backstop measures the ENGINE, not the page load (D345).
 *
 * SyncBootstrap defers boot on purpose (window load + idle). The 8s backstop
 * used to count from first render, so a slow page load fired a red "defect in
 * the sync engine's boot path" while the engine had not even been asked to run.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let started = false;
let settled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const fakeStore = {
  _sync: {
    hydrationSettled: () => settled,
    bootStarted: () => started,
    onHydrationSettledChange: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  },
};

jest.mock("@/lib/redux/hooks", () => ({ useAppStore: () => fakeStore }));

import { HYDRATION_BACKSTOP_MS, useSyncHydrated } from "../useSyncHydrated";

let seen: boolean[] = [];
function Probe() {
  seen.push(useSyncHydrated());
  return null;
}

describe("useSyncHydrated backstop", () => {
  let container: HTMLDivElement;
  let root: Root;
  let error: jest.SpyInstance;

  beforeEach(async () => {
    jest.useFakeTimers();
    started = false;
    settled = false;
    listeners.clear();
    seen = [];
    error = jest.spyOn(console, "error").mockImplementation(() => {});
    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root.render(<Probe />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    error.mockRestore();
    jest.useRealTimers();
  });

  it("does not fire while boot is deliberately deferred", async () => {
    await act(async () => {
      jest.advanceTimersByTime(HYDRATION_BACKSTOP_MS * 3);
    });
    expect(error).not.toHaveBeenCalled();
    expect(seen.at(-1)).toBe(false);
  });

  it("settles without error when boot finishes after a long deferral", async () => {
    await act(async () => {
      jest.advanceTimersByTime(HYDRATION_BACKSTOP_MS * 2);
      started = true;
      notify();
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
      settled = true;
      notify();
    });
    await act(async () => {
      jest.advanceTimersByTime(HYDRATION_BACKSTOP_MS);
    });
    expect(error).not.toHaveBeenCalled();
    expect(seen.at(-1)).toBe(true);
  });

  it("screams and settles when the engine stalls after boot starts", async () => {
    await act(async () => {
      started = true;
      notify();
    });
    await act(async () => {
      jest.advanceTimersByTime(HYDRATION_BACKSTOP_MS);
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("persisted hydration did not settle"),
    );
    expect(seen.at(-1)).toBe(true);
  });
});
