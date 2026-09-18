// What size, fill, ring and hue mean — and what the drawing says when the knob
// names something it has never heard of.

import { captureError } from "@/lib/diagnostics/errorCaptureStore";

import type { MapGraphEncoding } from "../../knobs";
import {
  dominantTone,
  resolveEncoding,
  sizeValueOf,
  tallyTopicTones,
  type ConvergenceRow,
} from "./encoding";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: jest.fn(() => "captured"),
}));

const captureErrorMock = captureError as jest.MockedFunction<typeof captureError>;

/** The live default row of `seo.topical_map.graph_encoding`. */
const LIVE: MapGraphEncoding = {
  size: "pages",
  fill: "status",
  ring: "tier",
  hue: "grouped_facet",
};

beforeEach(() => {
  captureErrorMock.mockClear();
});

describe("resolveEncoding — the live default", () => {
  it("reads all four channels and writes a full legend", () => {
    const resolved = resolveEncoding(LIVE, "structure");
    expect(resolved).toMatchObject({
      size: "pages",
      fill: "status",
      ring: "tier",
      hue: "grouped_facet",
    });
    expect(resolved.lines.map((line) => line.channel)).toEqual(["size", "fill", "ring", "hue"]);
    expect(resolved.lines.every((line) => line.known)).toBe(true);
    expect(resolved.lines[0].text).toContain("live pages");
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it("hands fill to the intents in convergence mode, and says so", () => {
    const resolved = resolveEncoding(LIVE, "convergence");
    expect(resolved.fill).toBe("none");
    const fillLine = resolved.lines.find((line) => line.channel === "fill");
    expect(fillLine?.text).toContain("where each topic's pages are going");
  });

  it("accepts a knob that switches channels off", () => {
    const resolved = resolveEncoding(
      { size: "none", fill: "none", ring: "none", hue: "none" },
      "structure",
    );
    expect(resolved.lines.every((line) => line.known)).toBe(true);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });
});

describe("an unrecognised encoding value", () => {
  it("renders an honest legend line, captures, and draws nothing for that channel", () => {
    const resolved = resolveEncoding({ ...LIVE, size: "gravity" }, "structure");
    expect(resolved.size).toBe("none");
    const line = resolved.lines.find((entry) => entry.channel === "size");
    expect(line?.known).toBe(false);
    expect(line?.text).toBe(
      "‘gravity’ is not a legend value this drawing knows, so nothing is drawn for size.",
    );
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock.mock.calls[0][0].message).toContain("gravity");
  });

  it("never leaves a channel without a line, even with the knob missing entirely", () => {
    const resolved = resolveEncoding(null, "structure");
    expect(resolved.lines).toHaveLength(4);
    // A missing key is read as "none", which is a real setting, not an error.
    expect(resolved.lines.every((line) => line.known)).toBe(true);
  });
});

describe("sizeValueOf", () => {
  const counts = { page_count: 12, planned_count: 3, keyword_count: 40 };
  it("reads the channel the knob names", () => {
    expect(sizeValueOf("pages", counts)).toBe(12);
    expect(sizeValueOf("planned", counts)).toBe(3);
    expect(sizeValueOf("keywords", counts)).toBe(40);
    expect(sizeValueOf("none", counts)).toBe(0);
  });
});

// ── Convergence ────────────────────────────────────────────────────────────

function row(
  pageId: string,
  currentTopicSlugs: string[],
  intent: ConvergenceRow["intent"],
): ConvergenceRow {
  return { pageId, currentTopicSlugs, intent };
}

describe("tallyTopicTones", () => {
  it("ignores a page that names neither the topic's coverage nor its intent", () => {
    const rows = [row("p1", ["other"], null)];
    expect(tallyTopicTones(rows, "alpha").in_place).toBe(0);
  });

  it("counts coverage with no intent as in place", () => {
    const rows = [row("p1", ["alpha"], null)];
    expect(tallyTopicTones(rows, "alpha").in_place).toBe(1);
  });

  it("counts a page moving away as leaving and its destination as arriving", () => {
    const rows = [
      row("p1", ["alpha"], { disposition: "move", state: "proposed", topicSlug: "beta" }),
    ];
    expect(tallyTopicTones(rows, "alpha").leaving).toBe(1);
    expect(tallyTopicTones(rows, "beta").arriving).toBe(1);
  });

  it("counts a deletion against the topic it sits on", () => {
    const rows = [
      row("p1", ["alpha"], { disposition: "delete", state: "accepted", topicSlug: "alpha" }),
    ];
    expect(tallyTopicTones(rows, "alpha").delete).toBe(1);
  });
});

describe("dominantTone", () => {
  const rowsFor = (tones: ConvergenceRow[]) => tones;

  it("takes the tone with the most pages", () => {
    const rows = rowsFor([
      row("p1", ["alpha"], null),
      row("p2", ["alpha"], null),
      row("p3", ["alpha"], { disposition: "move", state: "proposed", topicSlug: "beta" }),
    ]);
    expect(dominantTone({ slug: "alpha", page_count: 3, planned_count: 0 }, rows)).toBe("in_place");
  });

  it("breaks a tie towards the most actionable: delete over leaving", () => {
    const rows = rowsFor([
      row("p1", ["alpha"], { disposition: "delete", state: "proposed", topicSlug: "alpha" }),
      row("p2", ["alpha"], { disposition: "move", state: "proposed", topicSlug: "beta" }),
    ]);
    expect(dominantTone({ slug: "alpha", page_count: 2, planned_count: 0 }, rows)).toBe("delete");
  });

  it("breaks a tie towards leaving over arriving, and arriving over in place", () => {
    const leavingVsArriving = rowsFor([
      row("p1", ["alpha"], { disposition: "move", state: "proposed", topicSlug: "beta" }),
      row("p2", [], { disposition: "move", state: "proposed", topicSlug: "alpha" }),
    ]);
    expect(
      dominantTone({ slug: "alpha", page_count: 2, planned_count: 0 }, leavingVsArriving),
    ).toBe("leaving");

    const arrivingVsInPlace = rowsFor([
      row("p1", [], { disposition: "move", state: "proposed", topicSlug: "alpha" }),
      row("p2", ["alpha"], null),
    ]);
    expect(
      dominantTone({ slug: "alpha", page_count: 2, planned_count: 0 }, arrivingVsInPlace),
    ).toBe("arriving");
  });

  it("calls a topic with no live pages and something planned `planned`", () => {
    expect(dominantTone({ slug: "alpha", page_count: 0, planned_count: 4 }, [])).toBe("planned");
  });

  it("calls a topic with no live pages and nothing planned `missing`", () => {
    expect(dominantTone({ slug: "alpha", page_count: 0, planned_count: 0 }, [])).toBe("missing");
  });

  it("ABSENT IS NOT ZERO: a topic whose pages are not listed yet has no tone", () => {
    // page_count 8 with nothing listed is UNKNOWN, not `missing`. Returning
    // `missing` here would draw eight real pages as a hole in the map.
    expect(dominantTone({ slug: "alpha", page_count: 8, planned_count: 0 }, [])).toBeNull();
  });
});
