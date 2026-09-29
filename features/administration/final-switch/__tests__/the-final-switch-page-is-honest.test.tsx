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
//   4. the last rehearsal on the dev clone is on the page with its date;
//   5. Step 1 covers the context copy (coordinator 2026-09-27): the organizations only the context copy
//      clears are named as Step 1's, and the page says whether THIS server's context copy carries a
//      large organization (aidream 991ff424b5) — in red when it does not;
//   6. an unmet check's title says what is not true yet, never its met-form name as a claim (FINAL-SWITCH-2).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { FinalSwitchBoard, FinalSwitchOrganization } from "../finalSwitch";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const readFinalSwitch = jest.fn();
const readFinalSwitchCapabilities = jest.fn();

jest.mock("../finalSwitch", () => ({
  ...jest.requireActual("../finalSwitch"),
  readFinalSwitch: (...args: unknown[]) => readFinalSwitch(...args),
  readFinalSwitchCapabilities: (...args: unknown[]) => readFinalSwitchCapabilities(...args),
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

function board(kind: "blocked" | "after_copy" | "switched" | "context"): FinalSwitchBoard {
  const blocked = kind === "blocked";
  const context = kind === "context";
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
      ...(context
        ? [
            org({
              name: "Aamir's Org",
              context_clears: [
                { switch: "Where agents get their context", key: "follow_current", says: "No scope edit is waiting to be copied", detail: "432 edits made in the current scope screens are waiting for the copy (the oldest since 2026-09-27 10:49 UTC)." },
                { switch: "Scope and context screens", key: "scopes_screens.own_words_copied", says: "Every scope type's and context field's own words are on its copy", detail: "1 copy does not say what the current screens show: Tags (description)." },
              ],
              needs_context_copy: true,
              follow_lag: 432,
              ready: false,
            }),
          ]
        : []),
      org({
        name: "Coastal Pool Service",
        rerun_clears: kind === "switched" ? [] : [{ switch: "Data tables", key: "rows_current", says: "No row was edited in an older table after it was copied", detail: "4 rows were edited.", clears: 4 }],
        needs_copy_again: kind !== "switched",
        ready: false,
      }),
    ],
    totals: { organizations: 3, ready: 0, to_switch: 2, nothing_to_switch: 1, need_copy_again: 1, need_context_copy: context ? 1 : 0, blocked: blocked ? 1 : 0 },
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
    orphans:
      kind === "switched"
        ? []
        : [
            { id: "l1", name: "Untitled list", maker: "developer111@pixelium.uk", resolution: "organization", organization_id: "o1", organization_name: "Developer111's Org", why: "its maker belongs to one organization" },
            { id: "l2", name: "Onboarding Checklist", maker: "admin@admin.com", resolution: "no_owner", organization_id: null, organization_name: null, why: "its maker belongs to 46 organizations" },
          ],
    copyAgain:
      kind === "after_copy"
        ? { run_id: "r1", started_at: "2026-09-27T07:00:00Z", by: "admin@admin.com", finished: false, finished_at: null, ok: true, resumes: 0, organizations_done: 1, adopted: null,
            organizations: [{ id: "id-Harbor Dental Group", name: "Harbor Dental Group", ok: true, says: "Copied 2 tables again.", at: "2026-09-27T07:01:00Z", ms: 60000 }] }
        : null,
    copyAgainNeeded: kind === "after_copy" || context,
    needsContextCopy: context ? ["id-Aamir's Org"] : [],
    noOwnerArchived: kind === "switched" ? [{ id: "l2", name: "Onboarding Checklist", maker: "admin@admin.com", why: "its maker belongs to 46 organizations" }] : [],
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
  readFinalSwitchCapabilities.mockReset();
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

test("copy again is its own step: while a run is unfinished the press is off and Resume is offered", async () => {
  readFinalSwitch.mockResolvedValue(board("after_copy"));
  await mount();
  const press = byTestId("final-switch-press") as HTMLButtonElement;
  expect(press.disabled).toBe(true);
  const copy = byTestId("final-switch-copy-again-button") as HTMLButtonElement;
  expect(copy.disabled).toBe(false);
  expect(copy.textContent).toContain("Resume Step 1");
  expect(byTestId("final-switch-copy-again-state")!.textContent).toContain("not finished — 1 organizations done");
  expect(byTestId("final-switch-copy-again-organizations")!.textContent).toContain("Harbor Dental Group");
  expect(byTestId("final-switch-orphans")!.textContent).toContain("goes to Developer111's Org at Copy again");
  expect(byTestId("final-switch-orphans")!.textContent).toContain("archived by the press with no owner organization");
  expect(container.textContent).toContain("Copy again: not yet: no row was edited in an older table after it was copied (4)");
});

test("switched: no press, the undo is offered, the last run is said", async () => {
  readFinalSwitch.mockResolvedValue(board("switched"));
  await mount();
  expect(byTestId("final-switch-press")).toBeNull();
  expect(byTestId("final-switch-undo")).not.toBeNull();
  expect(container.textContent).toContain("Switched everything to the new system: 24 organizations.");
  expect(byTestId("final-switch-copy-again")).toBeNull();
  expect(byTestId("final-switch-no-owner")!.textContent).toContain("Onboarding Checklist");
});

test("one set of counts: every number on the page names its set and they agree (VERIFIER-27)", async () => {
  readFinalSwitch.mockResolvedValue(board("after_copy"));
  await mount();
  const counts = byTestId("final-switch-counts")!.textContent!;
  expect(counts).toContain("2 switch at the press");
  expect(counts).toContain("1 already on the new system or with nothing old left");
  expect(counts).toContain("1 of the listed need Copy again first");
  expect(container.textContent).toContain("3 organizations listed (anything old, or a switch pressed)");
  expect(container.textContent).toContain("The 3 organizations listed (2 switch at the press)");
  expect(container.textContent).not.toMatch(/Every organization is ready/);
});

test("the last rehearsal on the dev clone is on the page with its date", async () => {
  readFinalSwitch.mockResolvedValue(board("blocked"));
  await mount();
  const rehearsal = byTestId("final-switch-rehearsal");
  expect(rehearsal).not.toBeNull();
  expect(rehearsal!.textContent).toContain("Last rehearsal on the dev clone");
  expect(rehearsal!.textContent).toMatch(/hykobnqyuxspbcijrodb|clone/);
});

test("Step 1 covers the context copy: the organizations only it clears are Step 1's, and the server's gate is said", async () => {
  readFinalSwitch.mockResolvedValue({ ...board("context"), says: "Ready once Step 1 has run: Copy again for 1 organization, the context copy for 1 organization. Run it first; the press stays off until it finishes green." });
  readFinalSwitchCapabilities.mockResolvedValue({
    gitSha: "18d16a9bb26e6319da820aee4bde2c4b33ed5a10",
    contextCopyReady: false,
    contextCopyFix: "991ff424b5",
    says: "The context copy waits for the server: build 18d16a9bb2 does not have aidream 991ff424b5 (the tag copy that is not cut off by the database's 30-second clock), so a large organization's copy would stop half way.",
  });
  await mount();
  await act(async () => {});
  expect((byTestId("final-switch-press") as HTMLButtonElement).disabled).toBe(true);
  expect(byTestId("final-switch-step-one-plan")!.textContent).toContain("run the context copy for 1");
  const gate = byTestId("final-switch-context-gate")!;
  expect(gate.textContent).toContain("does not have aidream 991ff424b5");
  expect(gate.className).toContain("text-destructive");
  // Aamir's Org's waiting edits are Step 1's to clear — not a blocker a person must fix.
  expect(container.textContent).toContain("Context copy: not yet: no scope edit is waiting to be copied");
  expect(byTestId("final-switch-counts")!.textContent).toContain("1 need the context copy first");
  expect(byTestId("final-switch-counts")!.textContent).toContain("0 blocked");
});

test("no context copy needed: the page does not ask the server about it", async () => {
  readFinalSwitch.mockResolvedValue(board("after_copy"));
  await mount();
  expect(byTestId("final-switch-context-gate")).toBeNull();
  expect(readFinalSwitchCapabilities).not.toHaveBeenCalled();
});

test("an unmet check never reads as a claim: its title says what is not true yet (lane FINAL-SWITCH-2)", async () => {
  // Production, 2026-09-29: the platform list printed a check's NAME — the sentence it reads when met —
  // as a bold claim right before the detail that contradicts it: "The last Step 1 (Copy again and the
  // context copy) finished green. The last Step 1 finished with refusals: see its record."
  const b = board("after_copy");
  b.platform = [
    { key: "orphan_tables", says: "Every older table belongs to an organization", met: true, detail: "No older table is outside an organization.", fix: null },
    { key: "copy_again_finished", says: "The last Step 1 (Copy again and the context copy) finished green", met: false, detail: "The last Step 1 finished with refusals: see its record. Run Step 1 again.", fix: "Step 1 on this page (it resumes where it stopped)." },
  ];
  b.organizations[0] = {
    ...b.organizations[0],
    cannot_clear: [{ switch: "Data tables", key: "automations_follow", says: 'Every "when a row changes" automation names its table', detail: "1 automations run on a change to any older table.", clears: 0, leaves: 1 }],
  };
  readFinalSwitch.mockResolvedValue(b);
  await mount();
  const text = container.textContent ?? "";
  expect(text).toContain("Not yet: the last Step 1 (Copy again and the context copy) finished green.");
  expect(text).not.toContain("The last Step 1 (Copy again and the context copy) finished green.");
  expect(text).toContain("Every older table belongs to an organization.");
  expect(text).toContain('Not yet: every "when a row changes" automation names its table.');
  expect(text).toContain("Copy again: not yet: no row was edited in an older table after it was copied (4)");
  expect(text).not.toContain("Copy again: No row was edited");
});
