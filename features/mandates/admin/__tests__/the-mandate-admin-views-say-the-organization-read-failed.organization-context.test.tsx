/**
 * 🚨 THE FOURTH STATE IS NOT THE REFUSAL (R37, 2026-09-19) — on the two mandate
 * admin readers.
 *
 * `MandateReferenceBoardView` and `MandateSourceUsage` both spelled their
 * terminal answer as `!organizationId && orgBootstrapResolved`.
 * `setOrgBootstrapFailure` (lib/redux/slices/appContextSlice.ts) sets
 * `orgBootstrapResolved = true` deliberately, so that shape is ALSO true when
 * the organization read FAILED — and both screens then told a person who may
 * belong to thirteen organizations to choose one, from a picker, about
 * memberships nobody had read.
 *
 * On the prior bytes the `unavailable` case here rendered the refusal sentence
 * and no Try again; it must now render the ONE notice's failed posture, whose
 * remedy is the press.
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
  useAppDispatch: () => () => Promise.resolve({ data: null, error: null }),
}));

jest.mock("../references", () => ({
  SINGLE_SITE_SENTENCE: "one site",
  unreportedSentence: () => "unreported",
  formatRepoList: () => "",
  formatSeconds: () => "",
  costCell: () => "",
  errorRowsHref: () => "/administration",
  // The reads are RECORDED and never settle: this suite is about which
  // organization answer reaches the screen, and a settled read paints the whole
  // admin surface underneath it.
  fetchMandateReferences: () => {
    reads.push("references");
    return new Promise(() => {});
  },
  fetchMandateReferenceBoard: () => {
    reads.push("board");
    return new Promise(() => {});
  },
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

import { MandateReferenceBoardView } from "../MandateReferenceBoardView";
import { MandateSourceUsage } from "../MandateSourceUsage";

async function mount(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
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

const SURFACES: readonly [string, () => React.ReactElement][] = [
  ["the reference board", () => <MandateReferenceBoardView />],
];

beforeEach(() => {
  reads.length = 0;
});

describe.each(SURFACES)("%s and the organization question", (_name, render) => {
  it("says we could not check when the read FAILED, with Try again", async () => {
    appContext = makeAppContextState({
      orgBootstrapResolved: true,
      orgBootstrapFailure: "the organization read failed: Failed to fetch",
    });
    const m = await mount(render());
    try {
      expect(
        m.container.querySelector('[data-testid="organization-unavailable-notice"]'),
      ).not.toBeNull();
      expect(m.text).toContain("We could not check your organization");
      expect(m.text).toContain("Try again");
      // Never the refusal: nobody read this person's memberships.
      expect(
        m.container.querySelector('[data-testid="organization-required-notice"]'),
      ).toBeNull();
      expect(m.text).not.toContain("No organization is selected");
      expect(reads).toHaveLength(0);
    } finally {
      m.unmount();
    }
  });

  it("still refuses honestly when boot settled with nothing selected", async () => {
    appContext = makeAppContextState({ orgBootstrapResolved: true });
    const m = await mount(render());
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

  it("reads once an organization is selected", async () => {
    appContext = makeAppContextState({
      organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      orgBootstrapResolved: true,
    });
    const m = await mount(render());
    try {
      // Neither terminal answer is on screen, and the read actually went out.
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

// 🚨 SUPERSEDED FOR ONE KEY (Arman, 2026-09-23 — access belongs to the
// person): a key's source usage is ONE record read by key. It never waits on,
// and is never refused for, the selected organization; it used to print the
// organization notice and send nothing in both states below.
describe("a key's source usage never waits on the organization", () => {
  const usage = () => (
    <MandateSourceUsage
      mandateKey="test.key"
      fallback={{ declaration: null, importFailed: false }}
    />
  );
  it.each([
    ["boot settled with nothing selected", { orgBootstrapResolved: true }],
    [
      "the organization read FAILED",
      {
        orgBootstrapResolved: true,
        orgBootstrapFailure: "the organization read failed: Failed to fetch",
      },
    ],
  ] as const)("reads the references when %s", async (_name, state) => {
    appContext = makeAppContextState(state);
    const m = await mount(usage());
    try {
      expect(reads).toEqual(["references"]);
      expect(
        m.container.querySelector('[data-testid="organization-required-notice"]'),
      ).toBeNull();
      expect(
        m.container.querySelector('[data-testid="organization-unavailable-notice"]'),
      ).toBeNull();
    } finally {
      m.unmount();
    }
  });
});
