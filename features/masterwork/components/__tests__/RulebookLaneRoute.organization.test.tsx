/**
 * THE PERSON, NOT THE ORG (Arman, 2026-09-23) — A LANE NEVER MOVES THE
 * PERSON'S WORKING ORGANIZATION, AND OFFERS THE SWITCH INSTEAD.
 *
 * What was live: `useAdoptRecordOrganization` (wall W3, 2026-09-10) wrote the
 * Rulebook's organization into the GLOBAL selection whenever none was selected,
 * so merely opening a Rulebook silently changed the organization every other
 * page in the app worked in. And the lane held its body behind "Getting your
 * workspace ready…" until it did.
 *
 * The law: the lane opens whatever is selected (or nothing), never writes the
 * selection, and when the Rulebook lives elsewhere it says so with a one-click
 * "Switch to <org>" (`RecordOrganizationSwitchOffer`). Only transport is
 * stubbed: the Rulebook read, the memberships read, and the presentational
 * shell.
 *
 * Run it against the pre-fix `RulebookLaneRoute` and the first test fails at
 * `appContext.organization_id` — it becomes the Rulebook's, which is the defect.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

import { makeStore } from "@/lib/redux/store";
import { RulebookLaneRoute } from "../RulebookLaneRoute";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const RULEBOOK_ID = "33333333-3333-4333-8333-333333333333";
const ORG_ID = "44444444-4444-4444-8444-444444444444";

const getRulebook = jest.fn();
const getOrganization = jest.fn();
const toastInfo = jest.fn();
let memberships: { id: string; name: string }[] = [];

jest.mock("../../service", () => ({
  getRulebook: (...args: unknown[]) => getRulebook(...args),
  listMasterworksForRulebook: () => Promise.resolve([]),
}));

jest.mock("@/features/organizations/service", () => ({
  getOrganization: (...args: unknown[]) => getOrganization(...args),
}));

jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({ organizations: memberships }),
}));

jest.mock("@/lib/toast", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    error: jest.fn(),
    success: jest.fn(),
  },
}));

// Presentational shell only — the header portal and the tap-target button have
// nothing to do with which workspace the lane works in.
jest.mock("@/features/shell/components/header/RouteHeader", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@ai-matrx/tap-target/buttons", () => ({
  ChevronLeftTapButton: () => null,
}));
jest.mock("@/features/access-gate/components/AccessGate", () => ({
  AccessGate: () => <div>access gate</div>,
}));
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useSurfaceClientTools: () => undefined,
  useSurfaceWriteHandlers: () => undefined,
}));

let container: HTMLDivElement;
let root: Root;
let store: ReturnType<typeof makeStore>;

beforeEach(() => {
  jest.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  store = makeStore();
  getRulebook.mockReset();
  getOrganization.mockReset();
  toastInfo.mockReset();
  memberships = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function rulebookRow(organizationId: string | null) {
  return {
    id: RULEBOOK_ID,
    name: "Verification Handbook",
    organization_id: organizationId,
    created_by: "55555555-5555-4555-8555-555555555555",
    version: 1,
    rules: [],
    sections: {},
    source: {},
  };
}

async function renderLane() {
  await act(async () => {
    root.render(
      <Provider store={store}>
        <RulebookLaneRoute rulebookId={RULEBOOK_ID} lane="conduct" title="Build">
          {() => <div>lane body</div>}
        </RulebookLaneRoute>
      </Provider>,
    );
  });
  // Drive the clock past any bounded wait and let the reads settle, so a
  // late write to the selection would be caught.
  await act(async () => {
    jest.advanceTimersByTime(2_000);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

it("never writes the Rulebook's organization into the selection when none is selected — it offers the switch", async () => {
  getRulebook.mockResolvedValue(rulebookRow(ORG_ID));
  memberships = [{ id: ORG_ID, name: "Newsroom Desk" }];

  expect(store.getState().appContext.organization_id).toBeNull();

  await renderLane();

  expect(store.getState().appContext.organization_id).toBeNull();
  expect(toastInfo).not.toHaveBeenCalled();
  // The lane opens at once — no "Getting your workspace ready…" hold.
  expect(container.textContent).toContain("lane body");
  expect(container.textContent).toContain("This Rulebook is in Newsroom Desk");

  // The switch is the person's own click, and it is exactly one.
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Switch to Newsroom Desk"),
  );
  expect(button).toBeDefined();
  act(() => button!.click());
  expect(store.getState().appContext.organization_id).toBe(ORG_ID);
});

it("never overwrites a workspace the Expert actively chose, and names where the Rulebook lives", async () => {
  const chosen = "66666666-6666-4666-8666-666666666666";
  act(() => {
    store.dispatch({
      type: "appContext/setOrganization",
      payload: { id: chosen, name: "My Own Desk" },
    });
  });
  getRulebook.mockResolvedValue(rulebookRow(ORG_ID));
  memberships = [
    { id: ORG_ID, name: "Newsroom Desk" },
    { id: chosen, name: "My Own Desk" },
  ];

  await renderLane();

  expect(store.getState().appContext.organization_id).toBe(chosen);
  expect(toastInfo).not.toHaveBeenCalled();
  expect(container.textContent).toContain("lane body");
  expect(container.textContent).toContain("not the organization you are working in");
});

it("CONTROL: no offer when the Rulebook is already in the selected organization", async () => {
  act(() => {
    store.dispatch({
      type: "appContext/setOrganization",
      payload: { id: ORG_ID, name: "Newsroom Desk" },
    });
  });
  getRulebook.mockResolvedValue(rulebookRow(ORG_ID));
  memberships = [{ id: ORG_ID, name: "Newsroom Desk" }];

  await renderLane();

  expect(container.textContent).toContain("lane body");
  expect(container.textContent).not.toContain("Switch to");
});

it("opens a Rulebook from an organization the person is not a member of, with no offer", async () => {
  getRulebook.mockResolvedValue(rulebookRow(ORG_ID));
  memberships = [];

  await renderLane();

  expect(store.getState().appContext.organization_id).toBeNull();
  expect(container.textContent).toContain("lane body");
  expect(container.textContent).not.toContain("Switch to");
});
