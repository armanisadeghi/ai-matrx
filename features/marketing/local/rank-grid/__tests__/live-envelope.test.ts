/**
 * The screen's reads against REAL `seo_local` envelopes, captured through the
 * screen-run door on a local aidream at HEAD as admin@admin.com (2026-10-06,
 * call ids 6ea89d34 preview / 47084481 run): a 5x5 "orthodontist" grid whose 25
 * points were all reused free. If the server's shape drifts, this goes red.
 */
import fixture from "./fixtures-live-orthodontist-5x5.json";
import { bubbleFor, compareRows, gridFromOutcome, shortDate, sourceLine } from "../grid-model";

const ok = (output: unknown) => ({ status: "ok" as const, output, callId: "c" });

it("reads the live preview: free, 25 points, the center to confirm, nothing to pay", () => {
  const state = gridFromOutcome(ok(fixture.preview));
  if (state.kind !== "preview") throw new Error(`expected a preview, got ${state.kind}`);
  expect(state.data.points).toHaveLength(25);
  expect(state.data.estimate_usd).toBe(0);
  expect(state.data.reused_points).toBe(25);
  expect(state.data.center_confirmed_value).toBe("33.6189,-117.9298");
});

it("reads the live grid: reused from its collection date, not found read two ways, winners ranked", () => {
  const state = gridFromOutcome(ok(fixture.run));
  if (state.kind !== "result") throw new Error(`expected a result, got ${state.kind}`);
  const { data } = state.envelope;
  // The oldest point's collection time, in the reader's own time zone.
  expect(sourceLine(state.envelope)).toEqual({ reused: true, text: `Reused from ${shortDate("2026-10-06T01:49:15.312543Z")}` });
  expect(shortDate("2026-10-06T01:49:15.312543Z")).toMatch(/^Oct [56], 2026$/);

  const tones = data.points.map((p) => bubbleFor(p, data.depth).tone);
  expect(tones.filter((t) => t === "outranked")).toHaveLength(22);
  expect(tones.filter((t) => t === "sparse")).toHaveLength(3);

  const rows = compareRows(data, { name: "Bayside Orthodontics", cid: null });
  expect(rows.map((r) => [r.name, r.wins])).toEqual([
    ["Bayside Orthodontics", 0],
    ["Newport-Mesa Orthodontics & Family Dentistry", 13],
    ["Smile HB Dental and Orthodontics", 7],
    ["DiGiovanni Orthodontics", 3],
  ]);
  expect(rows[0]).toMatchObject({ avgRank: null, found: 0, searched: 25 });
});
