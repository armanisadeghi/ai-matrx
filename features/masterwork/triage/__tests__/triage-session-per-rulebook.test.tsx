/**
 * A TRIAGE SESSION BELONGS TO ONE RULEBOOK (Bugbot MEDIUM, 2026-09-13).
 *
 * `RulebookDetailPage` is ONE component instance reused as the route param
 * changes, so its triage state was page state, not Rulebook state: an open sort
 * — and the purpose the Expert had typed into it in her own words — survived
 * the move to another Rulebook, where starting it would have sorted THAT
 * Rulebook's drafts against the previous one's purpose.
 *
 * Two halves, both driven here through the real primitives:
 *   1. `useTriageDialogSession` — the open flag is held WITH the id it was
 *      opened for and dropped the instant they differ.
 *   2. `key={rulebook.id}` on the dialog — a remount, so `keep`, `set aside`
 *      and the preview switch cannot carry over (and neither can the durable
 *      run being rejoined, which `useDurableRun` reads once per mount).
 * Plus a source-level guard that the real page wires both.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { TriageDraftsDialog } from "../TriageDraftsDialog";
import { useTriageDialogSession } from "../../durable-run/rulebookDialogSession";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = NoopResizeObserver;

/** Which Rulebook's sort is in flight, by pointer key — nothing else matters. */
let runningFor: string | null = null;

jest.mock("../useTriageRun", () => ({
  useTriageRun: (rulebookId: string) => ({
    status: runningFor === rulebookId ? "running" : "idle",
    running: runningFor === rulebookId,
    stage: null,
    error: null,
    runId: runningFor === rulebookId ? `run-${rulebookId}` : null,
    result: null,
    start: jest.fn(),
    reset: jest.fn(),
  }),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppStore: () => ({ dispatch: jest.fn(), getState: () => ({}) }),
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => undefined,
}));

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const RULEBOOK_A = "44444444-4444-4444-8444-444444444444";
const RULEBOOK_B = "66666666-6666-4666-8666-666666666666";
const INTAKE: Record<string, string> = {
  [RULEBOOK_A]: "Deciding the next question for someone acutely ill.",
  [RULEBOOK_B]: "Deciding which line of a denied claim to appeal first.",
};

/**
 * THE PAGE'S OWN WIRING: one mounted page whose Rulebook changes under it,
 * exactly as the route param does. The session owns the open flag; the dialog
 * is keyed by the Rulebook.
 */
let lastOpen = false;
function PageWiring({ rulebookId }: { rulebookId: string | null }) {
  const triage = useTriageDialogSession(rulebookId);
  lastOpen = triage.open;
  return (
    <TooltipProvider>
      <button
        type="button"
        data-testid="open-triage"
        onClick={() => triage.setOpen(true)}
      >
        Sort the drafts
      </button>
      {rulebookId ? (
        <TriageDraftsDialog
          key={rulebookId}
          open={triage.open}
          onOpenChange={triage.setOpen}
          rulebookId={rulebookId}
          draftCount={336}
          intakeGoal={INTAKE[rulebookId]}
        />
      ) : null}
    </TooltipProvider>
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function show(rulebookId: string | null): Promise<void> {
  const localRoot = root;
  if (!localRoot) throw new Error("nothing mounted");
  await act(async () => {
    localRoot.render(<PageWiring rulebookId={rulebookId} />);
  });
}

function click(testid: string): void {
  const el = container?.querySelector(`[data-testid="${testid}"]`);
  if (!el) throw new Error(`no element ${testid}`);
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** The purpose field, as the Expert sees it. */
function keepField(): HTMLTextAreaElement {
  const el = document.querySelector<HTMLTextAreaElement>("#triage-keep");
  if (!el) throw new Error("the purpose field is not on screen");
  return el;
}

/** Type into a controlled textarea the way a browser does. */
function type(el: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  runningFor = null;
  lastOpen = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("moving to another Rulebook with the sort dialog open", () => {
  it("closes the sort, and never carries the purpose typed for the last one", async () => {
    await show(RULEBOOK_A);
    click("open-triage");
    expect(lastOpen).toBe(true);

    // She edits the prefilled purpose in her own words.
    const typed = "Only the first ten minutes at the bedside.";
    type(keepField(), typed);
    expect(keepField().value).toBe(typed);

    // 🚨 THE DEFECT: she moves to another Rulebook. The page does not remount.
    await show(RULEBOOK_B);
    expect(lastOpen).toBe(false);
    expect(document.querySelector("#triage-keep")).toBeNull();

    // Opening the sort here starts from THIS Rulebook's purpose, never hers
    // from the last one.
    click("open-triage");
    expect(lastOpen).toBe(true);
    expect(keepField().value).toBe(INTAKE[RULEBOOK_B]);
    expect(keepField().value).not.toContain("bedside");
  });

  it("does not reopen by itself when she comes back", async () => {
    // A session that only FILTERED by id would match again on return and an
    // empty dialog would remount on its own — the ingest dialog's round-11 bug.
    await show(RULEBOOK_A);
    click("open-triage");
    expect(lastOpen).toBe(true);

    await show(RULEBOOK_B);
    expect(lastOpen).toBe(false);

    await show(RULEBOOK_A);
    expect(lastOpen).toBe(false);
  });

  it("shows a sort in flight only on the Rulebook it is running for", async () => {
    // The run pointer is keyed `triage:<rulebookId>`, and the remount is what
    // makes the dialog read the key it is on now: `useDurableRun` rejoins once
    // per mount and never re-reads its pointer when the key changes.
    runningFor = RULEBOOK_A;
    await show(RULEBOOK_A);
    // The rejoin latch reopens the dialog onto the live sort.
    expect(lastOpen).toBe(true);

    await show(RULEBOOK_B);
    expect(lastOpen).toBe(false);
  });
});

/**
 * THE CLASS, held in the page itself: the page must not keep a bare boolean for
 * the sort, and must remount the dialog per Rulebook. Both are one line, and
 * both are exactly what regressed.
 */
describe("RulebookDetailPage's triage door", () => {
  const source = readFileSync(
    join(__dirname, "..", "..", "components", "detail", "RulebookDetailPage.tsx"),
    "utf8",
  );
  const code = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("*") && !line.startsWith("//"));

  it("owns the sort's open flag in a Rulebook-scoped session", () => {
    expect(code.some((l) => l.includes("useTriageDialogSession("))).toBe(true);
    expect(
      code.filter((l) => l.includes("triageOpen") && l.includes("useState(")),
    ).toEqual([]);
  });

  it("remounts the sort dialog per Rulebook", () => {
    const dialogAt = code.findIndex((l) => l.includes("<TriageDraftsDialog"));
    expect(dialogAt).toBeGreaterThan(-1);
    expect(code.slice(dialogAt, dialogAt + 8)).toContain("key={rulebook.id}");
  });
});
