/**
 * READING ONE THING NEVER WAITS ON THE SELECTED ORGANIZATION (Arman,
 * 2026-09-23 — common-docs/policies/access-belongs-to-the-person.md §4, §7.4).
 *
 * A workflow's run form, what it makes, and what a job asks for are each read
 * by id; the server checks the PERSON's access and never the selection, and
 * callApi sends a GET with no organization after its bounded restore wait
 * (0dff44c631). These hooks still returned early on a missing organization,
 * so /workflows/<id> and /mandates/<key> printed "choose an organization"
 * instead of the thing. Each case asserts the read LEFT (the dispatched
 * callApi), and that no organization sentence stands in for it.
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
const paths: string[] = [];

const dispatch = (action: { request?: { path?: string } }) => {
  if (action?.request?.path) paths.push(action.request.path);
  return Promise.resolve({ data: {}, error: null });
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

import { useServedRunForm } from "../served-form/useServedRunForm";
import { useResultSchema } from "../kind-emissions/useResultSchema";
import { useMandateInputSurface } from "@/features/mandates/input-surface";

async function mount(useHook: () => unknown): Promise<{
  current: unknown;
  unmount: () => void;
}> {
  const box: { current: unknown } = { current: undefined };
  function Probe() {
    box.current = useHook();
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
      return box.current;
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const NO_ORGANIZATION_STATES = {
  "boot settled with nothing selected": { orgBootstrapResolved: true },
  "the organization read FAILED": {
    orgBootstrapResolved: true,
    orgBootstrapFailure: "the organization read failed: Failed to fetch",
  },
} as const;

const READERS = {
  "a workflow's run form": {
    use: () => useServedRunForm("definition-1"),
    path: "/workflows/{definition_id}/run-form",
  },
  "what a workflow makes": {
    use: () => useResultSchema("definition-1"),
    path: "/workflows/{definition_id}/result-schema",
  },
  "what a job asks for": {
    use: () => useMandateInputSurface("content.brief"),
    path: "/mandates/{mandate_key}/input-surface",
  },
} as const;

beforeEach(() => {
  paths.length = 0;
});

describe("reading one thing never waits on the selected organization", () => {
  for (const [stateName, state] of Object.entries(NO_ORGANIZATION_STATES)) {
    for (const [readerName, reader] of Object.entries(READERS)) {
      it(`${readerName} is read when ${stateName}`, async () => {
        appContext = makeAppContextState(state);
        const probe = await mount(reader.use);
        try {
          expect(paths).toContain(reader.path);
          expect(JSON.stringify(probe.current ?? null)).not.toMatch(
            /organization/i,
          );
        } finally {
          probe.unmount();
        }
      });
    }
  }
});
