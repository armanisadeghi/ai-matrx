/**
 * The rank grid's pure reads: a point → its bubble (a missing rank read against
 * the result count, a failed or unsent point never "not found"), us against the
 * grid's winners, where the numbers came from, and one outcome → one state.
 */
import {
  BUBBLE_CLASS,
  bubbleFor,
  compareRows,
  gridFromOutcome,
  previewArgs,
  runArgs,
  sourceLine,
} from "../grid-model";
import type { GridPoint, GridResultData } from "../types";

const pt = (over: Partial<GridPoint>): GridPoint => ({
  row: 0,
  col: 0,
  lat: 33.6,
  lng: -117.9,
  rank: null,
  results_count: 20,
  top_result: null,
  ...over,
});

const grid = (points: GridPoint[], over: Partial<GridResultData["summary"]> = {}): GridResultData => ({
  keyword: "orthodontist",
  grid_size: 3,
  spacing_km: 1,
  zoom: 13,
  depth: 20,
  device: "mobile",
  center: { latitude: 33.6, longitude: -117.9, source: "argument" },
  matched_business: { name: "Bayside Orthodontics", cid: "111", place_id: null, address: null },
  summary: {
    points_found: points.filter((p) => p.rank != null).length,
    points_searched: points.length,
    points_failed: 0,
    points_pending: 0,
    avg_rank: 4.5,
    top3: 1,
    top10: 2,
    ...over,
  },
  grid_text: "",
  points,
});

describe("bubbleFor", () => {
  it("colours a found rank by band", () => {
    expect(bubbleFor(pt({ rank: 2 }), 20)).toMatchObject({ text: "2", tone: "top3" });
    expect(bubbleFor(pt({ rank: 7 }), 20)).toMatchObject({ text: "7", tone: "top10" });
    expect(bubbleFor(pt({ rank: 15 }), 20)).toMatchObject({ text: "15", tone: "ranked" });
  });

  it("reads a missing rank against the result count: outranked, not listed, no results", () => {
    expect(bubbleFor(pt({ results_count: 20 }), 20)).toMatchObject({ text: "20+", tone: "outranked", label: "Not in the top 20" });
    expect(bubbleFor(pt({ results_count: 3 }), 20)).toMatchObject({ text: "–", tone: "sparse", label: "Not listed among 3 results" });
    expect(bubbleFor(pt({ results_count: 0 }), 20)).toMatchObject({ tone: "no_results" });
    // The server's own reading wins over the count.
    expect(bubbleFor(pt({ results_count: 20, not_found_reading: "sparse" }), 20).tone).toBe("sparse");
  });

  it("never calls a failed or unsent point 'not found'", () => {
    expect(bubbleFor(pt({ error: "failed: timeout", results_count: null }), 20)).toMatchObject({ text: "x", tone: "failed" });
    expect(bubbleFor(pt({ pending: true, results_count: null }), 20)).toMatchObject({ text: "?", tone: "pending" });
  });

  it("gives not-found tones a look distinct from every ranked tone", () => {
    const ranked = new Set([BUBBLE_CLASS.top3, BUBBLE_CLASS.top10, BUBBLE_CLASS.ranked]);
    for (const tone of ["outranked", "sparse", "no_results", "failed"] as const) {
      expect(ranked.has(BUBBLE_CLASS[tone])).toBe(false);
    }
    expect(BUBBLE_CLASS.sparse).toContain("border-dashed");
    expect(BUBBLE_CLASS.no_results).toContain("border-dashed");
  });
});

describe("compareRows", () => {
  const A = { name: "Alpha Ortho", cid: "a" };
  const B = { name: "Beta Braces", cid: "b" };
  const C = { name: "Cee Smiles", cid: "c" };
  const D = { name: "Dee Dental", cid: "d" };

  it("ranks the three businesses that won the most points, after us", () => {
    const rows = compareRows(
      grid([
        pt({ rank: 1, top_result: { name: "Bayside Orthodontics", cid: "111" } }),
        pt({ rank: 4, top_result: B }),
        pt({ rank: null, top_result: B }),
        pt({ rank: 6, top_result: A }),
        pt({ rank: null, top_result: C }),
        pt({ rank: null, top_result: B }),
        pt({ rank: null, top_result: A }),
        pt({ rank: null, top_result: D }),
        pt({ rank: null, top_result: null, error: "failed: x" }),
      ]),
      { name: "Bayside Orthodontics", cid: "111" },
    );
    expect(rows.map((r) => r.name)).toEqual(["Bayside Orthodontics", "Beta Braces", "Alpha Ortho", "Cee Smiles"]);
    expect(rows[0]).toMatchObject({ isUs: true, wins: 1, avgRank: 4.5, found: 3, searched: 9 });
    expect(rows[1]).toMatchObject({ wins: 3, avgRank: null, found: null });
  });

  it("never counts our own #1 as a competitor's win, even matched by name", () => {
    const rows = compareRows(
      grid([pt({ rank: null, top_result: { name: "bayside orthodontics", cid: null } }), pt({ rank: 3, top_result: A })]),
      { name: "Bayside Orthodontics", cid: null },
    );
    expect(rows.map((r) => r.name)).toEqual(["Bayside Orthodontics", "Alpha Ortho"]);
  });
});

