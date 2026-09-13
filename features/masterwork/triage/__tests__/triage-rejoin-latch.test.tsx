/**
 * THE TRIAGE REJOIN HAPPENS FOR EVERY RUN, NOT ONCE PER PAGE (Bugbot MEDIUM,
 * 2026-09-13).
 *
 * A sort survives a refresh on the durable spine, so `TriageDraftsDialog`
 * reopens itself onto a run in flight. The latch that keeps it from re-firing
 * was set on the first auto-open and never cleared — so the dialog rejoined
 * exactly once in the life of the page. A LATER live sort (started in another
 * tab, or on a fresh pointer after `reset`) stayed hidden with the Start button
 * armed, and the Expert could pay for the same sort twice.
 *
 * This drives the real dialog through the same run states the page sees:
 * running → settled+closed → a second running run.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { TriageDraftsDialog } from "../TriageDraftsDialog";

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

/** What the fake durable run reports — the page's only inputs to the latch. */
let running = false;
let runId: string | null = null;

jest.mock("../useTriageRun", () => ({
  useTriageRun: () => ({
    status: running ? "running" : "idle",
    running,
    stage: running ? "Reading every draft…" : null,
    error: null,
    runId,
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

const RULEBOOK_ID = "44444444-4444-4444-8444-444444444444";

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const opened: boolean[] = [];

async function render(open: boolean) {
  const localRoot = root;
  if (!localRoot) throw new Error("nothing mounted");
  await act(async () => {
    localRoot.render(
      <TooltipProvider>
        <TriageDraftsDialog
          open={open}
          onOpenChange={(next) => opened.push(next)}
          rulebookId={RULEBOOK_ID}
          draftCount={336}
        />
      </TooltipProvider>,
    );
  });
}

beforeEach(() => {
  running = false;
  runId = null;
  opened.length = 0;
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

describe("the triage dialog rejoining a sort in flight", () => {
  it("reopens for a SECOND live run after the first one settled", async () => {
    // A sort is in flight when the page paints — the dialog reopens onto it.
    running = true;
    runId = "run-1";
    await render(false);
    expect(opened).toEqual([true]);

    // The page honours it: the dialog is on screen for the run it rejoined,
    // and the latch must not re-fire while that same run is open.
    await render(true);
    expect(opened).toEqual([true]);

    // The sort finishes and the Expert closes the dialog (`reset` clears the
    // run, so the pointer is gone too).
    running = false;
    runId = null;
    await render(true);
    await render(false);
    expect(opened).toEqual([true]);

    // 🚨 THE DEFECT: a NEW sort appears — another tab, or a fresh pointer after
    // reset. Before the fix the latch was still set from the first rejoin and
    // this second live sort stayed hidden.
    running = true;
    runId = "run-2";
    await render(false);
    expect(opened).toEqual([true, true]);
  });

  it("never re-fires while the run it rejoined is still going", async () => {
    running = true;
    runId = "run-1";
    await render(false);
    expect(opened).toEqual([true]);

    // The page has not applied the open yet (or closed it behind the run's
    // back): the same run must not ask a second time.
    await render(false);
    await render(false);
    expect(opened).toEqual([true]);
  });
});
