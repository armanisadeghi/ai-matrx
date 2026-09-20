/**
 * 🚨 WALK 14, DEFECT A — `/masterwork/encore/<id>?run=<runId>` RENDERED NOTHING.
 *
 * Walk 13's N10 replaced the developer door (`/workflows/runs/<id>`) with an
 * in-app address. The address landed and nothing else did: `EncoreRunPage`
 * grew `useSearchParams().get("run")`, the `getEncoreRunResult` fetch and a
 * loading/ready state — and NO JSX that consumed any of it. Walk 14 measured
 * the real page: `main` innerText identical before and after the click, zero
 * dialogs, no deliverable and no sentence. A dead click on the Expert's own
 * result.
 *
 * The guard that was supposed to catch this
 * (`every-surface-resolves-a-cited-rule.test.tsx`) only asserted the HREF
 * STRING appears in the source. A source grep cannot see an unrendered state,
 * which is why it stayed green through the whole defect. So this suite renders
 * the REAL page component through the REAL route entry — the search param —
 * and reads what a person would read.
 *
 * ## The fixture is the real run
 *
 * `workflow.run 40aa2317-8116-4bf9-9064-5d97e48320c8` of Masterwork
 * `ca0d2bd2-6be4-483a-bf3a-6a54c0d70935`, read read-only on 2026-09-20: its
 * `show` node settled with `__kind: "masterwork_result"` (8,841 bytes). Only
 * the network is stood in; the render path, the kind component route and every
 * sentence below are the product's own.
 *
 * ## PROVEN FAILING FIRST
 *   · delete the `<OpenRunPanel …>` block from `EncoreRunPage`
 *       → all four legs redden ("the ruling is on the page", "a reload of the
 *         address shows it", "kept-nothing says so", "a refused read says so")
 *   · collapse `getEncoreRunResult` back to a nullable payload so the panel
 *     cannot tell "unreadable" from "kept nothing"
 *       → the two honest-sentence legs redden
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const MASTERWORK_ID = "ca0d2bd2-6be4-483a-bf3a-6a54c0d70935";
const RUN_ID = "40aa2317-8116-4bf9-9064-5d97e48320c8";
const RULEBOOK_ID = "2fba365b-831a-4cb8-a1bb-51eab3889edc";

/** Verbatim from that run's `show` output (trimmed to two paragraphs). */
const LIVE_RESULT = {
  __kind: "masterwork_result",
  deliverable: null,
  approach: null,
  ruling:
    "## The Ruling\n\nThis letter is a verdict rendered from a telephone. " +
    "Its besetting sin is **pressure-before-parts-always**.\n",
};

const { makeAppContextState } = jest.requireActual<
  typeof import("@/lib/redux/slices/appContextSlice")
>("@/lib/redux/slices/appContextSlice");

const appContext = makeAppContextState({
  organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  orgBootstrapResolved: true,
});

/** What the server answers for the open run — set per scenario. */
let runResultRead: unknown = { status: "ready", result: LIVE_RESULT };
/** The run's own history row — set per scenario. */
let historyRun: Record<string, unknown> = {
  id: RUN_ID,
  status: "completed",
  created_at: "2026-09-20T06:00:00.000Z",
  started_at: "2026-09-20T06:00:00.000Z",
  completed_at: "2026-09-20T06:01:39.000Z",
  steps_executed: 10,
  cost_usd: 0.53,
  deliverable_preview: "The Ruling This letter is a verdict rendered from a…",
  error_message: null,
};

// ── The network, and only the network ──────────────────────────────────────
jest.mock("../service", () => ({
  getEncoreMasterwork: async () => ({
    id: MASTERWORK_ID,
    name: "The Irrigation Audit",
    masterwork_kind: "generate",
    submit_label: "Run it",
    deliverable: "A ruling on the letter you hand it.",
    rule_count: 12,
    released_at: "2026-09-19T00:00:00.000Z",
    updated_at: "2026-09-19T00:00:00.000Z",
    rulebook: {
      id: RULEBOOK_ID,
      name: "Irrigation",
      expert: "The Expert",
      created_by: "user-1",
    },
    auditionScore: null,
    auditionVerdict: null,
    auditionedAt: null,
  }),
  listMyEncoreRuns: async () => [historyRun],
  getEncoreRunResult: async () => runResultRead,
  setMasterworkReleased: async () => ({}),
}));

