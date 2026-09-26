// features/unified-data/cutover/__tests__/copy-again-beside-the-switch.test.tsx
//
// THE SWITCH THAT NAMES A FIX OFFERS IT (lane COPY-AGAIN-DOOR, the door law).
//
// Ridgeline HVAC's owner opens the organization's settings, Data. The tables switch says
// "1 colour differs, in 1 table: Service Calls … Copying again brings the older table's colours."
// Until this lane the only control was "Check again", which re-measures. This suite runs the REAL
// card with the board the database would answer and proves:
//   1. "Copy again" sits beside "Check again" when a check copying again clears is unmet;
//   2. pressing it runs the rerun for THIS organization, shows its progress, then its one line, and
//      measures again on its own, so the sentence updates (the second board is green, the button goes);
//   3. it is absent when nothing copying again clears is unmet, and for a member who may not press.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { SeamBoard, SeamCheck } from "../seamSwitches";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const readSeamBoard = jest.fn();
const copyAgain = jest.fn();

jest.mock("../seamSwitches", () => ({
  readSeamBoard: (...args: unknown[]) => readSeamBoard(...args),
  pressSeam: jest.fn(),
}));
jest.mock("../copyAgain", () => ({
  ...jest.requireActual("../copyAgain"),
  copyAgain: (...args: unknown[]) => copyAgain(...args),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn() }));
jest.mock("@/components/agent-copy/page-capture/usePageCapture", () => ({ usePageCaptureContribution: () => {} }));
jest.mock("@/components/ui/confirm-dialog", () => ({ ConfirmDialog: () => null }));

// eslint-disable-next-line import/first
import { OrgDataSwitches } from "../OrgDataSwitches";

const ORG = "1fedf48b-9a77-432e-a5e3-2d93ee140564";
const COLOUR_SAYS =
  "1 colour differs, in 1 table: Service Calls: cell d4b68c2d · Job is teal on the older table and red on the copy. Copying again brings the older table's colours.";

function board(opts: { colours: boolean; mayPress?: boolean }): SeamBoard {
  const checks: SeamCheck[] = [
    { key: "copied", says: "Every table is copied into the new system", met: true, detail: "3 of 3 tables copied." },
    {
      key: "colours_match",
      says: "Every copy shows the colours its older table shows",
      met: opts.colours,
      detail: opts.colours ? "Every row, column and cell colour matches its older table." : COLOUR_SAYS,
    },
    { key: "automations_follow", says: "Every automation names its table", met: true, detail: null },
  ];
  return {
    organizationId: ORG,
    checkedAt: "2026-09-26T06:00:00Z",
    mayPress: opts.mayPress ?? true,
    mayPressDetail: opts.mayPress === false ? "Only an owner of this organization can press a switch." : "You are an owner of this organization.",
    seams: [
      {
        key: "older_tables",
        title: "Data tables",
        oldSide: "The older tables",
        newSide: "The new tables",
        perOrganization: true,
        pressKind: "owner_press",
        state: "old",
        flipDoes: "Archives the older tables.",
        needsFirst: "",
        reverseDoes: "Unarchives them.",
        ready: opts.colours,
        checkedAt: "2026-09-26T06:00:00Z",
        checks,
        mayFlip: opts.colours && (opts.mayPress ?? true),
        mayReverse: false,
        reverseChecks: [],
        switched: null,
        lastPress: null,
      },
    ],
  };
}

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<OrgDataSwitches organizationId={ORG} />);
  });
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === label);
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  readSeamBoard.mockReset();
  copyAgain.mockReset();
});

test("a named colour difference offers Copy again, which runs, reports and measures again", async () => {
  readSeamBoard.mockResolvedValueOnce(board({ colours: false })).mockResolvedValueOnce(board({ colours: true }));
  let finish: (v: unknown) => void = () => {};
  copyAgain.mockImplementation((_dispatch, target, onProgress) => {
    expect(target).toEqual({ organizationId: ORG });
    onProgress({ done: 1, total: 3, says: "Copied 1 of 3: Service Calls" });
    return new Promise((resolve) => (finish = resolve));
  });

  await mount();
  expect(container.textContent).toContain(COLOUR_SAYS);
  expect(button("Check again")).toBeDefined();
  const copy = button("Copy again");
  expect(copy).toBeDefined();

  await act(async () => {
    copy!.click();
  });
  expect(copyAgain).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("Copied 1 of 3: Service Calls");
  expect(button("Copy again")!.disabled).toBe(true);

  const said = "Copied 3 tables again. Brought from the older tables: table colors changed on the older table (1).";
  await act(async () => {
    finish({ ok: true, says: said });
  });
  expect(readSeamBoard).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain(said);
  expect(container.textContent).not.toContain(COLOUR_SAYS);
  expect(button("Copy again")).toBeUndefined();
});

test("a refusal is said, not swallowed", async () => {
  readSeamBoard.mockResolvedValue(board({ colours: false }));
  copyAgain.mockResolvedValue({
    ok: false,
    says: "Ridgeline HVAC's tables are already being copied again. Nothing new was started; the switch updates when that copy finishes.",
  });
  await mount();
  await act(async () => {
    button("Copy again")!.click();
  });
  expect(container.textContent).toContain("already being copied again");
});

test("absent when nothing copying again clears is unmet, and for a member", async () => {
  readSeamBoard.mockResolvedValue(board({ colours: true }));
  await mount();
  expect(button("Check again")).toBeDefined();
  expect(button("Copy again")).toBeUndefined();
  act(() => root.unmount());
  container.remove();

  readSeamBoard.mockResolvedValue(board({ colours: false, mayPress: false }));
  await mount();
  expect(container.textContent).toContain(COLOUR_SAYS);
  expect(button("Copy again")).toBeUndefined();
});
