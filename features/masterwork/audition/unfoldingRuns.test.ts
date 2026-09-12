/**
 * THE UNFOLDING VERDICT HAS TWO LAWFUL SHAPES (Bugbot, PR #222, 2026-09-12).
 *
 * The live terminal event carries `type:
 * "masterwork_audition_unfolding_verdict"`. The durable row's `result` column
 * stores the table WITHOUT it — which is exactly what `listUnfoldingAuditions`
 * reads back, and what a rejoin or a snapshot settles from. Requiring the
 * discriminator therefore turned every rejoined run into a loud failure ("the
 * server returned an incomplete result") on a run that had finished perfectly.
 *
 * ONE-LINE BUG EACH TEST CATCHES:
 *  · first  — re-requiring `type` and refusing the stored table;
 *  · second — accepting ANY untyped object, so somebody else's payload gets
 *    drawn as an empty scoreboard.
 */
import {
  UNFOLDING_AUDITION_EVENT,
  parseUnfoldingVerdict,
} from "./unfoldingRuns";

const CASES = [
  {
    case_item_id: "ci-1",
    label: "The 61-year-old with a headache",
    arms: [
      {
        arm: "desk",
        masterwork_id: "mw-1",
        masterwork_name: "The Diagnostic Desk",
        diagnosis: "match",
        dangerous_branch: "none",
        steps: 4,
        cost: 3,
        risk: 1,
      },
      { arm: "vanilla", diagnosis: "miss", dangerous_branch: "committed" },
    ],
  },
];

it("reads the LIVE terminal event", () => {
  const verdict = parseUnfoldingVerdict({
    type: UNFOLDING_AUDITION_EVENT,
    cases: CASES,
    diagnosis_score: 75,
    safety_score: 50,
    desk_beats_vanilla: true,
  })!;
  expect(verdict.cases).toHaveLength(1);
  expect(verdict.cases[0].arms).toHaveLength(2);
  expect(verdict.deskBeatsVanilla).toBe(true);
  expect(verdict.diagnosisScore).toBe(75);
});

it("reads the STORED table a rejoin comes back with, which carries no type", () => {
  const verdict = parseUnfoldingVerdict({
    cases: CASES,
    diagnosis_score: 75,
    safety_score: 50,
    desk_beats_vanilla: true,
  });
  expect(verdict).not.toBeNull();
  expect(verdict!.cases[0].label).toBe("The 61-year-old with a headache");
  expect(verdict!.cases[0].arms[0].masterworkName).toBe("The Diagnostic Desk");
  expect(verdict!.deskBeatsVanilla).toBe(true);
});

it("still refuses anything that is not this verdict", () => {
  // Somebody else's typed event.
  expect(
    parseUnfoldingVerdict({ type: "masterwork_audition_verdict", cases: CASES }),
  ).toBeNull();
  // Untyped, but nothing that only this verdict emits.
  expect(parseUnfoldingVerdict({ cases: CASES })).toBeNull();
  // The headline with no table at all — never an empty scoreboard.
  expect(parseUnfoldingVerdict({ desk_beats_vanilla: true, cases: [] })).toBeNull();
  expect(parseUnfoldingVerdict(null)).toBeNull();
  expect(parseUnfoldingVerdict("done")).toBeNull();
});
