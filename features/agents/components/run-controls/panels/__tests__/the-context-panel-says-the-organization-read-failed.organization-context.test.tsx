/**
 * 🚨 THE FOREVER SKELETON UNDER A FAILED ORGANIZATION READ (R37, the fourth
 * state) — on the Model Context panel.
 *
 * The panel gated on the boolean pair `canLoad` / `organizationRequired` plus
 * the legacy `resolving`, and under a FAILED organization read all three point
 * at "keep waiting": `organizationRequired` is false (the nudge is a claim
 * about memberships nobody read), `canLoad` is false, and the legacy `resolving`
 * stays true by design. So `fetchContextState` was never dispatched and the
 * panel showed "Reading this conversation's context…" for as long as the tab
 * stayed open — a skeleton that never resolves (law 4), in the very file whose
 * comment block is about not showing the calm lie.
 *
 * The fix is the four-state reading: `organizationState` names the failed read,
 * and the ONE notice says "We could not check your organization" with Try again.
 *
 * On the prior bytes the `unavailable` case rendered "Reading this
 * conversation's context…" and no notice at all.
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
const dispatched: unknown[] = [];

const dispatch = (action: unknown) => {
  dispatched.push(action);
  return action;
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ appContext }),
  useAppDispatch: () => dispatch,
}));

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ dispatch: () => {} }),
}));
jest.mock("@/lib/redux/thunks/activeOrgBootstrap", () => ({
  retryActiveOrgBootstrap: () => ({ type: "test/retry-organization-read" }),
}));

/** No context snapshot exists — the state every branch under test starts from. */
jest.mock(
  "@/features/agents/redux/execution-system/context-state/context-state.selectors",
  () => ({
    selectContextState: () => () => null,
    selectEstimatedTokens: () => () => 0,
    selectContextFillRatio: () => () => 0,
    selectCacheLikelyAlive: () => () => false,
    selectCacheSecondsRemaining: () => () => 0,
    selectLastTrimSummary: () => () => null,
    selectLastRawUsage: () => () => null,
    DEFAULT_CONTEXT_WINDOW_TOKENS: 200000,
  }),
);

jest.mock("@/lib/api/context-api", () => ({
  fetchContextState: (args: unknown) => ({ type: "test/fetchContextState", args }),
}));

/** The picker inside the terminal refusal is its own surface, tested elsewhere. */
jest.mock("@/features/organizations/components/OrganizationPickerPanel", () => ({
  OrganizationPickerPanel: () => <div data-organization-picker />,
}));

import { ModelContextPanel } from "../ModelContextPanel";

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ModelContextPanel conversationId="conversation-1" />);
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
  dispatched.length = 0;
});

describe("the model context panel and the organization question", () => {
  it("says we could not check when the read FAILED — never 'Reading…' forever", () => {
    appContext = makeAppContextState({
      orgBootstrapResolved: true,
      orgBootstrapFailure: "the organization read failed: Failed to fetch",
    });
    const m = mount();
    try {
      expect(
        m.container.querySelector('[data-testid="organization-unavailable-notice"]'),
      ).not.toBeNull();
      expect(m.text).toContain("We could not check your organization");
      expect(m.text).not.toContain("Reading this conversation's context");
      // Not the refusal, and not the calm lie either.
      expect(
        m.container.querySelector('[data-testid="organization-required-notice"]'),
      ).toBeNull();
      expect(m.text).not.toContain("No context measurements yet");
      expect(dispatched).toHaveLength(0);
    } finally {
      m.unmount();
    }
  });

  it("keeps the checking posture while boot is still resolving", () => {
    appContext = makeAppContextState();
    const m = mount();
    try {
      expect(m.text).toContain("Reading this conversation's context");
      expect(dispatched).toHaveLength(0);
    } finally {
      m.unmount();
    }
  });

  it("still refuses honestly when boot settled with nothing selected", () => {
    appContext = makeAppContextState({ orgBootstrapResolved: true });
    const m = mount();
    try {
      expect(
        m.container.querySelector('[data-testid="organization-required-notice"]'),
      ).not.toBeNull();
      expect(dispatched).toHaveLength(0);
    } finally {
      m.unmount();
    }
  });

  it("hydrates the snapshot once an organization is selected", () => {
    appContext = makeAppContextState({
      organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      orgBootstrapResolved: true,
    });
    const m = mount();
    try {
      expect(dispatched).toHaveLength(1);
      expect(m.text).toContain("No context measurements yet");
    } finally {
      m.unmount();
    }
  });
});
