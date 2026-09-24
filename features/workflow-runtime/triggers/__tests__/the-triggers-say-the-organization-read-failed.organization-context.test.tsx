/**
 * 🚨 THE FOURTH STATE IS NOT THE REFUSAL (R37, 2026-09-19) — on a workflow's
 * schedules.
 *
 * `useWorkflowTriggers` derived its whole terminal answer from
 * `!organizationId && orgBootstrapResolved`. `setOrgBootstrapFailure`
 * (lib/redux/slices/appContextSlice.ts) sets `orgBootstrapResolved = true` on
 * purpose — a failed read must not hold every surface on a skeleton forever —
 * so that shape is ALSO true when the organization read FAILED, and the panel
 * told a person who may belong to thirteen organizations to go pick one. Nobody
 * had read their memberships.
 *
 * On the prior bytes the `unavailable` case here produced the refusal sentence
 * ("choose one from the organization picker in the header"); it must now say
 * plainly that we could not check.
 *
 * The fixture is `makeAppContextState` (THE FIXTURE LAW), so a field added to
 * the app context tomorrow cannot leave this suite asserting against a shape
 * the slice no longer has.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const { makeAppContextState } = jest.requireActual<
  typeof import("@/lib/redux/slices/appContextSlice")
>("@/lib/redux/slices/appContextSlice");

let appContext = makeAppContextState();
const apiCalls: unknown[] = [];

const dispatch = (action: unknown) => {
  apiCalls.push(action);
  return Promise.resolve({ data: { triggers: [] }, error: null });
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ appContext }),
  useAppDispatch: () => dispatch,
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: (request: unknown) => ({ type: "test/callApi", request }),
}));

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ dispatch: () => {} }),
}));
jest.mock("@/lib/redux/thunks/activeOrgBootstrap", () => ({
  retryActiveOrgBootstrap: () => ({ type: "test/retry-organization-read" }),
}));

import { useWorkflowTriggers } from "../useWorkflowTriggers";

type Reading = ReturnType<typeof useWorkflowTriggers>;

async function read(): Promise<{ current: Reading; unmount: () => void }> {
  const box: { current: Reading | null } = { current: null };
  function Probe() {
    box.current = useWorkflowTriggers("definition-1");
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Probe />);
  });
  return {
    get current() {
      if (!box.current) throw new Error("the probe never rendered");
      return box.current;
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => {
  apiCalls.length = 0;
});

describe("a workflow's schedules and the organization question", () => {
  // 🚨 SUPERSEDED 2026-09-23 (access belongs to the person): reading one
  // workflow's schedules never waits on, and is never refused for, the
  // selected organization. Each state below used to send NOTHING and print an
  // organization sentence; each must now send the read.
  it("reads the schedules when the organization read FAILED", async () => {
    appContext = makeAppContextState({
      orgBootstrapResolved: true,
      orgBootstrapFailure: "the organization read failed: Failed to fetch",
    });
    const probe = await read();
    try {
      expect(apiCalls).toHaveLength(1);
      expect(probe.current.loadError).toBeNull();
      expect(probe.current.loading).toBe(false);
    } finally {
      probe.unmount();
    }
  });

  it("reads the schedules when boot settled with nothing selected", async () => {
    appContext = makeAppContextState({ orgBootstrapResolved: true });
    const probe = await read();
    try {
      expect(apiCalls).toHaveLength(1);
      expect(probe.current.loadError).toBeNull();
      expect(probe.current.loading).toBe(false);
    } finally {
      probe.unmount();
    }
  });

  it("reads the schedules once an organization is selected", async () => {
    appContext = makeAppContextState({
      organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      orgBootstrapResolved: true,
    });
    const probe = await read();
    try {
      expect(probe.current.loadError).toBeNull();
      expect(apiCalls.length).toBeGreaterThan(0);
    } finally {
      probe.unmount();
    }
  });
});