describe("sourceLine", () => {
  const env = (reused: string[], evidence: { run_id: string; observed_at: string }[], charged = 0) => ({
    __kind: "seo.tool_envelope" as const,
    status: "ok" as const,
    data: grid([pt({ run_id: "r1" }), pt({ run_id: "r2" })]),
    cost: { class: "paid" as const, charged_usd: charged, reused: reused.length > 0, reused_run_ids: reused },
    evidence: evidence.map((e) => ({ ...e, operation: "maps" })),
  });

  it("says 'Reused from <oldest date>' when every point was a stored run", () => {
    expect(
      sourceLine(env(["r1", "r2"], [
        { run_id: "r1", observed_at: "2026-10-06T12:49:15Z" },
        { run_id: "r2", observed_at: "2026-10-06T12:49:59Z" },
      ])),
    ).toEqual({ reused: true, text: "Reused from Oct 6, 2026" });
  });

  it("says what was bought, and how much was reused, when some points were new", () => {
    const line = sourceLine(env(["r1"], [
      { run_id: "r1", observed_at: "2026-10-05T10:00:00Z" },
      { run_id: "r2", observed_at: "2026-10-06T12:00:00Z" },
    ], 0.002));
    expect(line.text).toBe("1 of 2 reused from Oct 5, 2026 · Bought Oct 6, 2026 · $0.002");
    expect(sourceLine(env([], [{ run_id: "r2", observed_at: "2026-10-06T12:00:00Z" }], 0.05))).toEqual({
      reused: false,
      text: "Bought Oct 6, 2026 · $0.05",
    });
  });
});

describe("gridFromOutcome", () => {
  const ok = (output: unknown) => ({ status: "ok" as const, output, callId: "c" });

  it("reads a preview, and a grid that is ok, partial or still processing", () => {
    const preview = { preview: true, points: [], center_confirmed_value: "1,2" };
    expect(gridFromOutcome(ok({ __kind: "seo.tool_envelope", status: "ok", data: preview, cost: { class: "free" }, notices: ["n"] })))
      .toMatchObject({ kind: "preview", notices: ["n"] });
    for (const status of ["ok", "partial", "processing"]) {
      expect(gridFromOutcome(ok({ __kind: "seo.tool_envelope", status, data: grid([pt({})]), cost: { class: "paid" } })).kind)
        .toBe("result");
    }
  });

  it("says nothing was spent when the approval is declined or closed", () => {
    expect(gridFromOutcome({ status: "declined" })).toEqual({ kind: "stopped", note: "Declined. Nothing was spent." });
    expect(gridFromOutcome({ status: "dismissed" })).toEqual({ kind: "stopped", note: "Closed. Nothing was spent." });
  });

  it("shows the tool's own words for an envelope with no grid", () => {
    expect(
      gridFromOutcome(ok({ __kind: "seo.tool_envelope", status: "unavailable", data: null, cost: { class: "free" }, notices: ["No grid center"] })),
    ).toEqual({ kind: "error", message: "No grid center" });
  });
});

describe("call arguments", () => {
  const business = { name: "Bayside Orthodontics", cid: "111", place_id: "p", address: null, lat: 33.6189, lng: -117.9298 };
  const request = { keyword: " orthodontist ", gridSize: 5 as const, spacingKm: 2, device: "mobile" as const };

  it("previews free at the confirmed storefront and runs only with the confirmed center", () => {
    expect(previewArgs(business, request)).toEqual({
      action: "rank_grid",
      keyword: "orthodontist",
      name: "Bayside Orthodontics",
      cid: "111",
      center: { latitude: 33.6189, longitude: -117.9298 },
      grid_size: 5,
      spacing_km: 2,
      device: "mobile",
      preview: true,
    });
    expect(runArgs(business, request, "33.6189,-117.9298")).toMatchObject({
      preview: false,
      center_confirmed: "33.6189,-117.9298",
    });
  });
});
