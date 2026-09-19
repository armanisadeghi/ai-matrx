/**
 * 🚨 THE FOREVER SKELETON UNDER A FAILED ORGANIZATION READ (R37, the fourth
 * state) — on the Encore page's bench-proof panel.
 *
 * The page gated on the boolean pair `organizationRequired` / the legacy
 * `resolving`, in this shape:
 *
 *   if (organizationRequired) { setBench(ORGANIZATION_REQUIRED); return; }
 *   setBench({ status: "loading" });
 *   if (resolving) return;            // still booting — the honest skeleton
 *
 * Under a FAILED organization read `organizationRequired` is false (the nudge
 * is a claim about memberships nobody read) and the legacy `resolving` stays
 * true by design, so the bench panel held `{ status: "loading" }` for as long
 * as the page was open. The admin who had started the trial watched a skeleton
 * that would never resolve — law 4's dead screen, on the panel that exists to
 * say whether her proof is there.
 *
 * The fix is the four-state reading: `organizationState` names the failed read
 * and it gets its own sentence, `ORGANIZATION_UNAVAILABLE`, which says picking
 * an organization is NOT the remedy and names the one this panel offers.
 *
 * On the prior bytes the `unavailable` case here rendered "loading" and no
 * sentence at all.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { makeAppContextState } = jest.requireActual<
  typeof import("@/lib/redux/slices/appContextSlice")
>("@/lib/redux/slices/appContextSlice");

let appContext = makeAppContextState();
let benchReads = 0;

// ── The network, and only the network ──────────────────────────────────────
jest.mock("../service", () => ({
  getEncoreMasterwork: async () => ({
    id: "d8dfbd2f-169c-468e-a892-c0980e7ddd45",
    name: "A released Masterwork",
    masterwork_kind: "generate",
    submit_label: "Run it",
    deliverable: "Something useful.",
    rule_count: 3,
    released_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
    rulebook: { id: "11111111-1111-4111-8111-111111111111" },
    auditionScore: null,
    auditionVerdict: null,
    auditionedAt: null,
  }),
  listMyEncoreRuns: async () => [],
  setMasterworkReleased: async () => ({}),
}));

/** The REAL sentences — only the server read is stood in. */
jest.mock("../benchProof", () => {
  const actual = jest.requireActual("../benchProof");
  return {
    ...actual,
    getBenchProof: async () => {
      benchReads += 1;
      return actual.UNAVAILABLE;
    },
  };
});

// ── The page's heavy neighbours, which are not this suite's subject ─────────
jest.mock("../../components/masterworks/TryMasterworkBox", () => ({
  TryMasterworkBox: () => null,
}));
jest.mock("../../review/ExpertSignOff", () => ({ ExpertSignOff: () => null }));
jest.mock("../RunTheBench", () => ({ RunTheBench: () => null }));
/** The bench panel, stood in so the STATE it is handed can be read directly. */
jest.mock("../AuditionProof", () => ({
  AuditionProof: ({ bench }: { bench: { status: string; headline?: string } }) => (
    <div data-bench-status={bench.status}>{bench.headline ?? bench.status}</div>
  ),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ appContext, userAuth: { id: "user-1" } }),
  useAppDispatch: () => () => undefined,
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "user-1",
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ dispatch: () => {} }),
}));
jest.mock("@/lib/redux/thunks/activeOrgBootstrap", () => ({
  retryActiveOrgBootstrap: () => ({ type: "test/retry-organization-read" }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EncoreRunPage } = require("../EncoreRunPage") as {
  EncoreRunPage: (props: { masterworkId: string }) => React.ReactElement;
};

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <EncoreRunPage masterworkId="d8dfbd2f-169c-468e-a892-c0980e7ddd45" />,
    );
  });
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const text = () => (document.body.textContent ?? "").replace(/\s+/g, " ");

beforeEach(() => {
  benchReads = 0;
});

afterEach(() => {
  if (!root) return;
  act(() => root.unmount());
  container.remove();
});

describe("the Encore bench panel and the organization question", () => {
  it("says we could not check when the read FAILED — never the loading state forever", async () => {
    appContext = makeAppContextState({
      orgBootstrapResolved: true,
      orgBootstrapFailure: "the organization read failed: Failed to fetch",
    });
    await mount();
    expect(text()).toContain("we could not check your organization");
    // Not the refusal — nobody read this person's memberships.
    expect(text()).not.toContain("no organization selected");
    // Not the skeleton that used to sit there forever.
    expect(
      document.querySelector('[data-bench-status="unavailable"]'),
    ).not.toBeNull();
    expect(benchReads).toBe(0);
  });

  it("still refuses honestly when boot settled with nothing selected", async () => {
    appContext = makeAppContextState({ orgBootstrapResolved: true });
    await mount();
    expect(text()).toContain("no organization selected");
    expect(benchReads).toBe(0);
  });

  it("reads the proof once an organization is selected", async () => {
    appContext = makeAppContextState({
      organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      orgBootstrapResolved: true,
    });
    await mount();
    expect(benchReads).toBeGreaterThan(0);
  });
});
