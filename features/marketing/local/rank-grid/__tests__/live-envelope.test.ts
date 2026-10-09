/**
 * The screen's reads against REAL `seo_local` envelopes, captured through the
 * screen-run door on a local aidream at HEAD as admin@admin.com (2026-10-06,
 * call ids fe0bf72b preview / ebb65345 run, after aidream 460956d41d): the
 * stored Bayside Orthodontics 5x5 "orthodontist" grid (2 km, center
 * 33.6189,-117.9298), all 25 points reused free, returned COMPACTED
 * (`point_table`, no per-point coordinates). `server_point_coordinates` are the
 * same grid's points as the server placed them in an earlier full-shape capture.
 * If the server's shape drifts, this goes red.
 */
import fixture from "./fixtures-live-orthodontist-5x5.json";
import {
  bubbleFor,
  compareRows,
  gridFromOutcome,
  gridPoints,
  shortDate,
  sourceLine,
} from "../grid-model";

const ok = (output: unknown) => ({ status: "ok" as const, output, callId: "c" });

function result() {
  const state = gridFromOutcome(ok(fixture.run));
  if (state.kind !== "result") throw new Error(`expected a result, got ${state.kind}`);
  return state.envelope;
}

it("reads the live preview: free, 25 points, the center to confirm, nothing to pay", () => {
  const state = gridFromOutcome(ok(fixture.preview));
  if (state.kind !== "preview") throw new Error(`expected a preview, got ${state.kind}`);
  expect(state.data.points).toHaveLength(25);
  expect(state.data.estimate_usd).toBe(0);
  expect(state.data.reused_points).toBe(25);
  expect(state.data.center_confirmed_value).toBe("33.6189,-117.9298");
});

it("expands the compacted point table onto the exact coordinates the server searched", () => {
  const envelope = result();
  expect(envelope.data.points_compacted).toBe(true);
  expect(envelope.data.points).toBeUndefined();
  const points = gridPoints(envelope.data);
  expect(points).toHaveLength(25);
  expect(points.map(({ row, col, lat, lng }) => ({ row, col, lat, lng }))).toEqual(
    fixture.server_point_coordinates,
  );
  // The #1's name comes from the competitors summary, matched by cid.
  expect(points[1].top_result).toEqual({
    cid: "17530339317838562582",
    name: "Smile HB Dental and Orthodontics",
  });
});

it("draws every point and reads not-found from the result count", () => {
  const { data } = result();
  const tones = gridPoints(data).map((p) => bubbleFor(p, data.depth).tone);
  expect(tones.filter((t) => t === "outranked")).toHaveLength(22);
  expect(tones.filter((t) => t === "sparse")).toHaveLength(3);
});

it("says the grid was reused, from its collection date", () => {
  const envelope = result();
  const observed = envelope.evidence?.[0]?.observed_at ?? null;
  expect(sourceLine(envelope, (u) => `<${u}>`)).toEqual({ reused: true, text: `Reused from ${shortDate(observed)}` });
  expect(shortDate(observed)).toMatch(/^Oct [56], 2026$/);
});

it("compares us with the three most visible competitors from the server's summary", () => {
  const rows = compareRows(result().data, { name: "Bayside Orthodontics", cid: null });
  expect(rows).toHaveLength(4);
  expect(rows[0]).toMatchObject({ isUs: true, wins: 0, avgRank: null, found: 0, searched: 25 });
  expect(rows[1]).toEqual({
    key: "5978929699797404409",
    name: "Newport-Mesa Orthodontics & Family Dentistry",
    isUs: false,
    wins: 13,
    avgRank: 1.55,
    found: 20,
    searched: 25,
  });
  expect(rows.slice(2).map((r) => [r.name, r.wins, r.avgRank, r.found])).toEqual([
    ["Smile HB Dental and Orthodontics", 7, 1.93, 15],
    ["DiGiovanni Orthodontics", 3, 5.5, 10],
  ]);
});
