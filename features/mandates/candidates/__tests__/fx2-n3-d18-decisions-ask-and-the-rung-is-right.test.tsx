/**
 * 🚨 V2 N3 — PROMOTE ALWAYS ASKS FIRST, NAMING WHAT GOES LIVE IN PLACE OF WHAT,
 * AND SAYS A REJECT / HOLD RECOMMENDATION PLAINLY.
 * 🚨 V2 D18 — "APPLIES TO" SHOWS THE RIGHT LEVEL FROM ITS FIRST FRAME.
 *
 * N3 (V2 shots 16a/16b): Promote on the Candidates tab changed the live holder
 * on ONE click — even on a candidate the review said to Reject. Put back on the
 * summary record already confirmed; every decision on the tab now asks in the
 * same words (candidates/words.ts).
 *
 * D18 (V2 shots 03a/03b): on first paint the picker read "PersonalPersonal" (the
 * seat's rung, pushed twice) for about a second before the live rung arrived,
 * and Start could be clicked in that second.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({ rpc: () => Promise.resolve({ data: 3, error: null }) }),
  },
}));
// A STABLE dispatch: the panel's reads key on it, so a fresh one per render re-reads forever.
const stableDispatch = jest.fn();
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => stableDispatch, useAppSelector: () => "user-1" }));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  peekEffectiveKnob: () => 10,
  ensureEffectiveKnob: async () => 10,
  subscribeEffectiveKnob: () => () => undefined,
}));
jest.mock("@ai-matrx/design-system/data-table", () => ({ MatrxDataTable: () => null }));
jest.mock("@ai-matrx/design-system/data-table/uuid-cell", () => ({ MatrxUuidCell: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/components/cost/Cost", () => ({ Cost: () => null }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/features/mandates/candidates/components/CandidateHolderName", () => ({
  CandidateHolderName: ({ name }: { name: string }) => <span>{name}</span>,
}));
jest.mock("@/features/mandates/candidates/openers", () => ({
  useOpenCandidateRun: () => jest.fn(),
  useOpenCandidateSummary: () => jest.fn(),
}));
jest.mock("@/features/bindings/HolderAssignment", () => ({ HolderAssignment: () => null }));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
const mandateHolder = jest.fn();
jest.mock("@ai-matrx/chat/mandates/useMandateHolder", () => ({ useMandateHolder: () => mandateHolder() }));

const fetchLiveCandidates = jest.fn();
const fetchLiveCandidate = jest.fn();
const promoteLiveCandidate = jest.fn();
jest.mock("@/features/mandates/candidate-dialog/api", () => ({
  COVERED_DOORS: ["chat_start", "run_mandate"],
  candidateFailureSentence: (e: unknown) => String(e),
  fetchLiveCandidates: (...a: unknown[]) => fetchLiveCandidates(...a),
  fetchLiveCandidate: (...a: unknown[]) => fetchLiveCandidate(...a),
  promoteLiveCandidate: (...a: unknown[]) => promoteLiveCandidate(...a),
  putBackLiveCandidate: jest.fn(),
  discardLiveCandidate: jest.fn(),
  setLiveCandidate: jest.fn(),
}));

import { MandateCandidatesPanel } from "@/features/mandates/record-next/MandateCandidatesPanel";
import { SetCandidateDialog, rungChoicesOf } from "@/features/mandates/candidate-dialog/SetCandidateDialog";
import { promoteConfirmation } from "../words";

jest.setTimeout(60_000);

let container: HTMLDivElement;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  jest.clearAllMocks();
});

function mount(element: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(element);
  });
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

function active(recommendation: "promote" | "hold" | "reject") {
  return {
    id: "cand-1",
    mandate_key: "v2verify.errors",
    rung: "global",
    holder_type: "agent",
    holder_id: "a-new",
    holder_name: "V2 Broken candidate",
    baseline_holder_type: "agent",
    baseline_holder_id: "a-old",
    baseline_holder_name: "Page Summary Analyst",
    set_by: "user-1",
    status: "ready",
    recommendation,
    recommendation_reason: "never produced an answer — 2 of 2 runs failed",
    counts: { runs_wanted: 2, runs_in: 2, runs_failed: 2 },
    can_decide: true,
    created_at: "2026-10-01T01:00:00Z",
  };
}

describe("N3 — Promote on the Candidates tab asks first", () => {
  it.each([
    ["reject", "The review said reject."],
    ["hold", "The review said hold."],
  ] as const)("a %s recommendation is said plainly, and nothing is promoted on the first click", async (rec, line) => {
    const cand = active(rec);
    fetchLiveCandidates.mockResolvedValue({
      active: cand,
      open: [cand],
      history: [],
      forecast: { doors: {}, eligible_of_recent: [0, 0], window_days: 30 },
    });
    fetchLiveCandidate.mockResolvedValue({ candidate: cand, runs: [] });
    mount(<MandateCandidatesPanel mandateKey={"v2verify.errors" as never} mandateName="Errors" rung={{ rung: "global", principalId: null }} />);
    await flush();

    const promote = container.querySelector<HTMLButtonElement>("[data-candidate-promote]")!;
    expect(promote).not.toBeNull();
    await act(async () => {
      promote.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(promoteLiveCandidate).not.toHaveBeenCalled();
    const dialog = document.body.querySelector('[role="alertdialog"], [role="dialog"]');
    expect(dialog).not.toBeNull();
    const text = dialog!.textContent ?? "";
    expect(text).toContain("V2 Broken candidate replaces Page Summary Analyst for every real run.");
    expect(text).toContain(line);
    expect(text).toContain("Promote anyway");
  });

  it("the words: a promote recommendation names the swap and the evidence", () => {
    expect(
      promoteConfirmation({ candidateName: "B", baselineName: "A", recommendation: "promote", judged: 3 }),
    ).toEqual({
      title: "Make the candidate live?",
      description: "B replaces A for every real run. Based on 3 judged runs.",
      confirmLabel: "Promote",
    });
  });
});

describe("D18 — the Applies-to picker is right from its first frame", () => {
  it("lists each rung once (the live and the seat rung were pushed twice)", () => {
    const me = { rung: "user" as const, principalId: "user-1" };
    const labels = rungChoicesOf([me, me], "org-1", "user-1").map((c) => c.rung);
    expect(labels).toEqual(["global", "org", "user"]);
  });

  it("shows no rung, and Start waits, until the live holder's rung is read", async () => {
    mandateHolder.mockReturnValue({ holder: null, loading: true, error: null, organizationPending: false });
    fetchLiveCandidates.mockResolvedValue({
      active: null,
      open: [],
      history: [],
      forecast: { doors: {}, eligible_of_recent: [0, 0], window_days: 30 },
    });
    mount(
      <SetCandidateDialog
        mandateKey={"v2verify.errors" as never}
        mandateName="Errors"
        rung={{ rung: "user", principalId: "user-1" }}
        followLiveRung
        initialTarget={{ type: "agent", id: "a-new", versionId: null } as never}
        onClose={() => undefined}
      />,
    );
    await flush();
    const trigger = document.body.querySelector('[aria-label="Applies to"]')!;
    expect(trigger).not.toBeNull();
    expect(trigger.textContent).not.toMatch(/Personal/);
    const start = document.body.querySelector<HTMLButtonElement>('[data-testid="set-candidate-confirm"]')!;
    expect(start.disabled).toBe(true);
  });
});
