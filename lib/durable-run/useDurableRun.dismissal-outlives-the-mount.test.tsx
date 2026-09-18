/**
 * @jest-environment jsdom
 */
/**
 * A SITTING THE EXPERT CLOSED STAYS CLOSED — ACROSS MOUNTS, NOT JUST WITHIN ONE.
 *
 * ## The defect this exists to catch (cold walk 7, finding 3, 2026-09-17)
 *
 * Every durable-run dialog carries an auto-reopen latch, so a live run started
 * elsewhere surfaces instead of hiding behind an armed Start button (work paid
 * for twice). The "I closed it" half of that lived at the call site as
 *
 *     const dismissedRunIdRef = useRef<string | null>(null);
 *     ...
 *     if (!next && running) dismissedRunIdRef.current = run.runId;
 *
 * Two holes, and the walk fell through both:
 *
 *  1. **A ref is per MOUNT; the receipt it guards lives an hour.** The run
 *     pointer sits in localStorage under `POINTER_MAX_AGE_MS` (60 minutes), so
 *     on any later visit the dismissal was gone while the receipt was not.
 *  2. **The dismissal was only recorded `&& running`.** A sitting closed while
 *     it was showing its finished summary recorded nothing at all.
 *
 * So cold walk 7 closed a COMPLETED Shadow-the-inbox sitting and had its
 * dialog reopen, uninvited, on three later plain navigations to
 * `/masterwork/<id>` with no query param — each time on top of the page,
 * blocking a real control underneath it (the Daily Drip's "Open it", then the
 * Interview panel's context-mode picker), and once announcing that a run which
 * had finished long before was "still going on the server. Reconnecting…".
 *
 * ## The rule, and where it lives now
 *
 * A dismissal is a fact about the RUN, so it is written onto the run's own
 * receipt (`RunPointer.dismissed`) by `DurableRunHandle.dismiss()`, and read
 * back through `DurableRunHandle.surfacing`, which is the ONE question a
 * dialog's latch asks. It is true only for a run that is genuinely in flight
 * and that the person has not closed away from — so a FINISHED sitting's
 * receipt (`settled: true`, kept so its answer survives a refresh) can never
 * pull a surface open, while a run that really is still going still does.
 *
 * Proven red before green (2026-09-17): with the dismissal held in a
 * component ref, "the dismissal survives a remount" fails — a fresh mount
 * surfaces the same run again, which is exactly the walk's three reopenings.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: (request: Record<string, unknown>) => request,
}));

jest.mock(
  "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream",
  () => ({ adoptForeignStream: jest.fn() }),
);

jest.mock(
  "@/features/agents/redux/execution-system/active-requests/active-requests.slice",
  () => ({ removeRequest: jest.fn() }),
);

jest.mock("@/features/overlays/openers/liveRunWindow", () => ({
  useFloatingLiveRun: jest.fn(),
}));

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  // A PARTIAL MOCK OF A REAL MODULE DIES ON THE NEXT EXPORT (DD-239): spread
  // the real store so a new export can never take this suite down at import.
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

import { MASTERWORK_RUN_WIRE } from "@/features/masterwork/durable-run/useMasterworkRun";

import { peekDurableRun, useDurableRun } from "./useDurableRun";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The real Masterwork wire — this is the lane the walk was standing in. */
const WIRE = MASTERWORK_RUN_WIRE;

const KEY = "rulebook-1";
const POINTER = `${WIRE.pointerPrefix}${KEY}`;
const RUN_ID = "run-shadow-inbox-1";

/** The receipt a completed Shadow-the-inbox sitting leaves behind. */
function writeReceipt(extra: Record<string, unknown> = {}): void {
  window.localStorage.setItem(
    POINTER,
    JSON.stringify({
      runId: RUN_ID,
      startedAt: Date.now() - 4 * 60_000,
      target: "the thread you pasted",
      ...extra,
    }),
  );
}

let handle: {
  surfacing: boolean;
  dismiss: () => void;
} | null = null;

function Lane(): React.ReactElement {
  const run = useDurableRun<unknown>({
    wire: WIRE,
    key: KEY,
    path: "/masterwork/ingest" as never,
  } as never);
  handle = { surfacing: run.surfacing, dismiss: run.dismiss };
  return <div />;
}

let container: HTMLDivElement;
let root: Root;

function mount(): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Lane />);
  });
}

function unmount(): void {
  act(() => root.unmount());
  container.remove();
  handle = null;
}

beforeEach(() => {
  window.localStorage.clear();
  handle = null;
});

afterEach(() => {
  try {
    unmount();
  } catch {
    /* already unmounted */
  }
});

describe("a dismissal is a fact about the run, not about the mount", () => {
  it("writes the dismissal onto the run's own receipt", () => {
    writeReceipt();
    mount();
    act(() => handle!.dismiss());
    expect(peekDurableRun(WIRE, KEY)?.dismissed).toBe(true);
    // And only the dismissal changed — the receipt is still the way back to
    // the run itself.
    expect(peekDurableRun(WIRE, KEY)?.runId).toBe(RUN_ID);
  });

  it("survives a remount — THE walk-7 reopening", () => {
    writeReceipt();
    mount();
    act(() => handle!.dismiss());
    unmount();

    // A later, unrelated visit to the Rulebook page: a brand-new mount of the
    // same lane, reading the same hour-long receipt. With the dismissal in a
    // ref this mount knew nothing, and the latch pulled the dialog back up
    // over the page.
    mount();
    expect(handle!.surfacing).toBe(false);
  });

  it("does not surface a FINISHED sitting's receipt", () => {
    // `settled: true` is the receipt a completed run leaves so its answer
    // survives a refresh. It is an answer, not a run — it must never drag a
    // surface open by itself, which is what walk 7 watched happen three times
    // to a Shadow-the-inbox sitting that had already finished.
    writeReceipt({ settled: true });
    mount();
    expect(handle!.surfacing).toBe(false);
  });

  it("still surfaces a run that is genuinely still going", () => {
    // The latch's whole reason to exist: a live run must never hide behind an
    // armed Start button, or the same work gets paid for twice. An unsettled,
    // undismissed receipt is exactly that case.
    writeReceipt();
    mount();
    expect(handle!.surfacing).toBe(true);
  });

  it("leaves a fresh run free to surface — the dismissal retires with its receipt", () => {
    writeReceipt();
    mount();
    act(() => handle!.dismiss());
    expect(peekDurableRun(WIRE, KEY)?.dismissed).toBe(true);
    unmount();

    // A NEW sitting writes a new receipt. Nothing about the old dismissal may
    // ride along: the whole point of the latch is that work paid for once is
    // never hidden behind an armed Start button.
    writeReceipt({ runId: "run-shadow-inbox-2" });
    mount();
    expect(peekDurableRun(WIRE, KEY)?.dismissed).toBe(false);
  });

  it("does nothing when there is no receipt to dismiss", () => {
    mount();
    act(() => handle!.dismiss());
    expect(peekDurableRun(WIRE, KEY)).toBeNull();
    expect(handle!.surfacing).toBe(false);
  });
});
