/**
 * test-utils/renderHook.tsx
 *
 * A ~40-line hook harness over `react-dom/client` + React 19's built-in `act`.
 *
 * Why not @testing-library/react: it is not a dependency of this repo, and the
 * only thing our hook suites need is "render a hook, read its result, call one
 * of its callbacks inside act()". Adding a testing framework to get three
 * functions is the kind of layer the Prime Rule exists to stop. If a suite ever
 * needs queries, events, or component trees, install the real library then —
 * this file is deliberately not a reimplementation of one.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// React refuses to run `act` without this flag and warns on every update.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

export interface HookHandle<T> {
  /** The hook's most recent return value. */
  readonly current: T;
  /** Run `fn` (usually one of the hook's callbacks) inside `act`. */
  act: (fn: () => void | Promise<void>) => Promise<void>;
  unmount: () => Promise<void>;
}

export async function renderHook<T>(hook: () => T): Promise<HookHandle<T>> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  let latest!: T;

  function Probe(): null {
    latest = hook();
    return null;
  }

  await act(async () => {
    root = createRoot(container);
    root.render(<Probe />);
  });

  return {
    get current() {
      return latest;
    },
    async act(fn) {
      await act(async () => {
        await fn();
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** Re-render until `predicate` holds, or fail loudly. Async hook loads settle here. */
export async function settle<T>(
  handle: HookHandle<T>,
  predicate: (value: T) => boolean,
  label = "condition",
): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if (predicate(handle.current)) return;
    await handle.act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  throw new Error(`renderHook: timed out waiting for ${label}`);
}
