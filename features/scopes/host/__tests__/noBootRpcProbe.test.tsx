/**
 * D311 GUARD — the associations host must not invoke a single RPC on mount.
 *
 * The live defect: `AssociationsProvider` defaults to running the package's
 * `assertDemandedSchema`, which calls all 26 demanded RPCs with sentinel
 * arguments to ask whether each exists — fourteen of them WRITES. Measured on
 * `/administration/billing/spend`, that was 25 POSTs to `/rest/v1/rpc/<name>`
 * answered 400 on every single page load, ahead of the page's own reads.
 *
 * THE CLASS RULE this guard holds: a write RPC is never invoked to ask
 * whether it exists.
 *
 * The first test is the SELF-TEST that makes the second one mean something:
 * with the probe left on, this harness records the probe calls, and names
 * them. If the second test ever goes green because the recorder stopped
 * seeing calls (a mount that never happens, a dataSource that is never
 * reached), the first test goes red and says so.
 */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createAssociationsStore } from "@ai-matrx/associations/core";
import { AssociationsProvider } from "@ai-matrx/associations/react";
import { PROBE_SCHEMA_AT_BOOT } from "../associationsStore";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** RPC names the package probe invokes that WRITE when handed real arguments. */
const WRITE_RPCS = [
  "assoc_add",
  "assoc_remove",
  "assoc_set_targets",
  "assoc_remove_for_entity",
  "conversation_file_add",
  "conversation_file_remove",
  "agent_resource_add",
  "agent_resource_remove",
  "cat_create",
  "cat_update",
  "cat_reparent",
  "cat_delete",
  "ues_set",
  "ues_touch",
  "cmt_add",
  "cmt_edit",
  "cmt_delete",
];

function mountWithRecorder(probeSchema: boolean): {
  calls: string[];
  unmount: () => void;
} {
  const calls: string[] = [];
  const answer = () => Promise.resolve({ data: null, error: null });
  const store = createAssociationsStore({
    dataSource: {
      rpc: ((fn: string) => {
        calls.push(fn);
        return answer();
      }) as never,
    } as never,
    identity: {
      requireUserId: () => "00000000-0000-0000-0000-000000000001",
      ensureOrgId: async () => "00000000-0000-0000-0000-000000000002",
    },
    errorSink: () => {},
  } as never);

  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(
      <AssociationsProvider store={store} probeSchema={probeSchema}>
        {"ready" as unknown as ReactNode}
      </AssociationsProvider>,
    );
  });
  return {
    calls,
    unmount: () => {
      act(() => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("D311 — no RPC probe on associations host mount", () => {
  it("SELF-TEST: with the probe ON the recorder sees the write RPCs fire", async () => {
    const mounted = mountWithRecorder(true);
    await settle();
    const fired = mounted.calls.filter((fn) => WRITE_RPCS.includes(fn));
    mounted.unmount();
    // Without this the next test could pass for the wrong reason.
    expect(fired.length).toBeGreaterThan(0);
  });

  it("ships with the probe OFF: mounting invokes ZERO RPCs", async () => {
    expect(PROBE_SCHEMA_AT_BOOT).toBe(false);
    const mounted = mountWithRecorder(PROBE_SCHEMA_AT_BOOT);
    await settle();
    const { calls } = mounted;
    mounted.unmount();
    expect(calls).toEqual([]);
  });
});
