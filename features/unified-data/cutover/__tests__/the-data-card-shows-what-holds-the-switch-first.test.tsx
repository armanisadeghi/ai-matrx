// features/unified-data/cutover/__tests__/the-data-card-shows-what-holds-the-switch-first.test.tsx
//
// THE USE CASE (lane HANDOVER, 2026-09-27). The owner of Cedar Ridge Physical Therapy, a new
// organization with nothing in the old system, opens Settings → Data to switch it. RED on the card
// before the lane:
//   1. thirteen ticked checks stood between her and the button, every one of them met;
//   2. the switches made for everyone printed what each does in the database, down to a setting's
//      internal key ("Sets custom/scopes_written_in_the_store for the organization").
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { Seam, SeamBoard } from "../seamSwitches";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const readSeamBoard = jest.fn();
const pressSeam = jest.fn();
let confirmProps: { open: boolean; onConfirm: () => void; description?: unknown } | null = null;

jest.mock("../seamSwitches", () => ({
  readSeamBoard: (...args: unknown[]) => readSeamBoard(...args),
  pressSeam: (...args: unknown[]) => pressSeam(...args),
}));
jest.mock("../copyAgain", () => ({ copyAgain: jest.fn(), copyAgainClears: () => false }));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn() }));
jest.mock("@/components/agent-copy/page-capture/usePageCapture", () => ({ usePageCaptureContribution: () => {} }));
jest.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: (props: { open: boolean; onConfirm: () => void; description?: unknown }) => {
    confirmProps = props;
    return null;
  },
}));

// eslint-disable-next-line import/first
import { OrgDataSwitches } from "../OrgDataSwitches";

const ORG = "3e1b7c52-7a41-4b43-9a55-2c1f0f7d9a10";

function scopesSeam(over: Partial<Seam>): Seam {
  return {
    key: "scopes_screens",
    title: "Scope and context screens",
    oldSide: "The current context tables are the writer.",
    newSide: "The record store writes this organization's scopes.",
    perOrganization: true,
    pressKind: "owner_press",
    state: "old",
    flipDoes: "Sets custom/scopes_written_in_the_store for the organization.",
    needsFirst: "",
    reverseDoes: "Sets the switch back to off for the organization.",
    ready: true,
    checkedAt: "2026-09-27T06:00:00Z",
    checks: [{ key: "parity", says: "Agents are handed the same context by both systems", met: true, detail: "0 defects." }],
    mayFlip: false,
    mayReverse: false,
    reverseChecks: [],
    reverseCarries: [],
    reverseNotCarried: [],
    reverseNeedsConfirm: false,
    switched: null,
    pressedForEveryone: true,
    lastPress: null,
    ...over,
  };
}

function board(seam: Seam, mayPress = true): SeamBoard {
  return {
    organizationId: ORG,
    checkedAt: "2026-09-27T06:00:00Z",
    mayPress,
    mayPressDetail: "You are an owner of this organization.",
    seams: [seam],
    finalSwitch: null,
  };
}

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  readSeamBoard.mockReset();
  pressSeam.mockReset();
  confirmProps = null;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const CHECKS = [
  { key: "copied", says: "Every table is copied into the new system", met: true, detail: "This organization has no older tables left." },
  { key: "rows_present", says: "No row is missing from a copy", met: true, detail: null },
  { key: "shares_match", says: "Every copy is shared exactly as its older table", met: false, detail: "Insurance Plan Accounts is shared with one person its copy is not." },
];

function tablesSeam(checks = CHECKS): Seam {
  return scopesSeam({
    key: "older_tables",
    title: "Data tables",
    pressKind: "owner_press",
    pressedForEveryone: false,
    mayFlip: true,
    ready: checks.every((c) => c.met),
    checks,
    flipDoes: "Every older table in this organization is archived.",
  });
}

it("says the unmet check in the open and keeps the met ones behind one line", async () => {
  readSeamBoard.mockResolvedValue({ ...board(tablesSeam()), seams: [tablesSeam(), scopesSeam({})] });
  act(() => root.render(<OrgDataSwitches organizationId={ORG} />));
  await flush();
  const unmet = Array.from(host.querySelectorAll("li")).find((li) => /shared exactly/.test(li.textContent ?? ""));
  expect(unmet).toBeDefined();
  expect(unmet!.closest("details")).toBeNull();
  const met = host.querySelector('details[data-met-checks="older_tables"]');
  expect(met).not.toBeNull();
  expect(met!.querySelector("summary")?.textContent).toContain("2 more checks pass");
  expect(met!.textContent).toContain("No row is missing from a copy");
});

it("when every check passes, one line says so", async () => {
  const all = CHECKS.map((c) => ({ ...c, met: true }));
  readSeamBoard.mockResolvedValue(board(tablesSeam(all)));
  act(() => root.render(<OrgDataSwitches organizationId={ORG} />));
  await flush();
  expect(host.querySelector('details[data-met-checks="older_tables"] summary')?.textContent).toContain("All 3 checks pass");
});

it("never prints a setting's internal key for a switch made for everyone", async () => {
  readSeamBoard.mockResolvedValue({ ...board(tablesSeam()), seams: [tablesSeam(), scopesSeam({ state: "new" })] });
  act(() => root.render(<OrgDataSwitches organizationId={ORG} />));
  await flush();
  const text = host.textContent ?? "";
  expect(text).toContain("Scope and context screens");
  expect(text).toContain("On the new system");
  expect(text).not.toMatch(/custom\/scopes_written_in_the_store/);
});
