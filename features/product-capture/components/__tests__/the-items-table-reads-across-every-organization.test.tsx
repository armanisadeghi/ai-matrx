/**
 * ACCESS BY PERSON, NOT BY SELECTION (org-filter sweep F4, 2026-09-29) — on the
 * captured items table.
 *
 * The table used to read `.eq("organization_id", <selected org>)` and showed
 * "No organization is selected" until one was chosen — a person with several
 * organizations could not see their own captures. It now reads everything the
 * person can access (organization null = all), whatever the header has
 * selected — nothing, a failed organization read, or one organization — and
 * never renders an organization refusal in place of the list.
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
const reads: string[] = [];

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ appContext }),
}));

/** jsdom has no matchMedia; the breakpoint is not what this test is about. */
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

/** The reads are RECORDED and never settle — this suite is about the answer
 *  on screen, not about the table the rows would paint. */
jest.mock("../../service", () => ({
  listAllItems: () => {
    reads.push("items");
    return new Promise(() => {});
  },
  listAllFiles: () => {
    reads.push("files");
    return new Promise(() => {});
  },
  deleteItem: () => Promise.resolve(),
  closeItem: () => Promise.resolve(),
}));

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ dispatch: () => {} }),
}));
jest.mock("@/lib/redux/thunks/activeOrgBootstrap", () => ({
  retryActiveOrgBootstrap: () => ({ type: "test/retry-organization-read" }),
}));

/** The picker is a whole org-tree surface of its own; the notice owns its tests. */
jest.mock("@/features/organizations/components/OrganizationPickerPanel", () => ({
  OrganizationPickerPanel: () => <div data-organization-picker />,
}));

import { AllItemsTable } from "../AllItemsTable";

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<AllItemsTable />);
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
  reads.length = 0;
});

describe("the captured items table reads across every organization", () => {
  const cases: Array<[string, Parameters<typeof makeAppContextState>[0]]> = [
    ["no organization selected", { orgBootstrapResolved: true }],
    [
      "the organization read failed",
      {
        orgBootstrapResolved: true,
        orgBootstrapFailure: "the organization read failed: Failed to fetch",
      },
    ],
    [
      "one organization selected",
      {
        organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
        orgBootstrapResolved: true,
      },
    ],
  ];

  it.each(cases)("reads the items and shows no organization notice: %s", async (_label, state) => {
    appContext = makeAppContextState(state);
    const m = await mount();
    // The load is deferred a tick (no synchronous setState in the effect).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    try {
      expect(m.container.querySelector('[data-testid="organization-required-notice"]')).toBeNull();
      expect(m.container.querySelector('[data-testid="organization-unavailable-notice"]')).toBeNull();
      expect(m.text).not.toContain("No organization is selected");
      expect(reads).toEqual(expect.arrayContaining(["items", "files"]));
    } finally {
      m.unmount();
    }
  });
});
