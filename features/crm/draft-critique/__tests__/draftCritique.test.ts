// The Tough Editor's score is computed from its rubric, never taken on the model's
// word (BRIEFS-MEDIA-WRITING-CRISIS.md section 6). Same golden vectors as aidream's
// aidream/services/crm/draft_critique.py — the aidream test fails if the copies differ.

import { readFileSync } from "fs";
import path from "path";

import { bandScore, correctDraftCritique, type DraftCritique } from "../draftCritique";

interface Vector {
  name: string;
  input: DraftCritique;
  draft_type?: "pitch_email" | "press_release";
  expect: { points: number; score: number; verdict: string };
  corrections: number;
}

const { vectors } = JSON.parse(
  readFileSync(path.join(__dirname, "..", "draft-critique.vectors.json"), "utf8"),
) as { vectors: Vector[] };

describe("draft_critique score mapping — golden vectors shared with aidream", () => {
  it.each(vectors.map((v) => [v.name, v] as const))("%s", (_name, vector) => {
    const result = correctDraftCritique(vector.input, vector.draft_type);
    expect({
      points: result.critique.points,
      score: result.critique.score,
      verdict: result.critique.verdict,
    }).toEqual(vector.expect);
    expect(result.corrections).toHaveLength(vector.corrections);
  });

  it("points 7 with criteria summing 8 is corrected, loudly", () => {
    const result = correctDraftCritique(vectors[0].input);
    expect(result.critique.points).toBe(8);
    expect(result.corrections.some((c) => c.includes("points") && c.includes("7") && c.includes("8"))).toBe(true);
  });

  it("never mutates its input", () => {
    const before = JSON.stringify(vectors[0].input);
    correctDraftCritique(vectors[0].input);
    expect(JSON.stringify(vectors[0].input)).toBe(before);
  });

  it.each([
    [0, 26, 1], [3, 26, 2], [8, 26, 3], [9, 26, 4], [13, 26, 5], [14, 26, 6],
    [19, 26, 7], [20, 26, 8], [24, 26, 9], [25, 26, 10], [15, 24, 6], [17, 24, 7], [19, 24, 8], [24, 24, 10],
  ])("band edge %i/%i -> %i", (points, max, score) => {
    expect(bandScore(points, max)).toBe(score);
  });

  it.each(vectors.map((v) => [v.name, v] as const))("idempotent: %s", (_name, vector) => {
    const once = correctDraftCritique(vector.input, vector.draft_type);
    const twice = correctDraftCritique(once.critique, vector.draft_type);
    expect(twice.corrections).toEqual([]);
    expect(twice.critique).toEqual(once.critique);
  });

  it("refuses a critique with no criteria list", () => {
    expect(() => correctDraftCritique({ __kind: "draft_critique" } as unknown as DraftCritique)).toThrow();
  });
});
