/**
 * 🚨 THE SAME FOREVER SKELETON, ONE HOOK OVER (R37, the fourth state).
 *
 * The census that followed the five named surfaces found `useRunsList` with the
 * identical shape its sibling `useWaitingRuns` had: `loading` starts TRUE and
 * the effect returned on a falsy organization id, so with no organization —
 * settled OR unreadable — `RunsList` held its table skeleton for as long as the
 * tab stayed open. Neither terminal answer was ever reached, which is law 4's
 * dead screen on the list of every run anyone has started.
 *
 * This drives the hook itself over the minimal fixture (`makeAppContextState`,
 * THE FIXTURE LAW). On the prior bytes `loading` stayed true in BOTH terminal
 * states and there was no `organizationState` to render.
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
  return Promise.resolve({ data: { runs: [] }, error: null });
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

jest.mock("../useRunAnnouncements", () => ({
  useRunAnnouncements: () => {},
}));

import { useRunsList } from "../useRunsList";

let seen: { loading: boolean; organizationState: string } | null = null;

function Probe() {
  const { loading, organizationState } = useRunsList();
  seen = { loading, organizationState };
  return null;
}

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Probe />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return () => {
    act(() => root.unmount());
    container.remove();
  };
}

beforeEach(() => {
  apiCalls.length = 0;
  seen = null;
});

describe("the runs list and the organization question", () => {
  it("stops the skeleton and names the failed read", async () => {
    appContext = makeAppContextState({
      orgBootstrapResolved: true,
      orgBootstrapFailure: "the organization read failed: Failed to fetch",
    });
    const unmount = await mount();
    try {
      expect(seen).toEqual({ loading: false, organizationState: "unavailable" });
      expect(apiCalls).toHaveLength(0);
    } finally {
      unmount();
    }
  });

  it("stops the skeleton when boot settled with nothing selected", async () => {
    appContext = makeAppContextState({ orgBootstrapResolved: true });
    const unmount = await mount();
    try {
      expect(seen).toEqual({ loading: false, organizationState: "required" });
      expect(apiCalls).toHaveLength(0);
    } finally {
      unmount();
    }
  });

  it("keeps the skeleton while boot is still resolving", async () => {
    appContext = makeAppContextState();
    const unmount = await mount();
    try {
      expect(seen).toEqual({ loading: true, organizationState: "resolving" });
      expect(apiCalls).toHaveLength(0);
    } finally {
      unmount();
    }
  });

  it("reads the list once an organization is selected", async () => {
    appContext = makeAppContextState({
      organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      orgBootstrapResolved: true,
    });
    const unmount = await mount();
    try {
      expect(apiCalls.length).toBeGreaterThan(0);
      expect(seen?.organizationState).toBe("ready");
    } finally {
      unmount();
    }
  });
});
