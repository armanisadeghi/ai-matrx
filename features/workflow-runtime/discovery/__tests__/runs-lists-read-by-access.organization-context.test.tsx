/**
 * 🚨 A LIST IS DECIDED BY ACCESS, NEVER BY THE SELECTED ORGANIZATION.
 *
 * Arman, 2026-09-25: "our workflow system is nearly completely broken and I
 * can't find my workflows because it's filtering by org. For someone like me
 * who has 6 orgs, that's not a very convenient thing." Law:
 * common-docs/policies/access-belongs-to-the-person.md.
 *
 * `useRunsList` and `useWaitingRuns` used to wait for a selected organization
 * (and render "choose one" without it), then re-read every time the header's
 * organization changed. `GET /runs` and `GET /runs/waiting` answer the
 * person's runs in EVERY organization with none selected, so both hooks now
 * read on mount — selected organization or not — and never re-read because the
 * selection moved. On the prior bytes the "nothing selected" cases made ZERO
 * calls, and the "selection changed" case made a second one.
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
const apiCalls: { request: { path: string } }[] = [];

const dispatch = (action: { request: { path: string } }) => {
  apiCalls.push(action);
  return Promise.resolve({
    data: action.request.path === "/runs/waiting" ? { runs: [] } : [],
    error: null,
  });
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ appContext }),
  useAppDispatch: () => dispatch,
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: (request: unknown) => ({ type: "test/callApi", request }),
}));

jest.mock("../useRunAnnouncements", () => ({
  useRunAnnouncements: () => {},
}));

import { useRunsList } from "../useRunsList";
import { useWaitingRuns } from "../useWaitingRuns";

function Probe() {
  useRunsList();
  useWaitingRuns();
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
  return {
    rerender: async () => {
      await act(async () => {
        root.render(<Probe />);
      });
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const paths = () => apiCalls.map((c) => c.request.path).sort();

beforeEach(() => {
  apiCalls.length = 0;
});

describe("the runs lists read by access", () => {
  it("reads both lists with no organization selected", async () => {
    appContext = makeAppContextState({ orgBootstrapResolved: true });
    const m = await mount();
    try {
      expect(paths()).toEqual(["/runs", "/runs/waiting"]);
    } finally {
      m.unmount();
    }
  });

  it("reads both lists while the organization read is still resolving", async () => {
    appContext = makeAppContextState();
    const m = await mount();
    try {
      expect(paths()).toEqual(["/runs", "/runs/waiting"]);
    } finally {
      m.unmount();
    }
  });

  it("does not re-read when the selected organization changes", async () => {
    appContext = makeAppContextState({
      organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      orgBootstrapResolved: true,
    });
    const m = await mount();
    try {
      expect(apiCalls).toHaveLength(2);
      appContext = makeAppContextState({
        organization_id: "11d47e36-4b1e-46b8-bdf6-8ef928b730fb",
        orgBootstrapResolved: true,
      });
      await m.rerender();
      expect(apiCalls).toHaveLength(2);
    } finally {
      m.unmount();
    }
  });
});
