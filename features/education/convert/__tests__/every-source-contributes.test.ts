// THE EVERY-SOURCE RULE (2026-10-05, /education/flashcards/new): a 4-card deck
// from 5 Sources drew on only 3 — the table and the saved result were folded
// into a neighbour's section and never got a card. Every Source is planned on
// its own and earns at least one item.
import { knobInt } from "@/lib/knobs/featureKnobs";
import { planCoverage } from "../coverage";

jest.mock("@/lib/knobs/featureKnobs", () => ({ knobInt: jest.fn() }));

const VALUES: Record<string, number> = {
  segment_target_chars: 400,
  max_segments: 20,
  max_items_total: 50,
  min_items_total: 2,
  items_per_segment_deck: 2,
};

beforeEach(() => {
  jest.mocked(knobInt).mockImplementation(async (_f, key) => {
    const v = VALUES[key];
    if (v === undefined) throw new Error(`Unexpected knob: ${key}`);
    return v;
  });
});

const GROUPS = [
  { label: "Insurance Carriers", text: "### Chunk a1\nAetna\nCigna\nHumana\nKaiser" },
  { label: "Clinic Equipment Service Log", text: "### Chunk b1\nAutoclave serviced 2026-09-01; X-ray head calibrated." },
  {
    label: "Photosynthesis conversation",
    text: Array.from({ length: 6 }, (_, i) => `### Chunk c${i}\n${"Light reactions split water in the thylakoid. ".repeat(6)}`).join("\n\n"),
  },
  { label: "Saved result", text: "### Chunk d1\nFlashcards: chlorophyll absorbs red and blue light." },
  {
    label: "GPU Server Decommissioning",
    text: Array.from({ length: 6 }, (_, i) => `## Step ${i}\n${"Wipe drives, record serials, recycle boards. ".repeat(6)}`).join("\n\n"),
  },
];
const TEXT = GROUPS.map((g) => g.text).join("\n\n");

describe("the every-source rule", () => {
  it("gives every Source its own section and at least one item", async () => {
    const plan = await planCoverage({ text: TEXT, targetKind: "deck", requestedTotal: 8, groups: GROUPS });
    for (let g = 0; g < GROUPS.length; g++) {
      const mine = plan.segments.filter((s) => s.group === g);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.reduce((a, s) => a + s.items, 0)).toBeGreaterThan(0);
      // a section never carries another Source's text
      for (const s of mine) for (const other of GROUPS) if (other !== GROUPS[g]) expect(s.text).not.toContain(other.text.slice(0, 30));
    }
    expect(plan.total).toBe(8);
  });

  it("makes one item per Source when the ask is smaller than the number of Sources", async () => {
    const plan = await planCoverage({ text: TEXT, targetKind: "deck", requestedTotal: 4, groups: GROUPS });
    expect(plan.total).toBe(5);
    expect(new Set(plan.segments.map((s) => s.group))).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it("labels each section with its Source's name", async () => {
    const plan = await planCoverage({ text: TEXT, targetKind: "deck", requestedTotal: 5, groups: GROUPS });
    expect(plan.segments.find((s) => s.group === 1)?.label).toMatch(/^Clinic Equipment Service Log/);
  });
});
