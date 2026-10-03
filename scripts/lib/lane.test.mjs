// lane.test.mjs — every database connection a script opens carries its lane (CLONE-CRASH-2026-10-03).
//   node --test scripts/lib/lane.test.mjs
// The break it catches: the lane dropped from application_name, so twelve lanes on one clone are again "Supavisor".
import { test } from "node:test";
import assert from "node:assert/strict";
import { laneName, laneApp } from "./lane.mjs";

test("MATRX_LANE names the lane", () => {
  assert.equal(laneName({ MATRX_LANE: "lane7w4a" }), "lane7w4a");
  assert.equal(laneApp("db:apply", { MATRX_LANE: "lane7w4a" }), "lane7w4a:db:apply");
});

test("unsafe characters are cleaned, never empty", () => {
  assert.equal(laneName({ MATRX_LANE: "lane 7/w4a!" }), "lane-7-w4a");
});

test("the 63-byte limit keeps the lane in front", () => {
  const a = laneApp("z".repeat(100), { MATRX_LANE: "lane9" });
  assert.equal(a.length, 63);
  assert.ok(a.startsWith("lane9:"));
});
