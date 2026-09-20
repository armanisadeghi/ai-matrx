/**
 * 🚨 THE FOREVER SKELETON UNDER A FAILED ORGANIZATION READ (R37, the fourth
 * state) — on the "waiting on you" inbox.
 *
 * `useWaitingRuns` gated on the boolean pair `canLoad` / `organizationRequired`,
 * and under a FAILED organization read both readings point at "keep waiting":
 * `organizationRequired` is false, because "select an organization" is a claim
 * about memberships and nobody managed to read them, and `canLoad` is false
 * because there is no organization to send. So the effect returned without ever
 * calling `setLoading(false)`, and `WaitingInbox` held three pulsing skeleton
 * rows for as long as the tab stayed open — a screen that never resolves, which
 * is law 4's dead screen, on the ONE surface that exists to say what is waiting
 * on you.
 *
 * The fix is the four-state reading: the hook forwards `organizationState`, the
 * inbox hands it to the ONE notice, and the failed read gets its own honest
 * screen with Try again instead of a skeleton or a refusal nobody verified.
 *
 * This mounts the real inbox with the real gate over the minimal fixture
 * (`makeAppContextState`, THE FIXTURE LAW). On the prior bytes the `required`
 * case passed and every `unavailable` assertion here failed: skeletons, no
 * notice.
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

/**
 * ONE dispatch identity for the whole suite. A fresh function per render would
 * re-run the projection effect on every render forever — a defect in the test,
 * not the surface.
 */
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

/**
 * The picker inside the terminal refusal is a whole org-tree surface of its own
 * and is not what this test is about — the notice's own tests cover it.
 */
jest.mock("@/features/organizations/components/OrganizationPickerPanel", () => ({
  OrganizationPickerPanel: () => <div data-organization-picker />,
}));

/** The live channel is not what this test is about. */
jest.mock("../useRunAnnouncements", () => ({
  useRunAnnouncements: () => {},
}));

import { WaitingInbox } from "../components/WaitingInbox";

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<WaitingInbox />);
  });
  return {
    container,
    get text() {
      return container.textContent ?? "";
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

describe("the waiting inbox and the organization question", () => {
  it("says we could not check when the read FAILED — no skeleton, no refusal", async () => {
    appContext = makeAppContextState({
      orgBootstrapResolved: true,
      orgBootstrapFailure: "the organization read failed: Failed to fetch",
    });
    const m = await mount();
    try {
      expect(
        m.container.querySelector('[data-testid="organization-unavailable-notice"]'),
      ).not.toBeNull();
      expect(m.text).toContain("We could not check your organization");
      // Not the refusal — nobody read this person's memberships.
      expect(
        m.container.querySelector('[data-testid="organization-required-notice"]'),
      ).toBeNull();
      // And not the skeleton that used to sit there forever.
      expect(m.container.querySelector('[aria-busy="true"] li')).toBeNull();
      // Nothing was asked of a transport that would have refused anyway.
      expect(apiCalls).toHaveLength(0);
    } finally {
      m.unmount();
    }
  });

  it("still refuses honestly when boot settled with nothing selected", async () => {
    appContext = makeAppContextState({ orgBootstrapResolved: true });
    const m = await mount();
    try {
      expect(
        m.container.querySelector('[data-testid="organization-required-notice"]'),
      ).not.toBeNull();
      expect(apiCalls).toHaveLength(0);
    } finally {
      m.unmount();
    }
  });

  it("reads the projection once an organization is selected", async () => {
    appContext = makeAppContextState({
      organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      orgBootstrapResolved: true,
    });
    const m = await mount();
    try {
      expect(
        m.container.querySelector('[data-testid="organization-unavailable-notice"]'),
      ).toBeNull();
      expect(apiCalls.length).toBeGreaterThan(0);
    } finally {
      m.unmount();
    }
  });
});
