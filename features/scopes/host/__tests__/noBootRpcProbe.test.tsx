/**
 * D311 GUARD — mounting this app's associations provider must not issue a
 * single RPC.
 *
 * The live defect: `AssociationsProvider` ran the package's
 * `assertDemandedSchema` on mount, which established whether each of the 26
 * demanded RPCs existed by CALLING it with sentinel arguments — fourteen of
 * them WRITES. Measured on `/administration/billing/spend`: 25 POSTs to
 * `/rest/v1/rpc/<name>` answered 400 on every page load, ahead of the page's
 * own reads. THE CLASS RULE: a write RPC is never invoked to ask whether it
 * exists.
 *
 * @ai-matrx/associations 0.9.0 deleted the probe and its `probeSchema` knob,
 * so the class is closed for every consumer. This guard stays because it is
 * THIS app's contract with the package across upgrades: the provider we mount
 * is inert, whatever a future version decides to do on mount. It is written
 * against the package's public surface — no knob to set, nothing to restate.
 *
 * The first test is the SELF-TEST that makes the second mean something: it
 * proves the recorder sees an RPC when one is actually made, so a green "zero
 * calls" can never come from a recorder that was never reached.
 */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createAssociationsStore,
  type AssociationsStore,
} from "@ai-matrx/associations/core";
import { AssociationsProvider } from "@ai-matrx/associations/react";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function makeStore(): { store: AssociationsStore; calls: string[] } {
  const calls: string[] = [];
  const store = createAssociationsStore({
    dataSource: {
      rpc: ((fn: string) => {
        calls.push(fn);
        return Promise.resolve({ data: null, error: null });
      }) as never,
    } as never,
    identity: {
      requireUserId: () => "00000000-0000-0000-0000-000000000001",
      ensureOrgId: async () => "00000000-0000-0000-0000-000000000002",
    },
    errorSink: () => {},
  } as never);
  return { store, calls };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("D311 — the associations provider mount is inert", () => {
  it("SELF-TEST: the recorder sees an RPC when one is actually made", async () => {
    const { store, calls } = makeStore();
    await store.services.categories.list();
    expect(calls.length).toBeGreaterThan(0);
  });

  it("mounting AssociationsProvider invokes ZERO RPCs", async () => {
    const { store, calls } = makeStore();
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root | null = null;
    act(() => {
      root = createRoot(container);
      root.render(
        <AssociationsProvider store={store}>
          {"ready" as unknown as ReactNode}
        </AssociationsProvider>,
      );
    });
    await settle();
    act(() => {
      root?.unmount();
    });
    container.remove();
    expect(calls).toEqual([]);
  });
});
