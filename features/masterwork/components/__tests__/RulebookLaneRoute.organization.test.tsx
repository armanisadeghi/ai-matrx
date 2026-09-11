/**
 * WALL W3 (Expert Book Challenge, 2026-09-10) — A LANE ADOPTS ITS RECORD'S
 * WORKSPACE.
 *
 * What was live: after a reload of any `/masterwork/[id]/<lane>` route, every
 * action died with the toast "Select an organization before sending this
 * request." The Rulebook row carries `organization_id`; the page never adopted
 * it, and the picker lives behind a switch in the avatar menu a first-time
 * Expert has never seen.
 *
 * This suite drives the REAL store and the REAL adoption primitive
 * (`features/organizations/useAdoptRecordOrganization`). Only transport is
 * stubbed: the two Supabase reads (the Rulebook, the organization row) and the
 * presentational shell the lane renders its header into.
 *
 * Run it against the pre-fix `RulebookLaneRoute` and the first test fails at
 * `appContext.organization_id` — it stays null, which is the defect.
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

jest.mock("../../service", () => ({
  getRulebook: (...args: unknown[]) => getRulebook(...args),
  listMasterworksForRulebook: () => Promise.resolve([]),
}));

jest.mock("@/features/organizations/service", () => ({
  getOrganization: (...args: unknown[]) => getOrganization(...args),
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
  // The adoption primitive gives a real restore a bounded head start before it
  // adopts (ADOPTION_WAIT_MS). Nothing is restoring in this store, so drive the
  // clock past it and let the organization read settle.
  await act(async () => {
    jest.advanceTimersByTime(2_000);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

it("adopts the Rulebook's own organization when the Expert has none selected", async () => {
  getRulebook.mockResolvedValue(rulebookRow(ORG_ID));
  getOrganization.mockResolvedValue({ id: ORG_ID, name: "Newsroom Desk" });

  expect(store.getState().appContext.organization_id).toBeNull();

  await renderLane();

  expect(getOrganization).toHaveBeenCalledWith(ORG_ID);
  expect(store.getState().appContext.organization_id).toBe(ORG_ID);
  expect(store.getState().appContext.organization_name).toBe("Newsroom Desk");
  // IT ANNOUNCES ITSELF — a silent context switch is the banned behaviour.
  expect(toastInfo).toHaveBeenCalled();
  expect(String(toastInfo.mock.calls[0][0])).toContain("Newsroom Desk");
  expect(container.textContent).toContain("lane body");
});

it("never overwrites a workspace the Expert actively chose", async () => {
  const chosen = "66666666-6666-4666-8666-666666666666";
  act(() => {
    store.dispatch({
      type: "appContext/setOrganization",
      payload: { id: chosen, name: "My Own Desk" },
    });
  });
  getRulebook.mockResolvedValue(rulebookRow(ORG_ID));
  getOrganization.mockResolvedValue({ id: ORG_ID, name: "Newsroom Desk" });

  await renderLane();

  expect(store.getState().appContext.organization_id).toBe(chosen);
  expect(getOrganization).not.toHaveBeenCalled();
  expect(toastInfo).not.toHaveBeenCalled();
  expect(container.textContent).toContain("lane body");
});

it("refuses to adopt an organization this user cannot read, and still renders", async () => {
  getRulebook.mockResolvedValue(rulebookRow(ORG_ID));
  // RLS-scoped to members: an unreadable row IS "not your workspace".
  getOrganization.mockResolvedValue(null);

  await renderLane();

  expect(store.getState().appContext.organization_id).toBeNull();
  expect(toastInfo).not.toHaveBeenCalled();
  expect(container.textContent).toContain("lane body");
});
