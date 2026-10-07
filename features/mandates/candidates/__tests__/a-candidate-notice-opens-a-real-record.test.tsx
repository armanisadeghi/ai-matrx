/**
 * 🚨 A CANDIDATE NOTICE OPENS A REAL RECORD, AND THE PAIR SAYS WHY WHEN IT CAN'T SHOW SOMETHING
 * (Mandate Candidates F3, PLAN §2.6 / A2 / A3 / P15).
 *
 * The two declared notification events link to
 * `?panels=detail:mandate_candidate_run.<id>:as-window` and
 * `?panels=detail:mandate_candidate.<id>:as-window`. Before F3 those types were
 * unknown to the one type map, so the window opened as a neutral "Item" with no
 * loader — a notice promising a comparison opened a card that could show none.
 *
 * 1. REGISTRATION — through the REAL `resolveItemDetailType`, both types resolve,
 *    carry a loader that reads the aidream door, and say nothing about
 *    associations or history (not association targets).
 * 2. THE PAIR BODY — rendered with real server-shaped rows:
 *    - a viewer who can't open the live conversation gets the facts and the
 *      one line, never an answer, never Compare text (A2);
 *    - a stopped pair names the step and tool, and puts the proposed arguments
 *      beside what the live run actually called (P8);
 *    - a run with no conversation says so instead of offering a dead chat door,
 *      and a run with one opens the review walk on its request (P15);
 *    - Agree / Disagree appear only when the viewer holds the rung (P19).
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

const apiGet = jest.fn();
jest.mock("@/lib/api/typed-client", () => ({
  apiGet: (...args: unknown[]) => apiGet(...args),
  apiPost: jest.fn(),
  buildPath: (template: string, params: Record<string, string>) =>
    template.replace(/\{([^}]+)\}/g, (_: string, k: string) => params[k]),
}));
jest.mock("@/features/organizations/awaitWorkspace", () => ({
  awaitOrganizationForRecordRead: async () => ({ status: "ready" }),
}));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/components/cost/Cost", () => ({
  Cost: ({ usd }: { usd: number | null }) => <span>{usd == null ? "—" : String(usd)}</span>,
}));
jest.mock("@/features/mandates/admin/bench-output-preview", () => ({
  OutputPreview: ({ output }: { output: string }) => <div data-testid="md">{output}</div>,
}));
const openDiff = jest.fn();
jest.mock("@/features/overlays/openers/diffViewerWindow", () => ({
  useOpenDiffViewerWindow: () => openDiff,
}));
const openWalk = jest.fn();
jest.mock("@/features/overlays/openers/reviewWalkWindow", () => ({
  useOpenReviewWalkWindow: () => openWalk,
}));
jest.mock("../openers", () => ({
  useOpenCandidateSummary: () => jest.fn(),
  useOpenCandidateRun: () => jest.fn(),
}));
const units: Record<string, unknown> = {};
jest.mock("../transcripts", () => ({
  useTranscriptUnit: ({ conversationId: id }: { conversationId: string | null }) =>
    id ? (units[id] ?? { state: "none" }) : { state: "none" },
}));

import { resolveItemDetailType } from "@/features/item-presentation/detail";
import type { LiveCandidate, LiveCandidateRun } from "../api";
import { CandidateRunBody } from "../components/CandidateRunBody";

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

describe("registration", () => {
  it.each(["mandate_candidate_run", "mandate_candidate"])("%s resolves with a door-backed loader", (type) => {
    const recordType = resolveItemDetailType(type);
    expect(recordType).not.toBeNull();
    expect(recordType!.load).not.toBeNull();
    expect(recordType!.entityToken).toBeNull();
    expect(recordType!.associationTokens).toBeNull();
    expect(recordType!.history).toBe(false);
    expect(recordType!.extraSections).toEqual(expect.any(Function));
  });

  it("the pair loader reads the pair door, then its candidate", async () => {
    apiGet.mockReset();
    apiGet
      .mockResolvedValueOnce({ data: run() })
      .mockResolvedValueOnce({ data: { candidate: candidate(), runs: [run()] } });
    const recordType = resolveItemDetailType("mandate_candidate_run")!;
    const result = await recordType.load!(RUN_ID, new AbortController().signal);
    expect(apiGet.mock.calls.map((c) => c[0])).toEqual([
      `/mandate-candidate-runs/${RUN_ID}`,
      `/mandate-candidates/${CANDIDATE_ID}`,
    ]);
    expect("row" in result && recordType.title(result.row, null)).toBe("Page Summary — run 1");
  });
});

describe("the pair body", () => {
  beforeEach(() => {
    openWalk.mockReset();
    openDiff.mockReset();
    for (const k of Object.keys(units)) delete units[k];
  });

  it("a withheld payload shows the facts and the one line — no answers, no Compare", () => {
    render(
      <CandidateRunBody
        row={{
          run: run({ payload: null, payload_withheld_reason: null }),
          candidate: candidate(),
        }}
      />,
    );
    expect(screen.getByText("The details belong to a conversation you can't open.")).toBeTruthy();
    expect(screen.queryByTestId("md")).toBeNull();
    expect(screen.queryByText("Compare text")).toBeNull();
    expect(screen.getByText("Same")).toBeTruthy();
  });

  it("a stopped pair names the step and puts the proposed call beside the live call", () => {
    render(
      <CandidateRunBody
        row={{
          run: run({
            status: "stopped",
            verdict: null,
            stop_match: "same_tool_different_args",
            tool_dispositions: [
              { seq: 1, tool: "web_search", disposition: "borrowed" },
              { seq: 2, tool: "send_email", disposition: "stopped" },
            ],
            payload: {
              stopped_at: {
                step: 2,
                tool: "send_email",
                args: { to: "proposed@example.com" },
                live_call_at_same_step: { tool: "send_email", canonical_args: { to: "live@example.com" } },
              },
            },
          }),
          candidate: candidate(),
        }}
      />,
    );
    expect(screen.getByText("Stopped at step 2: send_email")).toBeTruthy();
    expect(screen.getByText("Same tool, different arguments")).toBeTruthy();
    expect(screen.getByText(/proposed@example\.com/)).toBeTruthy();
    expect(screen.getByText(/live@example\.com/)).toBeTruthy();
    expect(screen.getByText("Used the live result")).toBeTruthy();
  });

  it("a run with no conversation says so; a run with one opens the walk on its request", () => {
    units["conv-live"] = { state: "ready", unit: { unitKind: "agent_request", unitId: "chat-req-1" } };
    render(
      <CandidateRunBody
        row={{ run: run({ candidate_conversation_id: null }), candidate: candidate() }}
      />,
    );
    expect(screen.getByText("This run left no transcript.")).toBeTruthy();
    click(screen.getByText("What the live agent saw"));
    expect(openWalk).toHaveBeenCalledWith(
      expect.objectContaining({ unitKind: "agent_request", unitId: "chat-req-1", agentId: "agent-old" }),
    );
    expect(screen.queryByText("What the candidate saw")).toBeNull();
  });

  it("Agree / Disagree only for a viewer who holds the rung", () => {
    const { rerender } = render(<CandidateRunBody row={{ run: run(), candidate: candidate() }} />);
    expect(screen.getByText("Agree")).toBeTruthy();
    rerender(
      <CandidateRunBody
        key="viewer"
        row={{ run: run(), candidate: candidate({ can_decide: false }) }}
      />,
    );
    expect(screen.queryByText("Agree")).toBeNull();
  });

  it("Compare text opens the diff window with both answers", () => {
    render(<CandidateRunBody row={{ run: run(), candidate: candidate() }} />);
    click(screen.getByText("Compare text"));
    expect(openDiff).toHaveBeenCalledWith(
      expect.objectContaining({ original: "Live answer text", modified: "Candidate answer text" }),
    );
  });
});
