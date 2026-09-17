/**
 * A FINISH CLICK STARTS THE FINISH, AND NEVER A CONVERSATION ROUND.
 *
 * 🚨 THE DEFECT, reproduced identically by two independent cold walks of the
 * Masterwork pipeline (2026-09-15 and 2026-09-16), each by a first-time Expert
 * following the product's own suggested path:
 *
 *   After 3 real turns, clicked Finish -> the dialog offered "Finish the
 *   interview" -> clicked it -> the room advanced to Round 4 with 5 new open
 *   questions, no documents written. Reopened Finish -> the button now read
 *   "Write the documents" -> clicked it -> the room advanced again, to Round
 *   5, the open-question count growing from 5 to 8 -- still no Vision
 *   document, no Requirements document, no cleaned transcript.
 *
 *   "This is the room the whole product is named after, and its one terminal
 *   action still does not terminate."
 *
 * TWO causes, one class. On the server, `interview.gate` refused the person's
 * first `done` and looped back into the router (fixed in aidream
 * `routing.done_decision`, guarded by
 * `aidream/services/vision_interview/tests/test_a_finish_finishes.py`). On
 * this side, the dialog made the person perform the server's TWO journeys
 * themselves: in any phase but `waiting_human` the confirm button called
 * `onStart` -- starting a run whose first act is a live interview round --
 * and only in `waiting_human` did it call `onFinish`. So the control labelled
 * Finish did something other than finish, and changed its own name between
 * presses to hide it.
 *
 * WHAT THIS PINS
 * --------------
 *  1. In EVERY run phase, confirming the Finish dialog calls the finish path
 *     exactly once. There is no phase in which it starts a conversation round
 *     instead. (RED against the pre-fix component: `onStart` is called and
 *     `onFinish` is not, in `idle`, `complete`, `starting` and `error`.)
 *  2. The button does not rename itself between presses. (RED: the label went
 *     "Finish the interview" -> "Write the documents" -> "Finish anyway".)
 *  3. When the room still has open questions, the dialog SAYS SO before the
 *     press. That information used to arrive only as an unrequested extra
 *     interview round behind the click; a confirmation a person can read
 *     belongs in front of it.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type RunPhase =
  | "idle"
  | "starting"
  | "running"
  | "waiting_human"
  | "complete"
  | "error";

interface RoomState {
  runPhase: RunPhase;
  openQuestions: number;
  openHoles: number;
}

const roomState: RoomState = {
  runPhase: "idle",
  openQuestions: 0,
  openHoles: 0,
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => undefined,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

jest.mock("../redux/vision-interview.slice", () => ({
  docViewChanged: (view: string) => ({ type: "docViewChanged", payload: view }),
  selectActiveSpeaker: () => null,
  selectPendingInterrupt: () => null,
  selectRoomSession: () => ({
    id: "session-1",
    vision_document: "",
    requirements_document: "",
    cleaned_transcript: "",
    finalized_at: null,
  }),
  selectRunError: () => null,
  selectRunPhase: () => roomState.runPhase,
  selectOpenQuestionCount: () => roomState.openQuestions,
  selectOpenHoleCount: () => roomState.openHoles,
}));

// The real ConfirmDialog renders through a portal-bearing Radix stack; this
// double keeps the CONTRACT that matters here (one confirm control carrying
// the label, wired to onConfirm) and nothing else.
jest.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    confirmLabel,
    onConfirm,
    content,
    description,
  }: {
    confirmLabel: string;
    onConfirm: () => void;
    content?: React.ReactNode;
    description?: string;
  }) => (
    <div>
      <p data-testid="description">{description}</p>
      <div data-testid="content">{content}</div>
      <button data-testid="confirm" onClick={onConfirm}>
        {confirmLabel}
      </button>
    </div>
  ),
}));

import { FinishInterviewDialog } from "../components/FinishInterviewDialog";

let container: HTMLDivElement;
let root: Root;

function mount(onFinish: () => Promise<boolean>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <FinishInterviewDialog
        open
        onOpenChange={() => undefined}
        onFinish={onFinish}
      />,
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  roomState.runPhase = "idle";
  roomState.openQuestions = 0;
  roomState.openHoles = 0;
});

const EVERY_PHASE: RunPhase[] = [
  "idle",
  "waiting_human",
  "complete",
  "error",
  "running",
  "starting",
];

describe("the Finish control finishes", () => {
  it.each(EVERY_PHASE)(
    "confirming in phase %s calls the finish path and nothing else",
    async (phase) => {
      roomState.runPhase = phase;
      const finish = jest.fn().mockResolvedValue(true);
      mount(finish);

      const confirm = container.querySelector<HTMLButtonElement>(
        '[data-testid="confirm"]',
      );
      expect(confirm).not.toBeNull();
      await act(async () => {
        confirm!.click();
      });

      const working = phase === "running" || phase === "starting";
      // A run already in flight is the one state that does nothing on a second
      // press — pressing Finish twice must not start a second finish.
      expect(finish).toHaveBeenCalledTimes(working ? 0 : 1);
    },
  );

  it("never renames itself between presses", async () => {
    const labels = new Set<string>();
    for (const phase of ["idle", "waiting_human", "complete"] as RunPhase[]) {
      roomState.runPhase = phase;
      const finish = jest.fn().mockResolvedValue(true);
      mount(finish);
      labels.add(
        container
          .querySelector('[data-testid="confirm"]')!
          .textContent!.trim(),
      );
      act(() => root.unmount());
      container.remove();
    }
    expect([...labels]).toEqual(["Finish and write the documents"]);
  });

  it("says what is still open BEFORE the press", async () => {
    roomState.runPhase = "waiting_human";
    roomState.openQuestions = 5;
    roomState.openHoles = 2;
    mount(jest.fn().mockResolvedValue(true));

    const text = container.textContent ?? "";
    expect(text).toContain("5 questions it has not had an answer to");
    expect(text).toContain("2 gaps it wanted to close");
    // And it is information, never a refusal: the control stays live.
    const confirm = container.querySelector<HTMLButtonElement>(
      '[data-testid="confirm"]',
    );
    expect(confirm!.disabled).toBe(false);
  });

  it("says nothing about open work when there is none", () => {
    roomState.runPhase = "waiting_human";
    mount(jest.fn().mockResolvedValue(true));
    expect(container.textContent ?? "").not.toContain("still has");
  });
});
