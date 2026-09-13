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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { IngestSourceDialog } from "../../components/detail/IngestSourceDialog";
import type { IngestLane } from "../../browse/approachLane";
import type { Rulebook } from "../../types";
import {
  DEFAULT_INGEST_LANE,
  findLiveIngestLane,
  useIngestDialogSession,
  useLiveIngestLane,
} from "../liveIngestLane";

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
/** Which surface has a FINISHED run whose summary is on screen. */
let settledSurface: string | null = null;

jest.mock("../useMasterworkRun", () => {
  const actual = jest.requireActual("../useMasterworkRun");
  return {
    ...actual,
    useMasterworkRun: (options: { surface: string }) => {
      mounted.push({ surface: options.surface });
      const running = options.surface === runningSurface;
      const settled = options.surface === settledSurface;
      return {
        running,
        stages: running ? ["Reading the case step by step…"] : [],
        result: settled
          ? {
              added: 11,
              duplicatesSkipped: 0,
              quotesUnverified: 0,
              failedChunks: 0,
              skippedWords: 0,
              followupSeed: null,
            }
          : null,
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
  settledSurface = null;
  lastTimelineOpen = false;
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
 * THE PAGE'S OWN WIRING, through the one session primitive the page uses
 * (`useIngestDialogSession`): the dialog's remount `key`, its `initialLane`,
 * its open state and `workspace_state.timeline_open` all read the session, and
 * the explicit doors call `openOn` with a named lane.
 */
let lastTimelineOpen = false;

function PageWiring({
  requested = null,
  onOpenChange,
}: {
  requested?: IngestLane | null;
  onOpenChange: (open: boolean) => void;
}) {
  const ingest = useIngestDialogSession(RULEBOOK_ID);
  lastTimelineOpen = ingest.timelineOpen;
  const openOn = ingest.openOn;
  // A deep link (`?ingest=file`) opens on its own lane, like the page's effect.
  React.useEffect(() => {
    if (requested) openOn(requested);
  }, [requested, openOn]);
  return (
    <TooltipProvider>
      {/* The page's explicit doors — "From a source" and the assist
          `open: "ingest"` chip — both name their lane. */}
      <button
        type="button"
        data-testid="from-a-source"
        onClick={() => ingest.openOn(DEFAULT_INGEST_LANE)}
      >
        From a source
      </button>
      <button
        type="button"
        data-testid="close-dialog"
        onClick={() => ingest.setOpen(false)}
      >
        Close
      </button>
      <IngestSourceDialog
        key={`ingest-${ingest.lane ?? "default"}`}
        open={ingest.open}
        onOpenChange={(next) => {
          ingest.setOpen(next);
          onOpenChange(next);
        }}
        rulebook={RULEBOOK}
        initialLane={ingest.lane}
      />
    </TooltipProvider>
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/**
 * Only the CLOCK is faked. React's scheduler rides microtasks / MessageChannel
 * and faking those deadlocks `act`.
 */
function useFrozenClock(): void {
  jest.useFakeTimers({
    doNotFake: [
      "queueMicrotask",
      "nextTick",
      "setImmediate",
      "clearImmediate",
      "performance",
      "requestAnimationFrame",
      "cancelAnimationFrame",
    ],
  });
}

function click(testid: string): void {
  const el = container?.querySelector(`[data-testid="${testid}"]`);
  if (!el) throw new Error(`no element ${testid}`);
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

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
  jest.useRealTimers();
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

  it("stops reporting a live lane within a beat of the run settling", async () => {
    // 🚨 THE STICKY-LANE DEFECT ITSELF (Bugbot, 2026-09-13): the probe read the
    // pointers ONCE, so the lane it found at mount was held for the life of the
    // page — a fact about a run that had been over for an hour. Remove the
    // re-probe and this test fails on its last assertion.
    useFrozenClock();
    writePointer("timeline");

    const shown: (IngestLane | null)[] = [];
    function Probe() {
      const lane = useLiveIngestLane(RULEBOOK_ID);
      shown.push(lane);
      return <span data-testid="lane">{lane ?? "none"}</span>;
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    const localRoot = createRoot(container);
    root = localRoot;
    await act(async () => {
      localRoot.render(<Probe />);
    });
    expect(shown.at(-1)).toBe("timeline");

    // The run finishes; `useDurableRun` keeps the pointer and marks it settled.
    writePointer("timeline", { settled: true });
    await act(async () => {
      jest.advanceTimersByTime(6_000);
    });
    expect(shown.at(-1)).toBeNull();
  });

  it("lets go of the timeline lane once that run settles", async () => {
    // 🚨 THE STICKY-LANE DEFECT (Bugbot, 2026-09-13). The probe used to read
    // the pointers once, so the lane it found at mount was held for the life of
    // the page: long after the case distillation finished, "From a source"
    // still opened the timeline dialog and could launch the case pipeline.
    useFrozenClock();
    writePointer("timeline");
    runningSurface = "timeline";
    await mountPage(null);
    expect(mounted.at(-1)?.surface).toBe("timeline");

    // The run finishes: `useDurableRun` keeps the pointer and marks it settled.
    writePointer("timeline", { settled: true });
    runningSurface = null;
    await act(async () => {
      jest.advanceTimersByTime(6_000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // "From a source" — the explicit door — now opens the INGEST lane.
    click("from-a-source");
    expect(mounted.at(-1)?.surface).toBe("ingest");
  });

  it("keeps the rejoined timeline dialog on screen when the run settles", async () => {
    // 🚨 THE DEFECT (Bugbot HIGH, 2026-09-13). Nothing named a lane after a
    // refresh, so the dialog's remount key tracked the PROBE — and the probe
    // drops its answer a beat after the pointer is marked settled. The dialog
    // the person was reading remounted onto an empty source form and the
    // finished summary was gone. The session latch is what keeps it.
    useFrozenClock();
    writePointer("timeline");
    runningSurface = "timeline";
    await mountPage(null);
    expect(mounted.at(-1)?.surface).toBe("timeline");
    expect(lastTimelineOpen).toBe(true);

    // The run finishes: the pointer is kept and marked settled, and the dialog
    // now shows its answer.
    writePointer("timeline", { settled: true });
    runningSurface = null;
    settledSurface = "timeline";
    await act(async () => {
      jest.advanceTimersByTime(6_000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Still the timeline dialog, still open, still showing the summary.
    expect(mounted.at(-1)?.surface).toBe("timeline");
    expect(lastTimelineOpen).toBe(true);
    expect(document.body.textContent ?? "").toContain(
      "11 suggested rules added as drafts",
    );
  });

  it("clears the latch on close, so the next open resolves again", async () => {
    // The mirror defect (Bugbot MEDIUM): an explicitly requested lane was never
    // cleared, so one click on "From a source" outranked the probe for the rest
    // of the session and a case started in another tab was never rejoined.
    useFrozenClock();
    await mountPage(null);

    click("from-a-source");
    expect(mounted.at(-1)?.surface).toBe("ingest");
    expect(lastTimelineOpen).toBe(false);

    click("close-dialog");
    expect(lastTimelineOpen).toBe(false);

    // Another tab starts a case on this Rulebook.
    writePointer("timeline");
    runningSurface = "timeline";
    await act(async () => {
      jest.advanceTimersByTime(6_000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // It is rejoined — the earlier click does not outrank it any more.
    expect(mounted.at(-1)?.surface).toBe("timeline");
    expect(lastTimelineOpen).toBe(true);
  });

  it("reports timeline_open from the latched session, not from the probe", async () => {
    // A live case with the dialog CLOSED is not a timeline dialog on screen.
    useFrozenClock();
    writePointer("timeline", { settled: true });
    await mountPage(null);
    expect(lastTimelineOpen).toBe(false);

    click("from-a-source");
    expect(lastTimelineOpen).toBe(false);

    click("close-dialog");
    expect(lastTimelineOpen).toBe(false);
  });

  it("opens the ingest lane from an explicit door even while a case is still running", async () => {
    // The assist chip's `open: "ingest"` path and the "From a source" menu item
    // are the same door: both name `DEFAULT_INGEST_LANE`, so a live — or stale —
    // timeline probe can never choose the pipeline a person's click starts.
    writePointer("timeline");
    runningSurface = "timeline";
    await mountPage(null);
    expect(mounted.at(-1)?.surface).toBe("timeline");

    click("from-a-source");

    expect(DEFAULT_INGEST_LANE).toBe("source");
    expect(mounted.at(-1)?.surface).toBe("ingest");
  });
});

/**
 * THE CLASS, held in the page itself: the ingest dialog's lane is owned by ONE
 * session primitive. A second source of truth for "which lane is on screen" —
 * a local `useState` twin, a bare boolean open flag, a re-derivation at the
 * call site — is how the lane changed under an open dialog in the first place.
 */
describe("RulebookDetailPage's ingest doors", () => {
  const source = readFileSync(
    join(__dirname, "..", "..", "components", "detail", "RulebookDetailPage.tsx"),
    "utf8",
  );
  const code = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("*") && !line.startsWith("//"));

  it("owns the ingest dialog's lane in one session, never a second flag", () => {
    expect(code.some((l) => l.includes("useIngestDialogSession("))).toBe(true);
    // No boolean open-state twin, and no local requested-lane twin: both were
    // the old shape, and both could disagree with the session.
    expect(code.filter((l) => l.includes("useState(false)") && l.includes("ingest"))).toEqual([]);
    expect(code.filter((l) => l.includes("setRequestedIngestLane"))).toEqual([]);
  });

  it("never opens the dialog without naming a lane", () => {
    // Every explicit door goes through `openIngestLane` (the session's `openOn`)
    // with a lane. `setIngestOpen(true)` — open on whatever the probe holds — is
    // exactly the call this class forbids.
    expect(code.filter((l) => l.includes("setIngestOpen(true)"))).toEqual([]);
    expect(code.some((l) => l.includes("openIngestLane(DEFAULT_INGEST_LANE)"))).toBe(
      true,
    );
  });
});
