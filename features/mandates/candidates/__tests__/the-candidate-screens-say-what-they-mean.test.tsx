/**
 * 🚨 THE CANDIDATE SCREENS SAY WHAT THEY MEAN AND KEEP UP BY THEMSELVES
 * (Mandate Candidates FX-F — verification V1 defects D3, D15, D16, D18, D19).
 *
 * D3  a notice said "run 1 of 3 — failed" while the tab badge still said
 *     "0 of 3 in": the badge re-read only on a click or a reload. It now
 *     re-reads on the heartbeat (knob mandates.candidate_poll_seconds) while a
 *     candidate collects, and stops when nothing does.
 * D15 the live call's arguments at a stopped step rendered as one escaped
 *     string (`"{\\"action\\":…`); they are the structure they encode.
 * D16 the pair never said "inputs identical" — only chips like "Instructions:
 *     the candidate's own". It now LEADS with one line (PLAN A4 / P10).
 * D18 the set dialog defaulted "Applies to" to the seat, not the rung the live
 *     holder sits at.
 * D19 a pair interrupted and retried looked like a first attempt.
 */

import type { ReactElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

function render(element: ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(element);
  });
  return {
    rerender(next: ReactElement) {
      act(() => root!.render(next));
    },
  };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
});

function byText(text: string | RegExp): HTMLElement | null {
  const all = Array.from(container.querySelectorAll<HTMLElement>("*"));
  return (
    all.find((el) => {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();
      const full = (el.textContent ?? "").trim();
      return typeof text === "string" ? own === text || (full === text && el.children.length === 0) || full === text : text.test(own);
    }) ?? null
  );
}

const screen = {
  getByText(text: string | RegExp): HTMLElement {
    const el = byText(text);
    if (!el) throw new Error(`text not found: ${String(text)}\n${container.textContent}`);
    return el;
  },
  queryByText: byText,
  queryByTestId: (id: string) => container.querySelector(`[data-testid="${id}"]`),
};

function click(el: HTMLElement) {
  act(() => {
    (el.closest("button") ?? el).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}


jest.mock("@/lib/api/typed-client", () => ({ apiGet: jest.fn(), apiPost: jest.fn(), buildPath: jest.fn() }));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/components/cost/Cost", () => ({ Cost: () => <span>—</span> }));
jest.mock("@/features/mandates/admin/bench-output-preview", () => ({
  OutputPreview: ({ output }: { output: string }) => <div data-testid="md">{output}</div>,
}));
jest.mock("@/features/overlays/openers/diffViewerWindow", () => ({ useOpenDiffViewerWindow: () => jest.fn() }));
jest.mock("@/features/overlays/openers/reviewWalkWindow", () => ({ useOpenReviewWalkWindow: () => jest.fn() }));
jest.mock("../openers", () => ({ useOpenCandidateSummary: () => jest.fn(), useOpenCandidateRun: () => jest.fn() }));
jest.mock("../transcripts", () => ({ useTranscriptUnit: () => ({ state: "none" }) }));
const stableDispatch = jest.fn();
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => stableDispatch,
  useAppSelector: () => "user-1",
}));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  peekEffectiveKnob: () => 10,
  ensureEffectiveKnob: async () => 10,
  subscribeEffectiveKnob: () => () => undefined,
}));
const fetchLiveCandidates = jest.fn();
jest.mock("@/features/mandates/candidate-dialog/api", () => ({
  fetchLiveCandidates: (...args: unknown[]) => fetchLiveCandidates(...args),
}));

import type { LiveCandidate, LiveCandidateRun } from "../api";
import { CandidateRunBody } from "../components/CandidateRunBody";
import { useCandidateCount } from "@/features/mandates/record-next/useCandidateCount";
import { liveRungOf } from "@/features/mandates/candidate-dialog/target";

const RUN_ID = "1f5f32cf-3b36-51db-84f3-9eb6b95fdcbd";
const CANDIDATE_ID = "b6252566-54d5-4ef6-8123-86e58f740482";

function candidate(overrides: Partial<LiveCandidate> = {}): LiveCandidate {
  return {
    id: CANDIDATE_ID,
    mandate_id: "m1",
    mandate_key: "candidate_e2e.page_summary",
    rung: "user",
    holder_type: "agent",
    holder_id: "agent-new",
    holder_name: "Page summary (v3)",
    baseline_holder_type: "agent",
    baseline_holder_id: "agent-old",
    baseline_holder_name: "Page summary (latest version)",
    set_by: "u1",
    organization_id: "o1",
    status: "collecting",
    counts: { runs_wanted: 3, runs_in: 1 },
    can_decide: true,
    created_at: "2026-09-30T20:58:51Z",
    updated_at: "2026-09-30T20:58:51Z",
    ...overrides,
  };
}

