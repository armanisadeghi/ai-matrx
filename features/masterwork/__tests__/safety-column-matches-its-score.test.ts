/**
 * THE EXAM MUST NOT PAINT A PASS AS A FAILURE (Bugbot HIGH, 2026-09-13).
 *
 * The unfolding Audition's `dangerous_branch` column answers one question: did
 * the desk go down the dangerous path? `none` is therefore the TOP of the
 * scale — the scorer is literally `none 1 / considered 0.5 / committed 0`.
 *
 * The table painted `none` in `text-destructive`: the same red as `committed`,
 * which is the worst outcome there is. So a desk that stayed clear of the
 * dangerous branch on every sealed case scored 100 for safety and was shown to
 * the Expert as if it had failed. The copy made it worse — "Never considered"
 * reads as "the desk never thought of it", not "the desk never went there".
 *
 * This is the whole reason the Audition exists: it is the surface that tells
 * the Expert whether her desk is safe. A surface that inverts its own headline
 * is worse than no surface, because she would act on it.
 *
 * The guard pins the ORDER, not the exact words: whatever the labels become,
 * the safest verdict may never be toned worse than the most dangerous one, and
 * the three tones must be distinct so the column still says something.
 */
import { readFileSync } from "fs";
import { join } from "path";

/** Tones this design system uses, worst-to-best, as the scorer ranks them. */
const TONE_RANK: Record<string, number> = {
  "text-destructive": 0,
  "text-muted-foreground": 1,
  "text-foreground": 2,
  "text-primary": 3,
};

function branchCopy(): Record<string, { label: string; cls: string }> {
  const source = readFileSync(
    join(
      __dirname,
      "..",
      "components",
      "masterworks",
      "UnfoldingAuditionPanel.tsx",
    ),
    "utf8",
  );
  const start = source.indexOf("const BRANCH_COPY");
  expect(start).toBeGreaterThan(-1);
  const body = source.slice(start, source.indexOf("};", start));
  const out: Record<string, { label: string; cls: string }> = {};
  for (const verdict of ["none", "considered", "committed"]) {
    const match = new RegExp(
      `\\b${verdict}:\\s*\\{\\s*label:\\s*"([^"]+)",\\s*cls:\\s*"([^"]+)"`,
    ).exec(body);
    expect(match).not.toBeNull();
    out[verdict] = { label: match![1], cls: match![2] };
  }
  return out;
}

it("tones the safety verdicts in the same order the scorer ranks them", () => {
  const copy = branchCopy();
  const rank = (v: string) => {
    const tone = TONE_RANK[copy[v].cls];
    expect(tone).toBeDefined();
    return tone;
  };

  // none (scores 1) is the safest; committed (scores 0) is the most dangerous.
  expect(rank("none")).toBeGreaterThan(rank("committed"));
  expect(rank("none")).toBeGreaterThanOrEqual(rank("considered"));
  expect(rank("considered")).toBeGreaterThanOrEqual(rank("committed"));
});

it("does not give the safest and the most dangerous verdict the same tone", () => {
  const copy = branchCopy();
  expect(copy.none.cls).not.toBe(copy.committed.cls);
});

it("does not describe the safest verdict as something the desk failed to do", () => {
  const copy = branchCopy();
  // "Never considered" was the original, and it reads as a miss rather than a
  // pass. A label for the top of a safety scale must not open with a negation.
  expect(copy.none.label.toLowerCase()).not.toMatch(/^(never|no |not |missed)/);
});
