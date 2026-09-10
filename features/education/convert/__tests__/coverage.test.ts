import { knobInt } from "@/lib/knobs/featureKnobs";
import { planCoverage } from "../coverage";

jest.mock("@/lib/knobs/featureKnobs", () => ({
  knobInt: jest.fn(),
}));

const VALUES: Record<string, number> = {
  segment_target_chars: 100,
  max_segments: 10,
  max_items_total: 50,
  min_items_total: 2,
  items_per_segment_deck: 2,
};

const mockedKnobInt = jest.mocked(knobInt);

describe("study-kit coverage planning", () => {
  beforeEach(() => {
    mockedKnobInt.mockImplementation(async (_feature, key) => {
      const value = VALUES[key];
      if (value === undefined) throw new Error(`Unexpected knob: ${key}`);
      return value;
    });
  });

  afterEach(() => {
    mockedKnobInt.mockReset();
  });

  it("splits a boundary-free OCR stream and preserves its tail", async () => {
    const text = `${"dense scanned chemistry text ".repeat(80)}TAIL_MARKER`;

    const plan = await planCoverage({
      text,
      targetKind: "deck",
      depth: "standard",
    });

    expect(plan.segments.length).toBeGreaterThan(1);
    expect(plan.segments.length).toBeLessThanOrEqual(10);
    expect(plan.singlePass).toBe(false);
    expect(plan.total).toBe(plan.segments.length * 2);
    expect(plan.segments.at(-1)?.text).toContain("TAIL_MARKER");
    expect(plan.rationale).toContain(
      `Covering all ${plan.segments.length} sections`,
    );
  });

  it("splits one oversized natural unit instead of treating it as one call", async () => {
    const text = `## One scanned page\n${"matter and measurement ".repeat(30)}`;

    const plan = await planCoverage({ text, targetKind: "deck" });

    expect(plan.segments.length).toBeGreaterThan(1);
    expect(plan.singlePass).toBe(false);
    expect(plan.segments.at(-1)?.text).toContain("measurement");
  });
});