function run(overrides: Partial<LiveCandidateRun> = {}): LiveCandidateRun {
  return {
    id: RUN_ID,
    candidate_id: CANDIDATE_ID,
    number: 1,
    door: "run_mandate",
    status: "completed",
    verdict: "same",
    live_request_id: "req-live",
    live_conversation_id: "conv-live",
    candidate_conversation_id: "conv-cand",
    live_metrics: { duration_ms: 35650, tokens_in: 548, tokens_out: 223 },
    candidate_metrics: { duration_ms: 36588, tokens_in: 548, tokens_out: 292 },
    input_differences: { identical: true, expected: [], flagged: [], unmeasured: [] },
    tool_dispositions: [],
    created_at: "2026-09-30T20:59:00Z",
    updated_at: "2026-09-30T21:00:00Z",
    payload: {
      door_args: { variables: { page_title: "Sonoran Desert" }, user_input: null },
      live_output: { text: "Live answer text", artifact: null },
      candidate_output: { text: "Candidate answer text", artifact: null },
      judge: { reasoning: "Neither summary is clearly better." },
    },
    ...overrides,
  };
}


describe("D16 — every pair leads with the shared-inputs line", () => {
  function leadLine(): string {
    const section = container.querySelector("[data-candidate-input]")!;
    const first = section.querySelector("h4")!.nextElementSibling as HTMLElement;
    return (first.textContent ?? "").trim();
  }

  it("the candidate's own instructions differing still reads as identical shared inputs", () => {
    render(
      <CandidateRunBody
        row={{
          run: run({ input_differences: { identical: false, expected: ["system", "tools_offered"], flagged: [], unmeasured: [] } }),
          candidate: candidate(),
        }}
      />,
    );
    expect(leadLine()).toBe("Shared inputs identical");
  });

  it("a shared part that differed is named in the lead line", () => {
    render(
      <CandidateRunBody
        row={{
          run: run({ input_differences: { identical: false, expected: ["system"], flagged: ["variables", "messages"], unmeasured: [] } }),
          candidate: candidate(),
        }}
      />,
    );
    expect(leadLine()).toBe("Shared inputs differed: Variables, Messages");
  });
});

describe("D15 — the live call's arguments render as the structure they are", () => {
  it("canonical JSON text becomes an object, not an escaped string", () => {
    render(
      <CandidateRunBody
        row={{
          run: run({
            status: "stopped",
            verdict: null,
            tool_dispositions: [{ seq: 1, tool: "note", disposition: "stopped" }],
            payload: {
              stopped_at: {
                step: 1,
                tool: "note",
                args: { action: "create", title: "V1CAND-1" },
                live_call_at_same_step: { tool: "note", canonical_args: '{"action":"create","title":"V1LIVE-1"}' },
              },
            },
          }),
          candidate: candidate(),
        }}
      />,
    );
    const blocks = Array.from(container.querySelectorAll("[data-candidate-stop] pre")).map((p) => p.textContent ?? "");
    const live = blocks.find((text) => text.includes("V1LIVE-1"))!;
    expect(live).toBeDefined();
    expect(live).not.toContain('\\"');
    expect(live).toContain('"title": "V1LIVE-1"');
  });
});

describe("D19 — a retried pair says which attempt it is", () => {
  it("attempt 2 is named; a first attempt says nothing", () => {
    const { rerender } = render(<CandidateRunBody row={{ run: run({ attempts: 2 }), candidate: candidate() }} />);
    expect(screen.getByText("Attempt 2")).toBeTruthy();
    rerender(<CandidateRunBody key="first" row={{ run: run({ attempts: 1 }), candidate: candidate() }} />);
    expect(screen.queryByText("Attempt 1")).toBeNull();
  });
});

describe("D18 — the dialog's default rung is where the live holder sits", () => {
  it("maps the resolution's provenance to the rung", () => {
    expect(liveRungOf("system", "org-1", "user-1")).toEqual({ rung: "global", principalId: null });
    expect(liveRungOf("org", "org-1", "user-1")).toEqual({ rung: "org", principalId: "org-1" });
    expect(liveRungOf("user", "org-1", "user-1")).toEqual({ rung: "user", principalId: "user-1" });
    expect(liveRungOf("run", "org-1", "user-1")).toBeNull();
  });
});

describe("D3 — the tab badge keeps up while a candidate collects", () => {
  function answer(runsIn: number, status: LiveCandidate["status"]) {
    const active = candidate({ status, counts: { runs_wanted: 3, runs_in: runsIn } });
    return { active, open: [active], history: [], forecast: { doors: {}, eligible_of_recent: [0, 0], window_days: 30 } };
  }
  function Badge() {
    const count = useCandidateCount("candidate_e2e.page_summary" as never);
    return <span data-testid="badge">{count?.value ?? "none"}</span>;
  }
  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    fetchLiveCandidates.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  it("re-reads on the heartbeat, then stops once nothing collects", async () => {
    fetchLiveCandidates
      .mockResolvedValueOnce(answer(0, "collecting"))
      .mockResolvedValueOnce(answer(1, "collecting"))
      .mockResolvedValueOnce(answer(3, "ready"))
      .mockImplementation(() => {
        throw new Error(`read ${fetchLiveCandidates.mock.calls.length} after nothing collects`);
      });
    render(<Badge />);
    await flush();
    expect(screen.queryByTestId("badge")!.textContent).toBe("0/3");

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await flush();
    expect(screen.queryByTestId("badge")!.textContent).toBe("1/3");

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await flush();
    expect(screen.queryByTestId("badge")!.textContent).toBe("3/3");
    expect(fetchLiveCandidates).toHaveBeenCalledTimes(3);

    // Ready: nothing collects, so the heartbeat has stopped.
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await flush();
    expect(fetchLiveCandidates).toHaveBeenCalledTimes(3);
  });
});
