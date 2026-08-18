/** Regression for the global React #418 persisted-state hydration incident. */

import React, { useLayoutEffect } from "react";
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let descendantLayoutCommitted = false;
const boot = jest.fn(() => {
  const sawDescendantLayout = descendantLayoutCommitted;
  return Promise.resolve(sawDescendantLayout);
});

jest.mock("@/lib/redux/hooks", () => ({
  useAppStore: () => ({ _sync: { boot } }),
}));

import { SyncBootstrap } from "./SyncBootstrap";

function HydrationSentinel() {
  useLayoutEffect(() => {
    descendantLayoutCommitted = true;
  }, []);
  return <div>server and client agree</div>;
}

function Subject() {
  return (
    <>
      <SyncBootstrap />
      <HydrationSentinel />
    </>
  );
}

describe("SyncBootstrap", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    boot.mockClear();
    descendantLayoutCommitted = false;
    container = document.createElement("div");
    container.innerHTML = renderToString(<Subject />);
    document.body.appendChild(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("boots only after descendant hydration and layout work complete", async () => {
    expect(boot).not.toHaveBeenCalled();
    const recoverableErrors: unknown[] = [];

    await act(async () => {
      root = hydrateRoot(container, <Subject />, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      });
    });

    expect(boot).toHaveBeenCalledTimes(1);
    expect(await boot.mock.results[0].value).toBe(true);
    expect(recoverableErrors).toEqual([]);
  });
});
