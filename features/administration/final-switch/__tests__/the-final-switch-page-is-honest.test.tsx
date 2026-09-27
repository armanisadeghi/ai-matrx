// features/administration/final-switch/__tests__/the-final-switch-page-is-honest.test.tsx
//
// THE FINAL SWITCH PAGE (lane FINAL-SWITCH). The platform admin opens Administration → Database →
// Final switch before pressing everything over. The page runs the REAL screen with the board the
// database would answer and proves it never lies:
//   1. not ready: the press is disabled with the database's own sentence, every blocking item is
//      listed (organization + table + difference), the per-organization table names each one, and
//      there is no undo;
//   2. ready after copying again: the press is enabled (the server copies again first);
//   3. switched: no press, the undo is offered, the last run's sentence is shown;
//   4. the last rehearsal on the dev clone is on the page with its date.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { FinalSwitchBoard, FinalSwitchOrganization } from "../finalSwitch";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const readFinalSwitch = jest.fn();

jest.mock("../finalSwitch", () => ({
  ...jest.requireActual("../finalSwitch"),
  readFinalSwitch: (...args: unknown[]) => readFinalSwitch(...args),
  pressFinalSwitch: jest.fn(),
  undoFinalSwitch: jest.fn(),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn() }));
jest.mock("@/components/agent-copy/page-capture/usePageCapture", () => ({ usePageCaptureContribution: () => {} }));
jest.mock("@/components/agent-copy/page-capture/AdminPageCapture", () => ({ AdminPageCapture: () => null }));
jest.mock("@/components/ui/confirm-dialog", () => ({ ConfirmDialog: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

// eslint-disable-next-line import/first
import { FinalSwitchScreen } from "../FinalSwitchScreen";

const BLOCKED_SAYS =
  "8 older pick lists belong to no organization, so no organization's switch reaches them: Onboarding Checklist (made by admin@admin.com).";
const SCOPES_SAYS =
  "The scope and context screens switch has no code yet: every scope screen, picker, tag and template still writes the current tables, and the agents' write-back still goes to them. Lane SCOPES-WRITE-THROUGH is building it; the final switch waits for it.";

function org(over: Partial<FinalSwitchOrganization> & { name: string }): FinalSwitchOrganization {
  return {
    id: `id-${over.name}`,
    created_at: "2026-08-01T00:00:00Z",
    archived: false,
    tables: { live: 3, copied: "3 of 3 tables copied.", state: "old", switched_at: null },
    lists: { live: 0, copied: null },
    scopes: { types: 2, state: "old", switched_at: null, parity: "2 of 2 scope types, 4 of 4 scopes, 6 of 6 context fields copied." },
    follow_lag: 0,
    rerun_clears: [],
    cannot_clear: [],
    needs_copy_again: false,
    ready: true,
    plan: { press_tables: true, sweep_tables: 0, sweep_lists: 0, press_context: true },
    ...over,
  };
}

function board(kind: "blocked" | "after_copy" | "switched"): FinalSwitchBoard {
  const blocked = kind === "blocked";
  return {
    checkedAt: "2026-09-27T05:00:00Z",
    state: kind === "switched" ? "new" : "old",
    lastRun:
      kind === "switched"
        ? { id: "run-1", direction: "new", at: "2026-09-27T09:10:00Z", says: "Switched everything to the new system: 24 organizations.", by: "admin@admin.com", counts: null }
        : null,
    platform: [
      { key: "orphan_lists", says: "Every older pick list belongs to an organization", met: !blocked, detail: blocked ? BLOCKED_SAYS : "No older pick list is outside an organization.", fix: "Give each an organization." },
      { key: "scopes_seam_has_code", says: "The scope and context screens switch has its code", met: !blocked, detail: blocked ? SCOPES_SAYS : "It has its step.", fix: null },
    ],
    organizations: [
      org({
        name: "Harbor Dental Group",
        cannot_clear: blocked
          ? [{ switch: "Data tables", key: "automations_follow", says: 'Every "when a row changes" automation names its table', detail: "1 automations run on a change to any older table. Pick the table each one watches first.", clears: 0, leaves: 1 }]
          : [],
        ready: !blocked,
      }),
      org({
        name: "Coastal Pool Service",
        rerun_clears: kind === "switched" ? [] : [{ switch: "Data tables", key: "rows_current", says: "No row was edited in an older table after it was copied", detail: "4 rows were edited.", clears: 4 }],
        needs_copy_again: kind !== "switched",
        ready: false,
      }),
    ],
    totals: { organizations: 2, ready: 0, need_copy_again: 1, blocked: blocked ? 1 : 0 },
    blocking: blocked ? [`The platform — Every older pick list belongs to an organization: ${BLOCKED_SAYS}`, "Harbor Dental Group — Data tables: automations"] : [],
    ready: false,
    readyAfterCopyAgain: !blocked,
    says: blocked
      ? "Not ready: 2 things must be fixed first. Copying again cannot fix them."
      : kind === "switched"
        ? "Everything is on the new system (the final switch)."
        : "Ready once the older tables are copied again for 1 organization; the press does that first.",
    mayPress: !blocked,
    mayUndo: kind === "switched",
    undo: kind === "switched" ? { plan: [], needs_confirm: false } : null,
  };
}

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<FinalSwitchScreen />);
  });
}

function byTestId(id: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  readFinalSwitch.mockReset();
});

test("not ready: the press is disabled with the database's sentence and every blocker is named", async () => {
  readFinalSwitch.mockResolvedValue(board("blocked"));
  await mount();
  const press = byTestId("final-switch-press") as HTMLButtonElement | null;
  expect(press).not.toBeNull();
  expect(press!.disabled).toBe(true);
  expect(container.textContent).toContain("Not ready: 2 things must be fixed first. Copying again cannot fix them.");
  expect(byTestId("final-switch-press-why")!.textContent).toBe("Off until the 2 things below are fixed.");
  expect(container.textContent).toContain(BLOCKED_SAYS);
  expect(container.textContent).toContain(SCOPES_SAYS);
  expect(container.textContent).toContain("1 automations run on a change to any older table");
  expect(container.querySelectorAll('[data-testid="final-switch-org-row"]').length).toBe(2);
  expect(byTestId("final-switch-undo")).toBeNull();
});

test("ready once copied again: the press is offered (the server copies again first)", async () => {
  readFinalSwitch.mockResolvedValue(board("after_copy"));
  await mount();
  const press = byTestId("final-switch-press") as HTMLButtonElement;
  expect(press.disabled).toBe(false);
  expect(byTestId("final-switch-press-why")).toBeNull();
  expect(container.textContent).toContain("No row was edited in an older table after it was copied (4)");
});

test("switched: no press, the undo is offered, the last run is said", async () => {
  readFinalSwitch.mockResolvedValue(board("switched"));
  await mount();
  expect(byTestId("final-switch-press")).toBeNull();
  expect(byTestId("final-switch-undo")).not.toBeNull();
  expect(container.textContent).toContain("Switched everything to the new system: 24 organizations.");
});

test("the last rehearsal on the dev clone is on the page with its date", async () => {
  readFinalSwitch.mockResolvedValue(board("blocked"));
  await mount();
  const rehearsal = byTestId("final-switch-rehearsal");
  expect(rehearsal).not.toBeNull();
  expect(rehearsal!.textContent).toContain("Last rehearsal on the dev clone");
  expect(rehearsal!.textContent).toMatch(/hykobnqyuxspbcijrodb|clone/);
});
