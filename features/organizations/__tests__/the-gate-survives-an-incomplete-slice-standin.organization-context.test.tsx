/**
 * 🚨 THE GATE READS ITS INPUTS THROUGH PURE LEAVES — BOTH OF THEM.
 *
 * THE CLASS (owed from F-102, closed here)
 * ----------------------------------------
 * `useOrganizationRequired` is the platform's organization gate, and dozens of
 * surface suites stand the app-context slice in with a module mock carrying the
 * selectors that gate read on the day the test was written:
 *
 *   jest.mock("@/lib/redux/slices/appContextSlice", () => ({
 *     selectOrganizationId: (s) => s.appContext.organization_id,
 *   }));
 *   jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: (sel) => sel(state) }));
 *
 * A module mock replaces the module for EVERY importer. So the day the gate
 * read one more export of that slice, every one of those suites died with
 * `TypeError: selector is not a function` — surfaces that had not changed at
 * all. It happened for real on 2026-09-18 (seven suites, 25 tests, green the
 * commit before), and F-102 closed it for `orgBootstrapFailure` by moving the
 * definition into a leaf that imports nothing from the project.
 *
 * `selectShouldPromptForOrganization` was the gate's OTHER slice input and was
 * left in the slice, so the class was half closed: the stand-in above — which
 * is every stand-in written before the nudge selector existed — still broke the
 * moment its surface adopted the gate.
 *
 * WHAT THIS TEST DOES, AND WHY IT FAILS ON THE PRIOR BYTES
 * -------------------------------------------------------
 * It stands the slice in with `selectOrganizationId` ALONE and renders a
 * consumer through the real gate over the minimal fixture
 * (`makeAppContextState`, THE FIXTURE LAW, F-107). On the prior bytes the gate
 * imported `selectShouldPromptForOrganization` from the mocked slice, got
 * `undefined`, and `useAppSelector(undefined)` threw
 * `TypeError: selector is not a function` on the FIRST render — all four cases
 * red. On these bytes the nudge comes from
 * `lib/organizations/shouldPromptForOrganization.ts`, which nobody mocks, and
 * all four organization states read correctly through a stand-in that has never
 * heard of it.
 *
 * WHERE IT RUNS: under `pnpm test`, and — via the `organization-context`
 * segment in this filename — inside the `check:organization-context` gate.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

/** THE FIXTURE LAW: the slice builds its own state. Read before it is mocked. */
const { makeAppContextState } = jest.requireActual<
  typeof import("@/lib/redux/slices/appContextSlice")
>("@/lib/redux/slices/appContextSlice");

/** The state this render is over. Set per case. */
let appContext = makeAppContextState();

/**
 * THE INCOMPLETE STAND-IN, verbatim in shape: one selector, the only one a gate
 * consumer's test knew about before the nudge and the fourth state existed.
 */
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: (state: { appContext: { organization_id: string | null } }) =>
    state.appContext.organization_id,
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ appContext }),
  useAppDispatch: () => jest.fn(),
}));

const dispatched: unknown[] = [];
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    dispatch: (action: unknown) => {
      dispatched.push(action);
      return action;
    },
  }),
}));

jest.mock("@/lib/redux/thunks/activeOrgBootstrap", () => ({
  retryActiveOrgBootstrap: () => ({ type: "test/retry-organization-read" }),
}));

import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";

/** A consumer, as thin as a consumer gets: it renders what the gate says. */
function Consumer() {
  const { organizationState, retry } = useOrganizationRequired();
  return (
    <button data-testid="state" onClick={retry}>
      {organizationState}
    </button>
  );
}

function renderConsumer(): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Consumer />);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function stateShown(): string {
  const node = document.querySelector('[data-testid="state"]');
  if (!node) throw new Error("the consumer rendered nothing");
  return node.textContent ?? "";
}

describe("the organization gate survives an incomplete app-context stand-in", () => {
  beforeEach(() => {
    dispatched.length = 0;
  });

  it("renders at all — the prior bytes threw 'selector is not a function' here", () => {
    appContext = makeAppContextState({ organization_id: "org-1" });
    const { unmount } = renderConsumer();
    expect(stateShown()).toBe("ready");
    unmount();
  });

  it("still resolving before boot answers", () => {
    appContext = makeAppContextState();
    const { unmount } = renderConsumer();
    expect(stateShown()).toBe("resolving");
    unmount();
  });

  it("required once boot answered with nothing", () => {
    appContext = makeAppContextState({ orgBootstrapResolved: true });
    const { unmount } = renderConsumer();
    expect(stateShown()).toBe("required");
    unmount();
  });

  it("unavailable when the read FAILED — never the refusal (R37)", () => {
    appContext = makeAppContextState({
      orgBootstrapResolved: true,
      orgBootstrapFailure: "the organization read failed: Failed to fetch",
    });
    const { unmount } = renderConsumer();
    expect(stateShown()).toBe("unavailable");
    unmount();
  });

  it("and the retry the stand-in never knew about still presses", () => {
    appContext = makeAppContextState({
      orgBootstrapResolved: true,
      orgBootstrapFailure: "the organization read failed: Failed to fetch",
    });
    const { container, unmount } = renderConsumer();
    const button = container.querySelector("button");
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(dispatched).toEqual([{ type: "test/retry-organization-read" }]);
    unmount();
  });
});
