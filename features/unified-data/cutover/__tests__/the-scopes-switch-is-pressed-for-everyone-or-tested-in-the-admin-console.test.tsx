// features/unified-data/cutover/__tests__/the-scopes-switch-is-pressed-for-everyone-or-tested-in-the-admin-console.test.tsx
//
// THE SCOPES SWITCH (lane SCOPES-WRITE-THROUGH). Arman, 2026-09-27: no organization-by-organization
// pressing — the final switch presses "Scope and context screens" for every organization at once.
//   1. On Bayfront Family Dentistry's settings page (Data), the switch is listed with the switches
//      made for everyone, never with a press control, even for its owner.
//   2. In the admin scope console, a platform admin sees where the organization's scopes are written
//      and switches ONE organization (to test it) through the same door, after a confirmation that
//      names what the switch does.
//   3. Not ready: no press control, and the first unmet check is said.
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
// eslint-disable-next-line import/first
import { ScopesWriterSwitch } from "../ScopesWriterSwitch";

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

it("the settings page lists the scopes switch with the switches made for everyone, with no press control", async () => {
  readSeamBoard.mockResolvedValue(board(scopesSeam({ mayFlip: false })));
  act(() => root.render(<OrgDataSwitches organizationId={ORG} />));
  await flush();
  const text = host.textContent ?? "";
  expect(text).toContain("Switched for everyone at once, not from here");
  expect(text).toContain("Scope and context screens");
  expect(text).not.toContain("Switch to the new system");
});

it("the admin console says where the scopes are written and switches one organization after a confirmation", async () => {
  readSeamBoard.mockResolvedValue(board(scopesSeam({ mayFlip: true })));
  pressSeam.mockResolvedValue({ ok: true, state: "new", says: "Switched to the new system." });
  act(() => root.render(<ScopesWriterSwitch organizationId={ORG} />));
  await flush();
  expect(host.textContent).toContain("Old tables");
  const button = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Switch to the record store");
  expect(button).toBeDefined();
  act(() => button!.click());
  expect(confirmProps?.open).toBe(true);
  expect(String(confirmProps?.description)).toContain("switches one organization only");
  readSeamBoard.mockResolvedValue(board(scopesSeam({ state: "new", mayReverse: true })));
  await act(async () => {
    confirmProps!.onConfirm();
  });
  await flush();
  expect(pressSeam).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG, seamKey: "scopes_screens", to: "new" }));
  expect(host.textContent).toContain("Record store");
  expect(host.textContent).toContain("Switched to the new system.");
});

it("not ready: no press control, and the first unmet check is said", async () => {
  readSeamBoard.mockResolvedValue(board(scopesSeam({
    ready: false,
    mayFlip: false,
    checks: [{ key: "parity", says: "Agents are handed the same context by both systems", met: false, detail: "Not measured yet for this organization." }],
  })));
  act(() => root.render(<ScopesWriterSwitch organizationId={ORG} />));
  await flush();
  expect(host.textContent).toContain("Not ready: Agents are handed the same context by both systems: Not measured yet");
  expect(host.querySelector("button")).toBeNull();
});
