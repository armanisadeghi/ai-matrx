/**
 * ONE SURFACE, ONE LANE — TWO DIALOGS MAY NEVER SHARE A DURABLE-RUN POINTER
 * (Bugbot HIGH, 2026-09-13).
 *
 * `useMasterworkRun` keys the browser's durable-run receipt on
 * `${surface}:${rulebookId}`. Two dialogs that declare the same `surface` for
 * one Rulebook therefore write and read the SAME pointer — so a reload, or a
 * live-lane probe, can rejoin one dialog's run inside the other, which parses
 * the result with a different parser and runs a different completion path.
 *
 * That is not hypothetical. Two trials built a case lane on the same night.
 * Trial 8's lives in `IngestSourceDialog` on `/masterworks/ingest-timeline`;
 * trial 7's lives in `IngestTimelineDialog` on `/masterworks/ingest-unfolding`
 * and is the ONLY door that can seal a case as a held-out exam. Both declared
 * `timeline`. A held-out case — whose entire purpose is that its resolution
 * never reaches the screen — could have been rejoined by the dialog that
 * performs no seal-and-strip.
 *
 * A per-file comment cannot hold this. The guard renders the REAL dialogs, on
 * one Rulebook, and records what each one actually asks the shared hook for.
 * A second lane that reuses a taken surface fails here by name.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { BodyOfWorkDialog } from "../components/detail/BodyOfWorkDialog";
import { ChatImportDialog } from "../components/detail/ChatImportDialog";
import { IngestSourceDialog } from "../components/detail/IngestSourceDialog";
import { IngestTimelineDialog } from "../components/detail/IngestTimelineDialog";
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

/** What each dialog asked the shared hook for, in render order. */
const asked: { surface: string; path: string }[] = [];

jest.mock("@/features/masterwork/durable-run/useMasterworkRun", () => {
  const actual = jest.requireActual(
    "@/features/masterwork/durable-run/useMasterworkRun",
  );
  return {
    ...actual,
    useMasterworkRun: (options: { surface: string; path: string }) => {
      asked.push({ surface: options.surface, path: String(options.path) });
      return {
        status: "idle",
        running: false,
        stage: null,
        stages: [],
        error: null,
        runId: null,
        result: null,
        waitMessage: null,
        start: jest.fn(),
        launch: jest.fn(),
        reset: jest.fn(),
        fail: jest.fn(),
        retry: jest.fn(),
      };
    },
  };
});

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

const RULEBOOK_ID = "66666666-6666-4666-8666-666666666666";
const RULEBOOK = {
  id: RULEBOOK_ID,
  organization_id: "77777777-7777-4777-8777-777777777777",
  name: "Fix — one Rulebook, every lane",
} as unknown as Rulebook;

/**
 * Every dialog that can be open on ONE Rulebook at the same time. The source
 * dialog appears TWICE because its `initialLane` prop switches it between
 * two different endpoints — the pair that actually collided.
 */
const LANES: { name: string; render: () => React.ReactElement }[] = [
  {
    name: "IngestSourceDialog (paste/upload)",
    render: () => (
      <IngestSourceDialog open onOpenChange={() => {}} rulebook={RULEBOOK} />
    ),
  },
  {
    name: "IngestSourceDialog (timeline)",
    render: () => (
      <IngestSourceDialog
        open
        initialLane="timeline"
        onOpenChange={() => {}}
        rulebook={RULEBOOK}
      />
    ),
  },
  {
    name: "IngestTimelineDialog (unfolding, the sealing door)",
    render: () => (
      <IngestTimelineDialog open onOpenChange={() => {}} rulebook={RULEBOOK} />
    ),
  },
  {
    name: "BodyOfWorkDialog",
    render: () => (
      <BodyOfWorkDialog open onOpenChange={() => {}} rulebook={RULEBOOK} />
    ),
  },
  {
    name: "ChatImportDialog",
    render: () => (
      <ChatImportDialog open onOpenChange={() => {}} rulebook={RULEBOOK} />
    ),
  },
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  asked.length = 0;
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

async function surfaceOf(lane: (typeof LANES)[number]): Promise<{
  surface: string;
  path: string;
}> {
  const localRoot = root;
  if (!localRoot) throw new Error("nothing mounted");
  asked.length = 0;
  await act(async () => {
    localRoot.render(<TooltipProvider>{lane.render()}</TooltipProvider>);
  });
  const first = asked[0];
  if (!first) throw new Error(`${lane.name} never called useMasterworkRun`);
  return first;
}

it("no two lanes on one Rulebook share a durable-run surface", async () => {
  const seen = new Map<string, string>();
  const collisions: string[] = [];

  for (const lane of LANES) {
    const { surface } = await surfaceOf(lane);
    const owner = seen.get(surface);
    if (owner) {
      collisions.push(
        `${lane.name} declares surface "${surface}", already taken by ${owner}`,
      );
    } else {
      seen.set(surface, lane.name);
    }
  }

  expect(collisions).toEqual([]);
});

it("the sealing door owns a surface of its own, and it is not the incumbent's", async () => {
  // Named explicitly, not just "distinct": this is the pair whose collision
  // could have rendered a held-out case's resolution through a dialog that
  // does not strip it.
  const incumbent = await surfaceOf(LANES[1]);
  const sealing = await surfaceOf(LANES[2]);

  expect(incumbent.surface).toBe("timeline");
  expect(incumbent.path).toBe("/masterworks/ingest-timeline");
  expect(sealing.surface).toBe("unfolding");
  expect(sealing.path).toBe("/masterworks/ingest-unfolding");
});
