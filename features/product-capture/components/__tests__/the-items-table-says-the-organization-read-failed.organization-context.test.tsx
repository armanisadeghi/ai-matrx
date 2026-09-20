/**
 * 🚨 THE FOURTH STATE IS NOT THE REFUSAL (R37, 2026-09-19) — on the captured
 * items table.
 *
 * `AllItemsTable` spelled its terminal answer as `!organizationId &&
 * orgBootstrapResolved`. `setOrgBootstrapFailure` (lib/redux/slices/
 * appContextSlice.ts) sets `orgBootstrapResolved = true` on purpose, so that
 * shape is ALSO true when the organization read FAILED — and the table then
 * told a person who may belong to thirteen organizations to choose one, about
 * memberships nobody read.
 *
 * On the prior bytes the `unavailable` case rendered "No organization is
 * selected… choose one from the organization picker"; it must now render the
 * ONE notice's failed posture, whose remedy is the press.
 *
 * The fixture is `makeAppContextState` (THE FIXTURE LAW).
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

describe("the captured items table and the organization question", () => {
  it("says we could not check when the read FAILED, with Try again", async () => {
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
      expect(m.text).toContain("Try again");
      expect(m.text).not.toContain("No organization is selected");
      expect(reads).toHaveLength(0);
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
      expect(m.text).toContain("No organization is selected");
      expect(reads).toHaveLength(0);
    } finally {
      m.unmount();
    }
  });

  it("reads the items once an organization is selected", async () => {
    appContext = makeAppContextState({
      organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      orgBootstrapResolved: true,
    });
    const m = await mount();
    try {
      expect(
        m.container.querySelector('[data-testid="organization-unavailable-notice"]'),
      ).toBeNull();
      expect(
        m.container.querySelector('[data-testid="organization-required-notice"]'),
      ).toBeNull();
      expect(reads.length).toBeGreaterThan(0);
    } finally {
      m.unmount();
    }
  });
});
