import { knobInt } from "@/lib/knobs/featureKnobs";
import { markForGrounding, planCoverage } from "../coverage";

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
  it("keeps the server's own chunk ids instead of re-chunking grounded text", async () => {
    // The Source resolver (`POST /sources/resolve`) hands back text already
    // marked `### Chunk <real id> (page N)`. Re-marking it would replace the
    // real ids with local ones and every citation would stop opening.
    const grounded = [
      "### Chunk 0b5c-real-1 (page 3)",
      "Mitochondria make ATP through oxidative phosphorylation.",
      "",
      "### Chunk 0b5c-real-2 (page 4)",
      "The electron transport chain sits on the inner membrane.",
    ].join("\n");
    expect(markForGrounding(grounded, "1_")).toBe(grounded);

    const plan = await planCoverage({ text: grounded, targetKind: "deck" });
    const all = plan.segments.map((s) => s.text).join("\n\n");
    expect(all).toContain("### Chunk 0b5c-real-1 (page 3)");
    expect(all).toContain("### Chunk 0b5c-real-2 (page 4)");
    expect(all).not.toMatch(/### Chunk \d+_\d+/);
  });

  it("repeats a real chunk header on every piece of an oversized chunk", async () => {
    const text = `### Chunk big-chunk-7 (page 9)\n${"cell membranes regulate transport ".repeat(20)}END`;
    const plan = await planCoverage({ text, targetKind: "deck" });
    expect(plan.segments.length).toBeGreaterThan(1);
    for (const segment of plan.segments) {
      expect(segment.text).toContain("### Chunk big-chunk-7 (page 9)");
    }
    expect(plan.segments.at(-1)?.text).toContain("END");
  });
});
