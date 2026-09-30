// THE COUNT LAW (verify-1, 2026-09-28): asked for 5 cards, got 10. A requested
// total is handed out exactly across every section, and the merge never ships
// more than was asked — nor two cards that teach the same thing.
import { knobInt } from "@/lib/knobs/featureKnobs";
import { planCoverage } from "../coverage";
import { runAgentExtraction } from "../runAgentExtraction";
import { isNearDuplicateQA, mergeSectionItems, segmentedGenerate } from "../segmentedGenerate";
import type { ConvertContext, ConvertProgress } from "../types";

jest.mock("@/lib/knobs/featureKnobs", () => ({ knobInt: jest.fn() }));
jest.mock("../runAgentExtraction", () => ({ runAgentExtraction: jest.fn() }));

const VALUES: Record<string, number> = {
  segment_target_chars: 100,
  max_segments: 20,
  max_items_total: 50,
  min_items_total: 2,
  items_per_segment_deck: 2,
  segment_concurrency: 1,
};

beforeEach(() => {
  jest.mocked(knobInt).mockImplementation(async (_f, key) => {
    const v = VALUES[key];
    if (v === undefined) throw new Error(`Unexpected knob: ${key}`);
    return v;
  });
});

/** Ten headed sections, each bigger than half a segment so none pack together. */
const TEN_SECTIONS = Array.from(
  { length: 10 },
  (_, i) => `## Section ${i + 1}\n${"membrane transport detail ".repeat(3)}END${i + 1}`,
).join("\n\n");

describe("the count law", () => {
  it("plans exactly the requested total when there are more sections than items", async () => {
    const plan = await planCoverage({ text: TEN_SECTIONS, targetKind: "deck", requestedTotal: 5 });
    expect(plan.total).toBe(5);
    expect(plan.segments.reduce((a, s) => a + s.items, 0)).toBe(5);
    // Balanced: exactly five passes of one item each.
    expect(plan.segments.map((seg) => seg.items)).toEqual([1, 1, 1, 1, 1]);
    // Nothing is dropped: every section's text still reaches one pass.
    const all = plan.segments.map((s) => s.text).join("\n");
    for (let i = 1; i <= 10; i++) expect(all).toContain(`END${i}`);
  });

  it("hands out a larger request exactly, proportionally", async () => {
    for (const asked of [7, 13, 23]) {
      const plan = await planCoverage({ text: TEN_SECTIONS, targetKind: "deck", requestedTotal: asked });
      expect(plan.segments.reduce((a, s) => a + s.items, 0)).toBe(asked);
      for (const s of plan.segments) expect(s.items).toBeGreaterThanOrEqual(1);
    }
  });

  it("never merges more than asked, even when sections over-deliver", () => {
    const plan = { segments: [{ items: 3 }, { items: 2 }] } as never;
    const batch = (p: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ q: `${p} unique question number ${i} about topic ${p}${i}` }));
    const merged = mergeSectionItems(plan, [batch("a", 6), batch("b", 6)], (x) => x.q, undefined, 5);
    expect(merged).toHaveLength(5);
    // Each section's share first: 3 from a, 2 from b.
    expect(merged.filter((m) => m.q.startsWith("a"))).toHaveLength(3);
  });

  it("fills a short section's gap from another section's extras", () => {
    const plan = { segments: [{ items: 3 }, { items: 2 }] } as never;
    const a = [{ q: "alpha one" }, { q: "alpha two" }, { q: "alpha three" }, { q: "alpha four" }];
    const merged = mergeSectionItems(plan, [a, null], (x) => x.q, undefined, 5);
    expect(merged.map((m) => m.q)).toEqual(["alpha one", "alpha two", "alpha three", "alpha four"]);
  });

  it("drops the near-duplicate a second section wrote", () => {
    const same = isNearDuplicateQA(
      {
        question: "What is osmosis, and in which direction does water move relative to solute concentration?",
        answer: "Osmosis is the diffusion of water across a selectively permeable membrane from lower solute concentration to higher solute concentration.",
      },
      {
        question: "What is osmosis?",
        answer: "Osmosis is the net movement of water molecules through a selectively permeable membrane toward higher solute concentration.",
      },
    );
    expect(same).toBe(true);
    const different = isNearDuplicateQA(
      { question: "What is osmosis?", answer: "The net movement of water across a selectively permeable membrane." },
      {
        question: "In forward osmosis, how is a draw solution used to separate water from a feed solution?",
        answer: "A draw solution with higher osmotic pressure pulls water out of the feed, concentrating the feed.",
      },
    );
    expect(different).toBe(false);
    // Seen live on the fix run: one question is the other plus "and why…".
    expect(
      isNearDuplicateQA(
        {
          question: "What is osmotic pressure, and why is it classified as a colligative property?",
          answer: "The external pressure required to prevent net solvent movement; it depends on solute concentration.",
        },
        {
          question: "What is osmotic pressure?",
          answer: "The force per unit area required to prevent the passage of water through a membrane.",
        },
      ),
    ).toBe(true);
    expect(
      isNearDuplicateQA(
        { question: "What is a cell?", answer: "The basic unit of life." },
        { question: "What is a cell membrane made of?", answer: "A phospholipid bilayer." },
      ),
    ).toBe(false);
  });
});

// V4-F (2026-09-30): the live progress line read "Section 5 of 5 — 8 cards so
// far" on a 5-card request — every section's spare (and over-delivery) was
// counted. The running count a person watches obeys THE COUNT LAW too.
describe("the count law on the progress line", () => {
  it("never reports more cards than were asked for, and ends on exactly that many", async () => {
    let call = 0;
    // Every section over-delivers: its share plus the spare plus one more.
    jest.mocked(runAgentExtraction).mockImplementation(async () => {
      call += 1;
      const n = call;
      return {
        value: [0, 1, 2].map((i) => ({ q: `section ${n} distinct question ${i} topic${n}x${i}` })),
        conversationId: null,
      } as never;
    });
    const seen: ConvertProgress[] = [];
    const ctx = { dispatch: jest.fn(), store: {}, orgId: "org", onProgress: (p: ConvertProgress) => seen.push(p) } as unknown as ConvertContext;
    const result = await segmentedGenerate<{ q: string }>({
      ctx,
      source: { text: TEN_SECTIONS } as never,
      targetKind: "deck",
      options: { count: 5 } as never,
      mandateKey: "education.flashcards" as never,
      surfaceKey: "test",
      sourceFeature: "flashcards" as never,
      variables: () => ({}),
      extract: (v) => v as { q: string }[],
      identity: (x) => x.q,
    });
    expect(seen.length).toBeGreaterThan(1);
    for (const p of seen) expect(p.items).toBeLessThanOrEqual(5);
    expect(seen[seen.length - 1].items).toBe(5);
    expect(result.items).toHaveLength(5);
  });
});