// ── The page's heavy neighbours, which are not this suite's subject ─────────
jest.mock("../../components/masterworks/TryMasterworkBox", () => ({
  TryMasterworkBox: () => null,
}));
jest.mock("../../review/ExpertSignOff", () => ({ ExpertSignOff: () => null }));
jest.mock("../RunTheBench", () => ({ RunTheBench: () => null }));
jest.mock("../AuditionProof", () => ({ AuditionProof: () => null }));
jest.mock("../benchProof", () => {
  const actual = jest.requireActual("../benchProof");
  return { ...actual, getBenchProof: async () => actual.UNAVAILABLE };
});

/**
 * The kind render path is stood in ONLY at its Matrix binding, and the stand-in
 * announces what it was asked to draw — the kind and the ruling text. That is
 * the assertion this defect needs: the deliverable reached the registered
 * `masterwork_result` component instead of never being handed to anything.
 */
jest.mock("@/features/content-ir/studio/components/KindInstanceRender", () => ({
  __esModule: true,
  default: ({ kind, value }: { kind: string; value: unknown }) => (
    <div data-kind-render={kind}>
      {String((value as { ruling?: string })?.ruling ?? "")}
    </div>
  ),
}));

// 🚨 THE ROUTE ENTRY ITSELF. `?run=<id>` is how a person arrives — by clicking
// their own run, and by pasting the address cold. The scenario carries it.
jest.mock("next/navigation", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@/test-utils/next-navigation").nextNavigationMock({
    params: { id: MASTERWORK_ID },
    pathname: `/masterwork/encore/${MASTERWORK_ID}`,
    searchParams: `run=${RUN_ID}`,
  }),
);

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
jest.mock("../../rules-context/MasterworkRulesContext", () => ({
  MasterworkRulesProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useRuleCitationIndex: () => null,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EncoreRunPage } = require("../EncoreRunPage") as {
  EncoreRunPage: (props: { masterworkId: string }) => React.ReactElement;
};

let container: HTMLDivElement;
let root: Root | null = null;

/** A cold arrival at the `?run=` address — exactly what a reload does. */
async function arriveAtTheRunAddress() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<EncoreRunPage masterworkId={MASTERWORK_ID} />);
  });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const text = () => (document.body.textContent ?? "").replace(/\s+/g, " ");

afterEach(() => {
  if (!root) return;
  const current = root;
  act(() => current.unmount());
  container.remove();
  root = null;
});

beforeEach(() => {
  runResultRead = { status: "ready", result: LIVE_RESULT };
  historyRun = { ...historyRun, status: "completed", error_message: null };
});

describe("the ?run= address opens the deliverable inside Encore", () => {
  it("renders the ruling through the registered masterwork_result component", async () => {
    await arriveAtTheRunAddress();
    const panel = document.querySelector(`[data-encore-open-run="${RUN_ID}"]`);
    expect(panel).not.toBeNull();
    // The deliverable reached the REGISTERED kind component, not a fallback.
    const rendered = document.querySelector(
      '[data-kind-render="masterwork_result"]',
    );
    expect(rendered).not.toBeNull();
    // And the words the Expert wrote are on the page.
    expect(text()).toContain("This letter is a verdict rendered from a telephone");
  });

  it("survives a cold reload of the address — nothing depends on the click", async () => {
    // The mount above IS a cold arrival; prove the panel does not need any
    // in-memory hand-off by reading only what the address and server gave it.
    await arriveAtTheRunAddress();
    expect(
      document.querySelector('[data-kind-render="masterwork_result"]'),
    ).not.toBeNull();
    expect(text()).toContain("Your result");
  });

  it("says so out loud when the run kept no readable result", async () => {
    runResultRead = { status: "kept-nothing" };
    await arriveAtTheRunAddress();
    expect(
      document.querySelector(`[data-encore-open-run="${RUN_ID}"]`),
    ).not.toBeNull();
    expect(text()).toContain("kept no readable result");
    // Never a blank panel, and never a pretend deliverable.
    expect(
      document.querySelector('[data-kind-render="masterwork_result"]'),
    ).toBeNull();
  });

  it("names the failure a failed run recorded instead of telling you to retry blind", async () => {
    runResultRead = { status: "kept-nothing" };
    historyRun = {
      ...historyRun,
      status: "failed",
      error_message: "The letter was longer than this Masterwork can read.",
    };
    await arriveAtTheRunAddress();
    expect(text()).toContain("This run did not finish");
    expect(text()).toContain(
      "The letter was longer than this Masterwork can read.",
    );
  });

  it("says the read was refused when it was refused — a different truth", async () => {
    runResultRead = { status: "unreadable" };
    await arriveAtTheRunAddress();
    expect(text()).toContain("the read was refused");
    expect(text()).not.toContain("kept no readable result");
  });
});
