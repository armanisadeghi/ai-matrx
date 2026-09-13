/**
 * A REFRESH REJOINS THE LANE THAT IS RUNNING (Bugbot HIGH, 2026-09-13).
 *
 * `timeline` and `ingest` are separate durable-run pointers on purpose, but the
 * Rulebook page mounts ONE `IngestSourceDialog`, on the surface its current
 * lane picks. So a reload that names no lane mounted on `ingest`, watched the
 * ingest pointer, found nothing, and left a live case distillation invisible
 * with its Start button armed — the Expert could pay for the same run twice.
 *
 * The first block tests the probe that reads both pointers. The second drives
 * the REAL dialog through the page's own wiring
 * (`requestedIngestLane ?? ingestLane ?? liveIngestLane`) and proves the lane
 * that actually mounts, and that the dialog reopens itself onto it.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { IngestSourceDialog } from "../../components/detail/IngestSourceDialog";
import type { IngestLane } from "../../browse/approachLane";
import type { Rulebook } from "../../types";
import { findLiveIngestLane, useLiveIngestLane } from "../liveIngestLane";

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
(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
  NoopResizeObserver;

const RULEBOOK_ID = "44444444-4444-4444-8444-444444444444";
const RULEBOOK = {
  id: RULEBOOK_ID,
  organization_id: "55555555-5555-4555-8555-555555555555",
  name: "Fix — sources",
} as unknown as Rulebook;

/** Exactly what `useDurableRun` writes when a run is launched. */
function writePointer(
  surface: "ingest" | "timeline",
  over: { startedAt?: number; settled?: boolean; runId?: string } = {},
): void {
  window.localStorage.setItem(
    `matrx.masterwork-run.${surface}:${RULEBOOK_ID}`,
    JSON.stringify({
      runId: over.runId ?? `run-${surface}`,
      startedAt: over.startedAt ?? Date.now() - 30_000,
      target: "your pasted source",
      ...(over.settled ? { settled: true } : {}),
    }),
  );
}

/** The surface each mount of the dialog asked the durable run for. */
const mounted: { surface: string }[] = [];
/** Which surface the fake durable run reports as still in flight. */
let runningSurface: string | null = null;

jest.mock("../useMasterworkRun", () => {
  const actual = jest.requireActual("../useMasterworkRun");
  return {
    ...actual,
    useMasterworkRun: (options: { surface: string }) => {
      mounted.push({ surface: options.surface });
      const running = options.surface === runningSurface;
      return {
        running,
        stages: running ? ["Reading the case step by step…"] : [],
        result: null,
        status: running ? "running" : "idle",
        error: null,
        waitMessage: running ? "Picking this back up" : null,
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

beforeEach(() => {
  window.localStorage.clear();
  mounted.length = 0;
  runningSurface = null;
});

describe("findLiveIngestLane", () => {
  it("finds a live timeline run when nothing asked for the timeline lane", () => {
    writePointer("timeline");
    expect(findLiveIngestLane(RULEBOOK_ID)).toBe("timeline");
  });

  it("finds a live ingest run", () => {
    writePointer("ingest");
    expect(findLiveIngestLane(RULEBOOK_ID)).toBe("source");
  });

  it("reports nothing when no run is in flight", () => {
    expect(findLiveIngestLane(RULEBOOK_ID)).toBeNull();
  });

  it("does not drag the page onto a run that already finished", () => {
    writePointer("timeline", { settled: true });
    expect(findLiveIngestLane(RULEBOOK_ID)).toBeNull();
  });

  it("ignores a pointer too old to be worth rejoining", () => {
    writePointer("timeline", { startedAt: Date.now() - 3 * 60 * 60 * 1000 });
    expect(findLiveIngestLane(RULEBOOK_ID)).toBeNull();
  });

  it("prefers the most recently started when both lanes are live", () => {
    writePointer("ingest", { startedAt: Date.now() - 10 * 60 * 1000 });
    writePointer("timeline", { startedAt: Date.now() - 60_000 });
    expect(findLiveIngestLane(RULEBOOK_ID)).toBe("timeline");
  });

  it("keeps every Rulebook's runs to itself", () => {
    writePointer("timeline");
    expect(findLiveIngestLane("99999999-9999-4999-8999-999999999999")).toBeNull();
  });
});

/**
 * The page's own resolution, in the page's own order: an explicit lane (deep
 * link or the in-page picker) outranks the probe; the probe answers the case
 * where nobody asked. `key` follows the same expression, so the dialog
 * remounts onto the lane that is running.
 */
function PageWiring({
  requested = null,
  onOpenChange,
}: {
  requested?: IngestLane | null;
  onOpenChange: (open: boolean) => void;
}) {
  const live = useLiveIngestLane(RULEBOOK_ID);
  const lane = requested ?? live;
  const [open, setOpen] = React.useState(false);
  return (
    <TooltipProvider>
      <IngestSourceDialog
        key={`ingest-${lane ?? "default"}`}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          onOpenChange(next);
        }}
        rulebook={RULEBOOK}
        initialLane={lane}
      />
    </TooltipProvider>
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mountPage(requested: IngestLane | null = null) {
  const opened: boolean[] = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  const localRoot = createRoot(container);
  root = localRoot;
  await act(async () => {
    localRoot.render(
      <PageWiring
        requested={requested}
        onOpenChange={(next) => opened.push(next)}
      />,
    );
  });
  // The probe answers in an effect, which remounts the dialog on the live lane.
  await act(async () => {
    await Promise.resolve();
  });
  return opened;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("the Rulebook page after a refresh", () => {
  it("rejoins a live timeline run — the case cannot be started twice", async () => {
    writePointer("timeline");
    runningSurface = "timeline";

    const opened = await mountPage(null);

    // The dialog that is mounted now watches the TIMELINE pointer…
    expect(mounted.at(-1)?.surface).toBe("timeline");
    // …and it reopens itself, so the run is on screen rather than hidden.
    expect(opened).toContain(true);
    expect(document.body.textContent ?? "").toContain(
      "Reading the case step by step",
    );
  });

  it("rejoins a live ingest run on the ingest lane", async () => {
    writePointer("ingest");
    runningSurface = "ingest";

    const opened = await mountPage(null);

    expect(mounted.at(-1)?.surface).toBe("ingest");
    expect(opened).toContain(true);
  });

  it("never overrides a lane the person explicitly asked for", async () => {
    writePointer("timeline");
    runningSurface = "timeline";

    await mountPage("file");

    expect(mounted.at(-1)?.surface).toBe("ingest");
  });
});
