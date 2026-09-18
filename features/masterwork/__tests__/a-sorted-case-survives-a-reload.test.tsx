/**
 * A SORTED CASE SURVIVES A RELOAD.
 *
 * 🚨 THE DEFECT (cold walk 5, finding 2, 2026-09-16), reproduced live on
 * `origin/main` on 2026-09-17 before a line was changed:
 *
 *   On a brand-new Rulebook, dealt twenty real e-waste cases into three named
 *   piles (Approve / Reject / Escalate), sorted five of them on the keyboard
 *   (1/2/1/3/2) until the screen read "Case 6 of 20" — then reloaded the page.
 *   The board came back as "Sort the pile, then we'll find the line" with the
 *   pile-count picker and "Start sorting": no "Case 6 of 20", no resume banner,
 *   no partial-progress notice of any kind, and no rules on the Rulebook from
 *   that session. A first-timer's only honest reading is that the whole sitting
 *   vanished and her taps did nothing.
 *
 * THE CLASS, NOT THE INSTANCE. The Triad game — this lane's own named sibling —
 * had the identical defect fixed a day earlier (cold walk 4, finding 2), but
 * that fix was hand-written inside `TriadGamePage`, so the Sorting Table had
 * nothing to inherit and shipped the same bug. The mechanism now lives in
 * `features/masterwork/sitting/sitting.ts`; BOTH lanes call it, and the next
 * play surface inherits it instead of rediscovering this.
 *
 * THE FORCING FUNCTION: the REAL component, real cases pasted through the real
 * door, real keyboard placements, and a SECOND mount that knows nothing except
 * what the first one actually wrote to this browser — exactly as a refresh
 * knows nothing. Only the transport and the knob reads are faked.
 *
 * RED against the pre-fix component: the second mount renders
 * "Sort the pile, then we'll find the line".
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mockDispatch = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: () => undefined,
  useAppStore: () => ({ dispatch: mockDispatch, getState: () => ({}) }),
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: (request: Record<string, unknown>) => request,
}));

jest.mock("@/lib/knobs/featureKnobs", () => ({
  knobInt: async (_feature: string, key: string) =>
    key === "piles" ? 3 : key === "cases_per_round" ? 20 : 5,
  knobBool: async () => true,
}));

jest.mock("@/features/masterwork/MasterworkDictationOrigin", () => ({
  MasterworkDictationOrigin: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/features/masterwork/components/AgentCredit", () => ({
  AgentCredit: () => null,
}));

jest.mock("@ai-matrx/associations/react", () => ({
  UniversalAssociationPicker: () => null,
}));

import { TooltipProvider } from "@/components/ui/tooltip";

import { SortingTablePage } from "../sorting/SortingTablePage";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const RULEBOOK_ID = "9b1f0c34-52ad-4e77-8c10-6f3d2b8e41aa";

/** Real cases from the domain every cold walk in this series uses. */
const CASES = [
  'County courthouse IT closet pallet, 18 intact ATX towers, no wipe certificate, manifest says "assorted IT equipment"',
  "Retail chain return pallet, 40 loose keyboards and mice, no storage media of any kind",
  "Hospital billing office pallet, 12 laptops, drives removed and bagged with a signed destruction log",
  "School district pallet, 60 Chromebooks, district IT provided a wipe certificate per serial",
  "Law firm pallet, 6 desktops and 2 NAS units, no paperwork, boxes taped shut",
  "Scrap dealer pallet, mixed power supplies and heatsinks, visibly stripped of boards",
  "Bank branch pallet, 9 teller terminals, drives present, wipe cert covers only 4 serials",
];

interface Mounted {
  container: HTMLElement;
  unmount: () => Promise<void>;
}

async function mountTable(rulebookId = RULEBOOK_ID): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <TooltipProvider>
        <SortingTablePage rulebookId={rulebookId} rulebookName="E-waste routing" />
      </TooltipProvider>,
    );
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function buttonSaying(container: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((button) => (button.textContent ?? "").includes(text));
  if (!match) throw new Error(`no button saying "${text}" on screen`);
  return match;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function typeInto(el: HTMLTextAreaElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** The keyboard the lane documents: 1…n place, s skips, u undoes. */
async function pressKey(key: string): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

/** Paste a real pile through the real door and start sorting. */
async function dealAndSort(mounted: Mounted, placements: string[]): Promise<void> {
  await click(buttonSaying(mounted.container, "Paste a list"));
  const box = mounted.container.querySelector<HTMLTextAreaElement>("textarea");
  if (!box) throw new Error("no paste box on screen");
  await typeInto(box, CASES.join("\n"));
  await click(buttonSaying(mounted.container, "Start sorting"));
  expect(mounted.container.textContent).toContain(`Case 1 of ${CASES.length}`);
  for (const key of placements) await pressKey(key);
}

describe("a sorted case survives a reload", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockDispatch.mockImplementation(async () => ({ data: null, error: null }));
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("comes back on the case you were on, and says so", async () => {
    const first = await mountTable();
    await dealAndSort(first, ["1", "2", "1", "3", "2"]);
    expect(first.container.textContent).toContain(`Case 6 of ${CASES.length}`);
    await first.unmount();

    // THE RELOAD: a brand new mount that knows only what the first one wrote.
    const back = await mountTable();
    expect(back.container.textContent).not.toContain(
      "Sort the pile, then we'll find the line",
    );
    expect(back.container.textContent).toContain(`Case 6 of ${CASES.length}`);
    expect(back.container.textContent).toContain("Picked up where you left off");
    expect(back.container.textContent).toContain("after sorting 5");
    await back.unmount();
  });

  it("keeps the piles she named, not the starting ones", async () => {
    const first = await mountTable();
    const named = Array.from(
      first.container.querySelectorAll<HTMLInputElement>("input"),
    ).slice(0, 3);
    expect(named).toHaveLength(3);
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    for (const [i, name] of ["Manual sort", "Shred", "Ask the client"].entries()) {
      await act(async () => {
        setter?.call(named[i], name);
        named[i].dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    await dealAndSort(first, ["1", "2"]);
    await first.unmount();

    const back = await mountTable();
    expect(back.container.textContent).toContain("Manual sort");
    expect(back.container.textContent).toContain("Ask the client");
    await back.unmount();
  });

  it("a fresh Rulebook still starts at the beginning", async () => {
    const first = await mountTable();
    await dealAndSort(first, ["1", "2"]);
    await first.unmount();

    const other = await mountTable("1d2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f");
    expect(other.container.textContent).toContain(
      "Sort the pile, then we'll find the line",
    );
    expect(other.container.textContent).not.toContain(
      "Picked up where you left off",
    );
    await other.unmount();
  });
});
