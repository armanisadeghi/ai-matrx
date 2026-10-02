/**
 * 🚨 V2 N1 — A CANDIDATE SCREEN KEEPS RE-READING UNTIL THE CANDIDATE IS
 * TERMINAL-FOR-NOW (ready / promoted / discarded / cancelled), NEVER MERELY
 * UNTIL ITS PAIRS ARE IN.
 *
 * V2 shot 09: "2 of 2 in · 2 failed", "Reject — 1 of 1 run failed", status
 * still Collecting — the counts had moved but the candidate's status and
 * recommendation (written by the server AFTER the last pair lands) never did.
 *
 * 1. An open pair window whose pair has finished keeps re-reading while its
 *    candidate is still collecting, and stops once the candidate is ready.
 * 2. A page that comes back into view re-reads at once instead of waiting out
 *    a throttled hidden-tab timer.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "user-1", useAppDispatch: () => jest.fn() }));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  peekEffectiveKnob: () => 10,
  ensureEffectiveKnob: async () => 10,
  subscribeEffectiveKnob: () => () => undefined,
}));
const fetchCandidateRun = jest.fn();
const fetchCandidate = jest.fn();
jest.mock("../api", () => ({
  fetchCandidateRun: (...args: unknown[]) => fetchCandidateRun(...args),
  fetchCandidate: (...args: unknown[]) => fetchCandidate(...args),
}));
jest.mock("../components/CandidateRunBody", () => ({
  CandidateRunBody: ({ row }: { row: { run: { status: string }; candidate: { status: string } | null } }) => (
    <span data-testid="pair">
      {row.run.status}/{row.candidate?.status ?? "none"}
    </span>
  ),
}));
jest.mock("../components/CandidateSummaryBody", () => ({ CandidateSummaryBody: () => null }));

import CandidateRecordBody from "../components/CandidateRecordBody";
import { useHeartbeat } from "../live";

let container: HTMLDivElement;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
});

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

function candidate(status: string) {
  return { id: "cand-1", status, counts: { runs_wanted: 2, runs_in: 2 } };
}
function pair(status: string) {
  return { id: "run-1", candidate_id: "cand-1", status, number: 2 };
}

describe("N1 — a finished pair keeps re-reading while its candidate still collects", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    fetchCandidateRun.mockReset();
    fetchCandidate.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  it("re-reads past 'all pairs in', then stops once the candidate is ready", async () => {
    fetchCandidateRun.mockResolvedValue(pair("failed"));
    fetchCandidate
      .mockResolvedValueOnce({ candidate: candidate("collecting") })
      .mockResolvedValueOnce({ candidate: candidate("ready") });

    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
      root.render(
        <CandidateRecordBody
          kind="run"
          row={{ run: pair("failed"), candidate: candidate("collecting") } as never}
        />,
      );
    });
    const shown = () => container.querySelector('[data-testid="pair"]')!.textContent;
    expect(shown()).toBe("failed/collecting");

    // The pair is done, but the candidate is not: the window must keep reading.
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await flush();
    expect(fetchCandidateRun).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await flush();
    expect(shown()).toBe("failed/ready");
    expect(fetchCandidateRun).toHaveBeenCalledTimes(2);

    // Ready is terminal-for-now: the heartbeat stops.
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await flush();
    expect(fetchCandidateRun).toHaveBeenCalledTimes(2);
  });
});

describe("N1 — a page that comes back into view re-reads at once", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  function Probe({ beat }: { beat: () => void }) {
    useHeartbeat(true, 10_000, beat);
    return null;
  }

  it("beats on visibilitychange → visible, without waiting for the timer", async () => {
    const beat = jest.fn();
    let state = "hidden";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
      root.render(<Probe beat={beat} />);
    });
    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(beat).not.toHaveBeenCalled();

    state = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(beat).toHaveBeenCalledTimes(1);
  });
});
