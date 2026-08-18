// FastFire live session adaptation (VISION §3, WP3 gap 1) — forcing tests.
// These pass only if a mid-drill gradeResolved actually REORDERS the unseen
// queue toward the struggling topic, never touches seen/active cards, stamps
// the explanation receipt, and stays inert when adaptation is off or the
// signal is uniform.

import reducer, {
  startDrill,
  beginRecording,
  advanceCard,
  commitAdvance,
  updateConfig,
  gradeResolved,
  openSetup,
  type DrillCard,
  type FastFireState,
} from "../fastFireSlice";
import type { SpokenGradeRubric } from "../../agents/grading-core";

const RUBRIC: SpokenGradeRubric = {} as SpokenGradeRubric;

function card(id: string, topic: string | null, position: number): DrillCard {
  return { id, front: `front ${id}`, back: `back ${id}`, position, topic };
}

/** algebra at 0/2, geometry seen once and aced; unseen tail mixes both. */
const CARDS: DrillCard[] = [
  card("a1", "algebra", 0),
  card("g1", "geometry", 1),
  card("g2", "geometry", 2),
  card("g3", "geometry", 3),
  card("a2", "algebra", 4),
  card("a3", "algebra", 5),
];

function drillAtIndex(index: number, adaptive = true): FastFireState {
  let state = reducer(undefined, openSetup({ setId: "set-1" }));
  state = reducer(state, updateConfig({ adaptive }));
  state = reducer(
    state,
    startDrill({ cards: CARDS, sessionId: "run-1", setName: "Test" }),
  );
  state = reducer(state, beginRecording());
  for (let i = 0; i < index; i++) {
    state = reducer(state, advanceCard({ reason: "timeout" }));
    state = reducer(state, commitAdvance());
  }
  return state;
}

function resolve(
  state: FastFireState,
  cardId: string,
  score: number,
): FastFireState {
  return reducer(
    state,
    gradeResolved({
      cardId,
      runId: "run-1",
      score,
      result: score >= 0.8 ? "correct" : "incorrect",
      rubric: RUBRIC,
      transcript: "",
      feedback: "",
      missing: [],
    }),
  );
}

describe("FastFire live adaptation", () => {
  test("a failing grade promotes the struggling topic in the unseen tail", () => {
    // Recording card index 1 (g1); a1 failed, g1's grade comes back perfect.
    let state = drillAtIndex(1);
    state = resolve(state, "a1", 0);
    state = resolve(state, "g1", 1);

    // Seen/active prefix untouched.
    expect(state.cards.slice(0, 2).map((c) => c.id)).toEqual(["a1", "g1"]);
    // Unseen tail: both algebra cards (weight 1.0) ahead of geometry (0.0),
    // preserving their own relative order.
    expect(state.cards.slice(2).map((c) => c.id)).toEqual([
      "a2",
      "a3",
      "g2",
      "g3",
    ]);
    // The receipt names the struggling topic so the UI can explain the shift.
    expect(state.adaptation).not.toBeNull();
    expect(state.adaptation?.focusTopic).toBe("algebra");
    expect(state.adaptation?.count).toBeGreaterThan(0);
  });

  test("adaptive=false never reorders and leaves no receipt", () => {
    let state = drillAtIndex(1, false);
    state = resolve(state, "a1", 0);
    expect(state.cards.map((c) => c.id)).toEqual(CARDS.map((c) => c.id));
    expect(state.adaptation).toBeNull();
  });

  test("uniform performance produces no shuffle", () => {
    let state = drillAtIndex(1);
    state = resolve(state, "a1", 1);
    state = resolve(state, "g1", 1);
    expect(state.cards.map((c) => c.id)).toEqual(CARDS.map((c) => c.id));
    expect(state.adaptation).toBeNull();
  });

  test("a stale grade from a previous run adapts nothing", () => {
    let state = drillAtIndex(1);
    state = reducer(
      state,
      gradeResolved({
        cardId: "a1",
        runId: "stale-run",
        score: 0,
        result: "incorrect",
        rubric: RUBRIC,
        transcript: "",
        feedback: "",
        missing: [],
      }),
    );
    expect(state.cards.map((c) => c.id)).toEqual(CARDS.map((c) => c.id));
    expect(state.adaptation).toBeNull();
  });

  test("grades landing after the drill completes leave the queue alone", () => {
    // Walk to finalizing (past the last card), then resolve a failure.
    let state = drillAtIndex(CARDS.length - 1);
    state = reducer(state, advanceCard({ reason: "timeout" }));
    state = reducer(state, commitAdvance());
    expect(state.phase).toBe("finalizing");
    state = resolve(state, "a1", 0);
    expect(state.cards.map((c) => c.id)).toEqual(CARDS.map((c) => c.id));
    expect(state.adaptation).toBeNull();
  });
});
