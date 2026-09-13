/**
 * A REJOIN HAPPENS FOR EVERY RUN, NOT ONCE PER PAGE (Bugbot MEDIUM, 2026-09-13).
 *
 * Four Masterwork dialogs reopen themselves onto a run still in flight on the
 * durable spine — the triage sort, the source ingest, the body-of-work lane and
 * the chat import. All four held the same latch, `reopenedRef`, set on the
 * first auto-open and NEVER cleared: so each rejoined exactly once in the life
 * of the page. A later live run — started in another tab, or on a fresh pointer
 * after the last one was reset — stayed hidden with the Start button armed, and
 * the Expert could pay for the same work twice.
 *
 * This drives all four REAL dialogs through their own prop contracts, over the
 * run states the page actually produces: running → settled and closed → a
 * second running run. One parametrized case per dialog, because the latch is a
 * class, not a bug in one file.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { BodyOfWorkDialog } from "../components/detail/BodyOfWorkDialog";
import { ChatImportDialog } from "../components/detail/ChatImportDialog";
import { IngestSourceDialog } from "../components/detail/IngestSourceDialog";
import { IngestTimelineDialog } from "../components/detail/IngestTimelineDialog";
import { TriageDraftsDialog } from "../triage/TriageDraftsDialog";
import type { Rulebook } from "../types";

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

/**
 * What the fake durable run reports. The latch reads exactly two things — is a
 * run going, and which one — so those are the only inputs the test moves.
 */
let running = false;
let runId: string | null = null;

/** The one handle shape every one of these dialogs reads. */
function fakeRun() {
  return {
    status: running ? "running" : "idle",
    running,
    stage: running ? "Reading every draft…" : null,
    stages: running ? ["Reading every draft…"] : [],
    error: null,
    runId,
    result: null,
    waitMessage: running ? "Picking this back up" : null,
    start: jest.fn(),
    launch: jest.fn(),
    reset: jest.fn(),
    fail: jest.fn(),
    retry: jest.fn(),
  };
}

// The three ingest-family dialogs call the shared hook directly…
jest.mock("@/features/masterwork/durable-run/useMasterworkRun", () => {
  const actual = jest.requireActual(
    "@/features/masterwork/durable-run/useMasterworkRun",
  );
  return { ...actual, useMasterworkRun: () => fakeRun() };
});

// …and the triage dialog through its own face of it.
jest.mock("@/features/masterwork/triage/useTriageRun", () => ({
  useTriageRun: () => fakeRun(),
}));

jest.mock("@/features/files/handler/hooks/useFileUpload", () => ({
  useFileUpload: () => ({ upload: jest.fn() }),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppStore: () => ({ dispatch: jest.fn(), getState: () => ({}) }),
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => undefined,
}));

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

/**
 * These dialogs read their own side boards from the DB on open. None of that is
 * what this test asserts, so the client is an empty-result chain: every builder
 * method returns the chain, and awaiting it yields no rows.
 */
jest.mock("@/utils/supabase/client", () => {
  const query: Record<string, unknown> = new Proxy(
    {
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve({ data: [], error: null })),
    },
    {
      get(target: Record<string, unknown>, prop: string) {
        if (prop in target) return target[prop];
        return () => query;
      },
    },
  );
  const client = { from: () => query, schema: () => client };
  return { supabase: client, createClient: () => client };
});

const RULEBOOK_ID = "44444444-4444-4444-8444-444444444444";
const RULEBOOK = {
  id: RULEBOOK_ID,
  organization_id: "55555555-5555-4555-8555-555555555555",
  name: "Fix — sources",
} as unknown as Rulebook;

/**
 * Each dialog rendered through its OWN prop contract — the page's props, not a
 * shared wrapper, so a dialog that stops taking `onOpenChange` fails here.
 */
const DIALOGS: {
  name: string;
  render: (
    open: boolean,
    onOpenChange: (next: boolean) => void,
  ) => React.ReactElement;
}[] = [
  {
    name: "TriageDraftsDialog",
    render: (open, onOpenChange) => (
      <TriageDraftsDialog
        open={open}
        onOpenChange={onOpenChange}
        rulebookId={RULEBOOK_ID}
        draftCount={336}
      />
    ),
  },
  {
    name: "IngestSourceDialog",
    render: (open, onOpenChange) => (
      <IngestSourceDialog
        open={open}
        onOpenChange={onOpenChange}
        rulebook={RULEBOOK}
      />
    ),
  },
  {
    name: "BodyOfWorkDialog",
    render: (open, onOpenChange) => (
      <BodyOfWorkDialog
        open={open}
        onOpenChange={onOpenChange}
        rulebook={RULEBOOK}
      />
    ),
  },
  {
    name: "ChatImportDialog",
    render: (open, onOpenChange) => (
      <ChatImportDialog
        open={open}
        onOpenChange={onOpenChange}
        rulebook={RULEBOOK}
      />
    ),
  },
  {
    // The fifth, added 2026-09-13: this dialog was built after the other four
    // were converted, so it reproduced the latch the class fix had just
    // removed — which is exactly why the case list, not a per-file test, is
    // the guard. Its unfold is also the most expensive of the five to pay for
    // twice.
    name: "IngestTimelineDialog",
    render: (open, onOpenChange) => (
      <IngestTimelineDialog
        open={open}
        onOpenChange={onOpenChange}
        rulebook={RULEBOOK}
      />
    ),
  },
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const opened: boolean[] = [];

async function render(
  dialog: (typeof DIALOGS)[number],
  open: boolean,
): Promise<void> {
  const localRoot = root;
  if (!localRoot) throw new Error("nothing mounted");
  await act(async () => {
    localRoot.render(
      <TooltipProvider>
        {dialog.render(open, (next) => opened.push(next))}
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

describe.each(DIALOGS.map((d) => [d.name, d] as const))(
  "%s rejoining a run in flight",
  (_name, dialog) => {
    it("reopens for a SECOND live run after the first one settled", async () => {
      // A run is in flight when the page paints — the dialog reopens onto it.
      running = true;
      runId = "run-1";
      await render(dialog, false);
      expect(opened).toEqual([true]);

      // The page honours it: the dialog is on screen for the run it rejoined,
      // and the latch must not re-fire while that same run is open.
      await render(dialog, true);
      expect(opened).toEqual([true]);

      // The run finishes and the Expert closes the dialog (`reset` clears the
      // run, so the pointer goes with it).
      running = false;
      runId = null;
      await render(dialog, true);
      await render(dialog, false);
      expect(opened).toEqual([true]);

      // 🚨 THE DEFECT: a NEW run appears — another tab, or a fresh pointer
      // after reset. Before the fix the latch was still set from the first
      // rejoin and this second live run stayed hidden.
      running = true;
      runId = "run-2";
      await render(dialog, false);
      expect(opened).toEqual([true, true]);
    });

    it("never re-fires while the run it rejoined is still going", async () => {
      running = true;
      runId = "run-1";
      await render(dialog, false);
      expect(opened).toEqual([true]);

      // The page has not applied the open yet (or closed it behind the run's
      // back): the same run must not ask a second time.
      await render(dialog, false);
      await render(dialog, false);
      expect(opened).toEqual([true]);
    });
  },
);
