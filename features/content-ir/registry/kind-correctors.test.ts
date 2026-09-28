/**
 * A draft_critique parsed on the CLIENT (DB-loaded messages, the hot re-split, the
 * terminal rehydrate — every path through `memoizedRegionEnvelope`) carries the rubric's
 * numbers before any renderer sees it. The server corrects its own envelopes
 * (aidream matrx_ai kind_correctors); this is the same correction for the region the
 * browser parses itself.
 */
import { IR_ENVELOPE_KEY } from "@ai-matrx/content-ir";
import { memoizedRegionEnvelope, withIrEnvelope } from "./region-envelope-memo";
import { KIND_CORRECTIONS_KEY, correctKindRegionSource } from "./kind-correctors";

const CRITIQUE = {
  __kind: "draft_critique",
  criteria: Array.from({ length: 13 }, (_, i) => ({ id: i + 1, score: i < 8 ? 1 : 0, note: `c${i + 1}` })),
  points: 7,
  score: 4,
  verdict: "workshopable",
};

function rootValue(source: string): Record<string, unknown> {
  const envelope = memoizedRegionEnvelope(source);
  expect(envelope).not.toBeNull();
  return (envelope!.root as unknown as { value: Record<string, unknown> }).value;
}

describe("client-side kind correction", () => {
  it("points 7 with criteria summing 8 reaches the envelope as 8 / 3 / start_over", () => {
    const source = JSON.stringify(CRITIQUE, null, 2);
    const value = rootValue(source);
    expect([value.points, value.score, value.verdict]).toEqual([8, 3, "start_over"]);
    const metadata = withIrEnvelope(source, undefined) as Record<string, unknown>;
    expect(metadata[IR_ENVELOPE_KEY]).toBeDefined();
    const notes = metadata[KIND_CORRECTIONS_KEY] as string[];
    expect(notes).toHaveLength(3);
    expect(notes.some((n) => n.includes("points was 7"))).toBe(true);
  });

  it("leaves a consistent critique and other kinds byte-identical", () => {
    const consistent = JSON.stringify({ ...CRITIQUE, points: 8, score: 3, verdict: "start_over" });
    expect(correctKindRegionSource(consistent)).toBeNull();
    expect(correctKindRegionSource(JSON.stringify({ __kind: "wine_tasting", rating: 3 }))).toBeNull();
    expect(correctKindRegionSource("{ not json")).toBeNull();
  });

  it("a critique that cannot be scored is shown as written, and says so", () => {
    const broken = JSON.stringify({ __kind: "draft_critique", criteria: "none", points: 7 });
    const out = correctKindRegionSource(broken);
    expect(out?.source).toBe(broken);
    expect(out?.corrections[0]).toMatch(/could not be checked/);
  });
});
