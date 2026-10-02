// features/administration/final-switch/__tests__/the-final-switch-page-stays-responsive-at-production-size.test.tsx
//
// THE PAGE FROZE (sec_8f1a9be1…, manage.aimatrx.com, 2026-10-01): production lists 1,636
// organizations, 1,619 of them already current. The page rendered one <tr> per organization (~40,000
// DOM nodes, so every style recalc on the page cost hundreds of ms), and it handed every organization
// to the page capture, which the copy menu prepares in full the moment it opens — opening it held
// the main thread for 4.1 s. This guard runs the REAL screen at production size and proves:
//   1. the organization table renders a bounded window of rows, never one per organization;
//   2. the page capture carries the organizations that still need something, and the whole list
//      only through `load` (read at copy time by the "with …" variants), never on the page.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { FinalSwitchBoard, FinalSwitchOrganization } from "../finalSwitch";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const readFinalSwitch = jest.fn();

type Section = { id: string; value: unknown; load?: () => Promise<unknown> };
let captured: (() => Section[]) | null = null;

jest.mock("../finalSwitch", () => ({
  ...jest.requireActual("../finalSwitch"),
  readFinalSwitch: (...args: unknown[]) => readFinalSwitch(...args),
  readFinalSwitchCapabilities: jest.fn(() => new Promise(() => {})),
  pressFinalSwitch: jest.fn(),
  undoFinalSwitch: jest.fn(),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn() }));
jest.mock("@/components/agent-copy/page-capture/usePageCapture", () => ({
  usePageCaptureContribution: (_owner: string, get: () => Section[]) => {
    captured = get;
  },
}));
jest.mock("@/components/agent-copy/page-capture/AdminPageCapture", () => ({ AdminPageCapture: () => null }));
jest.mock("@/components/ui/confirm-dialog", () => ({ ConfirmDialog: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

// eslint-disable-next-line import/first
import { FinalSwitchScreen } from "../FinalSwitchScreen";

const CURRENT = 1619;
const TO_SWITCH = 17;

function org(i: number, current: boolean): FinalSwitchOrganization {
  return {
    id: `org-${i}`,
    name: `Organization ${String(i).padStart(4, "0")}`,
    created_at: "2026-08-01T00:00:00Z",
    archived: false,
    tables: { live: current ? 0 : 3, copied: current ? null : "3 of 3 tables copied.", state: current ? "new" : "old", switched_at: null },
    lists: { live: 0, copied: null },
    scopes: { types: 2, state: current ? "new" : "old", switched_at: null, parity: null },
    follow_lag: 0,
    rerun_clears: [],
    cannot_clear: [],
    needs_copy_again: false,
    ready: true,
    plan: current
      ? { press_tables: false, sweep_tables: 0, sweep_lists: 0, press_context: false }
      : { press_tables: true, sweep_tables: 0, sweep_lists: 0, press_context: true },
  } as FinalSwitchOrganization;
}

function board(): FinalSwitchBoard {
  const organizations = [
    ...Array.from({ length: TO_SWITCH }, (_, i) => org(i, false)),
    ...Array.from({ length: CURRENT }, (_, i) => org(TO_SWITCH + i, true)),
  ];
  return {
    checkedAt: "2026-10-01T18:54:00Z",
    state: "old",
    lastRun: null,
    platform: [],
    organizations,
    totals: { organizations: organizations.length, ready: 0, to_switch: TO_SWITCH, nothing_to_switch: CURRENT, need_copy_again: 0, need_context_copy: 0, blocked: 0 },
    blocking: [],
    ready: true,
    readyAfterCopyAgain: true,
    says: "Ready.",
    mayPress: true,
    mayUndo: false,
    mayRetireUndo: false,
    undoRetired: null,
    undo: null,
    orphans: [],
    copyAgain: null,
    copyAgainNeeded: false,
    needsContextCopy: [],
    noOwnerArchived: [],
  } as FinalSwitchBoard;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  captured = null;
  readFinalSwitch.mockResolvedValue(board());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mount() {
  await act(async () => {
    root.render(<FinalSwitchScreen />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("the final switch page at production size (1,636 organizations)", () => {
  it("renders a bounded window of organization rows, never one per organization", async () => {
    await mount();
    expect(container.textContent).toContain("The 1636 organizations listed");
    const rows = container.querySelectorAll('[data-testid="final-switch-org-row"]').length;
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThanOrEqual(120);
  });

  it("captures the organizations that need something, and the whole list only at copy time", async () => {
    await mount();
    expect(captured).not.toBeNull();
    const sections = captured!();
    const orgs = sections.find((s) => s.id === "final-switch-organizations");
    expect(orgs).toBeDefined();
    expect(JSON.stringify(orgs!.value).length).toBeLessThan(50_000);
    const all = sections.find((s) => typeof s.load === "function");
    expect(all).toBeDefined();
    const loaded = (await all!.load!()) as unknown[];
    expect(loaded).toHaveLength(TO_SWITCH + CURRENT);
  });
});
